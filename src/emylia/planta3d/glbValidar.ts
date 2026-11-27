// 27/11: a validação de um GLB próprio (o ficheiro que a empresa carrega numa categoria, subcategoria ou Modelo), ANTES de o enviar e antes de o mostrar. Sem React nem three:
// só lê o contentor (cabeçalho glTF 2, blocos JSON e binário) e o JSON. As regras do dono: só `.glb` autocontido (nada de URI externos), meshopt permitido e Draco recusado com
// mensagem própria, até 5 MB, aviso a partir de 50 000 triângulos e recusa acima de 200 000, aviso de imagem embebida com mais de 2 MB. Y para cima e frente a +Z são
// convenções do glTF que não se conseguem verificar aqui: dizem-se na ajuda do ecrã. Os textos são para quem carrega o ficheiro (português, sem jargão desnecessário).
//
// `validarGlb` é síncrona e pura. `analisarGlb` acrescenta a prova de que o carregador do 3D (o mesmo GLTFLoader + meshopt de modelosHtml/glb.ts) consegue abrir o ficheiro; o three
// só se carrega aí (import dinâmico), por isso importar este módulo não puxa o three para quem só valida.

/** O limite do ficheiro (o do bucket e do CHECK da base: 5 MB). */
export const LIMITE_BYTES = 5 * 1024 * 1024;
/** O mínimo que a base aceita (CHECK glb_bytes BETWEEN 12 AND 5242880): o cabeçalho de um GLB tem 12 bytes. */
export const MIN_BYTES = 12;
/** A partir daqui avisa-se (o modelo fica pesado no telemóvel), e acima de MAX_TRIANGULOS recusa-se. */
export const AVISO_TRIANGULOS = 50_000;
export const MAX_TRIANGULOS = 200_000;
/** Uma imagem embebida acima disto pesa na carga: aviso, não recusa. */
export const AVISO_IMAGEM_BYTES = 2 * 1024 * 1024;

/** As extensões que o carregador do 3D sabe abrir sem decodificadores extra (Draco e KTX2/basisu pedem um e não o temos: ficam fora). */
export const EXTENSOES_PERMITIDAS: readonly string[] = [
  "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_transform", "KHR_materials_unlit", "KHR_materials_emissive_strength",
];
const DRACO = "KHR_draco_mesh_compression";

const MAGIA_GLTF = 0x46546c67, BLOCO_JSON = 0x4e4f534a, BLOCO_BIN = 0x004e4942;

export interface RelatorioGlb {
  /** sem nenhum erro: pode enviar-se e mostrar-se (os avisos não impedem) */
  ok: boolean;
  erros: string[]; avisos: string[];
  /** triângulos de todas as malhas (contados no JSON; com meshopt também valem: os acessores trazem o número descomprimido) */
  triangulos: number; malhas: number;
  /** os nomes dos materiais (sem repetir, pela ordem do ficheiro; um material sem nome não aparece) */
  materiais: string[];
  bytes: number;
}

/** Formatos fixos (sem depender do ICU do ambiente): «5,1» MB e «50 000». */
const MB = (n: number) => (n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "").replace(".", ",");
const MIL = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

type Json = Record<string, unknown>;
const objeto = (x: unknown): Json => (x && typeof x === "object" && !Array.isArray(x) ? (x as Json) : {});
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const inteiro = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);

const vazio = (bytes: number): RelatorioGlb => ({ ok: false, erros: [], avisos: [], triangulos: 0, malhas: 0, materiais: [], bytes });
const recusar = (r: RelatorioGlb, ...erros: string[]): RelatorioGlb => ({ ...r, ok: false, erros: [...r.erros, ...erros] });

/** O URI de um buffer ou imagem: ausente (vai no bloco binário) e `data:` (embebido) são autocontidos; qualquer outro aponta para fora. */
const eExterno = (uri: unknown): boolean => typeof uri === "string" && uri !== "" && !/^data:/i.test(uri);

/** Triângulos de uma primitiva: pelo modo (lista, faixa, leque; linhas e pontos não contam), com os índices se os há, senão com os vértices. */
function triangulosDaPrimitiva(p: Json, acessores: unknown[]): number {
  const modo = typeof p.mode === "number" ? p.mode : 4;
  if (modo < 4 || modo > 6) return 0;
  const ia = typeof p.indices === "number" ? p.indices : null;
  const pos = objeto(p.attributes).POSITION;
  const n = ia !== null ? inteiro(objeto(acessores[ia]).count) : typeof pos === "number" ? inteiro(objeto(acessores[pos]).count) : 0;
  return modo === 4 ? Math.floor(n / 3) : Math.max(0, n - 2);
}

/** O tecto de visitas ao percorrer os nós (um grafo de nós partilhados pode crescer exponencialmente): acima disto o ficheiro recusa-se. */
const MAX_VISITAS_NOS = 100_000;

/**
 * Os triângulos que o 3D desenha: o carregador cria uma malha POR NÓ que usa a malha do ficheiro (a geometria é partilhada, a contagem não), e só da cena por omissão. Percorre
 * a cena a contar cada malha tantas vezes quantos os nós que a usam, sem seguir um nó que já está na sua própria linha de descendência (ciclo). Sem cenas (ficheiro mínimo) conta
 * cada malha uma vez. Devolve null se o grafo de nós é grande de mais para se percorrer.
 */
function triangulosDaCena(json: Json, porMalha: number[]): number | null {
  const cenas = lista(json.scenes), nos = lista(json.nodes);
  const idx = typeof json.scene === "number" ? json.scene : 0;
  const cena = cenas.length > 0 ? objeto(cenas[idx] ?? cenas[0]) : null;
  if (!cena) return porMalha.reduce((s, n) => s + n, 0);
  let total = 0, visitas = 0;
  const naLinha = new Set<number>();
  const visitar = (i: unknown): boolean => {
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= nos.length || naLinha.has(i)) return true;
    if (++visitas > MAX_VISITAS_NOS) return false;
    const no = objeto(nos[i]);
    if (typeof no.mesh === "number") total += porMalha[no.mesh] ?? 0;
    naLinha.add(i);
    for (const f of lista(no.children)) if (!visitar(f)) return false;
    naLinha.delete(i);
    return true;
  };
  for (const raiz of lista(cena.nodes)) if (!visitar(raiz)) return null;
  return total;
}

/**
 * Valida o contentor e o JSON de um GLB. Nunca lança: tudo o que está mal vem em `erros` (em português); `ok` é «sem erros». Vários erros independentes juntam-se (o ficheiro
 * mostra de uma vez tudo o que tem de mudar), menos os do contentor, que impedem de ler o resto.
 */
export function validarGlb(entrada: ArrayBuffer | Uint8Array): RelatorioGlb {
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  const r0 = vazio(bytes.byteLength);
  if (bytes.byteLength < MIN_BYTES) return recusar(r0, "O ficheiro é demasiado pequeno para ser um GLB.");
  if (bytes.byteLength > LIMITE_BYTES) return recusar(r0, `O ficheiro tem ${MB(bytes.byteLength)} MB: o limite é 5 MB. Reduza as texturas ou use compressão meshopt.`);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== MAGIA_GLTF) return recusar(r0, "Não é um ficheiro GLB (falta o cabeçalho glTF). Exporte em formato .glb (binário), não .gltf nem outro formato.");
  const versao = v.getUint32(4, true);
  if (versao !== 2) return recusar(r0, `O GLB está na versão ${versao} do glTF: só se aceita a versão 2.`);
  const declarado = v.getUint32(8, true);
  if (declarado > bytes.byteLength) return recusar(r0, "O ficheiro está truncado (incompleto): volte a exportar o GLB.");
  const fim = Math.min(declarado, bytes.byteLength);

  // 27/11: o GLTFLoader fica com o ÚLTIMO bloco JSON e o último BIN que encontra; se aqui se validasse o primeiro, um segundo bloco JSON (com um URI externo, por exemplo) escapava
  // à validação e o carregador seguia-o. Por isso só se aceita UM bloco JSON (o primeiro, como manda a especificação) e UM binário; blocos de tipo desconhecido o carregador ignora.
  const blocos: { tipo: number; ini: number; n: number }[] = [];
  let p = 12;
  for (; p + 8 <= fim;) {
    const n = v.getUint32(p, true), tipo = v.getUint32(p + 4, true);
    if (p + 8 + n > fim) return recusar(r0, "O ficheiro está truncado (incompleto): volte a exportar o GLB.");
    blocos.push({ tipo, ini: p + 8, n });
    p += 8 + n;
  }
  // sobram bytes dentro do tamanho declarado, mas menos que um cabeçalho de bloco: o carregador tentaria lê-los como um bloco
  if (p !== fim) return recusar(r0, "O ficheiro tem bytes a mais depois do último bloco (está corrompido): volte a exportar o GLB.");
  const jsons = blocos.filter((b) => b.tipo === BLOCO_JSON), bins = blocos.filter((b) => b.tipo === BLOCO_BIN);
  if (jsons.length > 1) return recusar(r0, "O GLB tem mais de um bloco JSON: volte a exportar o ficheiro.");
  if (bins.length > 1) return recusar(r0, "O GLB tem mais de um bloco binário: volte a exportar o ficheiro.");
  if (jsons.length === 1 && blocos[0]?.tipo !== BLOCO_JSON) return recusar(r0, "O GLB tem os blocos fora de ordem (o JSON tem de vir primeiro): volte a exportar o ficheiro.");
  const temBin = bins.length === 1;
  let json: Json | null = null;
  if (jsons[0]) {
    try { json = objeto(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(jsons[0].ini, jsons[0].ini + jsons[0].n)))); }
    catch { return recusar(r0, "O JSON do GLB está corrompido: volte a exportar o ficheiro."); }
  }
  if (json === null) return recusar(r0, "O GLB não tem o bloco JSON: volte a exportar o ficheiro.");
  if (!String(objeto(json.asset).version ?? "").startsWith("2")) return recusar(r0, "O GLB não declara a versão 2 do glTF.");

  let r = r0;
  const erros: string[] = [], avisos: string[] = [];

  // autocontido: nada a apontar para fora (a empresa só envia UM ficheiro)
  const buffers = lista(json.buffers), imagens = lista(json.images);
  buffers.forEach((b, i) => { if (eExterno(objeto(b).uri)) erros.push(`O GLB depende de um ficheiro externo (buffer ${i}): exporte um .glb autocontido, com tudo dentro.`); });
  imagens.forEach((im, i) => { if (eExterno(objeto(im).uri)) erros.push(`O GLB depende de um ficheiro externo (a imagem ${i}): exporte um .glb autocontido, com as texturas dentro.`); });
  if (buffers.length > 0 && objeto(buffers[0]).uri === undefined && !temBin) erros.push("O GLB não traz o bloco binário com a geometria: volte a exportar o ficheiro.");

  // extensões: Draco tem a sua mensagem; as outras só as da lista
  const exigidas = lista(json.extensionsRequired).filter((x): x is string => typeof x === "string");
  const malhas = lista(json.meshes);
  const dracoNasMalhas = malhas.some((m) => lista(objeto(m).primitives).some((p) => objeto(objeto(p).extensions)[DRACO] !== undefined));
  if (exigidas.includes(DRACO) || dracoNasMalhas) erros.push("O modelo usa compressão Draco, que não é suportada. Reexporte sem compressão ou com compressão meshopt.");
  for (const e of exigidas) if (e !== DRACO && !EXTENSOES_PERMITIDAS.includes(e)) erros.push(`O modelo exige a extensão ${e}, que não é suportada.`);

  // malhas e triângulos
  const acessores = lista(json.accessors);
  const porMalha = malhas.map((m) => lista(objeto(m).primitives).reduce<number>((s, pr) => s + triangulosDaPrimitiva(objeto(pr), acessores), 0));
  const daCena = triangulosDaCena(json, porMalha);
  if (daCena === null) erros.push("O GLB tem uma hierarquia de nós demasiado grande para o 3D: simplifique a cena e volte a exportar.");
  const triangulos = daCena ?? 0;
  if (daCena !== null && (malhas.length === 0 || triangulos === 0)) erros.push("O GLB não tem nenhuma malha com triângulos para desenhar.");
  if (triangulos > MAX_TRIANGULOS) erros.push(`O modelo tem ${MIL(triangulos)} triângulos: o limite é ${MIL(MAX_TRIANGULOS)}. Simplifique a malha.`);
  else if (triangulos >= AVISO_TRIANGULOS) avisos.push(`O modelo tem ${MIL(triangulos)} triângulos (a partir de ${MIL(AVISO_TRIANGULOS)} pode ficar pesado no telemóvel).`);

  // imagens embebidas pesadas
  const vistas = lista(json.bufferViews);
  imagens.forEach((im, i) => {
    const bv = objeto(im).bufferView;
    const n = typeof bv === "number" ? inteiro(objeto(vistas[bv]).byteLength) : 0;
    if (n > AVISO_IMAGEM_BYTES) avisos.push(`A imagem ${i} embebida tem ${MB(n)} MB (mais de 2 MB): reduza a textura para o ficheiro abrir mais depressa.`);
  });

  const materiais = [...new Set(lista(json.materials).map((m) => objeto(m).name).filter((n): n is string => typeof n === "string" && n !== ""))];
  r = { ...r, erros, avisos, triangulos, malhas: malhas.length, materiais };
  return { ...r, ok: erros.length === 0 };
}

/** `abriu`: o carregador do 3D conseguiu ler o ficheiro (só se tenta se a validação passou). */
export interface AnaliseGlb extends RelatorioGlb { abriu: boolean }

/**
 * `validarGlb` e, se passou, a prova de que o carregador do 3D (GLTFLoader com o descodificador meshopt, como lerGlb em modelosHtml/glb.ts) abre o ficheiro: apanha o que o
 * JSON esconde (acessores partidos, bloco binário curto, textura que não decodifica). Uma falha de leitura vira um erro em português, nunca uma excepção.
 */
export async function analisarGlb(entrada: ArrayBuffer | Uint8Array): Promise<AnaliseGlb> {
  const r = validarGlb(entrada);
  if (!r.ok) return { ...r, abriu: false };
  const copia = entrada instanceof Uint8Array ? (entrada.buffer.slice(entrada.byteOffset, entrada.byteOffset + entrada.byteLength) as ArrayBuffer) : entrada;
  try {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("meshoptimizer/decoder")]);
    const carregador = new GLTFLoader();
    carregador.setMeshoptDecoder(MeshoptDecoder);
    await new Promise<void>((resolver, rejeitar) => carregador.parse(copia, "", () => resolver(), (e) => rejeitar(e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e)))));
    return { ...r, abriu: true };
  } catch (e) {
    return { ...r, ok: false, abriu: false, erros: [...r.erros, `O ficheiro não abriu no 3D (${(e as Error).message || "erro desconhecido"}): volte a exportar o GLB.`] };
  }
}
