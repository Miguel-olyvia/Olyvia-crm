/**
 * Liga os dados de exemplo (fichas, assiduidade e stores da frente C) ao calculo do salario.
 * Só lê; nada aqui escreve em store. A entrada de cada pessoa vem de `salarioEntrada.ts`.
 */
import { useMemo } from "react";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { useFluxosC } from "./lojaFluxosC";
import type { EstadoFluxosC } from "./dadosFluxosC";
import { calcularMes, entradaSalarioDaFicha, fichasDoCalculo, type LinhaCalculoPessoa } from "./salarioEntrada";
import { calcularSalario } from "./salarioRegras";

export { calcularMes, diasDeContratoNoMes, entradaSalarioDaFicha, fichasDoCalculo, horasSemanaisDaFicha, retribuicaoDoMes } from "./salarioEntrada";
export type { LinhaCalculoPessoa } from "./salarioEntrada";

export function useCalculoDoMes(ano: number, mes: number): LinhaCalculoPessoa[] {
  const fichas = useEstadoRh((e) => e.fichas);
  const ordem = useEstadoRh((e) => e.ordem);
  const c = useFluxosC((e) => e);
  const faltas = useGestao((g) => g.faltas);
  const horarios = useFluxosB((e) => e.horarios);
  return useMemo(
    () => calcularMes(fichasDoCalculo(fichas, ordem, ano, mes), c, ano, mes),
    // As faltas e os horarios sao lidos directamente por `entradaSalarioDaFicha`; mudam o resultado, por isso recalcula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fichas, ordem, c, faltas, horarios, ano, mes],
  );
}

/** Valor da hora da pessoa no mês, para o pagamento das horas extra. */
export function valorDaHoraDaFicha(ficha: FichaRh, c: EstadoFluxosC, ano: number, mes: number): number | null {
  return calcularSalario(entradaSalarioDaFicha(ficha, c, ano, mes)).valorHora;
}
