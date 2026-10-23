// O básico da Frota real: o dia de hoje (Europe/Lisbon, o mesmo fuso das RPCs), datas e formatos. Sem React.

const FUSO = "Europe/Lisbon";
const diaLisboa = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** O dia de hoje em Lisboa ("AAAA-MM-DD"), como o current_date das RPCs. Lê o relógio a cada chamada. */
export const hojeFrota = (): string => diaLisboa.format(new Date());

/** O dia (em Lisboa) de um instante ISO ("2026-10-14T21:30:00Z" → "2026-10-14"). */
export const diaDe = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : diaLisboa.format(d);
};
/** A hora (em Lisboa) de um instante ISO ("21:30"). */
export const horaDe = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("pt-PT", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(d);
};

export const d2n = (d: string): number => Date.parse(d + "T00:00:00Z") / 864e5;
/** Dias de `hoje` até `d` (negativo: já passou). */
export const dias = (d: string, hoje = hojeFrota()): number => Math.round(d2n(d) - d2n(hoje));
export const addDias = (d: string, n: number): string => new Date((d2n(d) + n) * 864e5).toISOString().slice(0, 10);
export function addMeses(d: string, m: number): string {
  const [y, mo, da] = d.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + m, da)).toISOString().slice(0, 10);
}
/** A segunda-feira da semana de `d`. */
export function segundaFeira(d: string): string {
  const w = new Date(d + "T00:00:00Z").getUTCDay();
  return addDias(d, -((w + 6) % 7));
}
/** Quantas semanas vai `d` à frente (ou atrás) da semana de hoje (0 = esta semana). */
export const semanaDe = (d: string, hoje = hojeFrota()): number => Math.round((d2n(segundaFeira(d)) - d2n(segundaFeira(hoje))) / 7);
/** A ligação para o calendário das Atribuições na semana de `d`. */
export const linkCalendario = (d: string): string => {
  const s = semanaDe(d);
  return s ? `/frota/atribuicoes?semana=${s}` : "/frota/atribuicoes";
};

export const fData = (d: string | null | undefined): string => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
export const fDataC = (d: string | null | undefined): string => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const eurFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
export const fEur = (n: number | null | undefined): string => eurFmt.format(n || 0);
export const fNum = (n: number | null | undefined, dec = 0): string =>
  new Intl.NumberFormat("pt-PT", { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(n || 0);
export const fKm = (n: number | null | undefined): string => fNum(n) + " km";
export const diaSemana = (d: string): string =>
  new Intl.DateTimeFormat("pt-PT", { weekday: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z")).replace(".", "");
export const diaLongo = (d: string): string =>
  new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
export const fQuando = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: FUSO }).format(d);
};

export const soma = <T,>(a: readonly T[], f: (x: T) => number | undefined | null): number => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
/** A primeira letra em maiúscula. */
export const maiuscula = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** Número de um campo de formulário ("1 234,5" → 1234.5); vazio ou inválido → null. */
export function numero(v: string | undefined | null): number | null {
  const t = String(v ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}
