/**
 * O custo lido diretamente dos stores de exemplo (sem React): serve os hooks do ecrã e os testes. A retribuição de cada
 * pessoa no mês é a do «Cálculo do mês» (`calcularMes`), nunca uma conta repetida aqui.
 */
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { lerCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { lerFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { calcularMes, fichasDoCalculo } from "@/components/rh-exemplo/fluxosC/salarioEntrada";
import { mesDaData } from "@/components/rh-exemplo/lib/custo";
import { acumulados, mesesEntre, type AvulsoCusto, type CustoDoMes } from "@/components/rh-exemplo/lib/custoMes";
import {
  composicaoDoCusto,
  custoDaPessoaNoMes,
  montarLinhaCusto,
  type ContextoCusto,
  type LinhaCusto,
  type ParteCusto,
} from "@/components/rh-exemplo/lib/custoOrganizacao";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { pessoaParaCusto } from "./pessoaParaCusto";

export interface CustoDaPessoa {
  mes: string;
  atual: CustoDoMes;
  /** A retribuição do mês: o total bruto do «Cálculo do mês» (`null` = sem retribuição registada). */
  retribuicaoMes: number | null;
  acumuladoAno: number;
  acumuladoAdmissao: number;
  avulsos: AvulsoCusto[];
  equipamentos: EquipamentoPessoa[];
  taxaExcecao: number | null;
  composicao: ParteCusto[];
}

const dividirMes = (mes: string): [number, number] => {
  const [ano, m] = mes.split("-").map(Number);
  return [ano || 0, m || 1];
};

const contextoDe = (mes: string): ContextoCusto => {
  const { avulsos, equipamentos, definicoes, excecoes } = lerCusto();
  return { mes, avulsos, equipamentos, definicoes, excecoes };
};

/** O custo de todas as pessoas que entram no «Cálculo do mês» nesse mês. */
export function linhasDaOrganizacao(mes: string): LinhaCusto[] {
  const estado = lerEstado();
  const [ano, m] = dividirMes(mes);
  const calculo = calcularMes(fichasDoCalculo(estado.fichas, estado.ordem, ano, m), lerFluxosC(), ano, m);
  return calculo.flatMap((linha) => {
    const ficha = estado.fichas[linha.pessoaId];
    return ficha ? [montarLinhaCusto(pessoaParaCusto(ficha, estado, linha.resultado.totalBruto), contextoDe(mes))] : [];
  });
}

function custoDoMesDaFicha(ficha: FichaRh, mes: string): CustoDoMes {
  const [ano, m] = dividirMes(mes);
  const retribuicao = calcularMes([ficha], lerFluxosC(), ano, m)[0]?.resultado.totalBruto ?? null;
  return custoDaPessoaNoMes(pessoaParaCusto(ficha, lerEstado(), retribuicao), contextoDe(mes));
}

/** O custo de uma pessoa num mês, com os acumulados do ano e desde a admissão (até esse mês, inclusive). */
export function custoLidoDaPessoa(pessoaId: string, mes: string): CustoDaPessoa | null {
  const ficha = lerEstado().fichas[pessoaId];
  if (!ficha) return null;
  const atual = custoDoMesDaFicha(ficha, mes);
  const admissao = ficha.pessoa.data_admissao ? mesDaData(ficha.pessoa.data_admissao) : null;
  const janeiro = `${mes.slice(0, 4)}-01`;
  const desde = admissao && admissao < janeiro ? admissao : janeiro;
  const totais = new Map(mesesEntre(desde, mes).map((x) => [x, x === mes ? atual.total : custoDoMesDaFicha(ficha, x).total] as const));
  const soma = acumulados(totais, admissao, mes);
  const { avulsos, equipamentos, excecoes } = lerCusto();
  const retribuicaoMes = atual.parteSujeita;
  return {
    mes, atual, retribuicaoMes, acumuladoAno: soma.ano, acumuladoAdmissao: soma.admissao,
    avulsos: avulsos.filter((a) => a.pessoaId === pessoaId),
    equipamentos: equipamentos.filter((e) => e.pessoaId === pessoaId),
    taxaExcecao: excecoes[pessoaId] ?? null,
    composicao: composicaoDoCusto(
      { retribuicao: retribuicaoMes ?? 0, avulsos: atual.kmEAjudas, encargos: atual.encargosTaxa, seguro: atual.seguro, equipamentos: atual.outrosCustos },
      atual.total,
    ),
  };
}
