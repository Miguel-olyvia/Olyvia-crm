// Dias e horas de Lisboa (Europe/Lisbon, com a hora de verão), sem relógio e sem depender do fuso da máquina.
// A base guarda instantes (UTC); a ficha pensa em "dia" (AAAA-MM-DD) e "hora" (HH:MM) de Lisboa.
export { diasEntre, hojeLisboa } from "./adaptarResumoPessoa";

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MS_MINUTO = 60_000;

// hourCycle h23: nunca devolve "24:00" à meia-noite.
const formatoRelogio = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

interface Relogio {
  dia: string;
  hora: string;
  /** O relógio de Lisboa lido como se fosse UTC (para medir o desvio). */
  comoUtc: number;
}

function relogioDe(ms: number): Relogio {
  const partes = formatoRelogio.formatToParts(new Date(ms));
  const v = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? "00";
  const hora = `${v("hour")}:${v("minute")}`;
  return {
    dia: `${v("year")}-${v("month")}-${v("day")}`,
    hora,
    comoUtc: Date.UTC(Number(v("year")), Number(v("month")) - 1, Number(v("day")), Number(v("hour")), Number(v("minute"))),
  };
}

function lerMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** O dia de Lisboa (AAAA-MM-DD) de um instante; null se não for uma data. */
export function diaLisboa(iso: string | null | undefined): string | null {
  const ms = lerMs(iso);
  return ms === null ? null : relogioDe(ms).dia;
}

/** A hora de Lisboa (HH:MM) de um instante; null se não for uma data. */
export function horaLisboa(iso: string | null | undefined): string | null {
  const ms = lerMs(iso);
  return ms === null ? null : relogioDe(ms).hora;
}

/** A hora de um próximo contacto, ou nada se for a meia-noite de Lisboa («sem hora»). */
export function horaDoProximoContacto(iso: string | null | undefined): string | undefined {
  const hora = horaLisboa(iso);
  return hora === null || hora === "00:00" ? undefined : hora;
}

/**
 * O instante (ISO, UTC) em que o relógio de Lisboa marca `dia` e `hora`; null se o dia ou a hora não existem.
 * Mede o desvio de Lisboa no próprio instante (duas voltas, por causa das mudanças de hora).
 */
export function instanteLisboa(dia: string, hora: string): string | null {
  if (!FORMATO_DIA.test(dia) || !FORMATO_HORA.test(hora)) return null;
  const [a, m, d] = dia.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  const parede = Date.UTC(a, m - 1, d, h, min);
  const confere = new Date(parede);
  if (confere.getUTCFullYear() !== a || confere.getUTCMonth() !== m - 1 || confere.getUTCDate() !== d) return null;
  let candidato = parede;
  for (let volta = 0; volta < 2; volta += 1) {
    const desvio = relogioDe(candidato).comoUtc - candidato;
    candidato = parede - desvio;
  }
  return new Date(Math.round(candidato / MS_MINUTO) * MS_MINUTO).toISOString();
}

/** O início (00:00) do dia de Lisboa, como instante ISO; null se o dia não existe. */
export const inicioDoDiaLisboa = (dia: string): string | null => instanteLisboa(dia, "00:00");
