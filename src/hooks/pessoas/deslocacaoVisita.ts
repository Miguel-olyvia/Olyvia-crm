// A deslocação de uma visita, em funções puras. A DECISÃO (pode ou não ir) é sempre a de checkTravelFeasible, copiada do main (regra 13,
// supabase/functions/_shared/travelFeasibility.ts): nada aqui define velocidades nem fórmulas. Os números mostrados (km, minutos, folga) vêm
// de haversineKm e requiredTravelMinutes, também do main. Sem destino (sem código postal de 7 dígitos ou sem coordenadas) só conta o almoço,
// como no main. A margem de arredondamento (MARGEM_ARREDONDAMENTO_MIN) NÃO cobre a viagem que o almoço soma dentro de checkTravelFeasible
// (essa usa as coordenadas arredondadas sem margem): só aperta as pontas anterior e seguinte (aceite). Nunca se bloqueia por desconhecimento: sem destino, sem base do recurso ou vizinha sem coordenadas, o resultado é «sem localização».
import { haversineKm } from "../../../supabase/functions/_shared/distance";
import { buildLunchBreakConfig, checkTravelFeasible, requiredTravelMinutes } from "../../../supabase/functions/_shared/travelFeasibility";
import { horaLisboa } from "./tempoLisboa";

export interface PontoDestino {
  lat: number;
  lng: number;
}

/**
 * Uma visita já marcada de um recurso nesse dia (só o que a base devolve: sem id, morada, nome nem cliente). As coordenadas vêm
 * arredondadas a 2 casas decimais (cerca de 1 km) de propósito, por privacidade: ver MARGEM_ARREDONDAMENTO_MIN.
 */
export interface VisitaVizinha {
  inicio: string;
  fim: string;
  lat: number | null;
  lng: number | null;
}

export interface RecursoVizinhas {
  resource_id: string;
  resource_name?: string | null;
  latitude: number | null;
  longitude: number | null;
  visitas: VisitaVizinha[];
}

/** A pausa de almoço da organização, como a base a devolve (schedule_settings). */
export interface AlmocoVizinhas {
  inicio: string | null;
  fim: string | null;
  minutos: number | null;
  timezone: string | null;
}

export interface VizinhasDoDia {
  recursos: RecursoVizinhas[];
  almoco: AlmocoVizinhas | null;
}

/** Uma ponta (a visita anterior ou a seguinte): a viagem que pede e a folga que há. */
export interface LadoViagem {
  /** HH:MM (Lisboa): o fim da visita anterior ou o início da seguinte. */
  hora: string;
  km: number;
  viagemMin: number;
  folgaMin: number;
  ok: boolean;
}

export type MotivoNaoPode = "anterior" | "seguinte" | "almoco";

export interface Veredicto {
  /** A decisão de checkTravelFeasible. */
  pode: boolean;
  /** Porque não pode (a ponta que falhou, segundo o main); vazio se pode. */
  motivos: MotivoNaoPode[];
  anterior: LadoViagem | null;
  seguinte: LadoViagem | null;
  /** Sem visitas vizinhas com coordenadas: de onde parte (a base do recurso), só informa e ordena. */
  base: { km: number; viagemMin: number } | null;
  /** O que faltou para verificar (sem destino, ou sem nenhuma localização do recurso). */
  semLocalizacao: boolean;
  /** A pausa de almoço em causa (minutos), quando é ela que impede. */
  almocoMin: number | null;
  /** O km que ordena os recursos (da vizinha mais próxima ou da base); null se não há. */
  km: number | null;
}

const MS_MINUTO = 60_000;

/**
 * As coordenadas das visitas vizinhas e da base do recurso chegam arredondadas a 2 casas decimais (privacidade), o que dá um erro de
 * distância até ~0,8 km por ponto arredondado (~1,4 min a 35 km/h). Soma-se esta margem ao tempo de viagem ANTES de o comparar com a folga
 * (só nos números e no veredicto de cada ponta; travelFeasibility.ts, copiado do main, não se altera). Só torna a decisão mais prudente.
 * O destino (o código postal do negócio) tem coordenadas exactas e não leva margem própria.
 */
export const MARGEM_ARREDONDAMENTO_MIN = 1.5;

/** «HH:MM» de um instante ISO, em Lisboa. */
const horaDe = (iso: string): string => horaLisboa(iso) ?? "";

interface Vizinha {
  start_datetime: string;
  end_datetime: string;
  location_lat: number | null;
  location_lng: number | null;
}

const comCoordenadas = (v: Vizinha): boolean => v.location_lat !== null && v.location_lng !== null;

/** A vizinha com coordenadas que acaba mais perto antes do início, e a que começa mais perto depois do fim (a mesma escolha do main). */
function maisProximas(vizinhas: readonly Vizinha[], inicioMs: number, fimMs: number): { antes: Vizinha | null; depois: Vizinha | null } {
  let antes: Vizinha | null = null;
  let depois: Vizinha | null = null;
  for (const v of vizinhas) {
    if (!comCoordenadas(v)) continue;
    const vi = new Date(v.start_datetime).getTime();
    const vf = new Date(v.end_datetime).getTime();
    if (vf <= inicioMs) {
      if (!antes || vf > new Date(antes.end_datetime).getTime()) antes = v;
    } else if (vi >= fimMs) {
      if (!depois || vi < new Date(depois.start_datetime).getTime()) depois = v;
    }
  }
  return { antes, depois };
}

function ladoDe(destino: PontoDestino, v: Vizinha, folgaMs: number, hora: string): LadoViagem {
  const km = haversineKm(destino.lat, destino.lng, v.location_lat as number, v.location_lng as number);
  const necessario = requiredTravelMinutes(km) + MARGEM_ARREDONDAMENTO_MIN;
  const folga = folgaMs / MS_MINUTO;
  return { hora, km, viagemMin: Math.ceil(necessario), folgaMin: Math.floor(folga), ok: folga >= necessario };
}

interface Entrada {
  recurso: RecursoVizinhas;
  /** Instantes ISO (UTC) da visita candidata. */
  inicio: string;
  fim: string;
  destino: PontoDestino | null;
  almoco: AlmocoVizinhas | null;
}

/** Se `recurso` consegue chegar a uma visita que começa em `inicio` e acaba em `fim`, e os números que o ecrã mostra. */
export function avaliarViagem(e: Entrada): Veredicto {
  // ao remarcar, a base já deixou de fora a visita que se remarca (p_exclude_item_id)
  const vizinhas: Vizinha[] = e.recurso.visitas
    .map((v) => ({ start_datetime: v.inicio, end_datetime: v.fim, location_lat: v.lat, location_lng: v.lng }));
  const lunchBreak = e.almoco
    ? buildLunchBreakConfig({
      timezone: e.almoco.timezone, lunch_window_start: e.almoco.inicio, lunch_window_end: e.almoco.fim, lunch_duration_minutes: e.almoco.minutos,
    })
    : null;
  const decisao = checkTravelFeasible({
    clientLat: e.destino?.lat ?? null, clientLng: e.destino?.lng ?? null, slotStart: e.inicio, slotEnd: e.fim, neighbors: vizinhas, lunchBreak,
  });
  const motivo = decisao.reason ?? "";
  const motivos: MotivoNaoPode[] = [];
  if (!decisao.feasible) {
    if (motivo.startsWith("not enough travel time from previous")) motivos.push("anterior");
    else if (motivo.startsWith("not enough travel time to next")) motivos.push("seguinte");
    else motivos.push("almoco");
  }

  const inicioMs = new Date(e.inicio).getTime();
  const fimMs = new Date(e.fim).getTime();
  let anterior: LadoViagem | null = null;
  let seguinte: LadoViagem | null = null;
  let base: Veredicto["base"] = null;
  let km: number | null = null;
  if (e.destino) {
    const { antes, depois } = maisProximas(vizinhas, inicioMs, fimMs);
    if (antes) anterior = ladoDe(e.destino, antes, inicioMs - new Date(antes.end_datetime).getTime(), horaDe(antes.end_datetime));
    if (depois) seguinte = ladoDe(e.destino, depois, new Date(depois.start_datetime).getTime() - fimMs, horaDe(depois.start_datetime));
    if (!antes && !depois && e.recurso.latitude !== null && e.recurso.longitude !== null) {
      const kmBase = haversineKm(e.destino.lat, e.destino.lng, e.recurso.latitude, e.recurso.longitude);
      base = { km: kmBase, viagemMin: Math.ceil(requiredTravelMinutes(kmBase) + MARGEM_ARREDONDAMENTO_MIN) };
      km = kmBase;
    } else if (anterior || seguinte) {
      km = Math.min(...[anterior?.km, seguinte?.km].filter((x): x is number => x !== undefined));
    }
  }
  // a margem do arredondamento só aperta: uma ponta que o main deixa passar por pouco, mas não cabe com a margem, também não pode
  if (anterior && !anterior.ok && !motivos.includes("anterior")) motivos.push("anterior");
  if (seguinte && !seguinte.ok && !motivos.includes("seguinte")) motivos.push("seguinte");
  return {
    pode: decisao.feasible && motivos.length === 0, motivos, anterior, seguinte, base,
    semLocalizacao: e.destino === null || (anterior === null && seguinte === null && base === null),
    almocoMin: motivos.includes("almoco") ? lunchBreak?.durationMinutes ?? null : null, km,
  };
}

const arredondar = (n: number): string => (n < 10 ? n.toFixed(1) : String(Math.round(n))).replace(".", ",");

/**
 * De onde pode partir o recurso, no dia: «com-origem» (a base tem coordenadas ou há visitas com coordenadas), «sem-base» (nem base nem visitas
 * localizadas) ou «base-sem-coordenadas» (o recurso tem código postal, mas ainda não foi geocodificado). Só informa: nunca bloqueia.
 */
export type OrigemDoRecurso = "com-origem" | "sem-base" | "base-sem-coordenadas";

export function origemDoRecurso(recurso: RecursoVizinhas, temCodigoPostal: boolean): OrigemDoRecurso {
  const temBase = recurso.latitude !== null && recurso.longitude !== null;
  const temVisitaLocalizada = recurso.visitas.some((v) => v.lat !== null && v.lng !== null);
  if (temBase || temVisitaLocalizada) return "com-origem";
  return temCodigoPostal ? "base-sem-coordenadas" : "sem-base";
}

/** A viagem estimada, numa frase curta para junto do recurso («~N min desde a base, aprox. X km»); null se não há de onde partir. */
export function estimativaDoVeredicto(v: Veredicto): string | null {
  if (v.base) return `~${v.base.viagemMin} min desde a base, aprox. ${arredondar(v.base.km)} km`;
  const lado = [v.anterior && { l: v.anterior, de: "desde a visita anterior" }, v.seguinte && { l: v.seguinte, de: "até à visita seguinte" }]
    .filter((x): x is { l: LadoViagem; de: string } => !!x)
    .sort((x, y) => x.l.km - y.l.km)[0];
  return lado ? `~${lado.l.viagemMin} min ${lado.de}, aprox. ${arredondar(lado.l.km)} km` : null;
}

/** As frases (uma por ponta ou por motivo) que o ecrã mostra para um recurso a uma hora. */
export function frasesDoVeredicto(v: Veredicto): string[] {
  const frases: string[] = [];
  if (v.motivos.includes("anterior") && v.anterior) {
    frases.push(`não pode: viagem de ~${v.anterior.viagemMin} min (estimativa) desde a visita que acaba às ${v.anterior.hora}, folga de ${v.anterior.folgaMin} min`);
  }
  if (v.motivos.includes("seguinte") && v.seguinte) {
    frases.push(`não pode: viagem de ~${v.seguinte.viagemMin} min (estimativa) até à visita das ${v.seguinte.hora}, folga de ${v.seguinte.folgaMin} min`);
  }
  if (v.motivos.includes("almoco")) {
    frases.push(v.almocoMin ? `não pode: não sobra tempo para o almoço de ${v.almocoMin} min` : "não pode: não sobra tempo para o almoço");
  }
  if (v.pode) {
    if (v.anterior) frases.push(`viagem de ~${v.anterior.viagemMin} min (estimativa) desde a visita que acaba às ${v.anterior.hora}, folga de ${v.anterior.folgaMin} min`);
    if (v.seguinte) frases.push(`viagem de ~${v.seguinte.viagemMin} min (estimativa) até à visita das ${v.seguinte.hora}, folga de ${v.seguinte.folgaMin} min`);
    if (v.base) frases.push(`parte da base: aprox. ${arredondar(v.base.km)} km, ~${v.base.viagemMin} min (estimativa)`);
    if (frases.length === 0 && v.semLocalizacao) frases.push("sem localização para verificar a viagem");
  }
  return frases;
}
