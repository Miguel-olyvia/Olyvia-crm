/**
 * Limpeza e recusa do CONTEUDO dos anexos do convite de admissao, depois de a
 * assinatura binaria ja ter dito que o ficheiro e pdf, png ou jpeg.
 *
 *  - PDF (D3): recusado se tiver accoes activas ou formularios (lista em
 *    NOMES_PROIBIDOS). Os nomes sao lidos com os escapes hexadecimais resolvidos
 *    (/J#61vaScript), no ficheiro todo (varrimento linear, nome a nome, sem
 *    construir listas) e dentro dos "object streams" (Flate, UMA so camada).
 *    Se nao for possivel analisar (cifrado, cadeia de filtros, filtro que nao se
 *    desfaz, predictor, descompressao falhada ou demasiado grande, estrutura que
 *    o leitor nao consegue seguir) o resultado e RECUSA.
 *    TROCA ASSUMIDA: o varrimento dos nomes le tambem os bytes dos streams
 *    comprimidos (uma fuga a partir de "so os objectos" seria mais facil de
 *    iludir); por isso um PDF com muitas imagens pode, raramente, conter por acaso
 *    um nome curto da lista (/3D, /AA, /JS) e ser recusado sem razao. Recusar a
 *    mais e o lado seguro. Tambem se recusam PDFs com ligacoes (/URI) e com
 *    formularios (/AcroForm).
 *  - PNG e JPEG (D2): reescritos ao nivel dos blocos/segmentos, sem EXIF, XMP,
 *    IPTC, comentarios nem texto, e sem nenhum byte depois do fim da imagem. Os
 *    pixeis NAO sao descodificados nem recodificados (sem dependencias novas e
 *    sem perda de qualidade). No JPEG so se mantem uma lista branca de marcadores;
 *    o EXIF e removido por inteiro, mas a ORIENTACAO (1-8) e reescrita num APP1
 *    minimo que so tem essa etiqueta (sem GPS nem outras etiquetas), para a foto
 *    nao ficar de lado.
 *
 * Todo o custo e linear no tamanho do ficheiro; nada faz fatias ate ao inicio.
 * Sem Deno e sem rede (so `DecompressionStream`, que o Deno e o Node trazem).
 */

export type ResultadoLimpeza = { ok: true; bytes: Uint8Array } | { ok: false };

const RECUSADO: ResultadoLimpeza = { ok: false };

// -- PDF --------------------------------------------------------------------

/** Accoes activas, ligacoes, formularios e conteudo embutido; mais /Encrypt (nao se le o que esta cifrado). */
const NOMES_PROIBIDOS: ReadonlySet<string> = new Set([
  "/JavaScript",
  "/JS",
  "/Launch",
  "/EmbeddedFile",
  "/OpenAction",
  "/AA",
  "/URI",
  "/SubmitForm",
  "/GoToR",
  "/GoToE",
  "/ImportData",
  "/RichMedia",
  "/3D",
  "/Rendition",
  "/XFA",
  "/AcroForm",
  "/Encrypt",
]);

/** Num object stream: filtros que nao se desfazem aqui (ou que tornam o conteudo ilegivel). */
const FILTROS_RECUSADOS_NO_OBJSTM: ReadonlySet<string> = new Set([
  "/LZWDecode", "/LZW", "/ASCII85Decode", "/A85", "/ASCIIHexDecode", "/AHx", "/RunLengthDecode", "/RL",
  "/CCITTFaxDecode", "/CCF", "/DCTDecode", "/DCT", "/JBIG2Decode", "/JPXDecode", "/Crypt", "/Predictor",
]);

const TETO_STREAM_DESCOMPRIMIDO = 20 * 1024 * 1024;
const TETO_TOTAL_DESCOMPRIMIDO = 50 * 1024 * 1024;
/** Nomes guardados por ficheiro (os dos dicionarios dos streams); acima disto e recusa. */
const MAX_NOMES_GUARDADOS = 200_000;
const MAX_OBJSTM = 2000;

class PdfRecusado extends Error {}
const recusar = (): never => {
  throw new PdfRecusado("pdf recusado");
};

function comoTexto(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function decodificarNome(nome: string): string {
  return nome.includes("#") ? nome.replace(/#([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) : nome;
}

/**
 * Varre TODOS os nomes do texto, um a um (sem os guardar), e recusa se algum
 * estiver na lista. Devolve quantas vezes aparece /ObjStm.
 */
function varrerNomes(texto: string): number {
  // eslint-disable-next-line no-control-regex
  const re = /\/[^\x00\t\n\f\r \/\[\]<>(){}%]*/g;
  let objstm = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const nome = decodificarNome(m[0]);
    if (NOMES_PROIBIDOS.has(nome)) recusar();
    if (nome === "/ObjStm") objstm++;
  }
  return objstm;
}

const ehEspaco = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const ehDelimitador = (c: number) =>
  c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;

async function inflar(dados: Uint8Array, teto: number): Promise<Uint8Array> {
  const leitor = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > teto) {
      await leitor.cancel();
      throw new Error("descomprimido acima do teto");
    }
    partes.push(value);
  }
  return juntar(partes, total);
}

/** Tenta com o corpo tal como esta e depois sem 1 ou 2 bytes de fim de linha antes de `endstream`. */
async function inflarCorpo(corpo: Uint8Array, teto: number): Promise<Uint8Array> {
  let ultimo: unknown;
  for (const aparar of [0, 1, 2]) {
    if (aparar > corpo.length) break;
    try {
      return await inflar(corpo.subarray(0, corpo.length - aparar), teto);
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("descompressao falhada");
}

/** Cabecalho zlib valido (CMF 0x78 e (CMF*256+FLG) multiplo de 31): uma segunda camada Flate. */
function pareceZlib(b: Uint8Array): boolean {
  return b.length >= 2 && (b[0] & 0x0f) === 8 && ((b[0] << 8) | b[1]) % 31 === 0;
}

interface EstadoPdf {
  orcamento: number;
  objstm: number;
}

/** Um stream cujo dicionario e `nomes`: so os object streams interessam (o resto sao dados). */
async function tratarStream(nomes: readonly string[], corpo: Uint8Array, estado: EstadoPdf): Promise<void> {
  if (!nomes.includes("/ObjStm")) return;
  if (++estado.objstm > MAX_OBJSTM) recusar();
  // Nada de cadeias nem de filtros que nao se desfazem; e a camada Flate e UMA so.
  if (nomes.some((n) => FILTROS_RECUSADOS_NO_OBJSTM.has(n))) recusar();
  const flate = nomes.filter((n) => n === "/FlateDecode" || n === "/Fl").length;
  if (flate > 1) recusar();
  // Sem /Filter nenhum o corpo ja esta em claro; com /Filter tem de ser exactamente o Flate acima.
  if (flate === 0 && nomes.includes("/Filter")) recusar();

  let conteudo = corpo;
  if (flate === 1) {
    const teto = Math.min(TETO_STREAM_DESCOMPRIMIDO, estado.orcamento);
    if (teto <= 0) recusar();
    conteudo = await inflarCorpo(corpo, teto);
    estado.orcamento -= conteudo.length;
    // Resultado que ainda parece zlib e que se descomprime outra vez: uma segunda camada escondida.
    if (pareceZlib(conteudo)) {
      let segunda = true;
      try {
        await inflar(conteudo, 1024 * 1024);
      } catch {
        segunda = false;
      }
      if (segunda) recusar();
    }
  }
  varrerNomes(comoTexto(conteudo));
}

/**
 * UMA passagem pelo ficheiro, a ler a sintaxe PDF (comentarios, strings, hex,
 * dicionarios, nomes). O dicionario de cada `stream` e o ultimo dicionario do nivel
 * zero fechado imediatamente antes da palavra: nada de procurar "obj" para tras.
 */
async function analisarEstrutura(texto: string, bytes: Uint8Array): Promise<number> {
  const n = texto.length;
  const estado: EstadoPdf = { orcamento: TETO_TOTAL_DESCOMPRIMIDO, objstm: 0 };
  let i = 0;
  let profundidade = 0;
  let nomesActuais: string[] | null = null;
  let ultimoDicionario: string[] | null = null;
  let acabouDicionario = false;
  let guardados = 0;
  let proximoEndstream = -2;
  let objstmTratados = 0;

  while (i < n) {
    const c = texto.charCodeAt(i);
    if (ehEspaco(c)) {
      i++;
      continue;
    }
    if (c === 37) {
      // % comentario ate ao fim da linha (nao muda o contexto)
      while (i < n) {
        const d = texto.charCodeAt(i);
        if (d === 10 || d === 13) break;
        i++;
      }
      continue;
    }
    if (c === 40) {
      acabouDicionario = false;
      let nivel = 1;
      i++;
      while (i < n && nivel > 0) {
        const d = texto.charCodeAt(i);
        if (d === 92) i += 2;
        else {
          if (d === 40) nivel++;
          else if (d === 41) nivel--;
          i++;
        }
      }
      continue;
    }
    if (c === 60) {
      acabouDicionario = false;
      if (texto.charCodeAt(i + 1) === 60) {
        profundidade++;
        if (profundidade === 1) nomesActuais = [];
        i += 2;
      } else {
        const f = texto.indexOf(">", i + 1);
        if (f === -1) recusar();
        i = f + 1;
      }
      continue;
    }
    if (c === 62) {
      if (texto.charCodeAt(i + 1) === 62) {
        if (profundidade > 0) {
          profundidade--;
          if (profundidade === 0) {
            ultimoDicionario = nomesActuais;
            nomesActuais = null;
            acabouDicionario = true;
          } else {
            acabouDicionario = false;
          }
        }
        i += 2;
      } else {
        acabouDicionario = false;
        i++;
      }
      continue;
    }
    if (c === 47) {
      acabouDicionario = false;
      let j = i + 1;
      while (j < n) {
        const d = texto.charCodeAt(j);
        if (ehEspaco(d) || ehDelimitador(d)) break;
        j++;
      }
      if (nomesActuais) {
        if (++guardados > MAX_NOMES_GUARDADOS) recusar();
        nomesActuais.push(decodificarNome(texto.slice(i, j)));
      }
      i = j;
      continue;
    }
    if (ehDelimitador(c)) {
      acabouDicionario = false;
      i++;
      continue;
    }
    let j = i;
    while (j < n) {
      const d = texto.charCodeAt(j);
      if (ehEspaco(d) || ehDelimitador(d)) break;
      j++;
    }
    if (j - i === 6 && texto.startsWith("stream", i)) {
      if (!acabouDicionario || !ultimoDicionario) recusar();
      let inicio = j;
      if (texto.charCodeAt(inicio) === 13) {
        inicio++;
        if (texto.charCodeAt(inicio) === 10) inicio++;
      } else if (texto.charCodeAt(inicio) === 10) inicio++;
      else recusar();
      // O cursor so anda para a frente: custo linear mesmo com milhares de streams.
      if (proximoEndstream < inicio) {
        proximoEndstream = texto.indexOf("endstream", inicio);
        if (proximoEndstream === -1) recusar();
      }
      const dic: string[] = ultimoDicionario as string[];
      if (dic.includes("/ObjStm")) objstmTratados++;
      await tratarStream(dic, bytes.subarray(inicio, proximoEndstream), estado);
      i = proximoEndstream + 9;
      ultimoDicionario = null;
      acabouDicionario = false;
      continue;
    }
    acabouDicionario = false;
    i = j;
  }
  if (profundidade !== 0) recusar();
  return objstmTratados;
}

/** `true` SO se o PDF foi analisado por inteiro e nao tem conteudo activo. */
export async function pdfSemConteudoActivo(bytes: Uint8Array): Promise<boolean> {
  try {
    const texto = comoTexto(bytes);
    // 1. O ficheiro todo: nenhum nome da lista, em lado nenhum (strings e streams incluidos).
    const mencoesObjStm = varrerNomes(texto);
    // 2. A estrutura: os object streams comprimidos desfazem-se (uma camada) e leem-se.
    const tratados = await analisarEstrutura(texto, bytes);
    // 3. Cada /ObjStm tem de ter sido visto como dicionario de um stream. Um que sobre (escondido do
    //    leitor de estrutura, p. ex. depois de uma string por fechar) e um stream por ler: recusa.
    if (mencoesObjStm !== tratados) return false;
    return true;
  } catch {
    return false;
  }
}

// -- comum ------------------------------------------------------------------

function juntar(partes: Uint8Array[], total: number): Uint8Array {
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

function u32(b: Uint8Array, pos: number): number {
  return ((b[pos] << 24) | (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]) >>> 0;
}

function ascii(b: Uint8Array, pos: number, n: number): string {
  return String.fromCharCode(...b.subarray(pos, pos + n));
}

// -- PNG --------------------------------------------------------------------

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Blocos que descrevem a imagem; fora daqui (eXIf, tEXt, iTXt, zTXt, tIME, blocos privados) cai tudo. */
const BLOCOS_PNG_MANTIDOS: ReadonlySet<string> = new Set([
  "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs",
]);

export function limparPng(bytes: Uint8Array): ResultadoLimpeza {
  if (bytes.length < 8 + 12 || !ASSINATURA_PNG.every((v, i) => bytes[i] === v)) return RECUSADO;
  const partes: Uint8Array[] = [bytes.subarray(0, 8)];
  let total = 8;
  let pos = 8;
  let primeiro = true;
  let temDados = false;
  while (pos + 12 <= bytes.length) {
    const comprimento = u32(bytes, pos);
    const tipo = ascii(bytes, pos + 4, 4);
    const fimDoBloco = pos + 12 + comprimento;
    if (fimDoBloco > bytes.length) return RECUSADO;
    if (primeiro && (tipo !== "IHDR" || comprimento !== 13)) return RECUSADO;
    primeiro = false;
    if (BLOCOS_PNG_MANTIDOS.has(tipo)) {
      partes.push(bytes.subarray(pos, fimDoBloco));
      total += fimDoBloco - pos;
    }
    if (tipo === "IDAT") temDados = true;
    pos = fimDoBloco;
    if (tipo === "IEND") return temDados ? { ok: true, bytes: juntar(partes, total) } : RECUSADO;
  }
  return RECUSADO; // sem IEND: truncado
}

// -- JPEG -------------------------------------------------------------------

function ehSof(m: number): boolean {
  return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

/**
 * LISTA BRANCA de segmentos com tamanho: DQT, DHT, SOF (sem os reservados), DAC (so serve
 * a codificacao aritmetica), DRI, SOS, e APP0 JFIF, APP2 ICC e APP14 Adobe (a transformada
 * de cor). Tudo o resto cai: APP1 (EXIF, XMP), APP13 (IPTC), outros APPn, comentarios,
 * DNL, EXP, JPGn.
 */
function manterSegmentoJpeg(m: number, b: Uint8Array, pos: number): boolean {
  const dados = pos + 4;
  switch (m) {
    case 0xdb: // DQT
    case 0xc4: // DHT
    case 0xcc: // DAC
    case 0xdd: // DRI
    case 0xda: // SOS
      return true;
    case 0xe0:
      return ascii(b, dados, 5) === "JFIF\0";
    case 0xe2:
      return ascii(b, dados, 12) === "ICC_PROFILE\0";
    case 0xee:
      return ascii(b, dados, 5) === "Adobe";
    default:
      return ehSof(m);
  }
}

/** A orientacao EXIF (1-8) de um APP1, ou `null` se nao houver uma valida. Le so a etiqueta 0x0112 do IFD0. */
function orientacaoDoExif(b: Uint8Array, pos: number, fim: number): number | null {
  const dados = pos + 4;
  if (ascii(b, dados, 6) !== "Exif\0\0") return null;
  const tiff = dados + 6;
  if (tiff + 8 > fim) return null;
  const ii = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  const mm = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
  if (!ii && !mm) return null;
  const u16 = (p: number) => (ii ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
  const l32 = (p: number) =>
    ii ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : u32(b, p);
  if (u16(tiff + 2) !== 42) return null;
  const ifd = tiff + l32(tiff + 4);
  if (ifd + 2 > fim) return null;
  const entradas = u16(ifd);
  for (let k = 0; k < entradas && k < 256; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > fim) return null;
    if (u16(e) === 0x0112 && u16(e + 2) === 3 && l32(e + 4) === 1) {
      const valor = u16(e + 8);
      return valor >= 1 && valor <= 8 ? valor : null;
    }
  }
  return null;
}

/** Um APP1 EXIF com UMA so etiqueta (Orientation), em ordem de bytes grande: sem GPS nem nada mais. */
function app1SoComOrientacao(valor: number): Uint8Array {
  return Uint8Array.of(
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF, MM, IFD0 em 8
    0x00, 0x01, // uma entrada
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, valor, 0x00, 0x00, // Orientation, SHORT, 1
    0x00, 0x00, 0x00, 0x00, // sem IFD seguinte
  );
}

export function limparJpeg(bytes: Uint8Array): ResultadoLimpeza {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return RECUSADO;
  const partes: Uint8Array[] = [bytes.subarray(0, 2)];
  let total = 2;
  let pos = 2;
  let viuSof = false;
  let viuSos = false;
  let orientacao: number | null = null;
  // O APP1 com a orientacao vai depois do JFIF (que tem de ser o primeiro segmento), se o houver.
  let posInserir = 1;
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) return RECUSADO;
    while (pos < bytes.length && bytes[pos] === 0xff) pos++; // bytes de enchimento
    if (pos >= bytes.length) return RECUSADO;
    const marcador = bytes[pos];
    pos--; // `pos` aponta para o 0xFF do marcador
    if (marcador === 0xd9) {
      if (!viuSof || !viuSos) return RECUSADO;
      partes.push(Uint8Array.of(0xff, 0xd9));
      total += 2;
      if (orientacao !== null && orientacao !== 1) {
        partes.splice(posInserir, 0, app1SoComOrientacao(orientacao));
        total += 36; // marcador (2) + campo de tamanho (2) + 32 de conteudo
      }
      return { ok: true, bytes: juntar(partes, total) };
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x00) {
      pos += 2;
      continue;
    }
    if (pos + 4 > bytes.length) return RECUSADO;
    const comprimento = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const fim = pos + 2 + comprimento;
    if (comprimento < 2 || fim > bytes.length) return RECUSADO;
    if (ehSof(marcador)) viuSof = true;
    if (marcador === 0xe1 && orientacao === null) orientacao = orientacaoDoExif(bytes, pos, fim);
    if (manterSegmentoJpeg(marcador, bytes, pos)) {
      partes.push(bytes.subarray(pos, fim));
      total += fim - pos;
      if (marcador === 0xe0) posInserir = partes.length;
    }
    pos = fim;
    if (marcador === 0xda) {
      viuSos = true;
      // Dados entropicos: ate ao proximo marcador que nao seja 0xFF00 nem RSTn.
      const inicio = pos;
      while (pos + 1 < bytes.length) {
        if (bytes[pos] === 0xff) {
          const seguinte = bytes[pos + 1];
          if (seguinte === 0x00 || (seguinte >= 0xd0 && seguinte <= 0xd7)) {
            pos += 2;
            continue;
          }
          if (seguinte === 0xff) {
            pos++;
            continue;
          }
          break;
        }
        pos++;
      }
      if (pos + 1 >= bytes.length) return RECUSADO;
      partes.push(bytes.subarray(inicio, pos));
      total += pos - inicio;
    }
  }
  return RECUSADO; // sem EOI: truncado
}

// -- entrada ----------------------------------------------------------------

/**
 * O conteudo que fica guardado: o proprio PDF se for limpo, ou a imagem sem
 * metadados nem lixo no fim. `ok: false` = recusar (`anexo_conteudo_recusado`).
 * Nunca lanca.
 */
export async function limparAnexo(assinatura: string, bytes: Uint8Array): Promise<ResultadoLimpeza> {
  try {
    if (assinatura === "pdf") return (await pdfSemConteudoActivo(bytes)) ? { ok: true, bytes } : RECUSADO;
    if (assinatura === "png") return limparPng(bytes);
    if (assinatura === "jpeg") return limparJpeg(bytes);
  } catch {
    return RECUSADO;
  }
  return RECUSADO;
}
