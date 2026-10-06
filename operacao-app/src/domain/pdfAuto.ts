/**
 * O PDF do auto de receção — escrito à mão, sem biblioteca.
 *
 * O relatório das ordens sai pela impressão do browser (Relatorio.tsx), e
 * bem. O auto é diferente: tem de ficar GUARDADO na obra, tal como foi
 * assinado, e por isso precisa de um ficheiro gerado no telemóvel. Um PDF
 * com texto Helvetica e uma imagem JPEG são ~150 linhas: não vale 300 KB de
 * biblioteca nem um passo a mais no build.
 *
 * Limites, de propósito: só Helvetica (as 14 fontes de base do PDF), texto
 * em WinAnsi (cobre o português todo, incluindo — · € “ ”), uma imagem JPEG
 * (a assinatura). Quebra de linha por largura aproximada.
 */

export interface DadosAuto {
  empresa?: string | null;
  codigo: string;
  titulo: string;
  cliente?: string | null;
  morada?: string | null;
  linhasDatas: Array<[string, string]>;
  tarefas: string;
  remates: string[];
  observacoes?: string | null;
  assinante: string;
  assinadoEm: string;
}

export interface Assinatura {
  jpeg: Uint8Array;
  largura: number;
  altura: number;
}

const A4 = { w: 595.28, h: 841.89 };
const MARGEM = 50;

/* WinAnsiEncoding: Latin-1 nos 0xA0–0xFF, e alguns sinais nos 0x80–0x9F. */
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99,
};

export function paraWinAnsi(texto: string): number[] {
  const out: number[] = [];
  for (const ch of texto.normalize("NFC")) {
    const c = ch.codePointAt(0) ?? 63;
    if (c >= 0x20 && c < 0x7f) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (WIN_ANSI_EXTRA[ch] !== undefined) out.push(WIN_ANSI_EXTRA[ch]);
    else if (ch === "\t") out.push(0x20);
    else out.push(0x3f); // "?"
  }
  return out;
}

/** Uma string PDF literal: ( … ) com \ ( ) escapados, em bytes WinAnsi. */
function literal(texto: string): number[] {
  const out: number[] = [0x28];
  for (const b of paraWinAnsi(texto)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c);
    out.push(b);
  }
  out.push(0x29);
  return out;
}

/** Quebra por largura aproximada (Helvetica: ~0,5 × tamanho por letra). */
export function quebrar(texto: string, tamanho: number, largura: number): string[] {
  const max = Math.max(10, Math.floor(largura / (tamanho * 0.5)));
  const linhas: string[] = [];
  for (const paragrafo of texto.split(/\r?\n/)) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      if (!atual) atual = palavra;
      else if ((atual + " " + palavra).length <= max) atual += " " + palavra;
      else {
        linhas.push(atual);
        atual = palavra;
      }
      while (atual.length > max) {
        linhas.push(atual.slice(0, max));
        atual = atual.slice(max);
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

type Op = { t: "texto"; x: number; y: number; tam: number; negrito: boolean; s: string }
  | { t: "linha"; x1: number; y1: number; x2: number; y2: number }
  | { t: "imagem"; x: number; y: number; w: number; h: number };

/** Paginação simples: escreve de cima para baixo e muda de página quando enche. */
class Paginas {
  paginas: Op[][] = [[]];
  y = A4.h - MARGEM;

  private get atual(): Op[] {
    return this.paginas[this.paginas.length - 1];
  }

  garantir(altura: number): void {
    if (this.y - altura < MARGEM) {
      this.paginas.push([]);
      this.y = A4.h - MARGEM;
    }
  }

  texto(s: string, tam = 10, negrito = false, recuo = 0): void {
    const largura = A4.w - 2 * MARGEM - recuo;
    for (const l of quebrar(s, tam, largura)) {
      this.garantir(tam * 1.45);
      this.y -= tam * 1.45;
      this.atual.push({ t: "texto", x: MARGEM + recuo, y: this.y, tam, negrito, s: l });
    }
  }

  espaco(h: number): void {
    this.y -= h;
  }

  regua(): void {
    this.garantir(8);
    this.y -= 6;
    this.atual.push({ t: "linha", x1: MARGEM, y1: this.y, x2: A4.w - MARGEM, y2: this.y });
    this.y -= 6;
  }

  imagem(w: number, h: number): void {
    this.garantir(h + 4);
    this.y -= h;
    this.atual.push({ t: "imagem", x: MARGEM, y: this.y, w, h });
  }
}

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function conteudo(ops: Op[]): number[] {
  const out: number[] = [];
  for (const op of ops) {
    if (op.t === "texto") {
      out.push(...enc(`BT /${op.negrito ? "F2" : "F1"} ${op.tam} Tf ${op.x.toFixed(2)} ${op.y.toFixed(2)} Td `));
      out.push(...literal(op.s));
      out.push(...enc(" Tj ET\n"));
    } else if (op.t === "linha") {
      out.push(...enc(`0.75 G 0.5 w ${op.x1.toFixed(2)} ${op.y1.toFixed(2)} m ${op.x2.toFixed(2)} ${op.y2.toFixed(2)} l S 0 G\n`));
    } else {
      out.push(...enc(`q ${op.w.toFixed(2)} 0 0 ${op.h.toFixed(2)} ${op.x.toFixed(2)} ${op.y.toFixed(2)} cm /Im1 Do Q\n`));
    }
  }
  return out;
}

/** Monta o PDF. Devolve os bytes, prontos a subir para o storage. */
export function gerarPdfAuto(d: DadosAuto, assinatura: Assinatura | null): Uint8Array {
  const p = new Paginas();

  if (d.empresa) p.texto(d.empresa, 9, false);
  p.texto("Auto de receção da obra", 18, true);
  p.texto(`${d.codigo} — ${d.titulo}`, 11, true);
  p.regua();
  if (d.cliente) p.texto(`Cliente: ${d.cliente}`, 10);
  if (d.morada) p.texto(`Morada: ${d.morada}`, 10);
  for (const [r, v] of d.linhasDatas) p.texto(`${r}: ${v}`, 10);
  p.texto(`Tarefas: ${d.tarefas}`, 10);
  p.espaco(6);

  p.texto(d.remates.length ? `Remates pendentes (${d.remates.length})` : "Remates pendentes: nenhum", 11, true);
  for (const r of d.remates) p.texto(`• ${r}`, 10, false, 10);
  p.espaco(6);

  if (d.observacoes?.trim()) {
    p.texto("Observações", 11, true);
    p.texto(d.observacoes.trim(), 10);
    p.espaco(6);
  }

  p.regua();
  p.texto(
    "O cliente declara que recebeu a obra acima identificada, nas condições em que se encontra, " +
      (d.remates.length
        ? "com os remates pendentes indicados, que a empresa se compromete a resolver."
        : "sem remates pendentes."),
    10
  );
  p.espaco(10);

  let largura = 0;
  let altura = 0;
  if (assinatura && assinatura.largura > 0 && assinatura.altura > 0) {
    largura = Math.min(220, assinatura.largura);
    altura = (largura * assinatura.altura) / assinatura.largura;
    if (altura > 110) {
      altura = 110;
      largura = (altura * assinatura.largura) / assinatura.altura;
    }
    p.texto("Assinatura do cliente:", 10, true);
    p.imagem(largura, altura);
  }
  p.regua();
  p.texto(`${d.assinante} · ${d.assinadoEm}`, 10);

  // ── Objetos ── (cada um é uma lista de blocos; a assinatura entra inteira)
  const objetos: Uint8Array[][] = [];
  const nPag = p.paginas.length;
  // 1 catálogo, 2 páginas, 3 F1, 4 F2, 5 imagem (ou vazio), depois pares página/conteúdo.
  const idPagina = (i: number) => 6 + 2 * i;
  const idConteudo = (i: number) => 7 + 2 * i;
  const B = (s: string) => Uint8Array.from(enc(s));
  const NL = "\n";

  objetos[1] = [B("<< /Type /Catalog /Pages 2 0 R >>")];
  objetos[2] = [B(`<< /Type /Pages /Count ${nPag} /Kids [${p.paginas.map((_, i) => `${idPagina(i)} 0 R`).join(" ")}] >>`)];
  objetos[3] = [B("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")];
  objetos[4] = [B("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")];
  objetos[5] = assinatura
    ? [
        B(
          `<< /Type /XObject /Subtype /Image /Width ${assinatura.largura} /Height ${assinatura.altura} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${assinatura.jpeg.length} >>` +
            NL + "stream" + NL
        ),
        assinatura.jpeg,
        B(NL + "endstream"),
      ]
    : [B("<< >>")];
  p.paginas.forEach((ops, i) => {
    const c = Uint8Array.from(conteudo(ops));
    objetos[idPagina(i)] = [
      B(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${assinatura ? " /XObject << /Im1 5 0 R >>" : ""} >> ` +
          `/Contents ${idConteudo(i)} 0 R >>`
      ),
    ];
    objetos[idConteudo(i)] = [B(`<< /Length ${c.length} >>` + NL + "stream" + NL), c, B(NL + "endstream")];
  });

  const blocos: Uint8Array[] = [B("%PDF-1.4" + NL + "%"), Uint8Array.from([0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  let tamanho = blocos.reduce((n, b) => n + b.length, 0);
  const juntar = (b: Uint8Array) => {
    blocos.push(b);
    tamanho += b.length;
  };
  const offsets: number[] = [];
  for (let id = 1; id < objetos.length; id++) {
    offsets[id] = tamanho;
    juntar(B(`${id} 0 obj` + NL));
    for (const b of objetos[id]) juntar(b);
    juntar(B(NL + "endobj" + NL));
  }
  const xref = tamanho;
  // Cada entrada da tabela xref tem exatamente 20 bytes (o fim de linha é " \n").
  let tabela = "xref" + NL + `0 ${objetos.length}` + NL + "0000000000 65535 f " + NL;
  for (let id = 1; id < objetos.length; id++) tabela += `${String(offsets[id]).padStart(10, "0")} 00000 n ` + NL;
  tabela += "trailer" + NL + `<< /Size ${objetos.length} /Root 1 0 R >>` + NL + "startxref" + NL + xref + NL + "%%EOF" + NL;
  juntar(B(tabela));

  const out = new Uint8Array(tamanho);
  let k = 0;
  for (const b of blocos) {
    out.set(b, k);
    k += b.length;
  }
  return out;
}
