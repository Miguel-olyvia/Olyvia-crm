// Famílias (interface): a escolha do passo «Escolher produtos». Os escolhidos guardam-se como objetos Produto (não ids), porque a lista vem do servidor
// por páginas e o produto de uma página anterior já não está carregado. Funções puras: nada se muta e não há rede.
import type { Produto } from "../v2/catalogoModelo";
import type { LinhaPaginaProduto } from "../real/produtosPaginados";
import { refDoProduto } from "./nucleo";

/** O máximo de produtos de uma família (e da escolha). */
export const MAX_SELECAO = 60;

/** A linha da página do servidor como Produto: o que o configurador lê (preço, SKU, marca, subcategoria e o nó onde fica). Não inventa o que a linha não tem. */
export function produtoDaLinha(l: LinhaPaginaProduto): Produto {
  return {
    id: l.id, n: l.nome, custo: l.custo ?? 0, un: l.unidade || "un", marca: l.marca ?? "", fornecedor: l.fornecedor ?? "", data: "",
    no: l.subcategoria_id || l.categoria_id || null,
    ...(l.sku ? { sku: l.sku } : {}), ...(l.pvp != null && l.pvp > 0 ? { pvp: l.pvp } : {}), ...(l.subcategoria ? { sub: l.subcategoria } : {}),
  };
}

/** Tem preço de venda (o PVP, ou o preço calculado pelo custo)? É o que o passo 3 exige. */
export const temPreco = (p: Pick<Produto, "id" | "n" | "custo" | "pvp">): boolean => refDoProduto({ id: p.id, n: p.n, custo: p.custo, ...(p.pvp != null ? { pvp: p.pvp } : {}) }).preco > 0;

/** Juntar (se há lugar) ou tirar um produto. No teto não junta e `cheio` diz-o; tirar nunca é recusado. */
export function alternarEscolha(lista: readonly Produto[], p: Produto): { lista: Produto[]; cheio: boolean } {
  if (lista.some((x) => x.id === p.id)) return { lista: lista.filter((x) => x.id !== p.id), cheio: false };
  if (lista.length >= MAX_SELECAO) return { lista: [...lista], cheio: true };
  return { lista: [...lista, p], cheio: false };
}

/** Junta os que ainda não estão escolhidos, pela ordem, até ao teto; `cortados` = quantos novos não couberam. */
export function juntarEscolha(lista: readonly Produto[], novos: readonly Produto[]): { lista: Produto[]; cortados: number } {
  const ids = new Set(lista.map((p) => p.id)), faltam = novos.filter((p, i) => !ids.has(p.id) && novos.findIndex((x) => x.id === p.id) === i);
  const cabem = Math.max(0, MAX_SELECAO - lista.length);
  return { lista: [...lista, ...faltam.slice(0, cabem)], cortados: Math.max(0, faltam.length - cabem) };
}
