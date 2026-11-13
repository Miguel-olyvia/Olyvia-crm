// 13/11: os atributos do produto (Medida, Cor, Tonalidade…): as contas e os textos puros, sem ecrã nem base.
// Ficam aqui o hex, o texto da medida, a linha curta da lista («Cor: Preto · Medida: 60×60 cm»), o texto da pesquisa e o formato
// que cat_guardar_produto_atributos recebe.
import type { AtributoDef, AtributoProduto, MedidaAtributo, Produto } from "./v2/catalogoModelo";

const HEX = /^#[0-9a-f]{6}$/i;
export const hexValido = (s: string): boolean => HEX.test(s);
/** «1a2b3c» ou «#1A2B3C» → «#1A2B3C»; o que não for #RRGGBB → null. */
export function normalizarHex(s: string): string | null {
  const t = s.trim(), c = t.startsWith("#") ? t : `#${t}`;
  return hexValido(c) ? c.toUpperCase() : null;
}

const num = (x: number) => String(x).replace(".", ",");
/** «60×60 cm», «12,5×25×0,8 mm». */
export const textoMedida = (m: MedidaAtributo): string =>
  `${[m.largura, m.comprimento, ...(m.tipo === "3D" && m.espessura != null ? [m.espessura] : [])].map(num).join("×")} ${m.unidade}`;

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

/** Os mesmos valores nos mesmos atributos (sem contar a ordem nem o texto em `valor`). */
export function mesmosAtributos(a: readonly AtributoProduto[] | undefined, b: readonly AtributoProduto[] | undefined): boolean {
  const chave = (L: readonly AtributoProduto[] | undefined) =>
    JSON.stringify(valoresParaGravar(L ?? [])
      .map((v) => ("medida" in v ? [v.atributo, v.medida.tipo, v.medida.largura, v.medida.comprimento, v.medida.espessura ?? null, v.medida.unidade] : [v.atributo, v.opcao]))
      .sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
  return chave(a) === chave(b);
}
