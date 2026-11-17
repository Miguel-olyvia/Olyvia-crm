// 13/11: os atributos do produto (Medida, Cor, Tonalidade…): as contas e os textos puros, sem ecrã nem base.
// Ficam aqui o hex, o texto da medida, a linha curta da lista («Cor: Preto · Medida: 60×60 cm»), o texto da pesquisa e o formato
// que cat_guardar_produto_atributos recebe.
import type { AtributoDef, AtributoProduto, DimensaoMedida, MedidaAtributo, Produto } from "./v2/catalogoModelo";

const HEX = /^#[0-9a-f]{6}$/i;
export const hexValido = (s: string): boolean => HEX.test(s);
/** «1a2b3c» ou «#1A2B3C» → «#1A2B3C»; o que não for #RRGGBB → null. */
export function normalizarHex(s: string): string | null {
  const t = s.trim(), c = t.startsWith("#") ? t : `#${t}`;
  return hexValido(c) ? c.toUpperCase() : null;
}

const num = (x: number) => String(x).replace(".", ",");
const textoDim = (d: DimensaoMedida): string => (typeof d === "number" ? num(d) : `${num(d.de)}–${num(d.ate)}`);
/** «60×60 cm», «12,5×25×0,8 mm»; com algum intervalo, «91–100 × 90 cm» (espaços à volta do ×, para o traço do intervalo não se confundir). */
export const textoMedida = (m: MedidaAtributo): string => {
  const partes = [m.largura, m.comprimento, ...(m.tipo === "3D" && m.espessura != null ? [m.espessura] : [])];
  return `${partes.map(textoDim).join(partes.some((p) => typeof p !== "number") ? " × " : "×")} ${m.unidade}`;
};

/* ---- a dimensão como se escreve no ecrã (texto) e como a base a recebe (número ou {de, ate}) */
/** `iv`: modo intervalo. Em modo número só se usa `a`; em intervalo `a` é o «de» e `b` o «até». */
export interface DimensaoTexto { iv: boolean; a: string; b: string }
export const dimensaoVazia = (): DimensaoTexto => ({ iv: false, a: "", b: "" });
const emTexto = (x: number) => String(x).replace(".", ",");
export const dimensaoParaTexto = (d: DimensaoMedida | null | undefined): DimensaoTexto =>
  d == null ? dimensaoVazia() : typeof d === "number" ? { iv: false, a: emTexto(d), b: "" } : { iv: true, a: emTexto(d.de), b: emTexto(d.ate) };

const MAXIMO = 100000, CASAS = 3;
const ERRO_NUMERO = "Escreva um número maior que 0.";
/** Um valor escrito: vazio → {v:null, erro:null} (incompleto); inválido → erro. As regras da base: > 0, até 100000, no máximo 3 casas. */
function lerValor(t: string): { v: number | null; erro: string | null } {
  const s = t.trim().replace(/\s/g, "").replace(",", ".");
  if (!s || s === "-" || s === "." || /^\d+\.$/.test(s)) return { v: null, erro: null }; // vazio ou a meio da escrita («12,», «-»): incompleto, sem erro
  if (!/^\d+(\.\d+)?$/.test(s)) return { v: null, erro: ERRO_NUMERO };
  const n = Number(s);
  if (!(n > 0)) return { v: null, erro: ERRO_NUMERO };
  if (n > MAXIMO) return { v: null, erro: `O máximo é ${MAXIMO}.` };
  if ((s.split(".")[1] ?? "").length > CASAS) return { v: null, erro: `No máximo ${CASAS} casas decimais.` };
  return { v: n, erro: null };
}
/** A dimensão escrita → o valor para a base (ou null se incompleta) e a mensagem de erro (ou null). A mesma validação da base. */
export function lerDimensao(d: DimensaoTexto): { v: DimensaoMedida | null; erro: string | null } {
  const { a: ea, b: eb } = errosDimensao(d);
  const erro = ea ?? eb;
  if (erro) return { v: null, erro };
  const a = lerValor(d.a);
  if (!d.iv) return a;
  const b = lerValor(d.b);
  return a.v == null || b.v == null ? { v: null, erro: null } : { v: { de: a.v, ate: b.v }, erro: null };
}
/** O erro de cada campo: o do «de» só marca o «de», o do «até» só o «até»; «de» ≥ «até» fica no «até». Em modo número só há `a`. */
export function errosDimensao(d: DimensaoTexto): { a: string | null; b: string | null } {
  const a = lerValor(d.a);
  if (!d.iv) return { a: a.erro, b: null };
  const b = lerValor(d.b);
  const ordem = a.erro == null && b.erro == null && a.v != null && b.v != null && !(a.v < b.v) ? "O «de» tem de ser menor que o «até»." : null;
  return { a: a.erro, b: b.erro ?? ordem };
}

/** O texto de um valor: a medida escrita, ou o nome da opção (o da definição; sem ela, o que veio com o produto). */
export function textoValor(def: AtributoDef | undefined, a: AtributoProduto): string {
  if (a.medida) return textoMedida(a.medida);
  const o = a.opcaoId ? def?.opcoes.find((x) => x.id === a.opcaoId) : undefined;
  return o ? o.nome || o.valor : a.valor ?? "";
}

/** A linha curta da lista: «Medida: 60×60 cm · Cor: Preto», pela ordem dos atributos. Atributo que já não existe: salta-se. */
export function resumoAtributos(attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined): string {
  if (!attrs?.length || !defs?.length) return "";
  const porId = new Map(defs.map((d) => [d.id, d]));
  return attrs
    .flatMap((a) => { const d = porId.get(a.atributoId); const t = d ? textoValor(d, a) : ""; return d && t ? [{ d, t }] : []; })
    .sort((x, y) => x.d.ordem - y.d.ordem)
    .map(({ d, t }) => `${d.nome}: ${t}`)
    .join(" · ");
}

/** Os valores dos atributos de um produto, para a pesquisa (o nome da opção e a medida). */
export const textoPesquisaAtributos = (p: Pick<Produto, "attrs">): string =>
  (p.attrs ?? []).map((a) => (a.medida ? textoMedida(a.medida) : a.valor ?? "")).filter(Boolean).join(" ");

/** O que cat_guardar_produto_atributos recebe: {atributo, opcao} ou {atributo, medida}. Um atributo sem valor não vai. */
export function valoresParaGravar(attrs: readonly AtributoProduto[]): ({ atributo: string; opcao: string } | { atributo: string; medida: MedidaAtributo })[] {
  return attrs.flatMap((a) => (a.medida ? [{ atributo: a.atributoId, medida: a.medida }] : a.opcaoId ? [{ atributo: a.atributoId, opcao: a.opcaoId }] : []));
}

/** Número ou [de, ate]: a ordem das chaves do objeto (a base devolve-as por outra ordem) não conta. */
const chaveDim = (d: DimensaoMedida | null | undefined) => (d == null ? null : typeof d === "number" ? d : [d.de, d.ate]);

/** Os mesmos valores nos mesmos atributos (sem contar a ordem nem o texto em `valor`). */
export function mesmosAtributos(a: readonly AtributoProduto[] | undefined, b: readonly AtributoProduto[] | undefined): boolean {
  const chave = (L: readonly AtributoProduto[] | undefined) =>
    JSON.stringify(valoresParaGravar(L ?? [])
      .map((v) => ("medida" in v ? [v.atributo, v.medida.tipo, chaveDim(v.medida.largura), chaveDim(v.medida.comprimento), chaveDim(v.medida.espessura), v.medida.unidade] : [v.atributo, v.opcao]))
      .sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
  return chave(a) === chave(b);
}
