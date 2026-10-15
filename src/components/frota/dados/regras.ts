// As regras da Frota sobre os dados reais (os "derivados" do protótipo, agora sobre as linhas fleet_*): quem tem a viatura
// num dia, vencimentos, revisão, alertas, carta de condução, custo por km, consumo, utilização e o que bloqueia a
// viatura no calendário. Puras: recebem o retrato `Frota` (lido da BD pelos hooks) e o dia de hoje vem de `F.hoje`.
// As regras que contam são as das RPCs (o servidor recusa); estas servem para mostrar e para avisar antes de gravar.
import type {
  FleetActivityLog, FleetAssignment, FleetCompliance, FleetDriver, FleetExpense, FleetExpenseCategory, FleetExpenseImport, FleetIncident,
  FleetMaintenanceEvent, FleetOdometerReading, FleetOpsLink, FleetRestockRequest, FleetVehicleView,
} from "@/integrations/supabase/fleetTypes";
import { addDias, addMeses, d2n, diaDe, dias, fData, fKm, soma } from "./base";
import { VENC, type Tom } from "./rotulos";

/** Uma linha de stock da carrinha (stocks do armazém da viatura, com o artigo). */
export interface LinhaStock { id: string; product_id: string; warehouse_id: string; ref: string; nome: string; un: string; qty: number; min: number }

/** O retrato da Frota da organização, montado pelos hooks a partir das tabelas e da vista. */
export interface Frota {
  org: string;
  hoje: string;
  viaturas: FleetVehicleView[];
  condutores: FleetDriver[];
  atrib: FleetAssignment[];
  leituras: FleetOdometerReading[];
  manut: FleetMaintenanceEvent[];
  ocorr: FleetIncident[];
  venc: FleetCompliance[];
  custos: FleetExpense[];
  importacoes: FleetExpenseImport[];
  pedidos: FleetRestockRequest[];
  ligacoes: FleetOpsLink[];
  log: FleetActivityLog[];
  stock: LinhaStock[];
}

export const frotaVazia = (org: string, hoje: string): Frota => ({
  org, hoje, viaturas: [], condutores: [], atrib: [], leituras: [], manut: [], ocorr: [], venc: [], custos: [], importacoes: [], pedidos: [],
  ligacoes: [], log: [], stock: [],
});

/** O período dos custos, dos relatórios e do custo por km: os últimos 90 dias (o mesmo de fn_fleet_cost_per_km). */
export const DIAS_PERIODO = 90;
export const inicioPeriodo = (hoje: string): string => addDias(hoje, -DIAS_PERIODO);
/** O custo por km de sempre, sem dados (o mesmo de fn_fleet_cost_per_km e das Operações). */
export const KM_FIXO = 0.4;
/** As categorias que contam para o custo por km (decisão 9/16: só custos variáveis com o uso). */
export const CATEGORIAS_VARIAVEIS: readonly FleetExpenseCategory[] = ["fuel", "charging", "tolls", "parking", "washing", "workshop", "other"];

export const viatura = (F: Frota, id: string | null | undefined): FleetVehicleView | undefined => F.viaturas.find((v) => v.id === id);
export const condutor = (F: Frota, id: string | null | undefined): FleetDriver | undefined => F.condutores.find((p) => p.id === id);
export const ativa = (v: FleetVehicleView): boolean => v.status !== "sold" && v.status !== "inactive";
export const eletrica = (v: FleetVehicleView | undefined): boolean => v?.fuel_type === "electric";

/** A atribuição cobre o dia `d`: o fim conta até ao próprio dia, exceto se a viatura já foi devolvida nesse dia (fn_fleet_assignment_at). */
export const cobre = (a: FleetAssignment, d: string): boolean =>
  !a.cancelled_at && a.starts_on <= d && (!a.ends_on || a.ends_on > d || (a.ends_on === d && !a.returned_on));
export const atribEm = (F: Frota, vid: string, d = F.hoje): FleetAssignment | undefined =>
  F.atrib.filter((a) => a.vehicle_id === vid && cobre(a, d)).sort((x, y) => y.starts_on.localeCompare(x.starts_on))[0];
export const condutorEm = (F: Frota, vid: string, d = F.hoje): FleetDriver | undefined => { const a = atribEm(F, vid, d); return a ? condutor(F, a.driver_id) : undefined; };
/** A viatura que o condutor tem hoje. */
export const viaturaDoCondutor = (F: Frota, did: string): FleetVehicleView | undefined => F.viaturas.find((v) => atribEm(F, v.id)?.driver_id === did);
/** A atribuição está aberta (por devolver ou por começar). */
export const aberta = (a: FleetAssignment, hoje: string): boolean => !a.cancelled_at && !a.returned_on && (!a.ends_on || a.ends_on >= hoje);

/** O tom de uma data de validade: vencida, a 30 dias, a 60 dias, ou em dia. Sem data é neutro. */
export function tomData(d: string | null | undefined, hoje: string): Tom {
  if (!d) return "neu";
  const x = dias(d, hoje);
  return x < 0 ? "bad" : x <= 30 ? "warn" : x <= 60 ? "info" : "ok";
}
export const tomSelo = (d: string | null | undefined, hoje: string): Tom => (tomData(d, hoje) === "info" ? "ok" : tomData(d, hoje));
export function textoData(d: string | null | undefined, hoje: string): string {
  if (!d) return "Sem data";
  const x = dias(d, hoje);
  return x < 0 ? `Vencido há ${-x} d` : x === 0 ? "Vence hoje" : `Faltam ${x} d`;
}

export type ChaveVenc = "insurance" | "inspection" | "road_tax" | "lease_contract";
export interface Vencimento { k: ChaveVenc; tipo: string; data: string | null; isento?: boolean }
/** Os vencimentos da viatura (os atuais, da vista): seguro, IPO, IUC (ou isento) e o fim do contrato, se houver. */
export function vencimentos(v: FleetVehicleView): Vencimento[] {
  const l: Vencimento[] = [
    { k: "insurance", tipo: VENC.insurance, data: v.insurance_until },
    { k: "inspection", tipo: VENC.inspection, data: v.inspection_until },
    { k: "road_tax", tipo: VENC.road_tax, data: v.road_tax_exempt ? null : v.road_tax_until, isento: v.road_tax_exempt },
  ];
  if (v.contract_ends_on) l.push({ k: "lease_contract", tipo: "Fim do contrato", data: v.contract_ends_on });
  return l;
}
export function proxVenc(v: FleetVehicleView): Vencimento | undefined {
  return vencimentos(v).filter((x) => x.data).sort((a, b) => a.data!.localeCompare(b.data!))[0];
}

export interface Revisao { nextKm: number | null; nextData: string | null; faltaKm: number | null; dd: number | null; tom: Tom; pct: number; txt: string }
/** A revisão por km ou por data, a que chegar primeiro (plano da vista). Sem plano: null. */
export function revisao(v: FleetVehicleView, hoje: string): Revisao | null {
  if (!v.service_every_km && !v.service_every_months) return null;
  const nextKm = v.service_next_km, nextData = v.service_next_on;
  const faltaKm = nextKm != null ? nextKm - v.odometer_km : null, dd = nextData ? dias(nextData, hoje) : null;
  const tom: Tom = (faltaKm != null && faltaKm <= 0) || (dd != null && dd < 0) ? "bad" : (faltaKm != null && faltaKm <= 3000) || (dd != null && dd <= 30) ? "warn" : "ok";
  const pctKm = v.service_every_km && v.service_last_km != null ? ((v.odometer_km - v.service_last_km) / v.service_every_km) * 100 : 0;
  const total = nextData && v.service_last_on ? d2n(nextData) - d2n(v.service_last_on) : 0;
  const pctData = total > 0 && dd != null ? ((total - dd) / total) * 100 : 0;
  const pelaData = pctData > pctKm;
  const pct = Math.max(0, Math.min(100, Math.max(pctKm, pctData)));
  const txt = faltaKm != null && faltaKm <= 0 ? `Passou ${fKm(-faltaKm)}`
    : dd != null && dd < 0 ? `Data passou há ${-dd} d`
    : pelaData && dd != null ? `Faltam ${dd} d (até ${fData(nextData)})`
    : faltaKm != null ? `Faltam ${fKm(faltaKm)}` : dd != null ? `Faltam ${dd} d` : "Sem plano";
  return { nextKm, nextData, faltaKm, dd, tom, pct, txt };
}

export const stockDe = (F: Frota, v: FleetVehicleView | undefined): LinhaStock[] =>
  v?.warehouse_id ? F.stock.filter((s) => s.warehouse_id === v.warehouse_id) : [];
export const abaixoMin = (st: readonly LinhaStock[]): LinhaStock[] => st.filter((s) => s.min > 0 && s.qty < s.min);
export const pedidosPendentes = (F: Frota, vid: string): FleetRestockRequest[] => F.pedidos.filter((p) => p.vehicle_id === vid && p.status === "requested");

export interface Alerta { tom: Tom; txt: string }
/** Os alertas de uma viatura ativa: vencimentos a 30 dias ou vencidos, revisão, carta do condutor a 60 dias e stock da carrinha abaixo do mínimo. */
export function alertas(F: Frota, v: FleetVehicleView): Alerta[] {
  if (!ativa(v)) return [];
  const a: Alerta[] = [];
  for (const x of vencimentos(v)) {
    const t = tomData(x.data, F.hoje);
    if (t === "bad" || t === "warn") a.push({ tom: t, txt: `${x.tipo}: ${textoData(x.data, F.hoje).toLowerCase()}` });
  }
  if (!v.insurance_until) a.push({ tom: "bad", txt: "Seguro: sem validade registada" });
  const r = revisao(v, F.hoje);
  if (r && r.tom !== "ok") a.push({ tom: r.tom, txt: `Revisão: ${r.txt.toLowerCase()}` });
  const c = condutorEm(F, v.id);
  if (c?.licence_expires_on && dias(c.licence_expires_on, F.hoje) <= 60)
    a.push({ tom: dias(c.licence_expires_on, F.hoje) < 0 ? "bad" : "warn", txt: `Carta de ${c.full_name}: ${textoData(c.licence_expires_on, F.hoje).toLowerCase()}` });
  const baixo = abaixoMin(stockDe(F, v)).length;
  if (baixo) a.push({ tom: "warn", txt: `${baixo} artigo(s) da carrinha abaixo do mínimo` });
  return a;
}

/** Os km feitos no período: da última leitura antes do período (ou da primeira dentro dele) até aos km atuais. */
export function kmPeriodo(F: Frota, vid: string, desde = inicioPeriodo(F.hoje)): number {
  const v = viatura(F, vid);
  if (!v) return 0;
  const l = F.leituras.filter((x) => x.vehicle_id === vid && !x.is_flagged);
  const antes = l.filter((x) => x.read_on < desde).sort((a, b) => b.read_on.localeCompare(a.read_on) || b.km - a.km)[0];
  const dentro = l.filter((x) => x.read_on >= desde);
  const base = antes?.km ?? (dentro.length ? Math.min(...dentro.map((x) => x.km)) : null);
  return base == null ? 0 : Math.max(0, v.odometer_km - base);
}
export const custosV = (F: Frota, vid: string, desde = inicioPeriodo(F.hoje)): FleetExpense[] =>
  F.custos.filter((c) => c.vehicle_id === vid && c.spent_on >= desde);
export const custoTotal = (F: Frota, vid: string, desde?: string): number => soma(custosV(F, vid, desde), (c) => c.amount);
const custoVariavel = (F: Frota, vid: string): number =>
  soma(custosV(F, vid).filter((c) => !c.needs_review && CATEGORIAS_VARIAVEIS.includes(c.category)), (c) => c.amount);
/** O custo por km da viatura nos últimos 90 dias, só com custos variáveis (o critério de fn_fleet_cost_per_km). */
export function custoKm(F: Frota, vid: string): number | null { const k = kmPeriodo(F, vid); const c = custoVariavel(F, vid); return k > 0 && c > 0 ? c / k : null; }
/** O custo por km médio da frota (as viaturas ativas, ponderado pelos km). */
export function custoKmMedio(F: Frota): number | null {
  const at = F.viaturas.filter(ativa);
  const km = soma(at, (v) => kmPeriodo(F, v.id)), c = soma(at, (v) => custoVariavel(F, v.id));
  return km > 0 && c > 0 ? c / km : null;
}
/** Litros (ou kWh) por 100 km no período. */
export function consumo(F: Frota, vid: string): number | null {
  const k = kmPeriodo(F, vid), q = soma(custosV(F, vid).filter((c) => c.quantity && (c.category === "fuel" || c.category === "charging")), (c) => c.quantity);
  return k > 0 && q ? (q / k) * 100 : null;
}
/** A percentagem de dias do período em que a viatura esteve atribuída. */
export function utilizacao(F: Frota, v: FleetVehicleView, ini = inicioPeriodo(F.hoje), fim = F.hoje): number {
  const n = d2n(fim) - d2n(ini) + 1;
  let k = 0;
  for (let i = 0; i < n; i++) if (atribEm(F, v.id, addDias(ini, i))) k++;
  return n > 0 ? (k / n) * 100 : 0;
}

export const multasPend = (F: Frota): FleetIncident[] => F.ocorr.filter((o) => o.kind === "fine" && o.status === "to_identify");
/** Quem tinha a viatura no dia da ocorrência (a sugestão para identificar o condutor). */
export function quemConduzia(F: Frota, vid: string, quandoIso: string): FleetDriver | undefined {
  return condutorEm(F, vid, diaDe(quandoIso));
}

/** A carta de condução serve para a viatura na data? Devolve o porquê quando não serve (as frases de fn_fleet_licence_problem). */
export function cartaProblema(p: FleetDriver, v: FleetVehicleView, data: string): string | null {
  if (!p.licence_categories?.length) return `${p.full_name} não tem carta de condução registada.`;
  if (p.licence_expires_on && p.licence_expires_on < data) return `A carta de ${p.full_name} caducou a ${fData(p.licence_expires_on)}.`;
  if (!p.licence_categories.includes(v.required_licence)) return `${p.full_name} não tem a categoria ${v.required_licence}.`;
  return null;
}

/* ------------------------------------------------------------------ calendário: o que bloqueia a viatura */

export type TipoBloqueio = "permanent" | "temporary" | "workshop" | "maintenance";
export interface Bloqueio { tipo: TipoBloqueio; txt: string; atrib?: FleetAssignment; manut?: FleetMaintenanceEvent }
const abrevia = (t: string): string => (/IPO|Inspe/.test(t) ? "IPO" : /Revis/.test(t) ? "Revisão" : t.split(" ")[0]);
const manutCobre = (m: FleetMaintenanceEvent, d: string): boolean =>
  (m.status === "scheduled" || m.status === "in_progress") && m.scheduled_on <= d && (m.expected_end_on ?? m.scheduled_on) >= d;
/** O que ocupa a viatura num dia (o mesmo critério de fn_fleet_vehicle_blockers): oficina, manutenção marcada e a atribuição. */
export function bloqueios(F: Frota, vid: string, d: string): Bloqueio[] {
  const v = viatura(F, vid);
  if (!v) return [];
  const l: Bloqueio[] = [];
  if (v.status === "workshop" && d >= F.hoje) l.push({ tipo: "workshop", txt: v.status_reason || "Oficina" });
  for (const m of F.manut) if (m.vehicle_id === vid && manutCobre(m, d)) l.push({ tipo: "maintenance", txt: abrevia(m.title), manut: m });
  const a = atribEm(F, vid, d);
  if (a) l.push({ tipo: a.kind, txt: condutor(F, a.driver_id)?.full_name ?? "", atrib: a });
  return l;
}
/** Pode-se reservar a viatura nesse dia (ativa, livre e sem bloqueios). */
export const podeReservar = (F: Frota, vid: string, d: string): boolean => {
  const v = viatura(F, vid);
  return !!v && v.status === "active" && d >= F.hoje && !bloqueios(F, vid, d).length;
};
/** As manutenções por fazer de uma viatura (agendadas ou em curso). */
export const manutAbertas = (F: Frota, vid?: string): FleetMaintenanceEvent[] =>
  F.manut.filter((m) => (!vid || m.vehicle_id === vid) && (m.status === "scheduled" || m.status === "in_progress"));

/** O próximo prazo legal da IPO (a regra de fn_fleet_next_inspection, só para mostrar a sugestão no formulário). */
export function proximaIpo(categoria: string | null | undefined, primeiraMatricula: string | null | undefined, feitaEm: string): string {
  if (!primeiraMatricula || (categoria !== "light_passenger" && categoria !== "light_goods")) return addMeses(feitaEm, 12);
  let anos = categoria === "light_passenger" ? 4 : 2;
  const limite = addMeses(feitaEm, 3);
  for (;;) {
    const prazo = addMeses(primeiraMatricula, anos * 12);
    if (prazo > limite) return prazo;
    anos += categoria === "light_passenger" && anos < 8 ? 2 : 1;
  }
}
