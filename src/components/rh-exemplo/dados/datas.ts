/** Datas relativas a hoje, para os dados de exemplo nunca "envelhecerem". */
const MS_DIA = 24 * 60 * 60 * 1000;

/** Hoje em AAAA-MM-DD (UTC, como o resto do módulo). */
export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Hoje deslocado `dias` (negativo = passado). */
export function diaIso(dias: number): string {
  const base = Date.parse(`${hojeIso()}T00:00:00Z`);
  return new Date(base + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Dia da semana de uma data ISO: 0 = domingo .. 6 = sábado. */
export function diaDaSemana(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Minutos entre dois "HH:MM". */
export function minutosEntre(inicio: string, fim: string): number {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  return hf * 60 + mf - (hi * 60 + mi);
}
