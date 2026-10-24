// Código de acompanhamento (DEN-2026-0042) e PIN de 6 dígitos. O gerador de números é injetável para os testes.

export type Aleatorio = () => number;

const PADRAO_CODIGO = /^DEN-(\d{4})-(\d{4})$/;

export const formatarCodigo = (ano: number, seq: number): string => `DEN-${ano}-${String(seq).padStart(4, "0")}`;

/** O código seguinte do ano: o maior número já usado nesse ano, mais um. */
export function proximoCodigo(codigos: readonly string[], ano: number): string {
  const usados = codigos.flatMap((c) => {
    const m = PADRAO_CODIGO.exec(c);
    return m && Number(m[1]) === ano ? [Number(m[2])] : [];
  });
  return formatarCodigo(ano, Math.max(0, ...usados) + 1);
}

/** Seis dígitos, com zeros à esquerda se for preciso. `aleatorio` devolve [0,1). */
export function gerarPin(aleatorio: Aleatorio = Math.random): string {
  const n = Math.min(999_999, Math.floor(aleatorio() * 1_000_000));
  return String(n).padStart(6, "0");
}

export const normalizarCodigo = (texto: string): string => texto.trim().toUpperCase().replace(/\s+/g, "");
export const normalizarPin = (texto: string): string => texto.replace(/\s+/g, "");

/** Procura a denúncia pelo par código + PIN. Quem chama não deve dizer qual dos dois falhou. */
export function acederComCodigo<T extends { codigo: string; pin: string }>(
  denuncias: readonly T[],
  codigo: string,
  pin: string,
): T | null {
  const c = normalizarCodigo(codigo);
  const p = normalizarPin(pin);
  return denuncias.find((d) => d.codigo === c && d.pin === p) ?? null;
}
