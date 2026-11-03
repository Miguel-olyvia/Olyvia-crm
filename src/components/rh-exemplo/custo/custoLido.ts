/**
 * O custo de cada pessoa num mes, sem React: serve os hooks do ecra e os testes.
 *
 * A RETRIBUICAO do mes vem de fora (`PessoaParaCusto.retribuicaoMes` = o total bruto estimado do processamento salarial
 * real), nunca de uma conta repetida aqui. Os valores avulsos vem da base (os lancamentos pontuais do periodo, passados
 * por `avulsosReais`); os equipamentos, as definicoes (taxa, seguro, km, dia) e as excecoes de taxa tambem vem da base e
 * entram por parametro (`DadosCusto`): esta conta nao le store nenhum para eles.
 */
import { lerCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { arredondar } from "@/components/rh-exemplo/lib/custo";
import { custoDoMes, type CustoDoMes, type AvulsoCusto, type DefinicoesCusto } from "@/components/rh-exemplo/lib/custoMes";
import {
  composicaoDoCusto,
  montarLinhaCusto,
  SALDO_BANCO_HORAS_EXEMPLO,
  type ContextoCusto,
  type LinhaCusto,
  type ParteCusto,
  type PessoaParaCusto,
} from "@/components/rh-exemplo/lib/custoOrganizacao";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";

export interface CustoDaPessoa {
  mes: string;
  atual: CustoDoMes;
  /** A retribuicao do mes: o total bruto estimado do processamento (`null` = sem retribuicao registada). */
  retribuicaoMes: number | null;
  /** Os acumulados precisam do calculo de cada mes anterior, que ainda nao esta ligado: `null` = sem valor. */
  acumuladoAno: number | null;
  acumuladoAdmissao: number | null;
  avulsos: AvulsoCusto[];
  equipamentos: EquipamentoPessoa[];
  taxaExcecao: number | null;
  composicao: ParteCusto[];
}

/**
 * O que vem da base e entra na conta: os equipamentos, as definicoes (por organizacao) e as excecoes de taxa. Passa-se por
 * parametro (os hooks `useEquipamentosCusto`, `useCustoDefinicoes` e `useCustoExcecoes` dao-nos): nunca se le de um store.
 */
export interface DadosCusto {
  equipamentos: readonly EquipamentoPessoa[];
  definicoes: DefinicoesCusto;
  excecoes: Readonly<Record<string, number | null>>;
}

/** `avulsosReais` (os lancamentos da base) substituem os do store em memoria; sem eles, usa-se o store (so os testes antigos). */
const contextoDe = (mes: string, dados: DadosCusto, avulsosReais?: readonly AvulsoCusto[]): ContextoCusto => ({
  mes,
  avulsos: avulsosReais ?? lerCusto().avulsos,
  equipamentos: dados.equipamentos,
  definicoes: dados.definicoes,
  excecoes: dados.excecoes,
});

/** O custo de todas as pessoas dadas, num mes. */
export function linhasDaOrganizacao(mes: string, pessoas: readonly PessoaParaCusto[], dados: DadosCusto, avulsosReais?: readonly AvulsoCusto[]): LinhaCusto[] {
  const contexto = contextoDe(mes, dados, avulsosReais);
  return pessoas.map((pessoa) => montarLinhaCusto(pessoa, contexto));
}

/**
 * O custo de uma pessoa num mes. `horasFeitas` sao as horas realmente trabalhadas no mes (relatorio de assiduidade);
 * o saldo do banco de horas continua a ser o valor de exemplo (o banco de horas nao esta ligado a base).
 */
export function custoDaPessoa(pessoa: PessoaParaCusto, mes: string, horasFeitas: number, dados: DadosCusto, avulsosReais?: readonly AvulsoCusto[]): CustoDaPessoa {
  const { equipamentos, definicoes, excecoes } = dados;
  const avulsos = avulsosReais ?? lerCusto().avulsos;
  const atual = custoDoMes({
    mes,
    salarioMes: pessoa.retribuicaoMes,
    avulsos: avulsos.filter((a) => a.pessoaId === pessoa.pessoaId),
    equipamentos: equipamentos.filter((e) => e.pessoaId === pessoa.pessoaId),
    definicoes,
    excecaoTaxa: excecoes[pessoa.pessoaId] ?? null,
    horasSemanais: pessoa.horasSemanais,
    saldoHoras: SALDO_BANCO_HORAS_EXEMPLO,
    horasFeitas: arredondar(horasFeitas),
  });
  const retribuicaoMes = atual.parteSujeita;
  return {
    mes,
    atual,
    retribuicaoMes,
    acumuladoAno: null,
    acumuladoAdmissao: null,
    avulsos: avulsos.filter((a) => a.pessoaId === pessoa.pessoaId),
    equipamentos: equipamentos.filter((e) => e.pessoaId === pessoa.pessoaId),
    taxaExcecao: excecoes[pessoa.pessoaId] ?? null,
    composicao: composicaoDoCusto(
      { retribuicao: retribuicaoMes ?? 0, avulsos: atual.kmEAjudas, encargos: atual.encargosTaxa, seguro: atual.seguro, equipamentos: atual.outrosCustos },
      atual.total,
    ),
  };
}
