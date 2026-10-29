// Serviços e produtos na visita (13/10/2026): as relações entre os dois, em funções puras.
// O Catálogo (V2) diz:
//   · que serviços OBRIGAM a escolher um produto de um ramo da árvore (exigeProduto: serviço → nó);
//   · que produtos TRAZEM um serviço (Produto.servico, com a quantidade = quantidade do produto × fatorServico).
// Há serviços sem produto (demolições) e produtos sem serviço (um espelho só vendido).
// O que se escolhe na visita fica na visita (d.visita.prod) como uma fotografia do produto (nome, custo,
// nó, serviço que traz): o orçamento faz-se dela, sem precisar do Catálogo (e não muda se o Catálogo mudar).
// Só tipos de motor.ts e do Catálogo: assim o motor pode usar este ficheiro sem ciclos de importação.
import type { Catalogo, No, Produto, Regra } from "./v2/catalogoModelo";
import type { LinhaOrc, MedKey, Medidas, SvcId } from "./motor";

export const PREFIXO_PROD = "Produto · ";
export const PREFIXO_CLIENTE = "Fornecido pelo cliente · ";
/** 29/10: só para fotografias antigas sem preço; o novo vem da margem-alvo do Catálogo (S.cfg.alvo, margem sobre o preço de venda). */
export const MARGEM_PROD_ANTIGA = 0.25;

/** Um produto escolhido na visita (fotografia do Catálogo no momento da escolha). */
export interface ProdVisita {
  /** O id do produto no Catálogo. */
  id: string;
  n: string;
  un: string;
  /** Custo de compra por unidade (€). */
  custo: number;
  q: number;
  /** O nó da árvore (para saber que obrigações cumpre). */
  no: string | null;
  /** O cliente fornece-o: fica na lista, sem custo nem preço. */
  cliente?: boolean;
  /** O serviço que o produto traz e o fator (quantidade do serviço = q × fator). */
  svc?: SvcId;
  fator?: number;
  /** O preço de venda por unidade, fixo no momento da escolha: o PVP do Catálogo, senão o custo com a margem-alvo (29/10). */
  pvp?: number;
  /** 26/10: vendido sem a instalação que traz (a mão de obra entra por outro serviço, escolhido à parte). */
  semSvc?: true;
}

/* ------------------------------------------------------------------ o Catálogo ligado */
// O motor não importa a store do Catálogo (ela importa o motor). A store liga-se aqui ao arrancar;
// sem Catálogo ligado (ex.: testes do motor) não há obrigações de produto.
let lerK: (() => Catalogo) | null = null;
export function ligarCatalogo(f: (() => Catalogo) | null) { lerK = f; }
export const catalogoLigado = (): Catalogo | null => (lerK ? lerK() : null);

/* ------------------------------------------------------------------ árvore */
/** O nó e tudo o que está abaixo dele. */
export function nosAbaixo(A: No[], no: string): Set<string> {
  const r = new Set([no]);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const n of A) if (n.pai && r.has(n.pai) && !r.has(n.id)) { r.add(n.id); mudou = true; }
  }
  return r;
}
/** "Canalização › Louças e torneiras". */
export function caminhoNo(A: No[], id: string | null | undefined): string {
  const n = id ? A.find((x) => x.id === id) : undefined;
  if (!n) return "Sem classificação";
  const pai = n.pai ? A.find((x) => x.id === n.pai) : undefined;
  return pai ? `${pai.n} › ${n.n}` : n.n;
}

/* ------------------------------------------------------------------ quantidades */
const r2 = (x: number) => Math.round(x * 100) / 100;
export function qtdRegra(r: Regra, m: Medidas): number {
  if (r.k === "fixo") return r.q;
  const q = (m[r.med as MedKey] || 0) * r.f;
  return r.arred ? Math.ceil(q - 1e-9) : r2(q);
}

/* ------------------------------------------------------------------ serviços ↔ produtos */
export interface Trazido { q: number; de: string[] }
/** Os serviços que os produtos escolhidos trazem (somados por serviço), com os nomes dos produtos de onde vieram. */
export function servicosTrazidos(prod: ProdVisita[]): Record<SvcId, Trazido> {
  const r: Record<SvcId, Trazido> = {};
  for (const p of prod) {
    if (!p.svc || p.semSvc || !(p.q > 0)) continue;
    const t = (r[p.svc] ??= { q: 0, de: [] });
    t.q = r2(t.q + p.q * (p.fator ?? 1));
    t.de.push(p.n);
  }
  return r;
}

/** Os serviços do pacote em uso (medida > 0 e não tirados). */
export const ativosDoPacote = (map: [SvcId, MedKey][], med: Medidas, off: SvcId[]): SvcId[] =>
  map.filter(([sid, k]) => med[k] > 0 && !off.includes(sid)).map(([sid]) => sid);

/**
 * Os serviços trazidos por produtos que entram no orçamento como linha própria: os que não estão já
 * no pacote (as medidas cobrem-nos) nem foram postos à mão (a quantidade à mão manda).
 */
export function trazidosParaOrc(prod: ProdVisita[], ativosPacote: SvcId[], extra: Partial<Record<SvcId, number>>): [SvcId, Trazido][] {
  return Object.entries(servicosTrazidos(prod)).filter(([sid]) => !ativosPacote.includes(sid) && !((extra[sid] || 0) > 0));
}

/** Todos os serviços da visita: do pacote, postos à mão e trazidos por produtos (sem repetir). */
export function servicosDaVisita(ativosPacote: SvcId[], extra: Partial<Record<SvcId, number>>, prod: ProdVisita[]): SvcId[] {
  const a = [...ativosPacote, ...Object.keys(extra).filter((s) => (extra[s] || 0) > 0), ...Object.keys(servicosTrazidos(prod))];
  return [...new Set(a)];
}

/** O que a visita guarda sobre as necessidades: os produtos e, por serviço, a resposta à pergunta e "o cliente compra". */
export interface NecVisita {
  prod?: ProdVisita[];
  /** A resposta à pergunta do serviço (ex.: "O cliente mantém a sanita?"): "sim" = não é preciso produto. */
  manter?: Record<SvcId, "sim" | "nao">;
  /** O cliente compra o produto deste serviço: o texto do que compra (fica no orçamento a zero). */
  clienteCompra?: Record<SvcId, string>;
  /** 21/10: as partes da estimativa do modelo que se tiraram à mão (pela descrição da parte, ex.: "pavimento"). */
  semParte?: string[];
}

/**
 * Como está a obrigação de produto de um serviço:
 *   "pergunta"  falta responder à pergunta (ex.: o cliente mantém a sanita?)
 *   "mantem"    o cliente mantém o que tem: não é preciso produto
 *   "produto"   há um produto escolhido no ramo (incluindo os que o cliente fornece)
 *   "cliente"   o cliente compra (fica registado, sem custo nem preço)
 *   "falta"     é preciso escolher o produto (ou marcar que o cliente compra)
 */
export type EstadoObrigacao = "pergunta" | "mantem" | "produto" | "cliente" | "falta";
export interface Obrigacao { sid: SvcId; no: string; caminho: string; pergunta: string | null; estado: EstadoObrigacao; cumprida: boolean; por: string[] }

/** As obrigações de produto dos serviços em uso, e como estão. */
export function obrigacoes(K: Catalogo, sids: SvcId[], v: NecVisita, clienteFornece = false): Obrigacao[] {
  const ex = K.exigeProduto ?? {}, prod = v.prod ?? [];
  return sids.flatMap((sid) => {
    const no = ex[sid];
    if (!no || !K.arvore.some((x) => x.id === no)) return [];
    // 26/10: com os ramos equivalentes (parede e pavimento), um produto de qualquer deles cumpre
    const ramo = new Set([no, ...(K.equivalentes ?? []).filter((g) => g.includes(no)).flat()].flatMap((n) => [...nosAbaixo(K.arvore, n)]));
    const por = prod.filter((p) => p.no && ramo.has(p.no) && p.q > 0).map((p) => p.n);
    const pergunta = K.perguntaManter?.[sid]?.trim() || null, resp = v.manter?.[sid];
    const estado: EstadoObrigacao =
      pergunta && resp === "sim" ? "mantem"
        : por.length ? "produto"
          : clienteFornece && v.clienteCompra?.[sid] ? "cliente"
            : pergunta && !resp ? "pergunta" : "falta";
    return [{ sid, no, caminho: caminhoNo(K.arvore, no), pergunta, estado, cumprida: estado === "mantem" || estado === "produto" || estado === "cliente", por }];
  });
}
export const emFaltaProdutos = (K: Catalogo, sids: SvcId[], v: NecVisita, clienteFornece = false) => obrigacoes(K, sids, v, clienteFornece).filter((o) => !o.cumprida);
/** O texto do que falta, para o portão: "Falta responder: o cliente mantém a sanita?" ou "Falta escolher: Pavimento cerâmico (Revestimentos › Pavimento)". */
export function textoFalta(o: Obrigacao, nomeSvc: string): string {
  if (o.estado === "pergunta") return "Falta responder: " + o.pergunta!.charAt(0).toLowerCase() + o.pergunta!.slice(1);
  return `Falta escolher: produto de ${o.caminho} (${nomeSvc})`;
}
/** O texto de "o cliente compra" de um serviço: "Louças e torneiras, para Montagem de louças". */
export const textoClienteCompra = (o: Obrigacao, nomeSvc: string) => `${o.caminho.split(" › ").pop()}, para ${nomeSvc}`;
/** As linhas "Fornecido pelo cliente · …" dos serviços em que o cliente compra (sem produto escolhido do Catálogo). */
export function linhasClienteCompra(v: NecVisita, sids: SvcId[], clienteFornece: boolean): LinhaOrc[] {
  if (!clienteFornece) return [];
  const c = v.clienteCompra ?? {};
  return sids.filter((s) => c[s] && v.manter?.[s] !== "sim").map((s) => ({ t: "mat", d: PREFIXO_CLIENTE + c[s], custo: 0, preco: 0 }));
}

/** Os produtos que se podem escolher num ramo (sem os consumíveis das receitas, que não são escolha do cliente). */
export function produtosDoRamo(K: Catalogo, no: string, consumiveis: Set<string>): Produto[] {
  const ramo = nosAbaixo(K.arvore, no);
  return K.produtos.filter((p) => p.no && ramo.has(p.no) && !consumiveis.has(p.n));
}

/** A quantidade sugerida ao escolher um produto: a regra (qtdDe) do serviço em uso que obriga ao ramo dele; senão 1. */
export function qtdSugerida(K: Catalogo, p: Produto, sids: SvcId[], med: Medidas): number {
  for (const sid of sids) {
    const no = K.exigeProduto?.[sid], r = K.qtdDe?.[sid];
    if (!no || !r || !p.no || !nosAbaixo(K.arvore, no).has(p.no)) continue;
    const q = qtdRegra(r, med);
    if (q > 0) return q;
  }
  return 1;
}

/* ------------------------------------------------------------------ mexer na lista */
/** 29/10: o preço de venda por unidade como no Catálogo (fichaServico.precoProduto): o PVP, senão custo / (1 − alvo/100). */
const venda = (p: { custo: number; pvp?: number }, alvo?: number): number | undefined =>
  p.pvp != null && p.pvp > 0 ? p.pvp : alvo != null && alvo < 100 ? r2(p.custo / (1 - alvo / 100)) : undefined;
/** A fotografia de um produto do Catálogo, com a relação de serviço que ele tem hoje.
 * 29/10: guarda o preço de venda do momento: o PVP, senão o custo com a margem-alvo (alvo, em %) — o mesmo do Catálogo. */
export function fotografia(p: Produto, q: number, cliente = false, alvo?: number): ProdVisita {
  const v: ProdVisita = { id: p.id, n: p.n, un: p.un, custo: p.custo, q, no: p.no };
  if (cliente) v.cliente = true;
  if (p.servico) { v.svc = p.servico; v.fator = p.fatorServico ?? 1; }
  const pvp = venda(p, alvo);
  if (pvp != null) v.pvp = pvp;
  return v;
}
/** Junta (ou substitui) um produto na lista. */
export const juntarProduto = (prod: ProdVisita[], v: ProdVisita): ProdVisita[] =>
  prod.some((x) => x.id === v.id) ? prod.map((x) => (x.id === v.id ? v : x)) : [...prod, v];
/** Tira um produto (e, com ele, o serviço que trouxe, se ninguém o pôs à mão: os trazidos calculam-se sempre da lista). */
export const tirarProduto = (prod: ProdVisita[], id: string): ProdVisita[] => prod.filter((x) => x.id !== id);
export const mudarQtd = (prod: ProdVisita[], id: string, q: number): ProdVisita[] => prod.map((x) => (x.id === id ? { ...x, q: Math.max(0, q) } : x));
/** 26/10: o produto passa a ser vendido sem a instalação que traz (ou volta a trazê-la). */
export const marcarSemServico = (prod: ProdVisita[], id: string, sem: boolean): ProdVisita[] =>
  prod.map((x) => { if (x.id !== id) return x; const y = { ...x }; if (sem) y.semSvc = true; else delete y.semSvc; return y; });
export const marcarCliente = (prod: ProdVisita[], id: string, cliente: boolean): ProdVisita[] =>
  prod.map((x) => { if (x.id !== id) return x; const y = { ...x }; if (cliente) y.cliente = true; else delete y.cliente; return y; });

/* ------------------------------------------------------------------ no orçamento */
/** O texto de um produto numa linha: "Sanita suspensa com estrutura" ou "Pavimento cerâmico 60×60 · 6 m²". */
export const textoProduto = (p: ProdVisita) => (p.q === 1 && p.un === "un" ? p.n : `${p.n} · ${String(p.q).replace(".", ",")} ${p.un}`);
export const precoProduto = (p: ProdVisita) => (p.pvp != null ? r2(p.pvp * p.q) : r2((p.custo * p.q) / (1 - MARGEM_PROD_ANTIGA)));
/** O preço de venda por unidade: o PVP real, senão o custo com a margem-alvo (alvo, em %); sem alvo (fotografias antigas), a margem antiga. */
export const precoUnitario = (p: { custo: number; pvp?: number }, alvo?: number) => venda(p, alvo) ?? r2(p.custo / (1 - MARGEM_PROD_ANTIGA));

/** As linhas de materiais dos produtos da visita: "Produto · …" (com custo e preço) ou "Fornecido pelo cliente · …" (a zero). */
export function linhasDosProdutos(prod: ProdVisita[]): LinhaOrc[] {
  return prod.filter((p) => p.q > 0).map((p) => p.cliente
    ? { t: "mat", d: PREFIXO_CLIENTE + textoProduto(p), custo: 0, preco: 0 }
    : { t: "mat", d: PREFIXO_PROD + textoProduto(p), custo: r2(p.custo * p.q), preco: precoProduto(p) });
}

/**
 * A linha "Materiais" do modelo é uma estimativa de TODOS os materiais do modelo, dividida em partes (motor: LINHAS[…].mat.partes).
 * - Uma parte sai se o cliente mantém o que tem (a resposta "Sim" a "O cliente mantém…?" de um dos seus serviços).
 * - Os produtos escolhidos (mesmo os que o cliente fornece) cobrem a parte do seu ramo do Catálogo: ela desce pelo custo
 *   deles, até zero. Os produtos fora do modelo (espelho, toalheiro…) não baixam nada: são linhas próprias.
 * O preço desce na mesma proporção do custo. Se não sobrar nada, a linha sai (null). Sem produtos nem respostas, fica igual.
 * Sem partes (ou sem Catálogo ligado para saber os ramos), cai na regra antiga: desce pelo custo de todos os produtos.
 */
type MatModelo = { custo: number; preco: number; partes?: { d?: string; peso: number; ramo?: [string, string?]; manter?: SvcId[] }[] };

/** 21/10: uma parte da estimativa do modelo, como está: o que se estimou, o que os produtos já cobrem e o que sobra. */
export interface ParteEstimativa {
  d: string;
  /** O custo estimado da parte (custo do modelo × peso). */
  est: number;
  /** O custo e o preço que sobram (0 quando coberta, mantida ou tirada). */
  custo: number; preco: number;
  /** O nó do ramo no Catálogo (para escolher produtos dele) e os nós abaixo. */
  raiz: string | null; nos: Set<string> | null;
  /** Os produtos escolhidos que a cobrem. */
  por: ProdVisita[];
  mantida: boolean; fora: boolean;
}

/** As partes da estimativa do modelo (sem partes ou sem Catálogo ligado: lista vazia). */
export function partesDoModelo(mat: MatModelo, prod: ProdVisita[], manter?: Record<SvcId, "sim" | "nao">, fora: string[] = [], arvore = catalogoLigado()?.arvore): ParteEstimativa[] {
  if (!mat.partes || !arvore) return [];
  const ativos = prod.filter((p) => p.q > 0);
  // os nós de um ramo: o próprio e os de baixo
  const ramo = ([o, sub]: [string, string?]) => {
    const of = arvore.find((x) => x.pai == null && x.n === o);
    const raiz = of && (sub ? arvore.find((x) => x.pai === of.id && x.n === sub) : of);
    return raiz ? { raiz: raiz.id, nos: nosAbaixo(arvore, raiz.id) } : null;
  };
  return mat.partes.map((pt, k) => {
    const d = pt.d ?? `parte ${k + 1}`, est = r2(mat.custo * pt.peso), R = pt.ramo ? ramo(pt.ramo) : null;
    const por = R ? ativos.filter((p) => p.no && R.nos.has(p.no)) : [];
    const mantida = !!pt.manter?.some((sid) => manter?.[sid] === "sim"), tirada = fora.includes(d);
    const custo = mantida || tirada ? 0 : r2(Math.max(0, est - por.reduce((a, p) => a + p.custo * p.q, 0)));
    return { d, est, custo, preco: r2(mat.preco * (custo / mat.custo)), raiz: R?.raiz ?? null, nos: R?.nos ?? null, por, mantida, fora: tirada };
  });
}

/**
 * A linha "Materiais" do modelo é uma estimativa de TODOS os materiais do modelo, dividida em partes (motor: LINHAS[…].mat.partes).
 * - Uma parte sai se o cliente mantém o que tem (a resposta "Sim" a "O cliente mantém…?" de um dos seus serviços),
 *   ou se se tirou à mão (fora, 21/10: na versão nova da proposta).
 * - Os produtos escolhidos (mesmo os que o cliente fornece) cobrem a parte do seu ramo do Catálogo: ela desce pelo custo
 *   deles, até zero. Os produtos fora do modelo (espelho, toalheiro…) não baixam nada: são linhas próprias.
 * O preço desce na mesma proporção do custo. Se não sobrar nada, a linha sai (null). Sem produtos nem respostas, fica igual.
 * Sem partes (ou sem Catálogo ligado para saber os ramos), cai na regra antiga: desce pelo custo de todos os produtos.
 */
export function materiaisDoModelo(
  mat: MatModelo, prod: ProdVisita[], manter?: Record<SvcId, "sim" | "nao">, arvore = catalogoLigado()?.arvore, fora: string[] = [],
): { custo: number; preco: number } | null {
  const partes = partesDoModelo(mat, prod, manter, fora, arvore);
  let custo = partes.length ? partes.reduce((a, p) => a + p.custo, 0) : mat.custo - prod.filter((p) => p.q > 0).reduce((a, p) => a + p.custo * p.q, 0);
  custo = r2(custo);
  if (!(custo > 0.004)) return null;
  if (custo >= mat.custo) return { custo: mat.custo, preco: mat.preco };
  return { custo, preco: r2(mat.preco * (custo / mat.custo)) };
}
