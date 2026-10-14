/** Pequenos formatadores partilhados pelos ecras do horario por tipo. */

/** Segunda a domingo (indices de dia da semana, 0 = domingo). */
export const ORDEM_SEMANA: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/** 480 -> «8 h», 495 -> «8 h 15», 0 -> «0 h». */
export function formatarHorasMinutos(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${String(resto).padStart(2, "0")}`;
}

/** AAAA-MM-DD para mostrar, sem passar por fusos (dd/mm/aaaa). */
export function formatarData(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}

/** A hora a partir de um carimbo ISO, para mostrar (hh:mm, hora do navegador). */
export function formatarDataHora(carimbo: string): string {
  const data = new Date(carimbo);
  if (Number.isNaN(data.getTime())) return carimbo;
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ${dois(data.getHours())}:${dois(data.getMinutes())}`;
}

/** 25 -> «25,00 €» (na lingua escolhida). */
export function formatarEuros(valor: number, lingua: string): string {
  return new Intl.NumberFormat(lingua === "pt" ? "pt-PT" : "en-GB", { style: "currency", currency: "EUR" }).format(valor);
}
