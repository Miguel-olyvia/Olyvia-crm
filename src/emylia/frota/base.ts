// O básico da Frota: o dia de hoje do exemplo, as datas, os formatos e o erro "de regra" (como base.ts do Inventário). Sem React.

/** Hoje, no exemplo da Frota: fixo, como no protótipo HTML (14/10/2026). */
export const HOJE = "2026-10-14";
/** O início do período dos custos e dos relatórios. */
export const INICIO_PERIODO = "2026-09-01";

/** Uma regra da Frota que recusa a ação: a mensagem é para quem usa. A base não muda (loja.ts). */
export class ErroFrota extends Error {}
export function falhar(msg: string): never { throw new ErroFrota(msg); }

export const d2n = (d: string): number => Date.parse(d + "T00:00:00Z") / 864e5;
/** Dias de hoje até `d` (negativo: já passou). */
export const dias = (d: string, hoje = HOJE): number => Math.round(d2n(d) - d2n(hoje));
export const addDias = (d: string, n: number): string => new Date((d2n(d) + n) * 864e5).toISOString().slice(0, 10);
export function addMeses(d: string, m: number): string {
  const [y, mo, da] = d.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + m, da)).toISOString().slice(0, 10);
}
/** `n` dias úteis depois de `d` (sem sábados nem domingos). */
export function diasUteis(d: string, n: number): string {
  let x = d, k = 0;
  while (k < n) {
    x = addDias(x, 1);
    const w = new Date(x + "T00:00:00Z").getUTCDay();
    if (w !== 0 && w !== 6) k++;
  }
  return x;
}

export const fData = (d: string | null | undefined): string => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
export const fDataC = (d: string | null | undefined): string => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const eurFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
export const fEur = (n: number | null | undefined): string => eurFmt.format(n || 0);
export const fNum = (n: number | null | undefined, dec = 0): string => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(n || 0);
export const fKm = (n: number): string => fNum(n) + " km";
export const diaSemana = (d: string): string =>
  new Intl.DateTimeFormat("pt-PT", { weekday: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z")).replace(".", "");
export const diaLongo = (d: string): string =>
  new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

export const soma = <T,>(a: readonly T[], f: (x: T) => number | undefined | null): number => a.reduce((s, x) => s + (f(x) || 0), 0);
let contador = 0;
/** Um id novo (o protótipo HTML usava Math.random; aqui um contador mais o relógio, para não repetir). */
export const uid = (p: string): string => p + Date.now().toString(36).slice(-4) + (++contador).toString(36);
/** A primeira letra em maiúscula ("em curso" → "Em curso"). */
export const maiuscula = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
