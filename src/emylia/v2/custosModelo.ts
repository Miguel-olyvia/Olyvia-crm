// Catálogo e custos da V2 (13/10/2026): o modelo, sem React.
// Funções puras: custo/hora dos perfis, €/h dos equipamentos, taxa de estrutura,
// custo e preço de uma receita, a lista única do Catálogo e os alertas.
// Os números são de EXEMPLO e batem certo com motor.ts e receitas.ts no arranque:
// um técnico de 1.900 € dá 25,00 €/h, a estrutura dá 5,06 €/h e os equipamentos
// têm a mesma amortização (preço ÷ vida útil) de receitas.ts.

// 22/10/2026 (fonte única do €/h): o €/h de cada perfil é a MÉDIA do custo/hora dos técnicos com esse perfil na ficha do RH
// (equipa/tecnicos.ts: perfilId, custoHora). Um perfil sem técnicos usa o €/h do salário do perfil (com o aviso "sem técnicos no RH");
// sem técnicos e sem salário, não há €/h: a mão de obra conta 0 € e o aviso bloqueia (nunca a média dos outros ofícios).
// Os custos vivem no Estado (S.custos, parte "global" da sincronização): garantirCustos migra os estados de antes.

import { CATALOGO, CATALOGO_TODO, itemCatalogo, normal, type ItemCatalogo, type LinhaCat } from "../catalogo";
import { LINHAS, alertas, eur, pct, r2, type Alerta, type Estado, type MedKey, type Negocio, type Servico, type SvcId } from "../motor";
import { RECEITAS, amortHora, consUn } from "../receitas";
import { EQUIP_MUDELAR, PERFIL_DO_OFICIO_MUDELAR, PERFIS_MUDELAR, receitaMudelar } from "../dados/catalogoMudelar";
import { TECNICOS, tecnicosDoPerfil, type FichaTecnico } from "../equipa/tecnicos";

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
  // sem salário no perfil: o €/h vem só dos técnicos com este perfil no RH (Sérgio Faria e Hugo Neves, 17,80 €/h)
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
  // os ofícios novos do catálogo da Mudelar (14/10)
  ...PERFIL_DO_OFICIO_MUDELAR,
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
    // + os perfis e os equipamentos do catálogo da Mudelar (14/10): a média dos salários novos é a de antes,
    // por isso o custo/hora médio (o do ladrilhador, sem salário) não muda
    perfis: [...PERFIS0, ...PERFIS_MUDELAR].map((p) => ({ ...p })),
    equip: [...equip0(), ...EQUIP_MUDELAR.map((e) => ({ ...e }))],
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
/** O custo/hora médio dos perfis com salário. 22/10: já não entra no custo de nenhum serviço (um perfil sem €/h não usa a média dos outros). */
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
/** €/h de estrutura: Σ dos custos mensais ativos ÷ horas produtivas da empresa por mês. 22/10: é a única taxa (o orçamento, a obra e os ecrãs usam-na). */
export const taxaEstrutura = (C: Custos) => (C.par.horasMes > 0 ? totalEstrutura(C) / C.par.horasMes : 0);

/* ------------------------------------------------------------------ o €/h de cada perfil (22/10) */
/** De onde vem o €/h de um perfil: a média dos técnicos do RH, o salário do perfil (sem técnicos), ou nenhum. */
export type FonteHora = "rh" | "salario" | "sem";
export interface HoraPerfil {
  perfil: string; n: string;
  /** €/h (null: sem técnicos e sem salário). */
  eh: number | null;
  fonte: FonteHora;
  /** Os técnicos com este perfil no RH e o custo/hora de cada um. */
  tecnicos: { id: string; n: string; custoHora: number }[];
  /** O €/h que o salário do perfil daria (null sem salário). */
  salario: number | null;
  /** 22/10: os técnicos do perfil sem dados de custo no RH (ficam fora da média). */
  semCustoRh: string[];
}
/** O €/h de um perfil: a média do custo/hora dos técnicos com esse perfil (`tecs`, por omissão o registo vivo, S.tecnicos);
 *  sem técnicos, o €/h do salário do perfil; sem nenhum dos dois, null (nunca a média dos outros perfis). */
export function horaPerfil(C: Custos, perfilId: string, tecs: readonly FichaTecnico[] = TECNICOS): HoraPerfil {
  const p = C.perfis.find((x) => x.id === perfilId);
  // 22/10: o custo/hora de cada técnico é o calculado nos Custos do RH (equipa/pontes.ts: custosDoRh); sem dados de custo no RH, fica de fora
  const doPerfil = tecnicosDoPerfil(perfilId, tecs);
  const tecnicos = doPerfil.filter((t) => !t.semCustoRh && t.custoHora > 0).map((t) => ({ id: t.id, n: t.n, custoHora: t.custoHora }));
  const semCustoRh = doPerfil.filter((t) => t.semCustoRh).map((t) => t.n);
  const salario = p ? custoHoraPerfil(p, C.par) : null;
  const base = { perfil: perfilId, n: p?.n ?? (perfilId || "Sem perfil"), tecnicos, salario, semCustoRh };
  if (tecnicos.length) return { ...base, eh: tecnicos.reduce((a, t) => a + t.custoHora, 0) / tecnicos.length, fonte: "rh" };
  if (salario != null) return { ...base, eh: salario, fonte: "salario" };
  return { ...base, eh: null, fonte: "sem" };
}
/** A origem do €/h, para mostrar: "Média de 2 técnicos no RH (Sérgio Faria, Hugo Neves)". */
export function origemHora(h: HoraPerfil): string {
  if (h.fonte === "rh") {
    const nomes = h.tecnicos.map((t) => t.n).join(", ");
    return h.tecnicos.length === 1 ? `Custo/hora de ${nomes} no RH` : `Média de ${h.tecnicos.length} técnicos no RH (${nomes})`;
  }
  if (h.fonte === "salario") return h.semCustoRh.length ? `Sem custo no RH (${h.semCustoRh.join(", ")}): usa o salário do perfil` : "Sem técnicos no RH: usa o salário do perfil";
  return "Sem técnicos no RH nem salário no perfil: sem custo/hora";
}

/* ------------------------------------------------------------------ os custos no Estado (22/10) */
/** Os custos do Estado (os de arranque, se ainda não os tem). */
export function custosDe(S: { custos?: Custos }): Custos {
  if (!S.custos) S.custos = custos0();
  return S.custos;
}
/** Garante os custos no Estado: um estado de antes de 22/10 fica com os de arranque; os perfis e os equipamentos novos juntam-se.
 *  Devolve se mudou alguma coisa (para o voltar a partilhar). */
export function garantirCustos(S: { custos?: Custos }): boolean {
  const C = S.custos;
  if (!C || !C.par || !Array.isArray(C.perfis) || !Array.isArray(C.equip) || !Array.isArray(C.estrutura)) { S.custos = custos0(); return true; }
  const c0 = custos0();
  let mudou = false;
  for (const p of c0.perfis) if (!C.perfis.some((x) => x.id === p.id)) { C.perfis.push(p); mudou = true; }
  for (const e of c0.equip) if (!C.equip.some((x) => x.id === e.id)) { C.equip.push(e); mudou = true; }
  if (!C.receitas) { C.receitas = {}; mudou = true; }
  if (!C.minLinha) { C.minLinha = {}; mudou = true; }
  return mudou;
}
/** O €/h de estrutura do Estado (a taxa dos custos dele). */
export const taxaEstruturaDe = (S: { custos?: Custos }) => taxaEstrutura(custosDe(S));

/* ------------------------------------------------------------------ receitas */
const linhasDe = (sid: SvcId): LinhaCat[] => {
  const s = new Set<LinhaCat>();
  for (const [l, L] of Object.entries(LINHAS) as [LinhaCat, (typeof LINHAS)["wc"]][]) if (L.map.some(([x]) => x === sid)) s.add(l);
  for (const l of itemCatalogo(sid)?.linhas ?? []) s.add(l);
  return [...s];
};
export const LINHA_NOME: Record<LinhaCat, string> = { wc: "Casa de banho", coz: "Cozinha", geral: "Remodelação geral" };

/** "há 8 meses" (receitas.ts) → data ISO; sem data, 1 de setembro. */
const dataDe = (txt?: string) => {
  const m = txt && /há (\d+) meses?/.exec(txt);
  return m ? mesesAntes(HOJE, Number(m[1])) : "2026-09-01";
};
/** O perfil de um nome (o do perfil, ou o ofício do Catálogo). 22/10: sem perfil, "" (antes ia para o primeiro perfil, o servente). */
export function perfilDoServico(C: Custos, nome: string): string {
  const p = C.perfis.find((x) => x.n === nome) ?? C.perfis.find((x) => x.id === PERFIL_DO_OFICIO[nome]);
  return p ? p.id : "";
}
/** O perfil de um serviço em uso: o id guardado (Servico.perfilId) e, nos de antes, pelo nome. */
export const perfilIdDe = (C: Custos, s: Pick<Servico, "perfil"> & { perfilId?: string }): string => s.perfilId || perfilDoServico(C, s.perfil);
/** O perfil principal de uma receita: o de mais horas ("" sem passos). */
export function perfilPrincipal(rec: Pick<ReceitaV2, "mo">): string {
  const h = new Map<string, number>();
  for (const p of rec.mo) h.set(p.perfil, (h.get(p.perfil) ?? 0) + p.h);
  let melhor = "", max = -1;
  for (const [k, v] of h) if (v > max) { melhor = k; max = v; }
  return melhor;
}

/** A receita de um serviço: a mexida, ou a que se deriva de receitas.ts (completa) ou do Catálogo (só as horas). */
export function receitaDe(C: Custos, sid: SvcId, s?: Servico | null, alvo = 35): ReceitaV2 | null {
  if (C.receitas[sid]) return C.receitas[sid];
  // os serviços novos do catálogo da Mudelar (14/10) trazem a receita completa e o PVP real como preço de tabela
  const mu = receitaMudelar(sid);
  if (mu) {
    return {
      sid, origem: "catalogo", mo: structuredClone(mu.mo), equip: structuredClone(mu.equip), cons: structuredClone(mu.cons),
      modo: "tabela", precoTabela: s?.preco ?? mu.pvp, margem: alvo, medida: mu.medida,
      hist: [{ data: "2026-01-15", preco: mu.pvp, nota: "Tabela da Mudelar de 2026" }],
    };
  }
  const cat = itemCatalogo(sid);
  if (!s && !cat) return null;
  const R = RECEITAS[sid];
  const perfil = s ? perfilIdDe(C, s) : perfilDoServico(C, cat!.cat);
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

/** A mão de obra de uma receita por perfil (ofício): as horas por unidade, o €/h e de onde vem. */
export interface OficioCusto { perfil: string; n: string; h: number; eh: number | null; fonte: FonteHora; tecnicos: string[] }
export interface CustoCalc {
  h: number; mo: number; eq: number; cons: number; estr: number; total: number;
  /** €/h médio da mão de obra (mo ÷ h). */
  eh: number;
  /** 22/10: perfis da receita sem €/h nenhum (sem técnicos no RH e sem salário): a mão de obra deles conta 0 €. */
  semCustoHora: string[];
  /** 22/10: perfis sem técnicos no RH (usam o €/h do salário do perfil). */
  semTecnicos: string[];
  /** 22/10: a mão de obra por perfil (o detalhe "horas × €/h" de cada ofício). */
  oficios: OficioCusto[];
  /** O €/h de estrutura usado (0 sem estrutura). */
  taxaEstr: number;
  /** O custo dos consumíveis opcionais por unidade (14/10): fora de `cons` e do total, salvo com `opcionais`. */
  consOpc: number;
}
/** O custo por unidade de uma receita. Os consumíveis opcionais só entram com `o.opcionais` (por omissão ficam em `consOpc`).
 *  22/10: o €/h de cada passo é o do perfil (horaPerfil: a média dos técnicos do RH). `o.tecnicos` substitui o registo vivo (testes). */
export function custoReceita(rec: ReceitaV2, C: Custos, estrutura: boolean, o: { opcionais?: boolean; tecnicos?: readonly FichaTecnico[] } = {}): CustoCalc {
  const semCustoHora: string[] = [], semTecnicos: string[] = [], oficios: OficioCusto[] = [];
  let h = 0, mo = 0;
  for (const p of rec.mo) {
    let of = oficios.find((x) => x.perfil === p.perfil);
    if (!of) {
      const hp = horaPerfil(C, p.perfil, o.tecnicos);
      of = { perfil: p.perfil, n: hp.n, h: 0, eh: hp.eh, fonte: hp.fonte, tecnicos: hp.tecnicos.map((t) => t.n) };
      oficios.push(of);
      if (hp.fonte === "sem") semCustoHora.push(hp.n);
      if (hp.fonte === "salario") semTecnicos.push(hp.n);
    }
    of.h += p.h;
    h += p.h; mo += p.h * (of.eh ?? 0);
  }
  const eq = rec.equip.reduce((a, u) => { const e = C.equip.find((x) => x.id === u.equip); return a + (e ? equipHora(e) * u.h : 0); }, 0);
  const un = (c: UsoCons) => consUn({ n: c.n, q: c.q, un: c.un, preco: c.preco, fornecedor: c.fornecedor });
  const consOpc = rec.cons.filter((c) => c.opcional).reduce((a, c) => a + un(c), 0);
  const cons = rec.cons.filter((c) => !c.opcional || o.opcionais).reduce((a, c) => a + un(c), 0);
  const taxaEstr = estrutura ? taxaEstrutura(C) : 0, estr = h * taxaEstr;
  return { h, mo, eq, cons, estr, total: mo + eq + cons + estr, eh: h > 0 ? mo / h : 0, semCustoHora, semTecnicos, oficios, taxaEstr, consOpc };
}
/** 22/10: uma subempreitada sem custo: a receita não tem passos nem equipamento e os consumíveis valem 0 € (as 12 da Mudelar têm só o
 *  "Preço do subempreiteiro (pedido por obra)" a 0 €): o custo e o preço ficam a 0 €. */
export const subempreitadaSemCusto = (rec: Pick<ReceitaV2, "origem" | "mo" | "equip" | "cons">) =>
  rec.origem !== "estimada" && !rec.mo.length && !rec.equip.length && !rec.cons.some((c) => !c.opcional && c.q * c.preco > 0);
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
export type IdAlerta = "sem-receita" | "sem-custo-hora" | "sem-tecnicos" | "subempreitada" | "desatualizado" | "abaixo-custo" | "abaixo-minimo" | "justificacao";
/** 22/10: os textos dos avisos do €/h (o Catálogo e o orçamento dizem o mesmo). */
export const textoSemCustoHora = (nomes: string[]) =>
  `${nomes.join(", ")}: sem técnicos no RH e sem salário no perfil. A mão de obra destes passos conta 0 €: ligue um técnico a este ofício (RH › ficha da pessoa › Obra) ou ponha o salário do perfil.`;
export const textoSemTecnicos = (nomes: string[]) => `${nomes.join(", ")}: sem técnicos no RH. Usa o €/h do salário do perfil.`;
export const TEXTO_SUBEMPREITADA = "Subempreitada sem custo: o custo e o preço ficam a 0 €. Ponha o preço do subempreiteiro (pedido por obra) na receita do Catálogo antes de o vender.";
/** 26/10: o aviso no orçamento: o custo da subempreitada escreve-se na linha (é um preço por obra). */
export const TEXTO_SUBEMPREITADA_LINHA = "Escreva nesta linha o custo do subempreiteiro, o valor que ele pediu para esta obra. Sem ele, a linha conta 0 € de custo e a margem aparece a 100%.";
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
  if (c.semCustoHora.length) A.push({ id: "sem-custo-hora", k: "x", t: "Ofício sem custo/hora", d: textoSemCustoHora(c.semCustoHora) });
  if (c.semTecnicos.length) A.push({ id: "sem-tecnicos", k: "w", t: "Sem técnicos no RH", d: textoSemTecnicos(c.semTecnicos) });
  const velhos = consumiveisDesatualizados(rec, o.mesesDesatualizado, o.hoje);
  if (velhos.length)
    A.push({ id: "desatualizado", k: "w", t: "Preço desatualizado", d: velhos.map((x) => `${x.n}: preço de ${dataPT(x.data)}`).join("; ") + ` (mais de ${o.mesesDesatualizado} meses).` });
  // 22/10: a subempreitada sem custo não tem margem para avaliar: só o aviso para pôr o custo do subempreiteiro (sem inventar valores)
  if (subempreitadaSemCusto(rec) && !(preco > 0)) { A.push({ id: "subempreitada", k: "w", t: "Subempreitada sem custo", d: TEXTO_SUBEMPREITADA }); return A; }
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

/**
 * A lista única: os serviços em uso e os do Catálogo. Por omissão, o Catálogo de antes (CATALOGO, o que a V2 mostra);
 * com `o.todo`, o Catálogo inteiro da Mudelar (CATALOGO_TODO, 14/10).
 */
export function listaCatalogo(S: Estado, C: Custos, hoje = HOJE, o: { todo?: boolean } = {}): ItemLista[] {
  const ids = [...Object.keys(S.svc), ...(o.todo ? CATALOGO_TODO : CATALOGO).map((c) => c.id).filter((id) => !S.svc[id])];
  const usosProto = (sid: SvcId) => S.deals.filter((d) => d.orc?.linhas.some((l) => l.t === "svc" && l.sid === sid)).length;
  const out: ItemLista[] = [];
  for (const sid of ids) {
    const s = S.svc[sid] ?? null, cat: ItemCatalogo | undefined = itemCatalogo(sid);
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

/** A lista única com o Catálogo inteiro da Mudelar (os 361 serviços; 14/10). */
export const listaCatalogoCompleta = (S: Estado, C: Custos, hoje = HOJE) => listaCatalogo(S, C, hoje, { todo: true });

export type Filtro = "uso" | "sem-receita" | "margem" | "desatualizado";
export const FILTROS: { id: Filtro; t: string }[] = [
  { id: "uso", t: "Em uso" }, { id: "sem-receita", t: "Sem receita" }, { id: "margem", t: "Margem abaixo do mínimo" }, { id: "desatualizado", t: "Preço desatualizado" },
];
export function passaFiltro(i: ItemLista, f: Filtro | null): boolean {
  if (!f) return true;
  if (f === "uso") return i.emUso;
  if (f === "sem-receita") return i.alertas.some((a) => a.id === "sem-receita" || a.id === "subempreitada");
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
  // 22/10: as linhas livres (adendas e imprevistos) não têm receita: só o €/h do perfil escolhido acompanha o RH
  if (sid.startsWith("livre-")) {
    const hp = horaPerfil(C, perfilIdDe(C, s));
    s.perfilId = hp.perfil || undefined; s.eh = r2(hp.eh ?? 0); s.semCusto = hp.fonte === "sem";
    return;
  }
  const rec = receitaDe(C, sid, s, S.cfg.alvo)!;
  const c = custoReceita(rec, C, false);
  const velhos = consumiveisDesatualizados(rec, C.par.mesesDesatualizado);
  s.h = r2(c.h); s.eh = r2(c.eh); s.eq = r2(c.eq); s.cons = r2(c.cons);
  s.preco = r2(precoReceita(rec, custoReceita(rec, C, S.cfg.estrutura).total));
  s.semCusto = c.semCustoHora.length > 0;
  // 22/10: o perfil pelo id (o principal da receita), para o plano da obra escolher o técnico
  const pp = perfilPrincipal(rec);
  if (pp) s.perfilId = pp;
  s.stale = velhos.length ? `${velhos.map((x) => x.n).join(", ")}: preço de ${dataPT(velhos[0].data)}.` : null;
}
/** Leva todas as receitas (com o €/h dos perfis, a média dos técnicos do RH) para S.svc: chama-se no arranque, ao mudar um custo,
 *  um técnico (custo/hora ou perfil) ou um perfil. Os orçamentos já enviados não mudam (guardam o custo na linha). */
export function aplicarTodos(S: Estado, C: Custos): void {
  for (const sid of Object.keys(S.svc)) aplicarAoServico(S, C, sid);
}
/** 22/10: S.svc derivado dos custos do próprio Estado (S.custos). */
export const derivarServicos = (S: Estado) => aplicarTodos(S, custosDe(S));

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
