// Catálogo da V2, parte 2 (13/10/2026): pacotes, materiais e consumíveis, e a classificação
// numa só árvore (ofício › sub), partilhada por serviços, materiais e pacotes. Funções puras,
// sem React. As contas dos pacotes usam as mesmas dos serviços (custosModelo.ts):
// o custo por medida da receita × a quantidade que sai da medida.
// Os números são de EXEMPLO; os pacotes de arranque copiam os LINHAS do motor (só leitura).

import { CATALOGO, OFICIOS, normal, type LinhaCat } from "../catalogo";
import { LINHAS, r2, type Estado, type MedKey, type Medidas, type SvcId } from "../motor";
import { RECEITAS } from "../receitas";
import { ARTIGOS_DEM0, PAR_DEM0, type ArtigoDem, type MudancaDem, type ParDem } from "../entulho";
import {
  HOJE, custoReceita, margemSobrePreco, mesesAntes, mesesEntre, precoReceita, receitaDe,
  type Custos, type ReceitaV2, type UsoCons,
} from "./custosModelo";
import type { IconeServicoKey, IlustracaoKey } from "../ilustracoes";

/* ------------------------------------------------------------------ tipos */
/** Um nó da árvore: ofício (pai null) ou sub (pai = id do ofício). Só dois níveis. */
export interface No { id: string; n: string; pai: string | null }
export interface Produto {
  id: string; n: string;
  /** Custo de compra por unidade (€). */
  custo: number;
  un: string; marca: string; fornecedor: string;
  /** Data do preço (ISO): alimenta o "Preço desatualizado". */
  data: string;
  /** Onde fica na árvore (null = sem classificação). */
  no: string | null;
  /** O serviço que o produto traz quando se escolhe na visita (ex.: a sanita traz a instalação da sanita). Sem ele: produto só vendido. */
  servico?: SvcId;
  /** Quantidade do serviço por unidade do produto (por omissão 1). */
  fatorServico?: number;
  /** Referência do fornecedor (opcional, 14/10). */
  sku?: string;
  /** Preço de venda real (€ s/IVA, por unidade). Sem ele, o preço é o custo ÷ (1 − margem). */
  pvp?: number;
  /** A ilustração (ilustracoes.tsx). Sem ela, escolhe-se pelo nome. */
  img?: IlustracaoKey;
  /** Uma linha de descrição. */
  desc?: string;
  /** A subcategoria real (ex.: "Toalheiros"). */
  sub?: string;
}
/** Quantidade de uma linha de pacote: fixa, ou por medida (× fator, com arredondamento para cima). */
export type Regra = { k: "fixo"; q: number } | { k: "por"; med: MedKey; f: number; arred: boolean };
export interface LinhaPacote {
  id: string;
  t: "svc" | "mat";
  /** As escolhas da linha: o serviço (sid) ou material (id do produto) e as alternativas ("ou"). */
  refs: string[];
  /** A escolhida (uma de refs): é a que conta no custo. */
  esc: string;
  regra: Regra;
}
export interface Pacote {
  id: string; n: string; no: string | null;
  /** A linha de serviço (para a margem mínima); null usa a mínima geral. */
  linha: LinhaCat | null;
  /** Margem sobre o preço dos materiais (%): o preço do material = custo ÷ (1 − margem). */
  margemMat: number;
  /** Medidas de exemplo para mostrar custo, preço e margem. */
  ex: Medidas;
  linhas: LinhaPacote[];
}
export interface Catalogo {
  arvore: No[];
  produtos: Produto[];
  pacotes: Pacote[];
  /** Serviço → nó da árvore. */
  classe: Record<SvcId, string>;
  /** Serviço → nó da árvore de onde é OBRIGATÓRIO escolher um produto na visita (ex.: louças → Louças e torneiras). Em falta = sem obrigação. */
  exigeProduto?: Record<SvcId, string>;
  /** A quantidade sugerida do produto obrigatório, a partir das medidas (ex.: pavimento = m² × 1,1). */
  qtdDe?: Record<SvcId, Regra>;
  /** A pergunta feita antes de obrigar ao produto (ex.: "O cliente mantém a sanita?"): "Sim" dispensa o produto. Em falta = sem pergunta. */
  perguntaManter?: Record<SvcId, string>;
  /** Demolição e entulho (entulho.ts): a tabela de artigos, o artigo que cada serviço de demolição usa, */
  /** os parâmetros (só a Direção os muda) e o histórico das mudanças. Em falta = os de arranque. */
  artigosDem?: ArtigoDem[];
  artigoDoServico?: Record<SvcId, string>;
  parDem?: ParDem;
  histDem?: MudancaDem[];
  unidades: string[];
  marcas: string[];
  fornecedores: string[];
  /** O ícone de cada serviço (14/10). Sem ele, usa-se o do nome ou o do ofício (ilustracoes.tsx). */
  icone?: Record<SvcId, IconeServicoKey>;
}

/* ------------------------------------------------------------------ medidas */
export const MEDIDAS: { k: MedKey; n: string; curto: string }[] = [
  { k: "pav", n: "m² de pavimento", curto: "m² pav." },
  { k: "par", n: "m² de paredes", curto: "m² par." },
  { k: "pts", n: "ponto de água", curto: "pontos" },
  { k: "pcs", n: "vaso sanitário", curto: "vasos sanit." },
];
export const MED_NOME = Object.fromEntries(MEDIDAS.map((m) => [m.k, m.n])) as Record<MedKey, string>;
export const EX0: Medidas = { pav: 4, par: 14, pts: 3, pcs: 3 };

const num = (x: number) => String(r2(x)).replace(".", ",");
/** "fixo 1", "1 por m² de pavimento", "1,1 por m² de paredes, arredondado". */
export function textoRegra(r: Regra): string {
  return r.k === "fixo" ? `fixo ${num(r.q)}` : `${num(r.f)} por ${MED_NOME[r.med]}${r.arred ? ", arredondado" : ""}`;
}
export function quantidade(r: Regra, m: Medidas): number {
  if (r.k === "fixo") return r.q;
  const q = (m[r.med] || 0) * r.f;
  return r.arred ? Math.ceil(q - 1e-9) : r2(q);
}
/** A regra por omissão a partir da unidade: m² → pavimento, pt → pontos, pç/mód → vasos sanitários (pcs), o resto fixo 1. */
export function regraDaUnidade(un: string): Regra {
  if (un === "m²") return { k: "por", med: "pav", f: 1, arred: false };
  if (un === "pt") return { k: "por", med: "pts", f: 1, arred: false };
  if (un === "pç" || un === "mód") return { k: "por", med: "pcs", f: 1, arred: false };
  return { k: "fixo", q: 1 };
}

/* ------------------------------------------------------------------ árvore */
export const oficios = (A: No[]) => A.filter((n) => n.pai == null);
export const subs = (A: No[], pai: string) => A.filter((n) => n.pai === pai);
/** O ofício de um nó (ele próprio, se for ofício). */
export function oficioDe(A: No[], id: string | null | undefined): No | null {
  const n = id ? A.find((x) => x.id === id) : undefined;
  if (!n) return null;
  return n.pai == null ? n : A.find((x) => x.id === n.pai) ?? null;
}
/** "Revestimentos › Colas e argamassas". */
export function caminho(A: No[], id: string | null | undefined): string {
  const n = id ? A.find((x) => x.id === id) : undefined;
  if (!n) return "Sem classificação";
  const of = oficioDe(A, id);
  return of && of.id !== n.id ? `${of.n} › ${n.n}` : n.n;
}
/** Se um nó está dentro do ofício (é ele ou um sub dele). */
export const dentroDe = (A: No[], id: string | null | undefined, oficio: string) => oficioDe(A, id)?.id === oficio;

const nomeLivre = (A: No[], pai: string | null, n: string, menos?: string) =>
  !A.some((x) => x.pai === pai && x.id !== menos && normal(x.n) === normal(n));
const novoId = (pref: string, ids: string[]) => pref + (Math.max(0, ...ids.map((x) => Number(x.replace(/\D/g, "")) || 0)) + 1);

export type ResArvore = { ok: true; A: No[]; id: string } | { ok: false; erro: string };
/** Junta um ofício (pai null) ou um sub (pai = um ofício). Nome não vazio e sem repetir entre irmãos. */
export function juntarNo(A: No[], n: string, pai: string | null = null): ResArvore {
  const nome = n.trim();
  if (!nome) return { ok: false, erro: "Escreva o nome." };
  if (pai != null && !A.some((x) => x.id === pai && x.pai == null)) return { ok: false, erro: "Só os ofícios têm subs." };
  if (!nomeLivre(A, pai, nome)) return { ok: false, erro: `Já existe «${nome}» aqui.` };
  const id = novoId("o", A.map((x) => x.id));
  const novo: No = { id, n: nome, pai };
  // o sub fica no fim dos irmãos; o ofício no fim de tudo
  if (pai == null) return { ok: true, A: [...A, novo], id };
  const ult = A.map((x, i) => (x.id === pai || x.pai === pai ? i : -1)).filter((i) => i >= 0).pop()!;
  return { ok: true, A: [...A.slice(0, ult + 1), novo, ...A.slice(ult + 1)], id };
}
export function renomearNo(A: No[], id: string, n: string): ResArvore {
  const nome = n.trim(), no = A.find((x) => x.id === id);
  if (!no) return { ok: false, erro: "Não existe." };
  if (!nome) return { ok: false, erro: "Escreva o nome." };
  if (!nomeLivre(A, no.pai, nome, id)) return { ok: false, erro: `Já existe «${nome}» aqui.` };
  return { ok: true, A: A.map((x) => (x.id === id ? { ...x, n: nome } : x)), id };
}
/** Sobe (−1) ou desce (+1) um nó entre os irmãos. Um ofício leva os subs consigo. No limite, não mexe. */
export function moverNo(A: No[], id: string, d: -1 | 1): No[] {
  const no = A.find((x) => x.id === id);
  if (!no) return A;
  const irmaos = A.filter((x) => x.pai === no.pai), i = irmaos.findIndex((x) => x.id === id), j = i + d;
  if (j < 0 || j >= irmaos.length) return A;
  const ordem = irmaos.map((x) => x.id);
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  if (no.pai != null) {
    // os subs: trocar só as posições deles dentro do ofício
    const pos = A.map((x, k) => (x.pai === no.pai ? k : -1)).filter((k) => k >= 0), out = [...A];
    pos.forEach((k, n) => { out[k] = A.find((x) => x.id === ordem[n])!; });
    return out;
  }
  return ordem.flatMap((o) => [A.find((x) => x.id === o)!, ...A.filter((x) => x.pai === o)]);
}
/** Retira um nó (e os subs); o que estava classificado lá fica no ofício (se era sub) ou sem classificação. */
export function retirarNo(K: Catalogo, id: string): Catalogo {
  const no = K.arvore.find((x) => x.id === id);
  if (!no) return K;
  const fora = new Set([id, ...K.arvore.filter((x) => x.pai === id).map((x) => x.id)]);
  const destino = no.pai;
  const re = <T extends string | null>(v: T) => (v && fora.has(v) ? destino : v);
  return {
    ...K,
    arvore: K.arvore.filter((x) => !fora.has(x.id)),
    produtos: K.produtos.map((p) => ({ ...p, no: re(p.no) })),
    pacotes: K.pacotes.map((p) => ({ ...p, no: re(p.no) })),
    classe: Object.fromEntries(Object.entries(K.classe).flatMap(([s, v]) => { const r = re(v); return r ? [[s, r]] : []; })),
    // a obrigação de produto passa para o ofício (se era um sub) ou sai
    ...(K.exigeProduto ? { exigeProduto: Object.fromEntries(Object.entries(K.exigeProduto).flatMap(([s, v]) => { const r = re(v); return r ? [[s, r]] : []; })) } : {}),
  };
}
/** Quantos serviços, materiais e pacotes estão num nó (ou num ofício, contando os subs). */
export function contarNo(K: Catalogo, id: string, sids: SvcId[]): { svc: number; mat: number; pac: number } {
  const no = K.arvore.find((x) => x.id === id), em = (v: string | null | undefined) => !!v && (v === id || (no?.pai == null && K.arvore.find((x) => x.id === v)?.pai === id));
  return { svc: sids.filter((s) => em(K.classe[s])).length, mat: K.produtos.filter((p) => em(p.no)).length, pac: K.pacotes.filter((p) => em(p.no)).length };
}
/** As opções de uma escolha de classificação: "Ofício" e "Ofício › Sub", pela ordem da árvore. */
export const opcoesArvore = (A: No[]) => A.map((n) => ({ v: n.id, t: caminho(A, n.id) }));

/* ------------------------------------------------------------------ "criar ao escrever" */
/** As opções que batem com o que se escreve (sem acentos), e se se pode criar uma nova. */
export function filtrarCombo(lista: string[], q: string): { opcoes: string[]; criar: string | null } {
  const t = q.trim(), qq = normal(t);
  const opcoes = qq ? lista.filter((x) => normal(x).includes(qq)) : lista;
  return { opcoes, criar: t && !lista.some((x) => normal(x) === qq) ? t : null };
}
/** Junta o valor à lista se for novo (sem repetir, ignora acentos e maiúsculas); devolve o valor tal como fica na lista. */
export function garantirValor(lista: string[], v: string): { lista: string[]; v: string } {
  const t = v.trim(), ja = lista.find((x) => normal(x) === normal(t));
  if (!t) return { lista, v: "" };
  return ja ? { lista, v: ja } : { lista: [...lista, t], v: t };
}

/* ------------------------------------------------------------------ produtos */
export interface NovoProduto { n: string; custo: number; un: string; marca?: string; fornecedor?: string; no?: string | null }
export type ResProduto = { ok: true; K: Catalogo; id: string } | { ok: false; erro: string };
/** Cria um material: nome único, custo ≥ 0 e unidade; marca, unidade e fornecedor novos entram nas listas. Data do preço = hoje. */
export function criarProduto(K: Catalogo, o: NovoProduto, hoje = HOJE): ResProduto {
  const n = o.n.trim();
  if (!n) return { ok: false, erro: "Escreva o nome do material." };
  if (K.produtos.some((p) => normal(p.n) === normal(n))) return { ok: false, erro: `Já existe «${n}».` };
  if (!(o.custo >= 0) || isNaN(o.custo)) return { ok: false, erro: "O custo tem de ser um número." };
  if (!o.un.trim()) return { ok: false, erro: "Escolha a unidade." };
  const u = garantirValor(K.unidades, o.un), m = garantirValor(K.marcas, o.marca ?? ""), f = garantirValor(K.fornecedores, o.fornecedor ?? "");
  const id = novoId("m", K.produtos.map((p) => p.id));
  const p: Produto = { id, n, custo: r2(o.custo), un: u.v, marca: m.v, fornecedor: f.v, data: hoje, no: o.no ?? null };
  return { ok: true, id, K: { ...K, produtos: [...K.produtos, p], unidades: u.lista, marcas: m.lista, fornecedores: f.lista } };
}
/** Muda o custo de um material: a data do preço passa a hoje. */
export function mudarCusto(p: Produto, custo: number, hoje = HOJE): Produto {
  return { ...p, custo: r2(custo), data: hoje };
}
export const produtoDesatualizado = (p: Produto, meses: number, hoje = HOJE) => mesesEntre(p.data, hoje) >= meses;
/** O consumível de uma receita a partir de um material da lista. */
export function consumivelDe(p: Produto, id: string, q = 1): UsoCons {
  return { id, n: p.n, q, un: p.un, preco: p.custo, fornecedor: p.fornecedor || "Por escolher", data: p.data };
}
/**
 * Leva o custo e a data de um material às receitas que o usam (pelo nome): devolve as receitas
 * (só as que mudam, já como entram em Custos.receitas) para o "Preço desatualizado" do serviço sair.
 */
export function propagarProduto(S: Estado, C: Custos, p: Produto, antigo = p.n): Record<SvcId, ReceitaV2> {
  const ids = [...Object.keys(S.svc), ...CATALOGO.map((c) => c.id).filter((id) => !S.svc[id])];
  const out: Record<SvcId, ReceitaV2> = {};
  for (const sid of ids) {
    const rec = receitaDe(C, sid, S.svc[sid] ?? null, S.cfg.alvo);
    if (!rec || !rec.cons.some((c) => normal(c.n) === normal(antigo))) continue;
    const r = structuredClone(rec);
    for (const c of r.cons) if (normal(c.n) === normal(antigo)) { c.n = p.n; c.preco = p.custo; c.un = p.un; c.data = p.data; c.fornecedor = p.fornecedor || c.fornecedor; }
    out[sid] = r;
  }
  return out;
}

/* ------------------------------------------------------------------ pacotes: as contas */
export interface ContaLinha {
  id: string; ref: string; n: string; un: string; q: number;
  /** Custo e preço por unidade e da linha. */
  cu: number; pu: number; custo: number; preco: number;
  /** Sem serviço/material (retirado da lista). */
  falta: boolean;
}
export interface ContaPacote { linhas: ContaLinha[]; custo: number; preco: number; m: number; min: number; h: number; mo: number; mat: number }

/** O nome de uma referência de linha (serviço ou material). */
export function nomeRef(S: Estado, K: Catalogo, t: LinhaPacote["t"], ref: string): string {
  if (t === "mat") return K.produtos.find((p) => p.id === ref)?.n ?? "Material retirado";
  return S.svc[ref]?.n ?? CATALOGO.find((c) => c.id === ref)?.n ?? "Serviço retirado";
}
/** Custo e preço de um pacote para umas medidas: serviços pela receita (custo por medida × quantidade), materiais pelo custo ÷ (1 − margem). */
export function contaPacote(S: Estado, C: Custos, K: Catalogo, P: Pacote, m: Medidas = P.ex): ContaPacote {
  let h = 0, mo = 0, mat = 0;
  const linhas = P.linhas.map((l): ContaLinha => {
    const q = quantidade(l.regra, m);
    if (l.t === "svc") {
      const s = S.svc[l.esc] ?? null, cat = CATALOGO.find((c) => c.id === l.esc);
      const rec = receitaDe(C, l.esc, s, S.cfg.alvo);
      if (!rec) return { id: l.id, ref: l.esc, n: "Serviço retirado", un: "un", q, cu: 0, pu: 0, custo: 0, preco: 0, falta: true };
      const c = custoReceita(rec, C, S.cfg.estrutura), pu = precoReceita(rec, c.total);
      h += c.h * q; mo += c.total * q;
      return { id: l.id, ref: l.esc, n: s?.n ?? cat!.n, un: s?.un ?? cat!.un, q, cu: c.total, pu, custo: c.total * q, preco: pu * q, falta: false };
    }
    const p = K.produtos.find((x) => x.id === l.esc);
    if (!p) return { id: l.id, ref: l.esc, n: "Material retirado", un: "un", q, cu: 0, pu: 0, custo: 0, preco: 0, falta: true };
    const pu = P.margemMat < 100 ? p.custo / (1 - P.margemMat / 100) : 0;
    mat += p.custo * q;
    return { id: l.id, ref: l.esc, n: p.n, un: p.un, q, cu: p.custo, pu, custo: p.custo * q, preco: pu * q, falta: false };
  });
  const custo = linhas.reduce((a, l) => a + l.custo, 0), preco = linhas.reduce((a, l) => a + l.preco, 0);
  const min = P.linha ? C.minLinha[P.linha] ?? S.cfg.min : S.cfg.min;
  return { linhas, custo, preco, m: margemSobrePreco(preco, custo), min, h, mo, mat };
}
export type AlertaPacote = { k: "x" | "w"; t: string };
export function alertasPacote(c: ContaPacote, P: Pacote): AlertaPacote[] {
  const A: AlertaPacote[] = [];
  if (!P.linhas.length) A.push({ k: "w", t: "Pacote vazio: junte serviços e materiais." });
  const faltam = c.linhas.filter((l) => l.falta);
  if (faltam.length) A.push({ k: "w", t: `${faltam.length} ${faltam.length === 1 ? "linha sem" : "linhas sem"} serviço ou material.` });
  if (c.preco > 0 && c.preco < c.custo) A.push({ k: "x", t: "Preço abaixo do custo." });
  else if (c.preco > 0 && c.m < c.min / 100) A.push({ k: "x", t: `Margem abaixo do mínimo de ${c.min}%.` });
  return A;
}

/* ------------------------------------------------------------------ pacotes: mexer */
export function criarPacote(K: Catalogo, n: string, o: { no?: string | null; alvo?: number } = {}): ResProduto {
  const nome = n.trim();
  if (!nome) return { ok: false, erro: "Escreva o nome do pacote." };
  if (K.pacotes.some((p) => normal(p.n) === normal(nome))) return { ok: false, erro: `Já existe «${nome}».` };
  const id = novoId("k", K.pacotes.map((p) => p.id));
  const P: Pacote = { id, n: nome, no: o.no ?? null, linha: null, margemMat: o.alvo ?? 35, ex: { ...EX0 }, linhas: [] };
  return { ok: true, id, K: { ...K, pacotes: [...K.pacotes, P] } };
}
/** Junta uma linha (serviço ou material) com a regra que sai da unidade. Não repete a mesma referência. */
export function juntarLinha(P: Pacote, t: LinhaPacote["t"], ref: string, un: string): Pacote {
  if (P.linhas.some((l) => l.t === t && l.refs.includes(ref))) return P;
  const id = "l" + (Math.max(0, ...P.linhas.map((l) => Number(l.id.replace(/\D/g, "")) || 0)) + 1);
  return { ...P, linhas: [...P.linhas, { id, t, refs: [ref], esc: ref, regra: regraDaUnidade(un) }] };
}
/** Junta uma alternativa ("ou") a uma linha: do mesmo tipo, sem repetir. */
export function juntarAlternativa(P: Pacote, linha: string, ref: string): Pacote {
  return { ...P, linhas: P.linhas.map((l) => (l.id === linha && !l.refs.includes(ref) ? { ...l, refs: [...l.refs, ref] } : l)) };
}
export function escolherAlternativa(P: Pacote, linha: string, ref: string): Pacote {
  return { ...P, linhas: P.linhas.map((l) => (l.id === linha && l.refs.includes(ref) ? { ...l, esc: ref } : l)) };
}
/** Retira uma alternativa; se era a escolhida, passa a primeira que fica. A última não sai (retira-se a linha). */
export function retirarAlternativa(P: Pacote, linha: string, ref: string): Pacote {
  return {
    ...P, linhas: P.linhas.map((l) => {
      if (l.id !== linha || l.refs.length < 2 || !l.refs.includes(ref)) return l;
      const refs = l.refs.filter((r) => r !== ref);
      return { ...l, refs, esc: l.esc === ref ? refs[0] : l.esc };
    }),
  };
}
export const retirarLinha = (P: Pacote, linha: string): Pacote => ({ ...P, linhas: P.linhas.filter((l) => l.id !== linha) });
export const mudarRegra = (P: Pacote, linha: string, regra: Regra): Pacote => ({ ...P, linhas: P.linhas.map((l) => (l.id === linha ? { ...l, regra } : l)) });
/** Sobe ou desce uma linha do pacote. */
export function moverLinha(P: Pacote, linha: string, d: -1 | 1): Pacote {
  const i = P.linhas.findIndex((l) => l.id === linha), j = i + d;
  if (i < 0 || j < 0 || j >= P.linhas.length) return P;
  const L = [...P.linhas];
  [L[i], L[j]] = [L[j], L[i]];
  return { ...P, linhas: L };
}

/** O que se pode juntar a um pacote: serviços (em uso primeiro, depois os mais pedidos) e materiais, pela pesquisa e pelo ofício. */
export interface Opcao { t: LinhaPacote["t"]; ref: string; n: string; un: string; no: string | null }
export function opcoesPacote(S: Estado, K: Catalogo, q: string, o: { t?: LinhaPacote["t"]; oficio?: string | null; sem?: string[]; max?: number } = {}): Opcao[] {
  const qq = normal(q.trim()), sem = new Set(o.sem ?? []);
  const svc: Opcao[] = [...Object.keys(S.svc), ...CATALOGO.map((c) => c.id).filter((id) => !S.svc[id])]
    .map((sid) => ({ t: "svc" as const, ref: sid, n: S.svc[sid]?.n ?? CATALOGO.find((c) => c.id === sid)!.n, un: S.svc[sid]?.un ?? CATALOGO.find((c) => c.id === sid)!.un, no: K.classe[sid] ?? null }));
  const mat: Opcao[] = K.produtos.map((p) => ({ t: "mat" as const, ref: p.id, n: p.n, un: p.un, no: p.no }));
  return [...(o.t === "mat" ? [] : svc), ...(o.t === "svc" ? [] : mat)]
    .filter((x) => !sem.has(x.ref) && (!qq || normal(x.n).includes(qq) || normal(caminho(K.arvore, x.no)).includes(qq)) && (!o.oficio || dentroDe(K.arvore, x.no, o.oficio)))
    .slice(0, o.max ?? 12);
}

/* ------------------------------------------------------------------ valores de arranque */
/** As subs de exemplo de cada ofício (os ofícios são os do Catálogo real). */
const SUBS0: Record<string, string[]> = {
  "Demolições": [], "Canalização": ["Águas e esgotos", "Louças e torneiras"], "Revestimentos": ["Parede", "Pavimento", "Colas e argamassas"],
  "Carpintaria": ["Mobiliário", "Pladur"], "Gás (ITG)": [], "Eletricidade": [], "Pintura": [],
};
/** Os serviços do pacote (motor) → ofício › sub. */
const CLASSE_SVC0: Record<SvcId, [string, string?]> = {
  demol: ["Demolições"], canal: ["Canalização", "Águas e esgotos"], revest: ["Revestimentos", "Parede"], pav: ["Revestimentos", "Pavimento"],
  loucas: ["Canalização", "Louças e torneiras"], moveis: ["Carpintaria", "Mobiliário"], eletr: ["Eletricidade"], teto: ["Carpintaria", "Pladur"], pint: ["Pintura"],
};
/** Os materiais de exemplo: os dos pacotes (LINHAS do motor) e os consumíveis das receitas. */
const PROD0: (Omit<Produto, "id" | "no" | "data"> & { cl: [string, string?]; data?: string; meses?: number })[] = [
  { n: "Cerâmico de parede 30×60", custo: 14.5, un: "m²", marca: "Revigrés", fornecedor: "Leroy Merlin Pro", cl: ["Revestimentos", "Parede"], meses: 2 },
  { n: "Pavimento cerâmico 60×60", custo: 18.9, un: "m²", marca: "Revigrés", fornecedor: "Leroy Merlin Pro", cl: ["Revestimentos", "Pavimento"], meses: 2 },
  { n: "Sanita suspensa com estrutura", custo: 285, un: "un", marca: "Roca", fornecedor: "Sanitop", cl: ["Canalização", "Louças e torneiras"], meses: 1 },
  { n: "Sanita compacta", custo: 165, un: "un", marca: "Roca", fornecedor: "Sanitop", cl: ["Canalização", "Louças e torneiras"], meses: 1 },
  { n: "Base de duche 80×120", custo: 210, un: "un", marca: "Sanindusa", fornecedor: "Sanitop", cl: ["Canalização", "Louças e torneiras"], meses: 3 },
  { n: "Banheira acrílica 170×70", custo: 240, un: "un", marca: "Sanindusa", fornecedor: "Sanitop", cl: ["Canalização", "Louças e torneiras"], meses: 3 },
  { n: "Cimento-cola · saco 25 kg", custo: 4.75, un: "saco", marca: "Weber", fornecedor: "Weber", cl: ["Revestimentos", "Colas e argamassas"], meses: 8 },
  { n: "Conjunto de móveis de cozinha", custo: 2600, un: "un", marca: "Mudelar", fornecedor: "Mudelar", cl: ["Carpintaria", "Mobiliário"], meses: 1 },
  { n: "Bancada em pedra", custo: 650, un: "un", marca: "Silestone", fornecedor: "Mármores do Sul", cl: ["Carpintaria", "Mobiliário"], meses: 4 },
  { n: "Bancada laminada", custo: 280, un: "un", marca: "Egger", fornecedor: "Mudelar", cl: ["Carpintaria", "Mobiliário"], meses: 4 },
];
const MARCA_FORN: Record<string, string> = { "Leroy Merlin Pro": "Dexter", "Würth": "Würth", "Sanitop": "Sanitop", "Weber": "Weber", "Rexel": "Legrand", "Placo": "Placo", "CIN": "CIN" };
const CL_CONS: Record<string, [string, string?]> = {
  demol: ["Demolições"], canal: ["Canalização", "Águas e esgotos"], revest: ["Revestimentos", "Colas e argamassas"], pav: ["Revestimentos", "Colas e argamassas"],
  loucas: ["Canalização", "Louças e torneiras"], moveis: ["Carpintaria", "Mobiliário"], eletr: ["Eletricidade"], teto: ["Carpintaria", "Pladur"], pint: ["Pintura"],
};
const dataDe = (txt?: string) => { const m = txt && /há (\d+) meses?/.exec(txt); return m ? mesesAntes(HOJE, Number(m[1])) : "2026-09-01"; };

/** As regras dos materiais dos LINHAS do motor, escritas como regras (há um teste que as compara com as funções do motor). */
export const REGRAS_LINHAS: Record<string, Regra> = {
  "Cerâmico de parede 30×60": { k: "por", med: "par", f: 1.1, arred: true },
  "Pavimento cerâmico 60×60": { k: "por", med: "pav", f: 1.1, arred: true },
  "Sanita suspensa com estrutura": { k: "fixo", q: 1 },
  "Base de duche 80×120": { k: "fixo", q: 1 },
  "Conjunto de móveis de cozinha": { k: "fixo", q: 1 },
  "Bancada em pedra": { k: "fixo", q: 1 },
};
/** As alternativas ("ou") de exemplo. */
const ALT0: Record<string, string> = { "Sanita suspensa com estrutura": "Sanita compacta", "Base de duche 80×120": "Banheira acrílica 170×70", "Bancada em pedra": "Bancada laminada" };

/** Produtos de exemplo para as relações: um que traz serviço (espelho com LED, toalheiro) e outros só vendidos. */
const PROD_SVC0: (Omit<Produto, "id" | "no" | "data"> & { cl: [string, string?] })[] = [
  { n: "Espelho com LED 80 cm", custo: 95, un: "un", marca: "Sanindusa", fornecedor: "Sanitop", cl: ["Eletricidade"] },
  { n: "Toalheiro elétrico", custo: 120, un: "un", marca: "Roca", fornecedor: "Sanitop", cl: ["Eletricidade"] },
  { n: "Espelho simples 60×80", custo: 35, un: "un", marca: "Leroy Merlin", fornecedor: "Leroy Merlin Pro", cl: ["Carpintaria", "Acessórios WC"] },
  { n: "Conjunto de acessórios WC", custo: 48, un: "un", marca: "Roca", fornecedor: "Sanitop", cl: ["Carpintaria", "Acessórios WC"] },
];
/** Produto → [serviço que traz, fator]. Os serviços são os do Catálogo real (catalogo.ts). */
const TRAZ0: Record<string, [SvcId, number]> = {
  "Sanita suspensa com estrutura": ["c13", 1], "Sanita compacta": ["c13", 1], "Banheira acrílica 170×70": ["c17", 1],
  "Espelho com LED 80 cm": ["c19", 1], "Toalheiro elétrico": ["c28", 1],
};
/** Serviço → [ramo de onde é obrigatório escolher produto, quantidade sugerida a partir das medidas]. */
const EXIGE0: Record<SvcId, [[string, string?], Regra]> = {
  loucas: [["Canalização", "Louças e torneiras"], { k: "fixo", q: 1 }],
  pav: [["Revestimentos", "Pavimento"], { k: "por", med: "pav", f: 1.1, arred: true }],
  moveis: [["Carpintaria", "Mobiliário"], { k: "fixo", q: 1 }],
  c6: [["Revestimentos", "Pavimento"], { k: "por", med: "pav", f: 1.1, arred: true }],
  c13: [["Canalização", "Louças e torneiras"], { k: "fixo", q: 1 }],
  c17: [["Canalização", "Louças e torneiras"], { k: "fixo", q: 1 }],
};
/** Serviço de demolição → o artigo de demolição que usa (a quantidade do serviço é a do artigo). */
const ARTIGO_SVC0: Record<SvcId, string> = {
  demol: "DEM-PAV-01", c1: "DEM-SAN-01",
};
/** A pergunta antes de obrigar ao produto ("Sim" = reaproveita-se o que há). */
const PERGUNTA0: Record<SvcId, string> = {
  loucas: "O cliente mantém a sanita e a base de duche?", c13: "O cliente mantém a sanita?", c17: "O cliente mantém a banheira?",
  pav: "O cliente mantém o pavimento?", c6: "O cliente mantém o pavimento?", moveis: "O cliente mantém os móveis?",
};

export function catalogo0(): Catalogo {
  let arvore: No[] = [];
  for (const of of OFICIOS) {
    const r = juntarNo(arvore, of);
    if (!r.ok) continue;
    arvore = r.A;
    for (const s of SUBS0[of] ?? []) { const q = juntarNo(arvore, s, r.id); if (q.ok) arvore = q.A; }
  }
  // um sub juntado depois (13/10): fica no fim da Carpintaria, sem mudar os ids dos nós de antes
  { const carp = arvore.find((x) => x.pai == null && x.n === "Carpintaria"); const q = carp && juntarNo(arvore, "Acessórios WC", carp.id); if (q && q.ok) arvore = q.A; }
  const noDe = ([o, s]: [string, string?]) => {
    const of = arvore.find((x) => x.pai == null && x.n === o);
    if (!of) return null;
    return (s && arvore.find((x) => x.pai === of.id && x.n === s)?.id) || of.id;
  };
  const classe: Record<SvcId, string> = {};
  for (const [sid, cl] of Object.entries(CLASSE_SVC0)) { const n = noDe(cl); if (n) classe[sid] = n; }
  for (const c of CATALOGO) if (!classe[c.id]) { const n = noDe([c.cat]); if (n) classe[c.id] = n; }

  const produtos: Produto[] = [];
  const juntar = (p: Omit<Produto, "id">) => { if (!produtos.some((x) => normal(x.n) === normal(p.n))) produtos.push({ ...p, id: "m" + (produtos.length + 1) }); };
  for (const p of PROD0) juntar({ n: p.n, custo: p.custo, un: p.un, marca: p.marca, fornecedor: p.fornecedor, data: mesesAntes(HOJE, p.meses ?? 1), no: noDe(p.cl) });
  for (const [sid, R] of Object.entries(RECEITAS)) for (const c of R.cons)
    juntar({ n: c.n, custo: c.preco, un: c.un, marca: MARCA_FORN[c.fornecedor] ?? "", fornecedor: c.fornecedor, data: dataDe(c.data), no: noDe(CL_CONS[sid] ?? ["Demolições"]) });
  // os produtos de exemplo das relações com serviços (13/10): no fim, para não mudar os ids de antes
  for (const p of PROD_SVC0) juntar({ n: p.n, custo: p.custo, un: p.un, marca: p.marca, fornecedor: p.fornecedor, data: mesesAntes(HOJE, 1), no: noDe(p.cl) });
  // produtos que trazem um serviço (quantidade do serviço = quantidade do produto × fator)
  for (const p of produtos) { const t = TRAZ0[p.n]; if (t) { p.servico = t[0]; p.fatorServico = t[1]; } }
  // serviços que obrigam a escolher um produto de um ramo, e a quantidade sugerida a partir das medidas
  const exigeProduto: Record<SvcId, string> = {}, qtdDe: Record<SvcId, Regra> = {};
  for (const [sid, [cl, r]] of Object.entries(EXIGE0)) { const n = noDe(cl); if (n) { exigeProduto[sid] = n; qtdDe[sid] = r; } }
  const perguntaManter = { ...PERGUNTA0 };

  const idProd = (n: string) => produtos.find((p) => p.n === n)!.id;
  const pacotes: Pacote[] = (Object.entries(LINHAS) as [LinhaCat, (typeof LINHAS)["wc"]][]).map(([lid, L], i) => {
    const linhas: LinhaPacote[] = [];
    L.map.forEach(([sid, k]) => linhas.push({ id: "l" + (linhas.length + 1), t: "svc", refs: [sid], esc: sid, regra: { k: "por", med: k, f: 1, arred: false } }));
    for (const [n] of L.mats) {
      const refs = [idProd(n), ...(ALT0[n] ? [idProd(ALT0[n])] : [])];
      // o cimento-cola do motor é ⌈(paredes + pavimento) ÷ 4⌉ (duas medidas): como regra de uma medida, fica ⌈paredes ÷ 4⌉ (aproximação)
      linhas.push({ id: "l" + (linhas.length + 1), t: "mat", refs, esc: refs[0], regra: REGRAS_LINHAS[n] ?? { k: "por", med: "par", f: 0.25, arred: true } });
    }
    return {
      id: "k" + (i + 1), n: `${L.n} · ${L.modelo}`, no: null, linha: lid, margemMat: 35,
      ex: lid === "wc" ? { pav: 4, par: 14, pts: 3, pcs: 3 } : { pav: 9, par: 14, pts: 2, pcs: 9 }, linhas,
    };
  });
  const uniq = (v: string[]) => [...new Set(v.filter(Boolean))];
  return {
    arvore, produtos, pacotes, classe, exigeProduto, qtdDe, perguntaManter,
    artigosDem: structuredClone(ARTIGOS_DEM0), artigoDoServico: { ...ARTIGO_SVC0 }, parDem: structuredClone(PAR_DEM0), histDem: [],
    unidades: uniq(["un", "m²", "ml", "m", "kg", "l", "kit", "tubo", "saco", "pç", ...produtos.map((p) => p.un)]),
    marcas: uniq(produtos.map((p) => p.marca)).sort((a, b) => a.localeCompare(b, "pt")),
    fornecedores: uniq(produtos.map((p) => p.fornecedor)).sort((a, b) => a.localeCompare(b, "pt")),
  };
}

/** O nó de um serviço: o da classificação, ou o ofício com o mesmo nome. */
export function noDoServico(K: Catalogo, sid: SvcId, oficio: string): string | null {
  return K.classe[sid] ?? K.arvore.find((x) => x.pai == null && normal(x.n) === normal(oficio))?.id ?? null;
}
