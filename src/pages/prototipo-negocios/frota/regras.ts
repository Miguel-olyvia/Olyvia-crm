// As regras da Frota, puras (os "derivados" do protótipo HTML): revisão por km ou data, vencimentos, alertas, carta de condução, quem tinha a viatura
// num dia (cobre/atribEm, com a devolução), prazo da multa (15 dias úteis), custo por km, consumo e utilização, e o que bloqueia a viatura na agenda.
import { HOJE, INICIO_PERIODO, addDias, addMeses, d2n, dias, diasUteis, fData, fKm, soma } from "./base";
import type { Atribuicao, ChaveVenc, Compromisso, Custo, Frota, LinhaCarrinha, Manutencao, Ocorrencia, Pessoa, Tom, Viatura } from "./tipos";

export const VENC: Record<ChaveVenc, string> = { seguro: "Seguro", ipo: "Inspeção (IPO)", iuc: "IUC" };
export const ESTADOS: Record<Viatura["estado"], [Tom, string]> = { ativa: ["ok", "Ativa"], oficina: ["warn", "Em oficina"], parada: ["neu", "Parada"], inativa: ["neu", "Inativa"], vendida: ["neu", "Vendida"] };

export const viatura = (F: Frota, id: string): Viatura | undefined => F.viaturas.find((v) => v.id === id);
export const pessoa = (F: Frota, id: string | null | undefined): Pessoa | undefined => F.pessoas.find((p) => p.id === id);
export const ativa = (v: Viatura): boolean => v.estado !== "vendida" && v.estado !== "inativa";

/** A atribuição cobre o dia `d`: o fim conta até ao próprio dia, exceto se a viatura já foi devolvida nesse dia. */
export const cobre = (a: Atribuicao, d: string): boolean => a.ini <= d && (!a.fim || a.fim > d || (a.fim === d && !a.devolvida));
export const atribEm = (F: Frota, vid: string, data = HOJE): Atribuicao | undefined => F.atrib.find((a) => a.vid === vid && cobre(a, data));
export const condutor = (F: Frota, vid: string, data = HOJE): Pessoa | undefined => { const a = atribEm(F, vid, data); return a ? pessoa(F, a.pid) : undefined; };
export const viaturaDe = (F: Frota, pid: string): Viatura | undefined => F.viaturas.find((v) => atribEm(F, v.id)?.pid === pid);

/** O tom de uma data de validade: vencida, a 30 dias, a 60 dias, ou em dia. Sem data é neutro. */
export function tomData(d: string | null | undefined): Tom {
  if (!d) return "neu";
  const x = dias(d);
  return x < 0 ? "bad" : x <= 30 ? "warn" : x <= 60 ? "info" : "ok";
}
/** O tom para um selo (o "a 60 dias" mostra-se como em dia). */
export const tomSelo = (d: string | null | undefined): Tom => (tomData(d) === "info" ? "ok" : tomData(d));
export function textoData(d: string | null | undefined): string {
  if (!d) return "Não aplicável";
  const x = dias(d);
  return x < 0 ? `Vencido há ${-x} d` : x === 0 ? "Vence hoje" : `Faltam ${x} d`;
}

export interface Vencimento { k: ChaveVenc | "contrato"; tipo: string; data: string | null }
export function vencimentos(v: Viatura): Vencimento[] {
  const l: Vencimento[] = (Object.keys(VENC) as ChaveVenc[]).map((k) => ({ k, tipo: VENC[k], data: v.venc[k] }));
  if (v.fimContrato) l.push({ k: "contrato", tipo: "Fim do " + v.posse.toLowerCase(), data: v.fimContrato });
  return l;
}
export function proxVenc(v: Viatura): Vencimento | undefined {
  return vencimentos(v).filter((x) => x.data).sort((a, b) => a.data!.localeCompare(b.data!))[0];
}

export interface Revisao { nextKm: number; nextData: string; faltaKm: number; dd: number; tom: Tom; pct: number; txt: string }
/** A revisão por km ou por data, a que chegar primeiro. */
export function revisao(v: Viatura): Revisao {
  const r = v.rev, nextKm = r.ultKm + r.cadaKm, nextData = addMeses(r.ultData, r.cadaMeses), faltaKm = nextKm - v.km, dd = dias(nextData);
  const tom: Tom = faltaKm <= 0 || dd < 0 ? "bad" : faltaKm <= 3000 || dd <= 30 ? "warn" : "ok";
  // a percentagem e o texto seguem o que chega primeiro: os km ou a data
  const pctKm = ((v.km - r.ultKm) / r.cadaKm) * 100;
  const total = d2n(nextData) - d2n(r.ultData), pctData = total > 0 ? ((total - dd) / total) * 100 : 100;
  const pelaData = pctData > pctKm;
  const pct = Math.max(0, Math.min(100, Math.max(pctKm, pctData)));
  const txt = faltaKm <= 0 ? `Passou ${fKm(-faltaKm)}` : dd < 0 ? `Data passou há ${-dd} d` : pelaData ? `Faltam ${dd} d (até ${fData(nextData)})` : `Faltam ${fKm(faltaKm)}`;
  return { nextKm, nextData, faltaKm, dd, tom, pct, txt };
}

export const abaixoMin = (st: readonly LinhaCarrinha[]): LinhaCarrinha[] => st.filter((s) => s.qty < s.min);

export interface Alerta { tom: Tom; txt: string }
/** Os alertas de uma viatura ativa: vencimentos a 30 dias ou vencidos, revisão, carta do condutor a 60 dias e stock da carrinha abaixo do mínimo. */
export function alertas(F: Frota, v: Viatura, stock: readonly LinhaCarrinha[] = []): Alerta[] {
  if (!ativa(v)) return [];
  const a: Alerta[] = [];
  for (const x of vencimentos(v)) { const t = tomData(x.data); if (t === "bad" || t === "warn") a.push({ tom: t, txt: `${x.tipo}: ${textoData(x.data).toLowerCase()}` }); }
  const r = revisao(v);
  if (r.tom !== "ok") a.push({ tom: r.tom, txt: `Revisão: ${r.txt.toLowerCase()}` });
  const c = condutor(F, v.id);
  if (c?.cartaVal && dias(c.cartaVal) <= 60) a.push({ tom: dias(c.cartaVal) < 0 ? "bad" : "warn", txt: `Carta de ${c.nome}: ${textoData(c.cartaVal).toLowerCase()}` });
  const baixo = abaixoMin(stock).length;
  if (baixo) a.push({ tom: "warn", txt: `${baixo} artigo(s) da carrinha abaixo do mínimo` });
  return a;
}

/** Os km feitos no período (desde a leitura mais antiga). */
export function kmPeriodo(F: Frota, vid: string): number {
  const l = F.leituras.filter((x) => x.vid === vid);
  const v = viatura(F, vid);
  return !l.length || !v ? 0 : v.km - Math.min(...l.map((x) => x.km));
}
export const custosV = (F: Frota, vid: string): Custo[] => F.custos.filter((c) => c.vid === vid);
export const custoTotal = (F: Frota, vid: string): number => soma(custosV(F, vid), (c) => c.valor);
export function custoKm(F: Frota, vid: string): number | null { const k = kmPeriodo(F, vid); return k > 0 ? custoTotal(F, vid) / k : null; }
/** Litros (ou kWh) por 100 km no período. */
export function consumo(F: Frota, vid: string): number | null {
  const k = kmPeriodo(F, vid), q = soma(custosV(F, vid).filter((c) => c.qtd), (c) => c.qtd);
  return k > 0 && q ? (q / k) * 100 : null;
}
/** O custo por km médio da frota (as viaturas ativas, ponderado pelos km). */
export function custoKmMedio(F: Frota): number | null {
  const at = F.viaturas.filter(ativa);
  const km = soma(at, (v) => kmPeriodo(F, v.id));
  return km > 0 ? soma(at, (v) => custoTotal(F, v.id)) / km : null;
}
/** A percentagem de dias do período em que a viatura esteve atribuída. */
export function utilizacao(F: Frota, v: Viatura, ini = INICIO_PERIODO, fim = HOJE): number {
  const n = d2n(fim) - d2n(ini) + 1;
  let k = 0;
  for (let i = 0; i < n; i++) if (atribEm(F, v.id, addDias(ini, i))) k++;
  return (k / n) * 100;
}

export const multasPend = (F: Frota): Ocorrencia[] => F.ocorr.filter((o) => o.tipo === "Multa" && o.estado === "por identificar");
/** O prazo para identificar o condutor de uma multa: 15 dias úteis desde a notificação. */
export const prazoMulta = (o: Ocorrencia): string => diasUteis(o.notificada ?? HOJE, 15);
/** Quem tinha a viatura no dia da infração (a sugestão para identificar o condutor). */
export function quemConduzia(F: Frota, vid: string, quando: string): Pessoa | undefined {
  const a = atribEm(F, vid, quando.slice(0, 10));
  return a ? pessoa(F, a.pid) : undefined;
}

/** A carta de condução serve para a viatura na data? Devolve o porquê quando não serve. */
export function cartaOk(p: Pessoa, v: Viatura, data = HOJE): string | null {
  if (!p.carta.length) return `${p.nome} não tem carta de condução registada no RH.`;
  if (p.cartaVal && p.cartaVal < data) return `A carta de ${p.nome} caducou a ${fData(p.cartaVal)}.`;
  if (!p.carta.includes(v.cat)) return `${p.nome} não tem a categoria ${v.cat}.`;
  return null;
}

/* ------------------------------------------------------------------ agenda: o que bloqueia a viatura */

export type TipoBloqueio = "permanente" | "pontual" | "oficina" | "manutencao";
export interface Bloqueio { tipo: TipoBloqueio; txt: string; atrib?: Atribuicao; manut?: Manutencao }
const abrevia = (t: string): string => (/IPO/.test(t) ? "IPO" : /Revis/.test(t) ? "Revisão" : t.split(" ")[0]);
/**
 * O que ocupa a viatura num dia, por esta ordem: oficina (estado "Em oficina", de hoje em diante), uma manutenção agendada ou em curso nesse dia,
 * e a atribuição (permanente ou pontual). As pontuais e as manutenções bloqueiam a viatura para outros serviços na agenda.
 */
export function bloqueios(F: Frota, vid: string, d: string): Bloqueio[] {
  const v = viatura(F, vid);
  if (!v) return [];
  const l: Bloqueio[] = [];
  if (v.estado === "oficina" && d >= HOJE) l.push({ tipo: "oficina", txt: "Oficina" });
  for (const m of F.manut) if (m.vid === vid && m.estado !== "concluída" && (m.data === d || (m.estado === "em curso" && m.data <= d && (m.prev ?? m.data) >= d)) && !(v.estado === "oficina" && m.estado === "em curso"))
    l.push({ tipo: "manutencao", txt: abrevia(m.tipo), manut: m });
  const a = atribEm(F, vid, d);
  if (a) l.push({ tipo: a.tipo, txt: pessoa(F, a.pid)?.nome ?? "", atrib: a });
  return l;
}
/** A viatura não está livre para uma reserva nova nesse dia (reserva pontual, manutenção ou oficina). As permanentes contam à parte, nas sobreposições. */
export const ocupada = (F: Frota, vid: string, d: string): boolean => bloqueios(F, vid, d).some((b) => b.tipo !== "permanente");

/** Os compromissos da viatura: os da agenda (tarefas de obra, visitas) e as manutenções por fazer, por data e hora. */
export function compromissos(F: Frota, vid: string): Compromisso[] {
  const ag = F.agenda.filter((x) => x.vid === vid);
  const ma: Compromisso[] = F.manut.filter((m) => m.vid === vid && m.estado !== "concluída")
    .map((m) => ({ vid, data: m.data, hora: "—", ref: abrevia(m.tipo), desc: `${m.tipo} · ${m.oficina}`, pid: atribEm(F, vid, m.data)?.pid ?? "" }));
  return [...ag, ...ma].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
}

/** As viaturas que foram ou vão a uma obra do protótipo: as reservas para a obra e as tarefas do plano na agenda. */
export interface ViaturaNaObra { v: Viatura; quem: string; oQue: string[]; datas: string[] }
export function viaturasDaObra(F: Frota, obra: number): ViaturaNaObra[] {
  const mapa = new Map<string, ViaturaNaObra>();
  const juntar = (vid: string, pid: string, oQue: string, datas: string[]): void => {
    const v = viatura(F, vid);
    if (!v) return;
    const x = mapa.get(vid) ?? { v, quem: pessoa(F, pid)?.nome ?? "", oQue: [], datas: [] };
    if (oQue && !x.oQue.includes(oQue)) x.oQue.push(oQue);
    for (const d of datas) if (!x.datas.includes(d)) x.datas.push(d);
    mapa.set(vid, x);
  };
  for (const a of F.atrib) if (a.obra === obra) juntar(a.vid, a.pid, (a.nota ?? "").replace(/^Obra #\d+ · /, ""), [a.ini, ...(a.fim && a.fim !== a.ini ? [a.fim] : [])]);
  for (const c of F.agenda) if (c.obra === obra) juntar(c.vid, c.pid, c.tarefa ?? "", [c.data]);
  return [...mapa.values()].map((x) => ({ ...x, datas: x.datas.sort() })).sort((a, b) => (a.datas[0] ?? "").localeCompare(b.datas[0] ?? ""));
}

/** O custo por km a usar na deslocação: o real da viatura (ou a média da frota) e, sem dados, os 0,40 €/km de sempre. */
export const KM_FIXO = 0.4;
export function custoKmDeslocacao(F: Frota, vid?: string): number {
  const k = vid ? custoKm(F, vid) : null;
  return k ?? custoKmMedio(F) ?? KM_FIXO;
}
