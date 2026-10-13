// Formatação em português para a área de custos.

/** 2454.55 → "2.454,55" (sempre 2 casas). */
export function formatarEur(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  // À mão: o pt-PT do Intl só agrupa a partir de 5 dígitos ("2454,55"), e a
  // base escreve "2.454,55". Assim o ecrã e as mensagens da base batem certo.
  const [int, dec] = Math.abs(Number(x)).toFixed(2).split(".");
  return (Number(x) < 0 ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
}

/** 31.93 → "31,9" (uma casa, sem o símbolo). */
export function formatarPct(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  return (Math.round(Number(x) * 10) / 10).toFixed(1).replace(".", ",");
}

/** Lê "1.234,5" ou "1234.5" → 1234.5. Vazio → null. */
export function lerNumero(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}
