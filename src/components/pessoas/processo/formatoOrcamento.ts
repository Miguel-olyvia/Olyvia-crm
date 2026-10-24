// Como o orçamento escreve euros, percentagens e números (guidelines E7): vírgula decimal, ponto nos milhares, o símbolo depois, com espaço.

/** `1476.02` -> "1.476,02 €" (sempre com dois decimais, arredondado ao cêntimo). */
export function eur(valor: number): string {
  const [inteiro, decimais] = (Math.round(valor * 100) / 100).toFixed(2).split(".");
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimais} €`;
}

/**
 * Uma margem (de 0 a 1) em percentagem com uma casa decimal, TRUNCADA e não arredondada: 27,96 % diz-se "27,9 %", para nunca
 * aparecer "margem de 28 %, abaixo do mínimo de 28 %". A folga de 1e-6 evita que o 28 % exato (0,27999999...) perca a décima.
 */
export function pct(margem: number): string {
  return `${(Math.floor(margem * 1000 + 1e-6) / 10).toString().replace(".", ",")} %`;
}

/** O número como se escreve num campo (vírgula decimal, sem zeros a mais). */
export const numeroParaTexto = (n: number): string => String(n).replace(".", ",");
