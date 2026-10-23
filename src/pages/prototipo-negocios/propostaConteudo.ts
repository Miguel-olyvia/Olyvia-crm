// O conteúdo da proposta, arrumado para o cliente (15/10/2026). Pedido do Ruben: "tudo muito mais organizado e com ícones,
// clean e profissional". As linhas do orçamento trazem prefixos técnicos ("Levantamento · ", "Produto · ",
// "Fornecido pelo cliente · ") e a descrição dos materiais do modelo; aqui viram grupos curtos, por fase:
// · Trabalhos: os serviços, com a quantidade por extenso ("Canalização · 2 pontos"), e a demolição;
// · Preparação e proteção: o que vem do levantamento (proteções, transporte, casa habitada), sem o prefixo nem o % de preço;
// · Materiais: os produtos escolhidos e os materiais do modelo;
// · Fornecido por si: o que o cliente fornece, uma vez só (sem repetir) e sem o serviço entre parênteses.
// E as escolhas do cliente (cores, mobilidade) à parte dos materiais; um "Não" não se mostra.
import { LINHA_DEMOLICAO } from "./entulho";
import { PREFIXO_LEV } from "./efeitosLevantamento";
import type { Estado, Negocio } from "./motor";
import { PREFIXO_CLIENTE, PREFIXO_PROD, precoProduto } from "./produtosVisita";

const nfmt = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");

/* ------------------------------------------------------------------ quantidades por extenso */
// As unidades contáveis escrevem-se por extenso, com o plural certo; as de medida ficam no símbolo (m², ml, kg…).
const UNIDADES: Record<string, [string, string]> = {
  un: ["unidade", "unidades"], unid: ["unidade", "unidades"], pt: ["ponto", "pontos"], "mód": ["módulo", "módulos"], mod: ["módulo", "módulos"],
  "pç": ["peça", "peças"], pc: ["peça", "peças"], kit: ["kit", "kits"], tubo: ["tubo", "tubos"], saco: ["saco", "sacos"], sacos: ["saco", "sacos"],
  rolo: ["rolo", "rolos"], caixa: ["caixa", "caixas"], cx: ["caixa", "caixas"], porta: ["porta", "portas"], dia: ["dia", "dias"],
};
/** "1 saco", "2 sacos", "2 pontos", "6 m²". Sem unidade (ou "vg", valor global): só o número, ou nada. */
export function quantidade(q: number, un: string): string {
  const u = (un || "").trim();
  if (!u || u === "vg") return q === 1 || !u ? "" : nfmt(q);
  const ex = UNIDADES[u.toLowerCase()];
  return ex ? `${nfmt(q)} ${Math.abs(q - 1) < 1e-9 ? ex[0] : ex[1]}` : `${nfmt(q)} ${u}`;
}

/* ------------------------------------------------------------------ as linhas de materiais */
export type Grupo = "trabalhos" | "preparacao" | "materiais" | "cliente";
export const GRUPOS: { k: Grupo; t: string }[] = [
  { k: "trabalhos", t: "Trabalhos" }, { k: "preparacao", t: "Preparação e proteção" }, { k: "materiais", t: "Materiais" }, { k: "cliente", t: "Fornecido por si" },
];
export interface Item { nome: string; det?: string }

const maiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Tira o que é nota de preço para o comercial (ex.: "(+4%)") e espaços a mais. */
const limpar = (s: string) => s.replace(/\s*\([+−-]?\s*\d+(?:[,.]\d+)?\s*%\)/g, "").replace(/\s+/g, " ").trim();

/** O grupo e o texto, para o cliente, de uma linha de materiais do orçamento (pela descrição). */
export function linhaDeMaterial(d: string): { grupo: Grupo; item: Item } {
  if (d === LINHA_DEMOLICAO) return { grupo: "trabalhos", item: { nome: "Demolição e remoção de entulho", det: "operador licenciado, com e-GAR" } };
  if (d.startsWith(PREFIXO_LEV)) return { grupo: "preparacao", item: { nome: maiuscula(limpar(d.slice(PREFIXO_LEV.length))) } };
  if (d.startsWith(PREFIXO_CLIENTE)) {
    // "Sacos de entulho (Demolição e entulho)": o serviço entre parênteses diz para que é
    const resto = limpar(d.slice(PREFIXO_CLIENTE.length)), m = resto.match(/^(.*?)\s*\(([^()]+)\)$/);
    return { grupo: "cliente", item: m ? { nome: maiuscula(m[1]), det: `para ${m[2].toLowerCase()}` } : { nome: maiuscula(resto) } };
  }
  if (d.startsWith(PREFIXO_PROD)) return { grupo: "materiais", item: { nome: maiuscula(limpar(d.slice(PREFIXO_PROD.length))) } };
  // a descrição dos materiais do modelo (ex.: "móveis, bancada, torneira")
  return { grupo: "materiais", item: { nome: maiuscula(limpar(d)), det: "incluídos no modelo" } };
}

/* ------------------------------------------------------------------ "O que vamos fazer", por fase */
export type Entrada =
  | { fase: number; t: "svc"; nome: string; q: number; un: string }
  | { fase: number; t: "mat"; d: string };
export interface FaseProposta { fase: number; grupos: { k: Grupo; t: string; itens: Item[] }[] }

/** As linhas do orçamento arrumadas por fase e, dentro de cada fase, por grupo (só os grupos com alguma coisa).
 *  "Fornecido por si" aparece uma vez em toda a proposta por item (na primeira fase em que surge). */
export function porFase(entradas: Entrada[]): FaseProposta[] {
  const fases = [...new Set(entradas.map((e) => e.fase))].sort((a, b) => a - b);
  const jaCliente = new Set<string>();
  return fases.map((fase) => {
    const G: Record<Grupo, Item[]> = { trabalhos: [], preparacao: [], materiais: [], cliente: [] };
    const vistos: Record<Grupo, Set<string>> = { trabalhos: new Set(), preparacao: new Set(), materiais: new Set(), cliente: new Set() };
    const por = (g: Grupo, it: Item) => {
      const chave = it.nome.toLowerCase();
      if (vistos[g].has(chave) || (g === "cliente" && jaCliente.has(chave))) return;
      vistos[g].add(chave); if (g === "cliente") jaCliente.add(chave);
      G[g].push(it);
    };
    for (const e of entradas.filter((x) => x.fase === fase)) {
      if (e.t === "svc") por("trabalhos", { nome: e.nome, det: quantidade(e.q, e.un) || undefined });
      else { const { grupo, item } = linhaDeMaterial(e.d); por(grupo, item); }
    }
    return { fase, grupos: GRUPOS.filter((g) => G[g.k].length).map((g) => ({ ...g, itens: G[g.k] })) };
  }).filter((f) => f.grupos.length);
}

/* ------------------------------------------------------------------ as escolhas do cliente */
/** As escolhas para mostrar ao cliente: um "Não" (ex.: mobilidade reduzida) não se mostra; um "Sim" mostra-se só com o nome. */
export function escolhasVisiveis(pares: readonly (readonly [string, string])[]): { l: string; v?: string }[] {
  return pares
    .filter(([, v]) => v && v.trim() && v !== "Não")
    .map(([l, v]) => (v === "Sim" ? { l } : { l, v }));
}

/* ------------------------------------------------------------------ o que o cliente fornece */
export interface Fornecido { nome: string; det?: string; poupa: number }
/** O que o cliente disse na visita que fornece: os itens das receitas marcados (com o que poupa, sem IVA: sai do custo
 *  e do preço pelo mesmo valor), o que compra em vez do produto, e os produtos marcados como dele. Sem repetir. */
export function fornecidosPeloCliente(d: Negocio, S: Estado): Fornecido[] {
  const out = new Map<string, Fornecido>();
  const juntar = (f: Fornecido) => {
    const k = f.nome.toLowerCase(), ja = out.get(k);
    if (!ja) { out.set(k, { ...f, poupa: Math.round(f.poupa * 100) / 100 }); return; }
    ja.poupa = Math.round((ja.poupa + f.poupa) * 100) / 100;
    if (f.det && ja.det && !ja.det.includes(f.det.replace(/^para /, ""))) ja.det = `${ja.det}, ${f.det.replace(/^para /, "")}`;
  };
  const linhas = d.orc?.linhas ?? [];
  const sim = d.f.materiais_cliente === "Sim";
  // 15/10: o cliente só fornece produtos; as linhas "Fornecido pelo cliente · …" do orçamento e os produtos marcados como dele
  for (const l of linhas) if (l.t === "mat") { const { grupo, item } = linhaDeMaterial(l.d); if (grupo === "cliente") juntar({ ...item, poupa: 0 }); }
  for (const p of d.visita.prod ?? []) if (p.cliente && p.q > 0) juntar({ nome: maiuscula(p.n), det: quantidade(p.q, p.un) || undefined, poupa: precoProduto(p) });
  return [...out.values()];
}
