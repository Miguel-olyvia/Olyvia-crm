/**
 * O GERADOR da assiduidade de exemplo: puro e deterministico (sem `Math.random`; a semente e o id da pessoa).
 *
 * Para cada pessoa e cada dia, de 1 de Agosto de 2026 ate hoje, produz o que foi feito (horas realizadas, que
 * as picagens espelham), as faltas, as horas extra e os movimentos do banco de horas. O PREVISTO vem do mesmo
 * resolvedor que o calendario da pessoa usa (`resolverPrevistoDoDia`), por isso o previsto e o feito nunca se
 * contradizem. Os dias que fogem ao normal estao no guiao (`assiduidadePlano.ts`); todos os outros sao dias
 * certos, com folgas de poucos minutos dentro da tolerancia.
 *
 * Por tipo de horario: padrao e repartido tem horas extra pelo tempo a mais do dia; banco de horas guarda o tempo
 * a mais como credito (e as saidas antecipadas e folgas como debito); livre conta so o total da semana; isencao
 * nao pica nem tem horas extra.
 */
import { periodosDoPrevisto, resolverPrevistoDoDia, type AusenciaDoDiaCal, type ContextoPrevisto, type PrevistoDoDia } from "@/components/rh-exemplo/calendarioPessoa/previsto";
import type { MovimentoBanco } from "@/components/rh-exemplo/fluxosC/bancoHorasRegras";
import {
  LIMITES_OMISSAO, avaliarCandidata, avaliarLimites, tempoAMaisPorTipo,
  type EstadoHoraExtra, type HoraExtra, type OrigemHoraExtra, type TipoHorarioHE,
} from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import { TOLERANCIA_ATRASO_MINUTOS, type ConfigHorario, type ExcecaoDia, type TipoHorario } from "@/components/rh-exemplo/lib/horarioTipos";
import type { HorarioRealizado } from "@/components/rh-exemplo/tipos";
import type { Falta, MotivoFalta } from "@/components/rh-exemplo/tiposAssiduidade";
import { PLANO_ASSIDUIDADE, type CodigoJustificacao, type EstadoDecisao, type EventoDia } from "./assiduidadePlano";

export const PRIMEIRO_DIA_GERADO = "2026-08-01";
export const MES_PROCESSAVEL = "2026-09";
export const PODE_HE_EXEMPLO: Readonly<Record<string, boolean>> = {
  "p-sofia": true, "p-rui": true, "p-ines": true, "p-tiago": true, "p-hugo": true, "p-andre": true,
};
/** Horas extra ja acumuladas no ano antes de Agosto (a Sofia esta perto do limite anual). */
export const ACUMULADO_ANO_MIN: Readonly<Record<string, number>> = { "p-sofia": 116 * 60 };
export const SALDO_ABERTURA_BANCO_MIN = 600;

export interface EntradaGerador {
  pessoaId: string;
  organizationId: string;
  vinculoId: string | null;
  localId: string | null;
  config: ConfigHorario;
  excecoes: readonly ExcecaoDia[];
  contrato: { desde: string; ate: string | null } | null;
  ausencias: ReadonlyMap<string, AusenciaDoDiaCal>;
  hoje: string;
  /** Quem decide as faltas (id da pessoa) e as horas extra (nome): o RH da apresentacao. */
  decididoPor: string;
  decididoPorNome: string;
}

export interface SaidaGerada {
  realizado: HorarioRealizado[];
  faltas: Falta[];
  horasExtra: HoraExtra[];
  banco: MovimentoBanco[];
  /** Ids das linhas de realizado cuja picagem de entrada foi a mais de 200 m do local. */
  foraDoLocal: string[];
}

type Turno = { ini: number; fim: number };
const HE_POR_TIPO: Record<TipoHorario, TipoHorarioHE> = {
  padrao: "normal", repartido: "repartido", isencao: "isencao", livre: "livre", banco: "banco_horas",
};

const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const paraMin = (hora: string): number => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const horasTexto = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
};

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** O inicio (segunda-feira) da semana ISO de um dia. */
export function segundaDaSemana(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return somarDias(iso, dow === 0 ? -6 : 1 - dow);
}

function semente(pessoaId: string): number {
  return [...pessoaId].reduce((s, c) => s + c.charCodeAt(0), 0);
}

/** Os turnos de um dia certo, a partir do previsto (a pausa fica a meio). */
function turnosBase(prev: PrevistoDoDia): Turno[] {
  if (prev.tipo === "livre") return [{ ini: 540, fim: 780 }, { ini: 840, fim: 1080 }];
  return periodosDoPrevisto(prev);
}

function criarFalta(e: EntradaGerador, base: {
  id: string; data: string; ini: number; fim: number; motivo: MotivoFalta; just: CodigoJustificacao; decididaPor?: string;
}): Falta {
  const estado = { jp: "justificada", jn: "justificada", pd: "pendente_documento", sj: "sem_justificacao" }[base.just] as Falta["justificacao_estado"];
  const justificada = estado === "justificada";
  return {
    id: base.id, pessoa_id: e.pessoaId, organization_id: e.organizationId, data: base.data, planeado_id: null,
    vinculo_id: e.vinculoId, local_id: e.localId, hora_inicio: hhmm(base.ini), hora_fim: hhmm(base.fim), minutos: base.fim - base.ini,
    motivo_codigo: base.motivo, justificacao_estado: estado, justificada, remunerada: base.just === "jp",
    desconta_saldo: false, justificacao_decidida_por: justificada ? (base.decididaPor ?? e.decididoPor) : null,
    justificacao_decidida_em: justificada ? `${base.data}T18:00:00Z` : null, justificacao_motivo: null, ausencia_dia_id: null,
    corrige_falta_id: null, correccao_motivo: null, estado: "activa", anulado_em: null, anulacao_motivo: null,
    created_at: `${base.data}T18:30:00Z`,
  };
}

const slug = (pessoaId: string): string => pessoaId.replace(/^p-/, "");

function pedidoHE(args: {
  e: EntradaGerador; data: string; minutos: number; origem: OrigemHoraExtra; motivoOrigem: string; noct: number;
  est: EstadoDecisao; estAcima: EstadoDecisao; decisao: string | null; jaNoAno: number;
}): HoraExtra[] {
  const { e, data, minutos, origem } = args;
  const podeFazer = PODE_HE_EXEMPLO[e.pessoaId] === true;
  if (avaliarCandidata(minutos, podeFazer, LIMITES_OMISSAO.minimoMin) !== "cria_pendente") return [];
  const ava = avaliarLimites(minutos, { jaNoDiaMin: 0, jaNoAnoMin: args.jaNoAno }, LIMITES_OMISSAO);
  const estado = (d: EstadoDecisao): EstadoHoraExtra => ({ c: "confirmada", r: "rejeitada", p: "pendente" } as const)[d];
  const parte = (id: string, min: number, noct: number, acima: boolean, d: EstadoDecisao): HoraExtra => ({
    id, pessoaId: e.pessoaId, data, minutos: min, nocturnoMin: noct, origem, motivoOrigem: args.motivoOrigem,
    estado: estado(d), acimaDoLimite: acima, motivoDecisao: d === "p" ? null : (args.decisao ?? (acima ? "Autorizado pela direção" : null)), decididoPor: d === "p" ? null : e.decididoPorNome,
  });
  const base = `he-${slug(e.pessoaId)}-${data}`;
  const noctNormal = Math.min(args.noct, ava.normaisMin);
  return [
    ...(ava.normaisMin > 0 ? [parte(base, ava.normaisMin, noctNormal, false, args.est)] : []),
    ...(ava.acimaDoLimiteMin > 0 ? [parte(`${base}-acima`, ava.acimaDoLimiteMin, Math.max(0, args.noct - noctNormal), true, args.estAcima)] : []),
  ];
}

/** Aplica os eventos do dia aos turnos; devolve os turnos que ficam, as faltas e o que sobra para o resto. */
function aplicarEventos(e: EntradaGerador, data: string, turnos: Turno[], eventos: readonly EventoDia[]) {
  let atual = turnos.map((t) => ({ ...t }));
  const faltas: Falta[] = [];
  let n = 0;
  const novaFalta = (id: string | undefined, t: Turno, motivo: MotivoFalta, just: CodigoJustificacao, decididaPor?: string) => {
    n += 1;
    faltas.push(criarFalta(e, { id: id && n === 1 ? id : `fa-${slug(e.pessoaId)}-${data}-${n}`, data, ini: t.ini, fim: t.fim, motivo, just, decididaPor }));
  };
  for (const ev of eventos) {
    if (ev.k === "atr" && atual.length > 0) {
      atual[0] = { ...atual[0], ini: atual[0].ini + ev.min };
      if (ev.min > TOLERANCIA_ATRASO_MINUTOS && !ev.semFalta) novaFalta(ev.id, { ini: turnos[0].ini, fim: turnos[0].ini + ev.min }, "atraso", ev.just ?? "sj");
    } else if (ev.k === "ext" && atual.length > 0) {
      atual[atual.length - 1] = { ...atual[atual.length - 1], fim: atual[atual.length - 1].fim + ev.min };
    } else if (ev.k === "sai" && atual.length > 0 && e.config.tipo !== "banco") {
      const ultimo = atual[atual.length - 1];
      novaFalta(undefined, { ini: ultimo.fim - ev.min, fim: ultimo.fim }, "saida_antecipada", ev.just ?? "sj");
      atual[atual.length - 1] = { ...ultimo, fim: ultimo.fim - ev.min };
    } else if (ev.k === "sai" && atual.length > 0) {
      atual[atual.length - 1] = { ...atual[atual.length - 1], fim: atual[atual.length - 1].fim - ev.min };
    } else if (ev.k === "fal") {
      const indices = ev.per === "m" ? [0] : ev.per === "t" ? [turnos.length - 1] : turnos.map((_, i) => i);
      indices.forEach((i) => novaFalta(ev.id, turnos[i], ev.motivo, ev.just, ev.decididaPor));
      atual = atual.filter((_, i) => !indices.includes(i));
    } else if (ev.k === "folga") {
      atual = [];
    }
  }
  return { turnos: atual, faltas };
}

function linhaRealizado(e: EntradaGerador, data: string, i: number, t: Turno): HorarioRealizado {
  const validado = data < somarDias(e.hoje, -3);
  return {
    id: `hr-${e.pessoaId}-${data}-${i}`, pessoa_id: e.pessoaId, organization_id: e.organizationId, vinculo_id: e.vinculoId,
    local_id: e.localId, planeado_id: null, data, hora_inicio: hhmm(t.ini), hora_fim: hhmm(t.fim), minutos: t.fim - t.ini,
    origem: "picagem", estado: validado ? "validado" : "registado", validado_por: null, validado_em: null, motivo_rejeicao: null, notas: null,
  };
}

function jitter(pessoaId: string, indice: number): { atraso: number; extra: number } {
  const h = (semente(pessoaId) * 7 + indice * 13) % 7;
  return { atraso: [0, 1, 0, 2, 3, 0, 1][h], extra: [0, 0, 2, 0, 1, 3, 0][(h + 3) % 7] };
}

function movimentoBanco(e: EntradaGerador, data: string, minutos: number, motivo: string): MovimentoBanco {
  return { id: `bh-${slug(e.pessoaId)}-${data}`, pessoaId: e.pessoaId, data, minutos, motivo, origem: "automatico" };
}

type EventoExt = Extract<EventoDia, { k: "ext" }>;
type EventoTrab = Extract<EventoDia, { k: "trab" }>;

interface SemanaAcumulada {
  feito: number;
  alvo: number;
  ultimo: string;
  ev: EventoExt | null;
}

/** O que se vai acumulando enquanto se percorrem os dias de uma pessoa. */
interface Corrente {
  e: EntradaGerador;
  ctx: ContextoPrevisto;
  plano: Record<string, EventoDia[]>;
  saida: SaidaGerada;
  semanas: Map<string, SemanaAcumulada>;
  acumuladoAno: number;
}

function guardarHE(c: Corrente, novas: HoraExtra[]): void {
  c.saida.horasExtra.push(...novas);
  c.acumuladoAno += novas.filter((h) => h.estado !== "rejeitada").reduce((s, h) => s + h.minutos, 0);
}

function turnosDoDia(c: Corrente, data: string, indice: number, prev: PrevistoDoDia, eventos: readonly EventoDia[], trab: EventoTrab | undefined) {
  if (trab) return { turnos: [{ ini: paraMin(trab.inicio), fim: paraMin(trab.fim) }], faltas: [] as Falta[] };
  const j = eventos.length === 0 && c.e.config.tipo !== "livre" ? jitter(c.e.pessoaId, indice) : { atraso: 0, extra: 0 };
  const base = turnosBase(prev);
  if (base.length > 0) {
    base[0] = { ...base[0], ini: base[0].ini + j.atraso };
    base[base.length - 1] = { ...base[base.length - 1], fim: base[base.length - 1].fim + j.extra };
  }
  // Hoje so ha o primeiro periodo: o dia ainda nao acabou.
  return aplicarEventos(c.e, data, data === c.e.hoje ? base.slice(0, 1) : base, eventos);
}

function registarBanco(c: Corrente, data: string, prev: PrevistoDoDia, feito: number, eventos: readonly EventoDia[]): void {
  const { e, saida } = c;
  for (const ev of eventos) {
    if (ev.k === "ext") saida.banco.push(movimentoBanco(e, data, ev.min, `Dia com ${horasTexto(feito)} feitas (${horasTexto(prev.minutos)} planeadas)`));
    if (ev.k === "sai") saida.banco.push(movimentoBanco(e, data, -ev.min, "Saída mais cedo acordada"));
    if (ev.k === "folga") saida.banco.push(movimentoBanco(e, data, -prev.minutos, "Folga gozada por banco de horas"));
  }
}

function registarHE(c: Corrente, data: string, prev: PrevistoDoDia, feito: number, ext: EventoExt | undefined, trab: EventoTrab | undefined): void {
  const evento = trab ?? ext;
  if (!evento) return;
  const especial = trab ? (prev.kind === "feriado" ? "feriado" : "descanso") : null;
  const { minutos, origem } = tempoAMaisPorTipo({ tipo: HE_POR_TIPO[c.e.config.tipo], feitoMin: feito, planeadoMin: prev.minutos, diaEspecial: especial });
  if (!origem) return;
  guardarHE(c, pedidoHE({
    e: c.e, data, minutos, origem, motivoOrigem: evento.origem, noct: ext?.nocturno ?? 0, est: evento.est,
    estAcima: ext?.estAcima ?? evento.est, decisao: decisaoDe(evento), jaNoAno: c.acumuladoAno,
  }));
}

function semanaDe(c: Corrente, data: string): SemanaAcumulada {
  const chave = segundaDaSemana(data);
  const existente = c.semanas.get(chave);
  if (existente) return existente;
  const nova: SemanaAcumulada = { feito: 0, alvo: 0, ultimo: data, ev: null };
  c.semanas.set(chave, nova);
  return nova;
}

function processarDia(c: Corrente, data: string, indice: number): void {
  const { e, saida } = c;
  const tipo = e.config.tipo;
  const prev = resolverPrevistoDoDia(c.ctx, data);
  const eventos = data < e.hoje ? (c.plano[data] ?? []) : [];
  const trab = eventos.find((ev): ev is EventoTrab => ev.k === "trab");
  if (tipo === "livre" && prev.kind !== "sem_contrato") semanaDe(c, data).alvo += prev.minutosParaTotais;
  if ((prev.kind !== "trabalha" || tipo === "isencao") && !trab) return;

  const { turnos, faltas } = turnosDoDia(c, data, indice, prev, eventos, trab);
  saida.faltas.push(...faltas);
  turnos.forEach((t, i) => saida.realizado.push(linhaRealizado(e, data, i, t)));
  if (eventos.some((ev) => ev.k === "fora") && turnos.length > 0) saida.foraDoLocal.push(`hr-${e.pessoaId}-${data}-0`);

  const feito = turnos.reduce((s, t) => s + (t.fim - t.ini), 0);
  const ext = eventos.find((ev): ev is EventoExt => ev.k === "ext");
  if (tipo === "livre") {
    const s = semanaDe(c, data);
    s.feito += feito;
    if (feito > 0) s.ultimo = data;
    if (ext) s.ev = ext;
    return;
  }
  if (tipo === "banco") registarBanco(c, data, prev, feito, eventos);
  registarHE(c, data, prev, feito, ext, trab);
}

/** Horario livre: a hora extra e do total da semana, datada no ultimo dia trabalhado, quando a semana ja acabou. */
function fecharSemanasLivres(c: Corrente): void {
  for (const [segunda, s] of c.semanas) {
    if (!s.ev || somarDias(segunda, 6) > c.e.hoje) continue;
    const { minutos, origem } = tempoAMaisPorTipo({ tipo: "livre", feitoMin: s.feito, planeadoMin: s.alvo, diaEspecial: null });
    if (!origem) continue;
    guardarHE(c, pedidoHE({ e: c.e, data: s.ultimo, minutos, origem, motivoOrigem: s.ev.origem, noct: 0, est: s.ev.est, estAcima: s.ev.est, decisao: decisaoDe(s.ev), jaNoAno: c.acumuladoAno }));
  }
}

export function gerarPessoa(e: EntradaGerador): SaidaGerada {
  const horario = {
    versoes: [{ id: "gerada", config: e.config, desde: "2000-01-01", ate: null, motivo: "", anexoNome: null, autor: "", criadaEm: "", corrigeId: null, correccao: false, autorizadaPor: null, substituidaPor: null }],
    excecoes: [...e.excecoes],
  };
  const c: Corrente = {
    e, ctx: { horario, contrato: e.contrato, ausencias: e.ausencias }, plano: PLANO_ASSIDUIDADE[e.pessoaId] ?? {},
    saida: { realizado: [], faltas: [], horasExtra: [], banco: [], foraDoLocal: [] }, semanas: new Map(), acumuladoAno: ACUMULADO_ANO_MIN[e.pessoaId] ?? 0,
  };
  diasEntre(PRIMEIRO_DIA_GERADO, e.hoje).forEach((data, indice) => processarDia(c, data, indice));
  fecharSemanasLivres(c);
  if (e.config.tipo === "banco") {
    c.saida.banco.unshift({ id: `bh-${slug(e.pessoaId)}-abertura`, pessoaId: e.pessoaId, data: "2026-07-31", minutos: SALDO_ABERTURA_BANCO_MIN, motivo: "Saldo de abertura", origem: "automatico" });
  }
  return c.saida;
}

function decisaoDe(ev: EventoDia): string | null {
  if (ev.k === "ext") return ev.decisao ?? (ev.estAcima === "c" ? "Autorizado pela direção" : null);
  return null;
}

const CACHE = new Map<string, SaidaGerada>();

/** Gera e guarda: os stores das fichas, da gestao e dos fluxos C leem todos a MESMA saida, sem duplicar dados. */
export function gerarEGuardar(e: EntradaGerador): SaidaGerada {
  const saida = gerarPessoa(e);
  CACHE.set(e.pessoaId, saida);
  return saida;
}

const SEM_SAIDA: SaidaGerada = { realizado: [], faltas: [], horasExtra: [], banco: [], foraDoLocal: [] };

export function saidaGeradaDe(pessoaId: string): SaidaGerada {
  return CACHE.get(pessoaId) ?? SEM_SAIDA;
}

export function todasAsSaidasGeradas(): SaidaGerada[] {
  return [...CACHE.values()];
}
