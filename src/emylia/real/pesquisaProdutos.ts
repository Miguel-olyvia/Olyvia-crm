// 17/11: a escolha de produtos por PESQUISA NO SERVIDOR. Com o Catálogo leve (catalogoLeve.ts) K.produtos já não tem os 29 785 produtos da Mudelar; quem escolhe
// um produto (os consumíveis e as ligações de um serviço, a visita, o orçamento) pesquisa-o em cat_ler_produtos_pagina (páginas de 50, com debounce) e, ao escolher,
// lê-o inteiro com cat_ler_produto: o Produto chega ao estado do negócio ou do serviço com o mesmo formato de sempre.
//
// Por serviço (products.servico_id, «produtos que trazem este serviço»): `servico` no filtro passa a leitura para cat_pesquisar_produtos (20270122000000).
import { useCallback, useEffect, useRef, useState } from "react";
import type { No, Produto } from "../v2/catalogoModelo";
import type { Res } from "../fichaProdutoDados";
import { SEM_FILTRO_SERVIDOR, lerProdutosPagina, type LinhaPaginaProduto } from "./produtosPaginados";
import { lerProdutoFicha } from "./produtosLeves";
import { categoriaCruDoNo, chaveDoServicoLido, noDoProdutoLido, registarProdutoLido } from "./catalogoLeve";
import { nosDeProdutoDoRamo } from "../ramoDosProdutos";

export const ATRASO_PESQUISA_MS = 300;

/** O que a pesquisa filtra: o texto (nome, marca, referência) e, se quiser, os ids de categoria e subcategoria de product_categories. */
export interface FiltroPesquisaProdutos { q: string; categoria?: string; subcategoria?: string; /** products.servico_id: só os produtos que trazem este serviço. */ servico?: string;
  /** 17/11: várias subcategorias (um ramo do motor com várias categorias de produto: «Louças e torneiras» = Sanitas, Bases Duche, Lavatórios…): uma pesquisa por cada, juntas. */
  subcategorias?: readonly string[] }

export interface PesquisaProdutos {
  linhas: LinhaPaginaProduto[]; total: number; aCarregar: boolean; erro: string | null; maisPaginas: boolean; maisUma: () => void;
  /** O que dizer a quem vê a lista (por exemplo, a pesquisa por serviço não existe na base e a lista não está filtrada). */
  aviso: string | null;
}

/** A pesquisa com debounce e páginas de 50. `ativo` false (o painel fechado) não chama a base. */
export function usePesquisaProdutos(org: string | null, f: FiltroPesquisaProdutos, op: { ativo?: boolean; atrasoMs?: number } = {}): PesquisaProdutos {
  const { ativo = true, atrasoMs = ATRASO_PESQUISA_MS } = op;
  const categoria = f.categoria ?? "", subcategoria = f.subcategoria ?? "", servico = f.servico ?? "", subs = (f.subcategorias ?? []).join(",");
  const [qAtraso, setQAtraso] = useState(f.q);
  const VAZIO = { chave: "", linhas: [] as LinhaPaginaProduto[], total: 0, pagina: 0, paginas: 0, aviso: null as string | null };
  const [estado, setEstado] = useState(VAZIO);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    if (f.q === qAtraso) return undefined;
    const t = setTimeout(() => setQAtraso(f.q), atrasoMs);
    return () => clearTimeout(t);
  }, [f.q, qAtraso, atrasoMs]);

  const ler = useCallback(async (pagina: number, juntar: boolean) => {
    if (!org) return;
    const eu = ++pedido.current;
    setACarregar(true); setErro(null);
    const chave = `${org}|${qAtraso}|${categoria}|${subcategoria}|${servico}|${subs}`;
    const r = subs ? await lerVariasSubcategorias(org, qAtraso, subs.split(","), pagina)
      : await lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q: qAtraso, categoria, subcategoria, ...(servico ? { servico } : {}) }, pagina);
    if (eu !== pedido.current) return; // uma pesquisa mais nova já saiu
    setACarregar(false);
    if (!r.ok) { setErro(r.erro); if (!juntar) setEstado(VAZIO); return; }
    setEstado((e) => ({ chave, linhas: juntar ? [...e.linhas, ...r.v.produtos.filter((x) => !e.linhas.some((y) => y.id === x.id))] : r.v.produtos, total: r.v.total, pagina: r.v.pagina, paginas: r.v.paginas, aviso: r.v.aviso ?? null }));
  }, [org, qAtraso, categoria, subcategoria, servico, subs]);

  useEffect(() => {
    if (!ativo || !org) return;
    void ler(1, false);
  }, [ativo, org, ler]);

  // M9: as linhas são de uma pesquisa; se o filtro (mesmo o texto ainda por «assentar») já é outro, a lista antiga não se mostra nem se toca
  const atual = !!org && estado.chave === `${org}|${f.q}|${categoria}|${subcategoria}|${servico}|${subs}`;
  const maisPaginas = atual && estado.pagina > 0 && estado.pagina < estado.paginas;
  const maisUma = useCallback(() => { if (!aCarregar && maisPaginas) void ler(estado.pagina + 1, true); }, [aCarregar, maisPaginas, ler, estado.pagina]);
  return atual
    ? { linhas: estado.linhas, total: estado.total, aCarregar, erro, maisPaginas, maisUma, aviso: estado.aviso }
    : { linhas: [], total: 0, aCarregar: aCarregar || (!!org && ativo && !erro), erro, maisPaginas: false, maisUma, aviso: null };
}

/** 17/11: a mesma página em várias subcategorias, junta (por nome, sem repetidos); falha só se todas falharem. */
async function lerVariasSubcategorias(org: string, q: string, subs: readonly string[], pagina: number): ReturnType<typeof lerProdutosPagina> {
  const rs = await Promise.all(subs.map((subcategoria) => lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q, subcategoria }, pagina)));
  const ok = rs.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
  if (!ok.length) return rs[0] ?? { ok: false, erro: "Não foi possível ler os produtos." };
  const vistos = new Set<string>(), produtos: LinhaPaginaProduto[] = [];
  for (const r of ok) for (const p of r.v.produtos) if (!vistos.has(p.id)) { vistos.add(p.id); produtos.push(p); }
  produtos.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  return { ok: true, v: { total: ok.reduce((a, r) => a + r.v.total, 0), pagina, limite: ok[0].v.limite, paginas: Math.max(...ok.map((r) => r.v.paginas)), produtos } };
}

/** O produto escolhido da pesquisa, lido inteiro (cat_ler_produto) e já no Catálogo em memória (e registado para o autosave). */
export async function escolherProdutoDoServidor(org: string, id: string): Promise<Res<Produto>> {
  const r = await lerProdutoFicha(org, id);
  if (!r.ok) return r;
  // o `no` vem como id de product_categories; o Catálogo usa o nó fundido com a árvore dos serviços (e o autosave grava a categoria por ele)
  // 17/11: o serviço que o produto traz pela chave do motor (a base dá o id; um serviço que o Catálogo não tem sai, em vez de partir a gravação do negócio)
  const servico = chaveDoServicoLido(r.v.servico);
  const { servico: _id, fatorServico, ...resto } = r.v;
  const p: Produto = { ...resto, no: noDoProdutoLido(r.v.no), ...(servico ? { servico, fatorServico: fatorServico ?? 1 } : {}) };
  return { ok: true, v: registarProdutoLido(p) };
}

/** O produto lido, SEM o meter no Catálogo (para quem só precisa dos valores, como o consumível de uma receita). */
export const lerProdutoEscolhido = (org: string, id: string): Promise<Res<Produto>> => lerProdutoFicha(org, id);

/** Os produtos de um ramo da árvore (o `no` de um serviço que pede produto), pesquisados no servidor: um nó de topo filtra pela categoria, um sub pela subcategoria. Sem nó, sem filtro de ramo. */
export function filtroDoRamo(arvore: readonly No[], no: string | null): Pick<FiltroPesquisaProdutos, "categoria" | "subcategoria" | "subcategorias"> {
  const x = no ? arvore.find((y) => y.id === no) : undefined;
  if (!x) return {};
  // 17/11 (A-Z na Mudelar: «Não há produtos com estes filtros»): um ramo só dos SERVIÇOS («Canalização › Louças e torneiras») não existe em product_categories.
  // Pesquisa-se pelas categorias de produto que lhe pertencem (ramoDosProdutos.ts): uma só → essa; várias com o mesmo pai → o pai; senão sem filtro de ramo.
  // Um ramo sem categorias de produto no mapa fica como antes.
  if (!x.soProduto && categoriaCruDoNo(x.id) === x.id) {
    const pai = x.pai ? arvore.find((y) => y.id === x.pai) : undefined;
    const deProduto = nosDeProdutoDoRamo(arvore, pai ? pai.n : x.n, pai ? x.n : undefined).map((id) => arvore.find((y) => y.id === id)!);
    if (deProduto.length === 1) return deProduto[0].pai ? { subcategoria: categoriaCruDoNo(deProduto[0].id) } : { categoria: categoriaCruDoNo(deProduto[0].id) };
    const pais = new Set(deProduto.map((y) => y.pai));
    if (deProduto.length > 1) {
      const p = [...pais][0];
      if (pais.size === 1 && p) return { categoria: categoriaCruDoNo(p) };
      // 17/11 (A-Z: «mantém a sanita e a base de duche?» abria com banheiras): uma pesquisa por cada subcategoria do ramo
      const subs = deProduto.filter((y) => y.pai).map((y) => categoriaCruDoNo(y.id));
      return subs.length ? { subcategorias: subs } : {};
    }
  }
  // o servidor só conhece os ids de product_categories: o nó fundido com um ramo dos serviços converte-se no id cru
  return x.pai ? { subcategoria: categoriaCruDoNo(x.id) } : { categoria: categoriaCruDoNo(x.id) };
}

/** A linha da lista como Produto para MOSTRAR (nome, preço, foto). Falta-lhe o que só a leitura inteira traz (o serviço que o produto traz, a descrição, o entulho): para escolher
 *  usa-se escolherProdutoDoServidor, que lê o produto todo. */
export function produtoDeLinha(l: LinhaPaginaProduto): Produto {
  const pvp = typeof l.pvp === "number" && l.pvp > 0 ? l.pvp : undefined;
  return {
    id: l.id, n: l.nome, custo: l.custo ?? 0, un: l.unidade ?? "un", marca: l.marca ?? "", fornecedor: l.fornecedor ?? "", data: new Date().toISOString().slice(0, 10),
    no: noDoProdutoLido(l.subcategoria_id || l.categoria_id),
    ...(l.sku ? { sku: l.sku } : {}), ...(pvp ? { pvp } : {}),
    ...(l.grossista != null ? { grossista: l.grossista } : {}), ...(l.distribuidor != null ? { distribuidor: l.distribuidor } : {}),
    ...(l.imagem ? { fotos: [l.imagem] } : {}),
    ...(l.servico_id ? { servico: l.servico_id, fatorServico: l.fator_servico ?? 1 } : {}),
  };
}

/** A pesquisa de um ramo, já como Produto[] para os cartões da visita e do orçamento. */
export function useProdutosDoRamo(org: string | null, arvore: readonly No[], no: string | null, q: string, ativo = true): Omit<PesquisaProdutos, "linhas"> & { produtos: Produto[] } {
  const { linhas, ...resto } = usePesquisaProdutos(org, { q, ...filtroDoRamo(arvore, no) }, { ativo });
  return { ...resto, produtos: linhas.map(produtoDeLinha) };
}

/** Tocar num cartão: tirar um produto já escolhido só precisa do id; juntar lê-o inteiro (com o serviço que traz) e mete-o no Catálogo em memória. */
export async function produtoParaTocar(org: string, p: Produto, jaEscolhido: boolean): Promise<Res<Produto>> {
  return jaEscolhido ? { ok: true, v: p } : escolherProdutoDoServidor(org, p.id);
}
