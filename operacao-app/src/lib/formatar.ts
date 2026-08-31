/**
 * Como os números aparecem a quem os lê.
 *
 * Num sítio só, porque "1234.5" e "1 234,50 €" na mesma página é a diferença
 * entre um relatório que se entrega e um que se explica.
 */

const EUROS = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

/** Nulo vira travessão, não "0,00 €" — não é a mesma coisa. */
export function euros(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? "—" : EUROS.format(n);
}

/** Com sinal à frente, porque num desvio o sinal é a informação toda. */
export function eurosComSinal(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return (n > 0 ? "+" : "") + EUROS.format(n);
}

export function percentagemComSinal(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} %`;
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function data(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
