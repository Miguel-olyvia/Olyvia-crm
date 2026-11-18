// Valor por extenso em inglês (euros e cêntimos). O equivalente português continua em
// src/utils/contractVariables.ts (numberToPortugueseWords), onde sempre esteve.
//
// Inglês britânico: «one hundred and one», «one thousand and one». Negativos levam «minus».
// Trabalha em cêntimos inteiros, por isso um arredondamento nunca inventa «100 cêntimos».

const ATE_19 = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const DEZENAS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ESCALAS: Array<[number, string]> = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

function ate99(n: number): string {
  if (n < 20) return ATE_19[n];
  const unidade = n % 10;
  return DEZENAS[Math.floor(n / 10)] + (unidade > 0 ? `-${ATE_19[unidade]}` : "");
}

function ate999(n: number): string {
  const centenas = Math.floor(n / 100);
  const resto = n % 100;
  if (centenas === 0) return ate99(resto);
  const cabeca = `${ATE_19[centenas]} hundred`;
  return resto > 0 ? `${cabeca} and ${ate99(resto)}` : cabeca;
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const partes: string[] = [];
  let resto = n;
  for (const [valor, nome] of ESCALAS) {
    if (resto < valor) continue;
    const quociente = Math.floor(resto / valor);
    // Acima de mil milhões o quociente pode passar de 999: recorre-se a si própria.
    partes.push(`${valor === 1_000_000_000 ? inteiroPorExtenso(quociente) : ate999(quociente)} ${nome}`);
    resto %= valor;
  }
  if (resto > 0) partes.push(partes.length > 0 && resto < 100 ? `and ${ate99(resto)}` : ate999(resto));
  return partes.join(" ");
}

/** 392.37 → «three hundred and ninety-two euros and thirty-seven cents». */
export function numberToEnglishWords(num: number): string {
  const valor = Number.isFinite(num) ? num : 0;
  const totalCentimos = Math.round(Math.abs(valor) * 100);
  const euros = Math.floor(totalCentimos / 100);
  const centimos = totalCentimos % 100;
  let texto = `${inteiroPorExtenso(euros)} ${euros === 1 ? "euro" : "euros"}`;
  if (centimos > 0) texto += ` and ${ate99(centimos)} ${centimos === 1 ? "cent" : "cents"}`;
  return valor < 0 && totalCentimos > 0 ? `minus ${texto}` : texto;
}
