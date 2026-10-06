/**
 * Texto -> numero, o unico do assistente de nova pessoa e do contrato.
 *
 * Vazio e ausencia (`null`), nao zero; ilegivel tambem e `null`. So se aceitam
 * numeros decimais escritos a mao (virgula ou ponto): `Number()` sozinho
 * aceitaria "0x10" (16), "1e3" (1000) e "0b11" (3), e num campo de horas ou de
 * subsidio isso gravava um valor que ninguem escreveu.
 */
const DECIMAL = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

export function numeroDe(valor: string): number | null {
  const limpo = valor.trim();
  if (limpo === "" || !DECIMAL.test(limpo)) return null;
  const n = Number(limpo.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
