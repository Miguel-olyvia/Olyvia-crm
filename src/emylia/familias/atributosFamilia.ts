// Famílias (configurador): o ADAPTADOR dos atributos estruturados do catálogo e a leitura/ordenação das medidas. Funções puras, sem React, sem base, sem rede.
//
// ENTRADA: `Produto.attrs` (AtributoProduto[]: opção da lista ou medida) + as `AtributoDef` (v2/catalogoModelo.ts). SAÍDA (`atributosDoItem`): o que o núcleo lê —
//   atributos  nome do atributo → texto (`textoValor`, o mesmo texto que o catálogo mostra: «Largura 70 cm», «60×60 cm», «Branco»)
//   hex        nome do atributo → lista de hex, SÓ de atributos com `temHex`, e sempre vindo da OPÇÃO (nunca do nome: nada se adivinha)
//   intervalos nomes dos atributos cuja medida tem algum intervalo {de, ate}
//   avisos     o que se ignorou (hex inválido)
//
// DECISÕES (13/11 em diante; documentadas aqui porque o núcleo e os testes dependem delas):
//  1. HEX. A base tem UNIQUE (product_id, attribute_id): um valor e um hex (da opção) por atributo e produto, e a cor normal dá um hex. A cor dupla é opcional e só se aceita
//     numa opção cujo `hex` traz vários separados por vírgula/espaço («#FFFFFF, #000000»). Um hex que não seja #RRGGBB ignora-se e fica um aviso; o atributo continua a
//     existir pelo nome (a cor fica «sem hex», sem bloquear). Um atributo REPETIDO no mesmo produto (não devia existir) usa a primeira linha e fica um aviso com os valores.
//  2. MEDIDA 1D vs 2D/3D. Ambas são valores únicos legítimos do atributo «Medida», mas não se medem pela mesma régua: «Largura 70 cm» não é «60×60 cm». A ordem é
//     2D/3D (por área, depois largura, comprimento, espessura) → 1D (largura < altura < comprimento < espessura; depois pelo valor) → o resto por texto (números por valor).
//     Misturar 1D e 2D/3D na mesma família NÃO bloqueia (o núcleo emite um AVISO `medida_mista`): é provável engano no catálogo, mas é uma escolha do utilizador.
//  3. INTERVALOS. Um intervalo («91–100 × 90 cm», «Largura 100–105 cm») descreve uma gama, não UMA medida; não é um valor de variante. O núcleo não o aceita como variante:
//     o produto fica de fora e é um ERRO «medida em intervalo». Só conta se a medida for um dos eixos escolhidos. Para ordenar (a função tem de ser total), o intervalo
//     entra pelo limite inferior e depois pelo superior.
//  4. ORDEM TOTAL E ESTÁVEL. `compararMedidas` nunca devolve 0 para textos diferentes (valores iguais, como «600×600 mm» e «60×60 cm», desempatam por texto), por isso o
//     resultado não depende da ordem de entrada. Unidades: cm e mm (mm → cm dividindo por 10).
import type { AtributoDef, AtributoProduto, DimensaoMedida, DimensaoUnica, MedidaAtributo, Produto } from "../v2/catalogoModelo";
import { normalizarHex, textoValor } from "../atributosTexto";

/** O nome do atributo da medida; o atributo cujo código é «medida» chama-se sempre assim no núcleo, seja qual for o nome na definição. */
export const NOME_MEDIDA = "Medida";
const CODIGO_MEDIDA = "medida";
const nomeDoAtributo = (def: AtributoDef): string => ((def.codigo ?? "").trim().toLowerCase() === CODIGO_MEDIDA ? NOME_MEDIDA : def.nome);

/** O que o núcleo lê de um produto: ver o cabeçalho. */
export interface AtributosDoItem {
  atributos: Record<string, string>;
  hex: Record<string, string[]>;
  intervalos: string[];
  avisos: string[];
}

const temIntervalo = (m: MedidaAtributo): boolean => {
  const dims: (DimensaoMedida | null)[] = m.tipo === "1D" ? [m.valor] : [m.largura, m.comprimento, m.espessura];
  return dims.some((d) => d !== null && typeof d === "object");
};

/** Os hex de uma opção («#F5F5F0» ou «#FFFFFF, #000000»), validados; o que não for #RRGGBB vai para `maus`. */
function hexDaOpcao(bruto: string | null | undefined): { validos: string[]; maus: string[] } {
  const validos: string[] = [], maus: string[] = [];
  for (const h of (bruto ?? "").split(/[\s,;/]+/).filter(Boolean)) {
    const n = normalizarHex(h);
    if (n) validos.push(n); else maus.push(h);
  }
  return { validos, maus };
}

/** Os atributos de um produto do catálogo no formato do núcleo. Nunca lança; atributo sem definição ou sem valor salta-se. Não muta os argumentos. */
export function atributosDoItem(produto: Pick<Produto, "attrs">, defs: readonly AtributoDef[] | undefined): AtributosDoItem {
  const r: AtributosDoItem = { atributos: {}, hex: {}, intervalos: [], avisos: [] };
  if (!produto.attrs?.length || !defs?.length) return r;
  const porId = new Map(defs.map((d) => [d.id, d] as const)), grupos = new Map<string, AtributoProduto[]>();
  for (const a of produto.attrs) grupos.set(a.atributoId, [...(grupos.get(a.atributoId) ?? []), a]);
  for (const [id, linhas] of grupos) {
    const def = porId.get(id);
    if (!def) continue;
    const comTexto = linhas.map((a) => ({ a, t: textoValor(def, a).trim() })).filter((x) => x.t), nome = nomeDoAtributo(def);
    if (comTexto.length === 0) continue;
    const { a: usada, t } = comTexto[0];
    r.atributos[nome] = t;
    if (comTexto.length > 1) r.avisos.push(`«${nome}»: o produto tem mais de um valor neste atributo (${comTexto.map((x) => x.t).join("; ")}): só se usa o primeiro.`);
    if (usada.medida && temIntervalo(usada.medida)) r.intervalos.push(nome);
    if (!def.temHex) continue;
    const o = usada.opcaoId ? def.opcoes.find((x) => x.id === usada.opcaoId) : undefined, { validos, maus } = hexDaOpcao(o?.hex);
    for (const m of maus) r.avisos.push(`«${nome}»: hex inválido «${m}» ignorado.`);
    if (validos.length) r.hex[nome] = validos;
  }
  return r;
}

/* ------------------------------------------------------------------ medidas em texto */
export interface Intervalo { de: number; ate: number }
export interface MedidaLida {
  tipo: "1D" | "2D" | "3D";
  /** só em 1D */ dimensao?: DimensaoUnica;
  /** uma por dimensão, na unidade do texto; um valor único tem de = ate */ dims: Intervalo[];
  unidade: "cm" | "mm";
  intervalo: boolean;
}
const NUM = String.raw`\d+(?:[.,]\d+)?`, DIM = String.raw`${NUM}(?:\s*[–-]\s*${NUM})?`;
const RE_1D = new RegExp(String.raw`^(largura|altura|comprimento|espessura)\s+(${DIM})\s*(cm|mm)$`, "i");
const RE_ND = new RegExp(String.raw`^(${DIM}(?:\s*[×x]\s*${DIM}){1,2})\s*(cm|mm)$`, "i");
const ORDEM_1D: Readonly<Record<DimensaoUnica, number>> = { largura: 0, altura: 1, comprimento: 2, espessura: 3 };
const n = (s: string): number => Number(s.replace(",", "."));
const lerDim = (s: string): Intervalo => { const p = s.split(/[–-]/).map((x) => n(x.trim())); return { de: p[0], ate: p[p.length - 1] }; };
const finitas = (dims: readonly Intervalo[]): boolean => dims.every((d) => Number.isFinite(d.de) && Number.isFinite(d.ate));

/** Lê o texto de uma medida do catálogo («Largura 70 cm», «60×60 cm», «12,5×25×0,8 mm», «91–100 × 90 cm»); o que não for uma medida → undefined. */
export function lerMedidaTexto(texto: string): MedidaLida | undefined {
  const t = (texto ?? "").trim();
  const a = RE_1D.exec(t);
  if (a) { const dims = [lerDim(a[2])]; if (!finitas(dims)) return undefined; return { tipo: "1D", dimensao: a[1].toLowerCase() as DimensaoUnica, dims, unidade: a[3].toLowerCase() as "cm" | "mm", intervalo: dims[0].de !== dims[0].ate }; }
  const b = RE_ND.exec(t);
  if (!b) return undefined;
  const dims = b[1].split(/\s*[×x]\s*/i).map(lerDim);
  if (!finitas(dims)) return undefined;
  return { tipo: dims.length === 3 ? "3D" : "2D", dims, unidade: b[2].toLowerCase() as "cm" | "mm", intervalo: dims.some((d) => d.de !== d.ate) };
}
/** «1D», «2D», «3D» ou «texto» (o que não se lê como medida). */
export const tipoDaMedida = (texto: string): "1D" | "2D" | "3D" | "texto" => lerMedidaTexto(texto)?.tipo ?? "texto";

const emCm = (m: MedidaLida): Intervalo[] => (m.unidade === "mm" ? m.dims.map((d) => ({ de: d.de / 10, ate: d.ate / 10 })) : m.dims);
/** Largura × comprimento em cm (mm convertido; intervalo pelo limite inferior; a espessura ignora-se) e a área; só para 2D/3D, senão undefined. */
export function medidaEmCm(valor: string): { largura: number; comprimento: number; area: number } | undefined {
  const m = lerMedidaTexto(valor);
  if (!m || m.tipo === "1D") return undefined;
  const [l, c] = emCm(m);
  return { largura: l.de, comprimento: c.de, area: l.de * c.de };
}

const CHAVE_ND = (m: MedidaLida): number[] => {
  const [l, c, e] = emCm(m);
  return [l.de * c.de, l.de, c.de, l.ate, c.ate, e?.de ?? 0, e?.ate ?? 0];
};
const CHAVE_1D = (m: MedidaLida): number[] => { const [d] = emCm(m); return [ORDEM_1D[m.dimensao ?? "largura"], d.de, d.ate]; };
const texto = (a: string, b: string): number => a.localeCompare(b, "pt", { numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);

/** Ordem total e estável das medidas em texto: 2D/3D por área → 1D por dimensão e valor → o resto por texto (números por valor). Ver o cabeçalho. */
export function compararMedidas(a: string, b: string): number {
  const x = lerMedidaTexto(a), y = lerMedidaTexto(b), gx = x ? (x.tipo === "1D" ? 1 : 0) : 2, gy = y ? (y.tipo === "1D" ? 1 : 0) : 2;
  if (gx !== gy) return gx - gy;
  if (x && y) {
    const kx = gx === 0 ? CHAVE_ND(x) : CHAVE_1D(x), ky = gy === 0 ? CHAVE_ND(y) : CHAVE_1D(y);
    for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i] - ky[i];
  }
  return texto(a ?? "", b ?? "");
}
