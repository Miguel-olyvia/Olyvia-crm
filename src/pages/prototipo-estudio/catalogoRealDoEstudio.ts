// 17/11 (Rúben: «depois ligar esse catálogo de produtos à lista de produtos que está disponível no Estúdio da visita»). Com sessão,
// o Estúdio deixa o catálogo de teste e mostra os produtos verdadeiros da organização (os da Mudelar, importados pelo Miguel), no
// mesmo formato (Produto de catalogoFake.ts), para o resto do Estúdio (a planta, o estilo, o 3D, a proposta) não mudar:
//  · cada tipo de peça lê as suas subcategorias (CATEGORIAS_REAIS), por páginas do servidor (cat_ler_produtos_pagina): uma geral e
//    uma por cada cor do estilo (branco, preto, cinza, madeira, bege), para haver por onde escolher em qualquer estilo;
//  · a cor sai do nome e dos atributos («BRANCO MATE», «Negro», «Antracite», «Carvalho»…), as medidas do nome («70x120»,
//    «100x81x45»), o preço é o PVP; a altura no 3D e a instalação de referência vêm da peça de teste da mesma categoria (a instalação
//    verdadeira é o serviço ligado ao produto, que entra pelo plano e pelo orçamento: servicosDoCatalogo.ts).
// Sem sessão, ou se a leitura falhar, fica o catálogo de teste.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useCompanyOpcional } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { lerPesquisaDoEstudio, lerProdutosPagina, SEM_FILTRO_SERVIDOR, type LinhaPaginaProduto } from "@/emylia/real/produtosPaginados";
import { ehIdDeModelo3D, resolverModelo3D } from "@/emylia/planta3d/modelos3dEscolha";
import type { ResultadoProcura } from "./pesquisaEstudio";
import { CATALOGO, CORES, ouvirProdutosReais, produtosReais, usarProdutosReais, versaoProdutosReais, type Categoria, type Cor, type Produto } from "./catalogoFake";

/** 24/11 (contratos reais da Mudelar, MD 1610 e outros): o mesmo cerâmico ou porcelânico (Surface Arena, Marfil 120x60) vai à parede
 *  e ao chão; a parede só procurava em «Cerâmico» e o chão só em «Porcelânico», e o RP0010 da parede dava «0 resultados». */
const CERAMICOS = ["Cerâmico", "Cerâmico Laminado", "Porcelânico"];
/** As subcategorias da Mudelar de cada tipo de peça do Estúdio (pelo nome, sem acentos nem maiúsculas). */
export const CATEGORIAS_REAIS: Partial<Record<Categoria, string[]>> = {
  base: ["Bases Duche"], banheira: ["Banheiras"], sanita: ["Sanitas"], bide: ["Bidés"], movel: ["Móveis de lavatório"],
  coluna: ["Colunas"], espelho: ["Espelhos"], toalheiro: ["Toalheiros"], coluna_duche: ["Colunas Duche"], resguardo: ["Resguardos de Duche"],
  torneira: ["Torneira Lavatório", "Torneira Pé Alto"], revestimento: CERAMICOS, pavimento: [...CERAMICOS, "SPC"],
  lava: ["Cubas compósito", "Cubas inox"], placa: ["Placas"], forno: ["Fornos"], frigorifico: ["Frigoríficos"], maquina: ["Máquinas lavar loiça"],
  exaustor: ["Exaustores"], armario: ["Armários de Coluna"],
};
/** Uma palavra para procurar cada cor (a pesquisa do servidor também apanha os atributos). */
const PROCURA_COR: Record<Cor, string> = { branco: "branco", preto: "preto", cinza: "cinza", madeira: "madeira", bege: "bege" };

import { coresDoTexto, medidasDoTexto, semAcento } from "./pesquisaEstudio";
export { coresDoTexto, medidasDoTexto, semAcento };
/** Um tom mais fiel do que a cor do estilo, para o desenho e o 3D (dourado, cobre, cromado). */
function hexDoTexto(texto: string, cores: Cor[]): string {
  const t = semAcento(texto);
  if (/\b(ouro|oro|dourad)/.test(t)) return "#c9a24a";
  if (/\bcobre\b/.test(t)) return "#b87333";
  if (/\brosa gold\b/.test(t)) return "#d8a39d";
  if (/\b(crom|inox|niquel)/.test(t) && !cores.includes("preto") && !cores.includes("branco")) return "#c0c4c8";
  return cores.length ? CORES[cores[0]].hex : "#d9d9d6";
}

/** A largura e o fundo na planta, pelo tipo de peça e pelas medidas do nome. */
function tamanhoNaPlanta(cat: Categoria, md: number[] | null): { w?: number; h?: number } {
  if (!md || md.length < 2) return {};
  const [a, b, c] = md;
  if (cat === "base" || cat === "banheira" || cat === "resguardo") return { w: Math.max(a, b), h: Math.min(a, b) };
  if ((cat === "movel" || cat === "coluna" || cat === "armario") && c) return { w: a, h: c };
  if (cat === "movel" || cat === "espelho" || cat === "toalheiro") return { w: a };
  return {};
}

/** 24/11: o «Modelo 3D» de cada categoria e subcategoria (product_categories.id → modelo), lido ao carregar o Estúdio; as linhas do servidor só trazem o ID delas. */
let modelosCategorias: ReadonlyMap<string, string> = new Map();

/** Uma linha do servidor como Produto do Estúdio. Null se não serve (sem preço de venda, inativo).
 *  O «Modelo 3D» fica resolvido (produto > subcategoria > categoria) em `modelo3d`; sem escolha em nenhum nível, o produto não leva a chave. */
export function produtoDaLinha(l: LinhaPaginaProduto, cat: Categoria, modelos: ReadonlyMap<string, string> = modelosCategorias): Produto | null {
  const pvp = l.pvp ?? 0;
  if (!(pvp > 0) || l.ativo === false || (l as { estado?: string }).estado === "draft") return null;
  const texto = `${l.nome} ${l.atributos_resumo ?? ""}`;
  const cores = coresDoTexto(texto);
  const molde = CATALOGO.find((p) => p.cat === cat);
  const un = /m2|m²/i.test(l.unidade ?? "") || cat === "revestimento" || cat === "pavimento" ? "m²" : "un";
  return {
    id: l.id, cat, n: l.nome.replace(/\s+/g, " ").trim(), colecao: l.modelo ?? l.marca ?? "",
    cores, hex: hexDoTexto(texto, cores), preco: Math.round(pvp * 100) / 100, un,
    inst: molde?.inst ?? 0,
    ...tamanhoNaPlanta(cat, medidasDoTexto(l.nome)),
    ...(molde?.z0 !== undefined ? { z0: molde.z0, z1: molde.z1 } : {}),
    ...(l.atributos_resumo ? { destaque: l.atributos_resumo.slice(0, 120) } : {}),
    // 23/11: a referência e o resto do texto, para a pesquisa do Estúdio (pelo SKU, pela marca, pela subcategoria, por todos os atributos)
    ...(l.sku?.trim() ? { ref: l.sku.trim() } : {}),
    ...(() => { const t = [l.marca, l.subcategoria, l.atributos_resumo].filter(Boolean).join(" "); return t ? { procura: t } : {}; })(),
    ...(() => {
      const m = resolverModelo3D({ produto: l.modelo3d, subcategoria: l.subcategoria_id ? modelos.get(l.subcategoria_id) : null, categoria: l.categoria_id ? modelos.get(l.categoria_id) : null }).modelo;
      return m ? { modelo3d: m } : {};
    })(),
  };
}

/** Faz `n` tarefas de cada vez. */
async function aos<T>(tarefas: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(tarefas.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, async () => {
    while (i < tarefas.length) { const k = i++; out[k] = await tarefas[k](); }
  }));
  return out;
}

/** Os ids das subcategorias pelo nome (product_categories da organização). */
async function idsDasSubcategorias(org: string): Promise<Map<string, string>> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { id: string; name: string }[] | null; error: unknown }> } } })
    .from("product_categories").select("id,name").eq("organization_id", org);
  if (error || !data) return new Map();
  return new Map(data.map((c) => [semAcento(c.name), c.id]));
}

/** 24/11: o «Modelo 3D» escolhido em cada categoria e subcategoria da organização (product_categories.modelo_3d), por id. Leitura À PARTE da dos ids pelo nome:
 *  se a coluna ainda não existir (a migração do modelo 3D por aplicar) o PostgREST recusa o select, e isso só deixa o Estúdio sem estes modelos (nunca sem produtos).
 *  Escolha: um select separado e tolerante, em vez de repetir o primeiro sem a coluna, para o que já funciona não depender do que ainda não existe. */
export async function modelosDasCategorias(org: string): Promise<Map<string, string>> {
  try {
    const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { id: string; modelo_3d: unknown }[] | null; error: unknown }> } } })
      .from("product_categories").select("id,modelo_3d").eq("organization_id", org);
    if (error || !data) return new Map();
    return new Map(data.flatMap((c) => (ehIdDeModelo3D(c.modelo_3d) ? [[c.id, c.modelo_3d] as [string, string]] : [])));
  } catch {
    return new Map();
  }
}

// ------------------------------------------------------------------ 17/11 (Rúben: «a mão de obra a vir do serviço ligado»)

export interface LigacaoServico { sid: string; fator: number }
export interface ServicoComPreco { n: string; preco: number }
/** A mão de obra de cada produto pelo serviço que o instala (products.servico_id): o preço de venda do serviço × o fator. Sem
 *  serviço ligado (ou sem preço), o produto fica como estava. */
export function comMaoDeObraDoServico(lista: readonly Produto[], ligacoes: ReadonlyMap<string, LigacaoServico>, servicos: ReadonlyMap<string, ServicoComPreco>): Produto[] {
  return lista.map((p) => {
    const l = ligacoes.get(p.id), s = l && servicos.get(l.sid);
    return s ? { ...p, inst: Math.round(s.preco * l!.fator * 100) / 100, instServico: s.n } : p;
  });
}

type Sb = { from: (t: string) => { select: (c: string) => { in: (k: string, v: string[]) => Promise<{ data: unknown[] | null; error: unknown }> } } };
const aos150 = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 150) }, (_, i) => xs.slice(i * 150, i * 150 + 150));

/** Lê o serviço ligado a cada produto e o preço de venda desse serviço (as mesmas leituras que as encomendas e o seletor do catálogo). */
async function maoDeObraDosServicos(lista: readonly Produto[]): Promise<Produto[]> {
  const sb = supabase as unknown as Sb;
  const ligacoes = new Map<string, LigacaoServico>();
  for (const ids of aos150(lista.map((p) => p.id))) {
    const { data, error } = await sb.from("products").select("id, servico_id, fator_servico").in("id", ids);
    if (error || !data) return [...lista];
    for (const r of data as { id: string; servico_id: string | null; fator_servico: number | null }[]) {
      if (r.servico_id) ligacoes.set(r.id, { sid: r.servico_id, fator: Number(r.fator_servico) > 0 ? Number(r.fator_servico) : 1 });
    }
  }
  const servicos = new Map<string, ServicoComPreco>();
  for (const ids of aos150([...new Set([...ligacoes.values()].map((l) => l.sid))])) {
    const { data, error } = await sb.from("services").select("id, name, service_prices(price, price_type)").in("id", ids);
    if (error || !data) return [...lista];
    for (const s of data as { id: string; name: string; service_prices: { price: number; price_type: string | null }[] | null }[]) {
      const precos = s.service_prices ?? [];
      const pr = precos.find((x) => x.price_type === "retail") ?? precos[0];
      if (pr && Number(pr.price) > 0) servicos.set(s.id, { n: s.name, preco: Number(pr.price) });
    }
  }
  return comMaoDeObraDoServico(lista, ligacoes, servicos);
}

interface Pedido { cat: Categoria; sub: string; q: string; pagina: number }
/** Quantas páginas a mais se pré-carregam por subcategoria, depois da primeira (17/11, Rúben: como a lista de produtos do Catálogo,
 *  que mostra 50 e pré-carrega as seguintes). */
export const PAGINAS_A_MAIS = 2;

/** Lê os pedidos (8 de cada vez) e junta aos já vistos os produtos novos, com a mão de obra. Devolve também as subcategorias que têm
 *  mais páginas (para pré-carregar). */
async function lerPedidos(org: string, pedidos: readonly Pedido[], vistos: Map<string, Produto>): Promise<{ novos: Produto[]; comMais: { p: Pedido; paginas: number }[]; haMais: boolean }> {
  const respostas = await aos(pedidos.map((p) => async () => {
    const r = await lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, subcategoria: p.sub, q: p.q }, p.pagina);
    return { p, linhas: r.ok ? r.v.produtos : [], paginas: r.ok ? r.v.paginas : 1 };
  }), 8);
  const novos = await juntarLinhas(respostas.map(({ p, linhas }) => ({ cat: p.cat, linhas })), vistos);
  return {
    novos,
    comMais: respostas.filter((r) => !r.p.q && r.paginas > r.p.pagina).map((r) => ({ p: r.p, paginas: r.paginas })),
    haMais: respostas.some((r) => r.paginas > r.p.pagina),
  };
}

const chaveVista = (cat: Categoria, id: string) => `${cat}:${id}`;
/** Junta aos já vistos os produtos novos destas linhas do servidor (com a mão de obra) e devolve-os. */
async function juntarLinhas(grupos: readonly { cat: Categoria; linhas: readonly LinhaPaginaProduto[] }[], vistos: Map<string, Produto>): Promise<Produto[]> {
  const novos: Produto[] = [];
  for (const { cat, linhas } of grupos) {
    for (const l of linhas) {
      // 24/11: pela categoria e pelo id: o mesmo porcelânico entra no revestimento e no pavimento
      if (vistos.has(chaveVista(cat, l.id))) continue;
      // as colunas de duche: só as colunas (os braços, os pratos e os chuveiros de encastre vão com elas)
      if (cat === "coluna_duche" && !/^\s*coluna/i.test(l.nome)) continue;
      const x = produtoDaLinha(l, cat);
      if (x) { vistos.set(chaveVista(cat, l.id), x); novos.push(x); }
    }
  }
  // a mão de obra pelo serviço ligado; se a leitura falhar, ficam os valores de referência
  let comMao = novos;
  try { comMao = await maoDeObraDosServicos(novos); } catch { /* fica a de referência */ }
  for (const x of comMao) vistos.set(chaveVista(x.cat, x.id), x);
  return comMao;
}

// ------------------------------------------------------------------ 17/11 (Rúben: «no Estúdio permitia fazer pesquisas dos produtos»)

/** O que a pesquisa precisa de saber do carregamento: a organização e as subcategorias de cada tipo de peça. */
let contexto: { org: string; subs: Map<Categoria, string[]> } | null = null;

export { bateComPesquisa, grauDaPesquisa, ordenarPorPesquisa } from "./pesquisaEstudio";

/** 23/11: a base ainda não tem cat_estudio_procurar_produtos (20270126050000): a pesquisa lê como antes, subcategoria a subcategoria. */
let semPesquisaNova = false;

/** Procura no catálogo inteiro da organização, nas subcategorias deste tipo de peça, e junta o que encontrar aos produtos do Estúdio.
 *  `pagina` > 1 traz a página seguinte da mesma pesquisa («Ver mais»). Devolve quantos novos chegaram e se o servidor tem mais
 *  (nada sem sessão ou sem catálogo verdadeiro). Chama-se por pesquisaEstudio.ts (carregado à parte).
 *  23/11 (Rúben: «procurar pela referência dá 0 resultados»; «o produto nunca apareceu, nem com o nome quase inteiro»): com a função
 *  nova, uma só leitura que aceita a referência, procura nos atributos e traz os mais parecidos primeiro; sem ela, a de antes. */
export async function procurarNoCatalogoReal(cat: Categoria, q: string, pagina = 1): Promise<ResultadoProcura> {
  const c = contexto, subs = c?.subs.get(cat) ?? [];
  const texto = q.trim();
  if (!c || !subs.length || semAcento(texto).length < 2) return { novos: 0, haMais: false };
  const vistos = new Map(produtosReais().map((p) => [p.id, p]));
  let novos: Produto[] = [], haMais = false;
  const r = semPesquisaNova ? null : await lerPesquisaDoEstudio(c.org, texto, subs, pagina);
  if (r?.ok && r.v) {
    novos = await juntarLinhas([{ cat, linhas: r.v.produtos }], vistos);
    haMais = r.v.paginas > r.v.pagina;
  } else {
    if (r?.ok && r.v === null) semPesquisaNova = true;
    ({ novos, haMais } = await lerPedidos(c.org, subs.map((sub) => ({ cat, sub, q: texto, pagina })), vistos));
  }
  if (novos.length) usarProdutosReais([...vistos.values()]);
  return { novos: novos.length, haMais };
}

/** Os produtos verdadeiros do Estúdio, de todas as categorias. Devolve logo a 1.ª página de cada subcategoria (e de cada cor) e, por
 *  trás, pré-carrega as páginas seguintes (até PAGINAS_A_MAIS): `aoChegarMais` recebe a lista toda quando chegam. */
export async function carregarProdutosDoEstudio(org: string, aoChegarMais?: (todos: Produto[]) => void): Promise<Produto[]> {
  const [ids, modelos] = await Promise.all([idsDasSubcategorias(org), modelosDasCategorias(org)]);
  modelosCategorias = modelos;
  const pedidos: Pedido[] = [];
  const subsPorCat = new Map<Categoria, string[]>();
  contexto = { org, subs: subsPorCat };
  for (const [cat, subs] of Object.entries(CATEGORIAS_REAIS) as [Categoria, string[]][]) {
    for (const nome of subs) {
      const sub = ids.get(semAcento(nome));
      if (!sub) continue;
      subsPorCat.set(cat, [...(subsPorCat.get(cat) ?? []), sub]);
      pedidos.push({ cat, sub, q: "", pagina: 1 });
      for (const c of Object.values(PROCURA_COR)) pedidos.push({ cat, sub, q: c, pagina: 1 });
    }
  }
  const vistos = new Map<string, Produto>();
  const { comMais } = await lerPedidos(org, pedidos, vistos);
  const primeira = [...vistos.values()];
  if (aoChegarMais && comMais.length) {
    const seguintes = comMais.flatMap(({ p, paginas }) =>
      Array.from({ length: Math.min(PAGINAS_A_MAIS, paginas - 1) }, (_, i) => ({ ...p, pagina: i + 2 })));
    // sem esperar: o Estúdio já trabalha com a 1.ª página
    void lerPedidos(org, seguintes, vistos).then(({ novos }) => { if (novos.length) aoChegarMais([...vistos.values()]); }).catch(() => { /* fica a 1.ª página */ });
  }
  return primeira;
}

/** No Estúdio: com sessão, carrega os produtos verdadeiros da organização (uma vez por organização) e redesenha quando chegam. */
export function useProdutosReaisNoEstudio(): { n: number; aLer: boolean } {
  const org = useCompanyOpcional()?.activeCompany?.id ?? null;
  const [aLer, setALer] = useState(false);
  useSyncExternalStore(ouvirProdutosReais, versaoProdutosReais);
  useEffect(() => {
    if (!org || jaLido === org) return;
    let vivo = true;
    setALer(true);
    // a 1.ª página entra logo; as seguintes juntam-se quando chegam (mesmo que o Estúdio já tenha fechado: ficam para a próxima vez)
    carregarProdutosDoEstudio(org, (todos) => { if (jaLido === org) usarProdutosReais(todos); })
      .then((lista) => { if (!vivo) return; if (lista.length) { jaLido = org; usarProdutosReais(lista); } })
      .catch(() => { /* fica o catálogo de teste */ })
      .finally(() => { if (vivo) setALer(false); });
    return () => { vivo = false; };
  }, [org]);
  return { n: produtosReais().length, aLer };
}
/** A organização cujos produtos já estão carregados (o Estúdio abre e fecha várias vezes na mesma visita). */
let jaLido: string | null = null;
