/** "2026-10-13" ou ISO → "13/10/2026" (sem mudar de dia por causa do fuso). */
export function formatarData(valor: string | null | undefined): string {
  if (!valor) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (m && valor.length === 10) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
