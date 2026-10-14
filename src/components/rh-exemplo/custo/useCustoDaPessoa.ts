/** O custo de uma pessoa, calculado em memória: o mês de hoje, os acumulados e os valores avulsos dela. */
import { useMemo } from "react";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { arredondar, horasPrevistasDoMes, mesDaData, salarioMensal } from "@/components/rh-exemplo/lib/custo";
import {
  acumulados,
  custoDoMes,
  mesesEntre,
  type AvulsoCusto,
  type CustoDoMes,
  type EntradaCustoMes,
} from "@/components/rh-exemplo/lib/custoMes";
import type { Periodicidade } from "@/components/rh-exemplo/tipos";

/** Valores de exemplo (não vêm do banco de horas nem da assiduidade): só para mostrar a conta. */
export const SALDO_BANCO_HORAS_EXEMPLO = 3;
export const HORAS_FEITAS_A_MAIS_EXEMPLO = 2;
const HORAS_SEMANAIS_OMISSAO = 40;

interface Entrada {
  pessoaId: string;
  admissao: string | null;
  retribuicao: { valor_base: number; periodicidade: Periodicidade } | null;
  horasSemanais: number | null;
}

export interface CustoDaPessoa {
  mesAtual: string;
  atual: CustoDoMes;
  acumuladoAno: number;
  acumuladoAdmissao: number;
  avulsos: AvulsoCusto[];
  taxaExcecao: number | null;
}

export function useCustoDaPessoa({ pessoaId, admissao, retribuicao, horasSemanais }: Entrada): CustoDaPessoa {
  const todos = useCusto((e) => e.avulsos);
  const definicoes = useCusto((e) => e.definicoes);
  const excecao = useCusto((e) => e.excecoes[pessoaId] ?? null);

  return useMemo(() => {
    const avulsos = todos.filter((a) => a.pessoaId === pessoaId);
    const mesAtual = mesDaData(hojeIso());
    const semanais = horasSemanais ?? HORAS_SEMANAIS_OMISSAO;
    const entradaDoMes = (mes: string): EntradaCustoMes => {
      const previstas = horasPrevistasDoMes(semanais, mes);
      return {
        mes,
        salarioMes: salarioMensal(retribuicao, previstas),
        avulsos,
        definicoes,
        excecaoTaxa: excecao,
        horasSemanais: semanais,
        saldoHoras: SALDO_BANCO_HORAS_EXEMPLO,
        horasFeitas: arredondar(previstas + HORAS_FEITAS_A_MAIS_EXEMPLO),
      };
    };
    const inicio = admissao ? mesDaData(admissao) : mesAtual;
    const janeiro = `${mesAtual.slice(0, 4)}-01`;
    const desde = inicio < janeiro ? inicio : janeiro;
    const totais = new Map(mesesEntre(desde, mesAtual).map((m) => [m, custoDoMes(entradaDoMes(m)).total] as const));
    const soma = acumulados(totais, admissao ? mesDaData(admissao) : null, mesAtual);
    return { mesAtual, atual: custoDoMes(entradaDoMes(mesAtual)), acumuladoAno: soma.ano, acumuladoAdmissao: soma.admissao, avulsos, taxaExcecao: excecao };
  }, [todos, definicoes, excecao, pessoaId, admissao, retribuicao, horasSemanais]);
}
