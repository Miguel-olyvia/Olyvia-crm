// 17/11: o Catálogo LEVE (cat_ler_catalogo_servicos). Com ele K.produtos traz só os produtos dos consumos dos serviços (145 na Mudelar, em vez de 29 785); os outros
// escolhem-se por pesquisa no servidor (pesquisaProdutos.ts). Este módulo guarda, para os ecrãs, DUAS coisas que a leitura deixa de dizer sozinha:
//   · se o Catálogo em memória é parcial, e de que organização (a pesquisa precisa da organização);
//   · os produtos que o utilizador escolheu de uma pesquisa e que entram no Catálogo. A página dos Serviços grava sozinha o que mudou (diferencasCatalogo compara o
//     «antes» com o «depois»): um produto que só aparece no «depois» grava-se como NOVO (duplicado). Por isso quem grava regista-se aqui (aoRegistarProduto) e mete
//     o produto também no «antes» e na base ANTES de ele entrar no Catálogo.
import { lerCatalogo, mudarCatalogo } from "../v2/catalogoStore";
import type { Produto } from "../v2/catalogoModelo";
import type { No } from "../v2/catalogoModelo";
import { juntarArvoreProdutos, type LinhaCategoriaProduto, type LinhaProduto } from "./catalogoReal";

let parcial = false;
let orgDoCatalogo: string | null = null;
/** A árvore dos produtos junta à dos serviços pelo nome (juntarArvoreProdutos): o id de product_categories → o nó do Catálogo e o inverso. Sem ela, os ids são os mesmos. */
let nos: { noDe: (id: string | null | undefined) => string | null; cru: Map<string, string> } | null = null;

/** Chamado por carregarCatalogo com a árvore dos SERVIÇOS (sem os ramos só de produtos) e as categorias de produto lidas. */
export function definirArvoreProdutos(arvore: readonly No[], categorias: readonly LinhaCategoriaProduto[] | undefined): void {
  if (!categorias) { nos = null; return; }
  const { noDe } = juntarArvoreProdutos(arvore.filter((x) => !x.soProduto), categorias);
  const cru = new Map<string, string>();
  for (const c of categorias) { const n = noDe(c.id); if (n && !cru.has(n)) cru.set(n, c.id); }
  nos = { noDe, cru };
}
/** O `no` de um produto vindo do servidor: o id de product_categories (sub, senão categoria) como nó do Catálogo (o fundido com o ramo dos serviços, se o nome coincide). */
export const noDoProdutoLido = (idCru: string | null | undefined): string | null => (idCru ? nos?.noDe(idCru) ?? idCru : null);
/** O inverso, para pesquisar no servidor: o nó do Catálogo como id de product_categories. */
export const categoriaCruDoNo = (no: string): string => nos?.cru.get(no) ?? no;

/** Chamado por carregarCatalogo, antes de aplicar o Catálogo lido. */
export function definirCatalogoLido(org: string, leve: boolean): void {
  orgDoCatalogo = org;
  parcial = leve;
}
/** Esquecer o que a leitura definiu (a página que a fez saiu): o protótipo e as outras organizações não herdam o estado parcial nem a organização. */
export function limparCatalogoLido(): void {
  parcial = false;
  orgDoCatalogo = null;
  nos = null;
}
/** O Catálogo em memória veio da leitura leve: K.produtos NÃO é a lista toda. */
export const catalogoParcial = (): boolean => parcial;
/** A organização do Catálogo em memória (null: nada lido). */
export const orgDoCatalogoLido = (): string | null => orgDoCatalogo;

type Ouvinte = (p: Produto) => void;
const ouvintes = new Set<Ouvinte>();
/** Quem grava o Catálogo regista-se para saber dos produtos que entram vindos de uma pesquisa. Devolve a função que o tira. */
export function aoRegistarProduto(f: Ouvinte): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** O produto lido do servidor entra no Catálogo em memória (se ainda lá não está), depois de os gravadores o registarem como já existente. Devolve o que lá fica. */
export function registarProdutoLido(p: Produto): Produto {
  const ja = lerCatalogo().produtos.find((x) => x.id === p.id);
  if (ja) return ja;
  ouvintes.forEach((f) => f(structuredClone(p)));
  mudarCatalogo((k) => { k.produtos.push(structuredClone(p)); });
  return p;
}

/** A linha da base que corresponde a um produto lido (a «base» do autosave só precisa de saber que ele existe; o resto serve a um consumível de receita). */
export function linhaDeProduto(p: Produto): LinhaProduto {
  return {
    id: p.id, name: p.n, sku: p.sku ?? null, tipo_catalogo: "produto", unidade: p.un, catalogo_categoria_id: p.no, servico_id: p.servico ?? null, fator_servico: p.fatorServico ?? 1,
    entulho_m3: p.entulho?.m3 ?? null, entulho_kg: p.entulho?.kg ?? null, short_description: p.desc ?? null, marca_livre: p.marca || null, fornecedor_livre: p.fornecedor || null,
  };
}
