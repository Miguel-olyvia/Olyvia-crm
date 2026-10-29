// As horas livres de uma visita, em funções puras. Parte do que a base diz que cada recurso tem livre (get_resource_available_slots) e corta
// pelo horário VERDADEIRO da organização (Configurações da Agenda › Horários: hora de início e de fim, dias de trabalho, feriados e pausa de almoço).
// A regra do recurso (o horário dele) manda dentro da base; aqui a organização só pode ESTREITAR, nunca alargar. A deslocação não entra.
import { diaLisboa, horaLisboa, instanteLisboa } from "./tempoLisboa";

export interface AlmocoOrg {
  /** HH:MM */
  inicio: string;
  /** HH:MM */
  fim: string;
  minutos: number;
}

export interface HorarioOrg {
  /** HH:MM */
  inicio: string;
  /** HH:MM */
  fim: string;
  /** 0 = domingo ... 6 = sábado (o `working_days` da organização). */
  dias: readonly number[];
  /** `null` quando a organização não somou pausa de almoço. */
  almoco: AlmocoOrg | null;
}

/** Quando a organização ainda não gravou horários, vale isto, e o ecrã diz que é a omissão (nada se esconde). */
export const HORARIO_POR_OMISSAO: HorarioOrg = { inicio: "09:00", fim: "18:00", dias: [1, 2, 3, 4, 5], almoco: null };

export interface FeriadosOrg {
  /** AAAA-MM-DD */
  datas: ReadonlySet<string>;
  /** MM-DD (feriados que se repetem todos os anos) */
  anuais: ReadonlySet<string>;
}

export const SEM_FERIADOS: FeriadosOrg = { datas: new Set(), anuais: new Set() };

export interface SlotDb {
  slot_start: string;
  slot_end: string;
}

/** «09:00:00» e «09:00» dão «09:00». */
export const hhmm = (texto: string | null | undefined): string => (texto ?? "").slice(0, 5);

export function minutosDoDia(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const doisDigitos = (n: number): string => String(n).padStart(2, "0");
export const horaDeMinutos = (min: number): string => `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;

export function ehFeriado(dia: string, f: FeriadosOrg): boolean {
  return f.datas.has(dia) || f.anuais.has(dia.slice(5));
}

/** O dia da semana de uma data AAAA-MM-DD (0 = domingo). */
export const diaDaSemana = (dia: string): number => new Date(`${dia}T12:00:00Z`).getUTCDay();

export type MotivoDiaFechado = "feriado" | "naoTrabalha";

/** Porque a organização não trabalha nesse dia; `null` = trabalha. */
export function motivoDiaFechado(dia: string, h: HorarioOrg, f: FeriadosOrg): MotivoDiaFechado | null {
  if (ehFeriado(dia, f)) return "feriado";
  return h.dias.includes(diaDaSemana(dia)) ? null : "naoTrabalha";
}

/**
 * As horas (HH:MM, Lisboa) a que a visita pode começar segundo UM recurso: os inícios que a base deu livres nesse dia, dentro do horário da
 * organização (a visita tem de acabar até à hora de fim) e que ainda não passaram.
 */
export function horasDoRecurso(slots: readonly SlotDb[], dia: string, duracaoMin: number, h: HorarioOrg, agora: number): string[] {
  const ini = minutosDoDia(h.inicio);
  const fim = minutosDoDia(h.fim);
  const horas = new Set<string>();
  for (const s of slots) {
    if (diaLisboa(s.slot_start) !== dia) continue;
    const hora = horaLisboa(s.slot_start);
    if (!hora) continue;
    const comeco = minutosDoDia(hora);
    if (comeco < ini || comeco + duracaoMin > fim) continue;
    const instante = instanteLisboa(dia, hora);
    if (instante === null || Date.parse(instante) <= agora) continue;
    horas.add(hora);
  }
  return [...horas].sort();
}

/** A visita acaba dentro da janela do almoço (as pontas contam)? Então a pausa tem de caber a seguir. */
export function terminaNoAlmoco(hora: string, duracaoMin: number, a: AlmocoOrg): boolean {
  const fim = minutosDoDia(hora) + duracaoMin;
  return fim >= minutosDoDia(a.inicio) && fim <= minutosDoDia(a.fim);
}

/** Só as horas que TODOS os recursos têm livres. Sem recursos, nenhuma. */
export function intersetar(listas: readonly (readonly string[])[]): string[] {
  const [primeira, ...resto] = listas;
  if (!primeira) return [];
  return primeira.filter((hora) => resto.every((l) => l.includes(hora)));
}

/**
 * As horas livres de todos os recursos, cortadas pelo almoço: uma hora cuja visita acaba na janela do almoço só fica se cada recurso também tiver livre a
 * pausa a seguir (`comPausa` = as horas livres de cada recurso para uma visita com a duração mais a pausa).
 */
export function aplicarAlmoco(horas: readonly string[], duracaoMin: number, almoco: AlmocoOrg | null, comPausa: readonly (readonly string[])[]): string[] {
  if (!almoco || almoco.minutos <= 0) return [...horas];
  const comFolga = new Set(intersetar(comPausa));
  return horas.filter((hora) => !terminaNoAlmoco(hora, duracaoMin, almoco) || comFolga.has(hora));
}

/** A hora de uma visita que já existe fica sempre escolhível ao remarcar (a base já não a conta como livre por estar ocupada por ela própria). */
export function comHoraAtual(horas: readonly string[], dia: string, atual: { dia: string; hora: string } | null, h: HorarioOrg): string[] {
  if (!atual || atual.dia !== dia || horas.includes(atual.hora)) return [...horas];
  const c = minutosDoDia(atual.hora);
  if (c < minutosDoDia(h.inicio) || c >= minutosDoDia(h.fim)) return [...horas];
  return [...horas, atual.hora].sort();
}
