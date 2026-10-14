// Catálogo e custos da V2 (13/10/2026): o modelo, sem React.
// Funções puras: custo/hora dos perfis, €/h dos equipamentos, taxa de estrutura,
// custo e preço de uma receita, a lista única do Catálogo e os alertas.
// Os números são de EXEMPLO e batem certo com motor.ts e receitas.ts no arranque:
// um técnico de 1.900 € dá 25,00 €/h, a estrutura dá 5,06 €/h e os equipamentos
// têm a mesma amortização (preço ÷ vida útil) de receitas.ts.

import { CATALOGO, normal, type ItemCatalogo, type LinhaCat } from "../catalogo";
import { LINHAS, alertas, eur, pct, r2, type Alerta, type Estado, type MedKey, type Negocio, type Servico, type SvcId } from "../motor";
import { RECEITAS, amortHora, consUn } from "../receitas";

/* ------------------------------------------------------------------ tipos */
export interface Parametros {
  /** Meses de salário por ano (12 + subsídios de férias e de Natal). */
  meses: number;
  /** TSU da empresa, em %. */
  tsu: number;
  /** Seguros e medicina do trabalho, € por técnico e por ano. */
  segurosAno: number;
  /** Horas produtivas de um técnico por ano. */
  horasAno: number;
  /** Horas produtivas da empresa por mês (todos os técnicos): divide a estrutura. */
  horasMes: number;
  /** Ao fim de quantos meses o preço de um consumível fica desatualizado. */
  mesesDesatualizado: number;
}
export interface Perfil { id: string; n: string; salario: number | null }
export interface Equip { id: string; n: string; compra: number; vida: number; residual: number; manutAno: number; usoAno: number }
export type CategoriaEstrutura = "Renda" | "Viaturas" | "Seguros" | "Pessoal não operacional" | "Licenças e software" | "Energia e água" | "Outro";
export const CATEGORIAS_ESTRUTURA: CategoriaEstrutura[] = ["Renda", "Viaturas", "Seguros", "Pessoal não operacional", "Licenças e software", "Energia e água", "Outro"];
export interface LinhaEstrutura { id: string; n: string; cat: CategoriaEstrutura; mensal: number; ativo: boolean }

export interface PassoMO { id: string; n: string; perfil: string; h: number }
export interface UsoEquip { id: string; equip: string; h: number }
export interface UsoCons {
  id: string; n: string; q: number; un: string; preco: number; fornecedor: string; data: string;
  /** Consumível opcional (14/10): não entra no custo por omissão; o técnico ou o comercial pode ligá-lo. */
  opcional?: boolean;
}
export interface PrecoHist { data: string; preco: number; nota: string }
export type ModoPreco = "tabela" | "margem";
export const JUSTIFICACOES = ["Preço de mercado da zona", "Cliente ou obra estratégica", "Serviço de entrada (traz outros)", "Campanha em curso"] as const;

/** A receita de um serviço. origem: "catalogo" (receita completa de receitas.ts), "estimada" (só as horas do Catálogo), "editada" (mexida aqui). */
export interface ReceitaV2 {
  sid: SvcId;
  origem: "catalogo" | "estimada" | "editada";
  mo: PassoMO[];
  equip: UsoEquip[];
  cons: UsoCons[];
  modo: ModoPreco;
  precoTabela: number;
  /** Margem sobre o preço (%), no modo "Custo + margem". */
  margem: number;
  hist: PrecoHist[];
  justificacao?: string;
  /**
   * De onde vem a quantidade do serviço na visita (14/10): pav (m² de pavimento), par (m² de paredes),
   * pts (pontos de água), pcs (vasos sanitários); null = o comercial escreve a quantidade.
   * Em falta (undefined) usa-se a do modelo (LINHAS) ou a que sai da unidade (fichaModelo.ts: medidaDe).
   */
  medida?: MedKey | null;
}

export interface Custos {
  par: Parametros;
  perfis: Perfil[];
  equip: Equip[];
  estrutura: LinhaEstrutura[];
  /** Margem mínima por linha de serviço (%); a que falta usa a mínima geral das Definições. */
  minLinha: Partial<Record<LinhaCat, number>>;
  /** Só as receitas mexidas; as outras derivam-se de S.svc, receitas.ts e catalogo.ts. */
  receitas: Record<SvcId, ReceitaV2>;
}

/* ------------------------------------------------------------------ datas */
/** "Hoje" do protótipo. */
export const HOJE = "2026-10-13";
/** A data N meses antes (ou depois, com N negativo) de uma data ISO. */
export function mesesAntes(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1 - n, 1));
  const ult = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ult)).padStart(2, "0")}`;
}
/** Meses completos entre duas datas ISO. */
export function mesesEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number), [a2, m2, d2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}
export const dataPT = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

/* ------------------------------------------------------------------ valores de arranque */
export const PERFIS0: Perfil[] = [
  { id: "servente", n: "Servente · demolição", salario: 1900 },
  { id: "canalizador", n: "Canalizador", salario: 1900 },
  // sem salário no RH: é o "Técnico sem custo/hora" do revestimento (S.svc.revest.semCusto)
  { id: "ladrilhador", n: "Ladrilhador", salario: null },
  { id: "montador", n: "Montador", salario: 1900 },
  { id: "eletricista", n: "Eletricista", salario: 1900 },
  { id: "pintor", n: "Pintor", salario: 1900 },
  { id: "gas", n: "Técnico de gás (ITG)", salario: 2100 },
];
/** O ofício do Catálogo → o perfil que o faz. */
export const PERFIL_DO_OFICIO: Record<string, string> = {
  "Demolições": "servente", "Canalização": "canalizador", "Revestimentos": "ladrilhador", "Carpintaria": "montador",
  "Gás (ITG)": "gas", "Eletricidade": "eletricista", "Pintura": "pintor",
};

const idEquip = (n: string) => "e-" + normal(n).replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
function equip0(): Equip[] {
  const vistos = new Map<string, Equip>();
  for (const r of Object.values(RECEITAS)) for (const e of r.equip) {
    const id = idEquip(e.n);
    if (!vistos.has(id)) vistos.set(id, { id, n: e.n, compra: e.compra, vida: e.vida, residual: 0, manutAno: 0, usoAno: 600 });
  }
  return [...vistos.values()];
}

export function custos0(): Custos {
  return {
    par: { meses: 14, tsu: 23.75, segurosAno: 713, horasAno: 1345, horasMes: 672, mesesDesatualizado: 6 },
    perfis: PERFIS0.map((p) => ({ ...p })),
    equip: equip0(),
    estrutura: [
      { id: "s1", n: "Renda do armazém e escritório", cat: "Renda", mensal: 900, ativo: true },
      { id: "s2", n: "Viaturas (2 carrinhas)", cat: "Viaturas", mensal: 1200, ativo: true },
      { id: "s3", n: "Seguros da empresa", cat: "Seguros", mensal: 300, ativo: true },
      { id: "s4", n: "Gestão e administrativo", cat: "Pessoal não operacional", mensal: 800, ativo: true },
      { id: "s5", n: "Software e telemóveis", cat: "Licenças e software", mensal: 200, ativo: true },
    ],
    minLinha: { coz: 30 },
    receitas: {},
  };
}

/* ------------------------------------------------------------------ contas */
/** Custo/hora de um perfil: salário × meses × (1 + TSU) + seguros, a dividir pelas horas produtivas. Null sem salário. */
export function custoHoraPerfil(p: Perfil, par: Parametros): number | null {
  if (p.salario == null || !(par.horasAno > 0)) return null;
  return (p.salario * par.meses * (1 + par.tsu / 100) + par.segurosAno) / par.horasAno;
}
/** O ano de um perfil, para mostrar a conta (só a Direção vê o salário). */
export function anoPerfil(p: Perfil, par: Parametros) {
  const base = (p.salario ?? 0) * par.meses, tsu = base * par.tsu / 100;
  return { base, tsu, seguros: par.segurosAno, total: base + tsu + par.segurosAno, horas: par.horasAno };
}
/** O custo/hora médio dos perfis com salário: o que se usa quando um perfil não tem custo/hora. */
export function mediaHora(C: Custos): number {
  const v = C.perfis.map((p) => custoHoraPerfil(p, C.par)).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
/** €/h de um equipamento: (compra − residual) ÷ vida útil (a amortização de receitas.ts) + manutenção do ano ÷ horas de uso do ano. */
export function equipHora(e: Equip): number {
  const amort = e.vida > 0 ? amortHora({ n: e.n, compra: Math.max(0, e.compra - e.residual), vida: e.vida, uso: 1 }) : 0;
  return amort + (e.usoAno > 0 ? e.manutAno / e.usoAno : 0);
}
export const totalEstrutura = (C: Custos) => C.estrutura.filter((l) => l.ativo).reduce((a, l) => a + l.mensal, 0);
/** €/h de estrutura: Σ dos custos mensais ativos ÷ horas produtivas da empresa por mês. */
export const taxaEstrutura = (C: Custos) => (C.par.horasMes > 0 ? totalEstrutura(C) / C.par.horasMes : 0);

/* ------------------------------------------------------------------ receitas */
const linhasDe = (sid: SvcId): LinhaCat[] => {
  const s = new Set<LinhaCat>();
  for (const [l, L] of Object.entries(LINHAS) as [LinhaCat, (typeof LINHAS)["wc"]][]) if (L.map.some(([x]) => x === sid)) s.add(l);
  for (const l of CATALOGO.find((c) => c.id === sid)?.linhas ?? []) s.add(l);
  return [...s];
};
export const LINHA_NOME: Record<LinhaCat, string> = { wc: "Casa de banho", coz: "Cozinha" };

/** "há 8 meses" (receitas.ts) → data ISO; sem data, 1 de setembro. */
const dataDe = (txt?: string) => {
  const m = txt && /há (\d+) meses?/.exec(txt);
  return m ? mesesAntes(HOJE, Number(m[1])) : "2026-09-01";
};
export function perfilDoServico(C: Custos, nome: string): string {
  const p = C.perfis.find((x) => x.n === nome) ?? C.perfis.find((x) => x.id === PERFIL_DO_OFICIO[nome]);
  return p ? p.id : C.perfis[0]?.id ?? "";
}

/** A receita de um serviço: a mexida, ou a que se deriva de receitas.ts (completa) ou do Catálogo (só as horas). */
export function receitaDe(C: Custos, sid: SvcId, s?: Servico | null, alvo = 35): ReceitaV2 | null {
  if (C.receitas[sid]) return C.receitas[sid];
  const cat = CATALOGO.find((c) => c.id === sid);
  if (!s && !cat) return null;
  const R = RECEITAS[sid];
  const perfil = perfilDoServico(C, s?.perfil ?? cat!.cat);
  const mo: PassoMO[] = s
    ? [{ id: "p1", n: "Execução", perfil, h: s.h }]
    : [
      ...(cat!.hu ? [{ id: "p1", n: "Execução", perfil, h: cat!.hu }] : []),
      ...(cat!.hf ? [{ id: "p2", n: `Preparação (${String(cat!.hf).replace(".", ",")} h fixas a dividir por ${String(cat!.qm).replace(".", ",")} ${cat!.un})`, perfil, h: r2(cat!.hf / Math.max(1, cat!.qm)) }] : []),
    ];
  const equip: UsoEquip[] = R ? R.equip.map((e, i) => ({ id: "e" + i, equip: idEquip(e.n), h: e.uso })) : [];
  const cons: UsoCons[] = R ? R.cons.map((c, i) => ({ id: "c" + i, n: c.n, q: c.q, un: c.un, preco: c.preco, fornecedor: c.fornecedor, data: dataDe(c.data) })) : [];
  return {
    sid, origem: R ? "catalogo" : "estimada", mo, equip, cons,
    modo: s ? "tabela" : "margem", precoTabela: s?.preco ?? 0, margem: alvo,
    hist: s ? [{ data: "2026-01-15", preco: s.preco, nota: "Tabela de 2026" }] : [],
  };
}

export interface CustoCalc {
  h: number; mo: number; eq: number; cons: number; estr: number; total: number;
  /** €/h médio da mão de obra (mo ÷ h). */
  eh: number;
  /** Perfis da receita sem custo/hora (usaram a média). */
  semCustoHora: string[];
  /** O custo dos consumíveis opcionais por unidade (14/10): fora de `cons` e do total, salvo com `opcionais`. */
  consOpc: number;
}
/** O custo por unidade de uma receita. Os consumíveis opcionais só entram com `o.opcionais` (por omissão ficam em `consOpc`). */
export function custoReceita(rec: ReceitaV2, C: Custos, estrutura: boolean, o: { opcionais?: boolean } = {}): CustoCalc {
  const media = mediaHora(C), semCustoHora: string[] = [];
  let h = 0, mo = 0;
  for (const p of rec.mo) {
    const pf = C.perfis.find((x) => x.id === p.perfil);
    const eh = pf ? custoHoraPerfil(pf, C.par) : null;
    if (eh == null && pf && !semCustoHora.includes(pf.n)) semCustoHora.push(pf.n);
    h += p.h; mo += p.h * (eh ?? media);
  }
  const eq = rec.equip.reduce((a, u) => { const e = C.equip.find((x) => x.id === u.equip); return a + (e ? equipHora(e) * u.h : 0); }, 0);
  const un = (c: UsoCons) => consUn({ n: c.n, q: c.q, un: c.un, preco: c.preco, fornecedor: c.fornecedor });
  const consOpc = rec.cons.filter((c) => c.opcional).reduce((a, c) => a + un(c), 0);
  const cons = rec.cons.filter((c) => !c.opcional || o.opcionais).reduce((a, c) => a + un(c), 0);
  const estr = estrutura ? h * taxaEstrutura(C) : 0;
  return { h, mo, eq, cons, estr, total: mo + eq + cons + estr, eh: h > 0 ? mo / h : 0, semCustoHora, consOpc };
}
export const precoReceita = (rec: ReceitaV2, custo: number) =>
  rec.modo === "tabela" ? rec.precoTabela : rec.margem < 100 ? custo / (1 - rec.margem / 100) : 0;
/** Margem sobre o preço. */
export const margemSobrePreco = (preco: number, custo: number) => (preco > 0 ? (preco - custo) / preco : 0);

/** A margem mínima de um serviço: a mais alta das linhas onde entra (cada linha tem a sua, ou a geral). */
export function minimoServico(C: Custos, sid: SvcId, minGeral: number): number {
  const ls = linhasDe(sid);
  return ls.length ? Math.max(...ls.map((l) => C.minLinha[l] ?? minGeral)) : minGeral;
}
export const minimoLinha = (C: Custos, l: LinhaCat, minGeral: number) => C.minLinha[l] ?? minGeral;

/* ------------------------------------------------------------------ alertas */
export type IdAlerta = "sem-receita" | "sem-custo-hora" | "desatualizado" | "abaixo-custo" | "abaixo-minimo" | "justificacao";
export interface AlertaCat { id: IdAlerta; k: "x" | "w"; t: string; d: string }

/** Os consumíveis com o preço mais velho do que N meses. */
export const consumiveisDesatualizados = (rec: ReceitaV2, n: number, hoje = HOJE) => rec.cons.filter((c) => mesesEntre(c.data, hoje) >= n);

/** Os alertas de um serviço do Catálogo (funções puras; o `alertas()` do motor não muda). */
export function alertasServico(o: {
  rec: ReceitaV2; c: CustoCalc; preco: number; un: string; min: number; alvo: number; mesesDesatualizado: number; hoje?: string;
}): AlertaCat[] {
  const { rec, c, preco, un, min, alvo } = o, A: AlertaCat[] = [];
  if (rec.origem === "estimada")
    A.push({ id: "sem-receita", k: "w", t: "Linha sem custo", d: "Sem receita no Catálogo: o custo só conta a mão de obra das horas validadas. Faltam equipamentos e consumíveis." });
  if (c.semCustoHora.length)
    A.push({ id: "sem-custo-hora", k: "w", t: "Técnico sem custo/hora", d: `${c.semCustoHora.join(", ")}: sem salário no RH, usa o custo médio dos perfis.` });
  const velhos = consumiveisDesatualizados(rec, o.mesesDesatualizado, o.hoje);
  if (velhos.length)
    A.push({ id: "desatualizado", k: "w", t: "Preço desatualizado", d: velhos.map((x) => `${x.n}: preço de ${dataPT(x.data)}`).join("; ") + ` (mais de ${o.mesesDesatualizado} meses).` });
  const m = margemSobrePreco(preco, c.total);
  if (preco < c.total) A.push({ id: "abaixo-custo", k: "x", t: "Preço abaixo do custo", d: `${eur(preco)} €/${un} não cobre o custo de ${eur(c.total)} €/${un}.` });
  else if (m < min / 100) A.push({ id: "abaixo-minimo", k: "x", t: "Margem abaixo do mínimo", d: `${pct(m)}, com um mínimo de ${min}% para este serviço.` });
  else if (m < alvo / 100 - 0.0005 && !rec.justificacao)
    A.push({ id: "justificacao", k: "w", t: "Falta a justificação", d: `${pct(m)} fica entre o mínimo (${min}%) e o alvo (${alvo}%): escolha porquê.` });
  return A;
}

/* ------------------------------------------------------------------ a lista única */
export interface ItemLista {
  sid: SvcId;
  n: string;
  oficio: string;
  un: string;
  emUso: boolean;
  /** Orçamentos da Mudelar (catalogo.ts) + orçamentos deste protótipo com o serviço. */
  usos: number;
  rec: ReceitaV2;
  c: CustoCalc;
  preco: number;
  m: number;
  min: number;
  linhas: LinhaCat[];
  alertas: AlertaCat[];
}

export function listaCatalogo(S: Estado, C: Custos, hoje = HOJE): ItemLista[] {
  const ids = [...Object.keys(S.svc), ...CATALOGO.map((c) => c.id).filter((id) => !S.svc[id])];
  const usosProto = (sid: SvcId) => S.deals.filter((d) => d.orc?.linhas.some((l) => l.t === "svc" && l.sid === sid)).length;
  const out: ItemLista[] = [];
  for (const sid of ids) {
    const s = S.svc[sid] ?? null, cat: ItemCatalogo | undefined = CATALOGO.find((x) => x.id === sid);
    const rec = receitaDe(C, sid, s, S.cfg.alvo);
    if (!rec) continue;
    const c = custoReceita(rec, C, S.cfg.estrutura), preco = precoReceita(rec, c.total), min = minimoServico(C, sid, S.cfg.min);
    out.push({
      sid, n: s?.n ?? cat!.n, oficio: cat?.cat ?? s!.perfil, un: s?.un ?? cat!.un, emUso: !!s,
      usos: (cat?.usos ?? 0) + usosProto(sid), rec, c, preco, m: margemSobrePreco(preco, c.total), min, linhas: linhasDe(sid),
      alertas: alertasServico({ rec, c, preco, un: s?.un ?? cat!.un, min, alvo: S.cfg.alvo, mesesDesatualizado: C.par.mesesDesatualizado, hoje }),
    });
  }
  return out;
}

export type Filtro = "uso" | "sem-receita" | "margem" | "desatualizado";
export const FILTROS: { id: Filtro; t: string }[] = [
  { id: "uso", t: "Em uso" }, { id: "sem-receita", t: "Sem receita" }, { id: "margem", t: "Margem abaixo do mínimo" }, { id: "desatualizado", t: "Preço desatualizado" },
];
export function passaFiltro(i: ItemLista, f: Filtro | null): boolean {
  if (!f) return true;
  if (f === "uso") return i.emUso;
  if (f === "sem-receita") return i.alertas.some((a) => a.id === "sem-receita");
  if (f === "margem") return i.alertas.some((a) => a.id === "abaixo-minimo" || a.id === "abaixo-custo");
  return i.alertas.some((a) => a.id === "desatualizado");
}
export type Coluna = "n" | "usos" | "custo" | "preco" | "m";
/** Ordena; por omissão (usos) primeiro os em uso e depois os mais pedidos. */
export function ordenar(L: ItemLista[], col: Coluna, asc: boolean): ItemLista[] {
  const v = (i: ItemLista): number | string => col === "n" ? normal(i.n) : col === "custo" ? i.c.total : col === "preco" ? i.preco : col === "m" ? i.m : (i.emUso ? 1e6 : 0) + i.usos;
  return [...L].sort((a, b) => { const x = v(a), y = v(b); const r = x < y ? -1 : x > y ? 1 : 0; return asc ? r : -r; });
}
export function pesquisar(L: ItemLista[], q: string): ItemLista[] {
  const qq = normal(q.trim());
  return qq ? L.filter((i) => normal(i.n).includes(qq) || normal(i.oficio).includes(qq)) : L;
}

/* ------------------------------------------------------------------ passar para o motor */
/** Leva a receita para o serviço em S.svc (horas, €/h, equipamentos, consumíveis, preço), para o orçamento usar o mesmo custo. */
export function aplicarAoServico(S: Estado, C: Custos, sid: SvcId): void {
  const s = S.svc[sid];
  if (!s) return;
  const rec = receitaDe(C, sid, s, S.cfg.alvo)!;
  const c = custoReceita(rec, C, false);
  const velhos = consumiveisDesatualizados(rec, C.par.mesesDesatualizado);
  s.h = r2(c.h); s.eh = r2(c.eh); s.eq = r2(c.eq); s.cons = r2(c.cons);
  s.preco = r2(precoReceita(rec, custoReceita(rec, C, S.cfg.estrutura).total));
  s.semCusto = c.semCustoHora.length > 0;
  s.stale = velhos.length ? `${velhos.map((x) => x.n).join(", ")}: preço de ${dataPT(velhos[0].data)}.` : null;
}
/** Leva todas as receitas mexidas (e as que dependem de um perfil ou equipamento mexido) para S.svc. */
export function aplicarTodos(S: Estado, C: Custos): void {
  for (const sid of Object.keys(S.svc)) aplicarAoServico(S, C, sid);
}

/* ------------------------------------------------------------------ alertas do orçamento (V2) */
/**
 * Os alertas do orçamento na V2: os do motor, mais os que faltavam (todas puras; `alertas()` não muda).
 * - "Linha sem custo": serviço sem receita (em vez dos 25 €/h inventados por garantirServico);
 * - "Preço desatualizado" pela data do preço (N meses), no lugar da frase fixa do motor;
 * - margem mínima por linha de serviço (WC, Cozinha);
 * - entre o mínimo e o alvo, a justificação é obrigatória.
 */
export function alertasOrcamentoV2(d: Negocio, S: Estado, C: Custos, o: { justificacao?: string; hoje?: string } = {}): Alerta[] {
  const A = alertas(d, S).filter((a) => a.t !== "Preço desatualizado");
  const hoje = o.hoje ?? HOJE, min = minimoLinha(C, d.linha, S.cfg.min), vistas = new Set<string>();
  d.orc!.linhas.forEach((l, i) => {
    if (l.t !== "svc" || vistas.has(l.sid)) return;
    vistas.add(l.sid);
    const s = S.svc[l.sid], rec = receitaDe(C, l.sid, s, S.cfg.alvo);
    if (!rec || rec.origem === "estimada") A.push({ k: "w", t: `Linha sem custo em ${s.n}`, d: "Serviço sem receita no Catálogo: o custo é desconhecido (só a mão de obra). Complete a receita.", go: "catalogo", key: "sr" + l.sid });
    const velhos = rec ? consumiveisDesatualizados(rec, C.par.mesesDesatualizado, hoje) : [];
    if (velhos.length) A.push({ k: "w", t: "Preço desatualizado", d: `${s.n}: ${velhos.map((x) => `${x.n} com preço de ${dataPT(x.data)}`).join("; ")}.`, key: "dt" + l.sid });
    const m = margemSobrePreco(l.pu, l.cu);
    if (l.pu >= l.cu && m >= S.cfg.min / 100 && m < min / 100)
      A.push({ k: "x", fix: true, t: `Margem abaixo do mínimo de ${LINHA_NOME[d.linha]} em ${s.n}`, d: `${pct(m)} nesta linha; ${LINHA_NOME[d.linha]} tem um mínimo de ${min}%.`, i, sug: r2(l.cu / (1 - S.cfg.alvo / 100)), aprov: true });
  });
  const T = d.orc!.linhas.reduce((a, l) => {
    const p = l.t === "svc" ? l.pu * l.q : l.preco, c = l.t === "svc" ? l.cu * l.q : l.custo;
    return { p: a.p + p, c: a.c + c };
  }, { p: 0, c: 0 });
  const pf = T.p * (1 - (d.orc!.desconto || 0) / 100), mt = margemSobrePreco(pf, T.c);
  if (mt >= min / 100 && mt < S.cfg.alvo / 100 - 0.0005 && !o.justificacao)
    A.push({ k: "w", t: "Falta a justificação da margem", d: `${pct(mt)} fica entre o mínimo (${min}%) e o alvo (${S.cfg.alvo}%). Escolha a razão antes de enviar.`, key: "just" });
  return A;
}
