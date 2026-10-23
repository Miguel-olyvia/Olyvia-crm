/** Formatos de texto partilhados pelos ecrãs da frente C (pt-PT). */

/** 90 -> «1 h 30», 120 -> «2 h», 45 -> «45 min». */
export function minutosEmHoras(minutos: number): string {
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const texto = m === 0 ? `${h} h` : h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")}`;
  return minutos < 0 ? `−${texto}` : texto;
}

export function euros(valor: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);
}

/** AAAA-MM-DD -> DD/MM/AAAA. */
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** AAAA-MM -> «novembro de 2026». */
export function nomeDoMes(chave: string): string {
  const [a, m] = chave.split("-").map(Number);
  if (!a || !m) return chave;
  return new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, 1)));
}
