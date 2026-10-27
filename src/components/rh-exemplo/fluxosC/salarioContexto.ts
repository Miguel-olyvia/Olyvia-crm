/**
 * Ponte para o calculo do salario DE EXEMPLO (fichas e stores em memoria). O «Cálculo do mês» e os «Custos» deixaram de o
 * usar: passaram ao processamento salarial real (`processamento/useCalculoReal`). Resta aqui o valor da hora de exemplo
 * que o cartao do banco de horas ainda le (esse ecra nao esta ligado a base). Só lê; nada aqui escreve em store.
 */
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { EstadoFluxosC } from "./dadosFluxosC";
import { entradaSalarioDaFicha } from "./salarioEntrada";
import { calcularSalario } from "./salarioRegras";

export { calcularMes, diasDeContratoNoMes, entradaSalarioDaFicha, fichasDoCalculo, horasSemanaisDaFicha, retribuicaoDoMes } from "./salarioEntrada";
export type { LinhaCalculoPessoa } from "./salarioEntrada";

/** Valor da hora da pessoa no mês, para o pagamento das horas extra (cálculo de exemplo). */
export function valorDaHoraDaFicha(ficha: FichaRh, c: EstadoFluxosC, ano: number, mes: number): number | null {
  return calcularSalario(entradaSalarioDaFicha(ficha, c, ano, mes)).valorHora;
}
