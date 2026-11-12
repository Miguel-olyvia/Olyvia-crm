// Protótipo (visualizador 3D): a COMPOSIÇÃO LIVRE. O utilizador junta produtos diferentes (lava-loiça, torneira, placa, produtos do catálogo) numa lista e
// põe-nos na planta de uma vez. Reutiliza o mecanismo dos conjuntos (conjuntos.ts): cada parte é uma peça com `conj`, `papel`, `lx`/`ly` e a primeira é a
// âncora; assim o conjunto move-se, roda e soma como um só (reposicionarConjunto, linhasVendaveis, totalDasLinhas). Só no ecrã: nada vai para a base.
// Funções puras (cm, como conjuntos.ts).
import type { PecaPlanta, Ponto } from "../planta";
import type { ProdutoModelo3D } from "./catalogo3d";
import { TIPO_LEGADO } from "./catalogo3d";
import { ID_COMPOSICAO_LIVRE, camposDaVariante } from "./conjuntos";
import { familiaPorId, modeloDaFamilia, resolverVariante } from "./familias";

/** Folga entre partes vizinhas na fila (cm). */
export const GAP_CM = 5;
const arred1 = (n: number) => Math.round(n * 10) / 10;
const arred2 = (n: number) => Math.round(n * 100) / 100;

/** Uma parte da composição: o modelo (de uma variante de família, ou um produto do catálogo) e um identificador só desta lista. */
export interface ParteLivre { uid: string; modelo: ProdutoModelo3D }
export interface DescricaoParte { nome: string; variante: string; sku?: string; preco?: number; semPreco: boolean }
export interface LinhaLivre extends DescricaoParte { uid: string }

/** Uma variante de família (medida e acabamento caem na primeira que serve, como resolverVariante); família desconhecida dá null. */
export function parteDeFamilia(uid: string, familiaId: string, medidaId?: string, acabId?: string): ParteLivre | null {
  const f = familiaPorId(familiaId);
  return f ? { uid, modelo: modeloDaFamilia(f, medidaId, acabId) } : null;
}
/** Um produto do catálogo; portas e janelas são aberturas da parede e não entram numa composição (null). */
export function parteDeProduto(uid: string, modelo: ProdutoModelo3D): ParteLivre | null {
  return modelo.tipo === "porta" || modelo.tipo === "janela" ? null : { uid, modelo };
}
export const juntarParte = (partes: readonly ParteLivre[], parte: ParteLivre): ParteLivre[] => [...partes, parte];
export const removerParte = (partes: readonly ParteLivre[], uid: string): ParteLivre[] => partes.filter((p) => p.uid !== uid);

/** O que o painel mostra de uma parte: nome, variante, SKU e preço; sem família não há preço («sem preço», visível e fora da soma). */
export function descreverParte(p: ParteLivre): DescricaoParte {
  const f = p.modelo.fam ? familiaPorId(p.modelo.fam.familiaId) : undefined;
  if (f && p.modelo.fam) {
    const v = resolverVariante(f, p.modelo.fam.medidaId, p.modelo.fam.acabId);
    return { nome: v.nome, variante: [v.medida.rotulo, v.acabamento.nome].filter(Boolean).join(" · "), sku: v.sku, preco: v.preco, semPreco: false };
  }
  const d = p.modelo.dimensoes;
  return { nome: p.modelo.nome, variante: `${Math.round(d.larguraCm)}×${Math.round(d.profundidadeCm)} cm`, semPreco: true };
}
export const linhasDaComposicaoLivre = (partes: readonly ParteLivre[]): LinhaLivre[] => partes.map((p) => ({ uid: p.uid, ...descreverParte(p) }));
export function totalDaComposicao(partes: readonly ParteLivre[]): { total: number; semPreco: number } {
  const l = linhasDaComposicaoLivre(partes);
  return { total: arred2(l.reduce((s, x) => s + (x.preco ?? 0), 0)), semPreco: l.filter((x) => x.semPreco).length };
}

/** Onde fica cada parte no referencial da âncora (primeira parte): fila da esquerda para a direita com GAP_CM, costas alinhadas. `lx`,`ly` = centro. */
export function posicoesDaComposicao(partes: readonly ParteLivre[]): { lx: number; ly: number; w: number; h: number }[] {
  let cursor = 0;
  return partes.map((p) => {
    const c = camposDaVariante(p.modelo), pos = { lx: cursor + c.w / 2, ly: c.h / 2, w: c.w, h: c.h };
    cursor += c.w + GAP_CM;
    return pos;
  });
}

/**
 * As peças da planta (rot 0, sem ajustar à divisão): a fila centrada em `centro`, todas com o mesmo `conj`, `conjId` da composição livre e o papel
 * `p1`, `p2`… A primeira é a âncora: depois de a ajustar à divisão, `reposicionarConjunto` leva as outras.
 */
export function pecasDaComposicao(partes: readonly ParteLivre[], inst: string, centro: Ponto): PecaPlanta[] {
  if (partes.length === 0) return [];
  const pos = posicoesDaComposicao(partes), ult = pos[pos.length - 1];
  const largura = ult.lx + ult.w / 2, fundo = Math.max(...pos.map((q) => q.h));
  const x0 = centro.x - largura / 2, y0 = centro.y - fundo / 2;
  return partes.map((p, i): PecaPlanta => {
    const m = p.modelo, base = camposDaVariante(m), q = pos[i], fam = m.fam ? familiaPorId(m.fam.familiaId) : undefined;
    return {
      ...base, produto: m.fam ? base.produto : m.produtoId, tipo: TIPO_LEGADO[m.tipo], id: `${inst}-p${i + 1}`,
      x: arred1(x0 + q.lx - q.w / 2), y: arred1(y0), rot: 0, mont: m.montagem, alt: Math.round(m.alturaOmissao * 1000) / 10, esp: false,
      conj: inst, conjId: ID_COMPOSICAO_LIVRE, papel: `p${i + 1}`, lx: arred1(q.lx), ly: arred1(q.ly),
      ...(i === 0 ? { ancora: true } : {}), ...(fam?.geo === false ? { semGeo: true } : {}), ...(m.tipo === "lava_loica" ? { opc: { montagem: "baixo" as const } } : {}),
    };
  });
}
