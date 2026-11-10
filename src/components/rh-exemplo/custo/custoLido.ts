/**
 * O custo de cada pessoa num mes, sem React: serve os hooks do ecra e os testes.
 *
 * A RETRIBUICAO do mes vem de fora (`PessoaParaCusto.retribuicaoMes` = o total bruto estimado do processamento salarial
 * real), nunca de uma conta repetida aqui. Os valores avulsos vem da base (os lancamentos pontuais do periodo, passados
 * por `avulsosReais`, so os manuais); os equipamentos e as excecoes de taxa tambem vem da base e
 * entram por parametro (`DadosCusto`): esta conta nao le store nenhum para eles.
 */
import { lerCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { arredondar } from "@/components/rh-exemplo/lib/custo";
import { custoDoMes, type CustoDoMes, type AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import {
  composicaoDoCusto,
  montarLinhaCusto,
  type ContextoCusto,
  type LinhaCusto,
  type ParteCusto,
  type PessoaParaCusto,
} from "@/components/rh-exemplo/lib/custoOrganizacao";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import type { EstimadoPeloCargo, RazaoSemEstimativa } from "@/components/rh-exemplo/lib/estimativaCusto";

export interface CustoDaPessoa {
  mes: string;
  atual: CustoDoMes;
  /** A retribuicao do mes: o total bruto estimado do processamento (`null` = sem retribuicao registada). */
  retribuicaoMes: number | null;
  /** `retribuicaoMes` e uma ESTIMATIVA pelo salario do cargo (a pessoa nao tem retribuicao definida); ausente quando e a retribuicao real. */
  estimadoPeloCargo?: EstimadoPeloCargo;
  /** Sem retribuicao e sem estimativa possivel: a razao, para o ecra a dizer em texto. */
  razaoSemValor?: RazaoSemEstimativa;
  /** As horas feitas que entram na conta; `null` = sem horas (mes fechado sem valores gravados): nunca um 0 inventado. */
  horasFeitas: number | null;
  /** Os acumulados precisam do calculo de cada mes anterior, que ainda nao esta ligado: `null` = sem valor. */
  acumuladoAno: number | null;
  acumuladoAdmissao: number | null;
  avulsos: AvulsoCusto[];
  equipamentos: EquipamentoPessoa[];
  taxaExcecao: number | null;
  composicao: ParteCusto[];
}

/**
 * O que vem da base e entra na conta: os equipamentos e as excecoes de taxa. Passa-se por parametro (os hooks
 * `useEquipamentosCusto` e `useCustoExcecoes` dao-nos): nunca se le de um store. A TSU e fixa e o seguro e do cargo (vem na pessoa).
 */
export interface DadosCusto {
  equipamentos: readonly EquipamentoPessoa[];
  excecoes: Readonly<Record<string, number | null>>;
}

/** `avulsosReais` (os lancamentos da base) substituem os do store em memoria; sem eles, usa-se o store (so os testes antigos). */
const contextoDe = (mes: string, dados: DadosCusto, avulsosReais?: readonly AvulsoCusto[], horasRealizadas?: ReadonlyMap<string, number>): ContextoCusto => ({
  mes,
  avulsos: avulsosReais ?? lerCusto().avulsos,
  equipamentos: dados.equipamentos,
  excecoes: dados.excecoes,
  horasRealizadas,
});

/** O custo de todas as pessoas dadas, num mes. */
export function linhasDaOrganizacao(
  mes: string,
  pessoas: readonly PessoaParaCusto[],
  dados: DadosCusto,
  avulsosReais?: readonly AvulsoCusto[],
  horasRealizadas?: ReadonlyMap<string, number>,
): LinhaCusto[] {
  const contexto = contextoDe(mes, dados, avulsosReais, horasRealizadas);
  return pessoas.map((pessoa) => montarLinhaCusto(pessoa, contexto));
}

/**
 * O custo de uma pessoa num mes. `horasFeitas` sao as horas realmente trabalhadas no mes (relatorio de assiduidade).
 */
export function custoDaPessoa(pessoa: PessoaParaCusto, mes: string, horasFeitas: number | null, dados: DadosCusto, avulsosReais?: readonly AvulsoCusto[]): CustoDaPessoa {
  const { equipamentos, excecoes } = dados;
  const avulsos = avulsosReais ?? lerCusto().avulsos;
  const atual = custoDoMes({
    mes,
    salarioMes: pessoa.retribuicaoMes,
    avulsos: avulsos.filter((a) => a.pessoaId === pessoa.pessoaId),
    equipamentos: equipamentos.filter((e) => e.pessoaId === pessoa.pessoaId),
    seguroPct: pessoa.seguroPct ?? null,
    seguroDesconhecido: pessoa.seguroDesconhecido,
    decomposicao: pessoa.decomposicao ?? null,
    estimado: pessoa.estimadoPeloCargo !== undefined,
    excecaoTaxa: excecoes[pessoa.pessoaId] ?? null,
    horasSemanais: pessoa.horasSemanais,
    horasFeitas: arredondar(horasFeitas ?? 0),
  });
  const retribuicaoMes = atual.parteSujeita;
  return {
    mes,
    atual,
    retribuicaoMes,
    ...(pessoa.estimadoPeloCargo ? { estimadoPeloCargo: pessoa.estimadoPeloCargo } : {}),
    ...(pessoa.razaoSemValor ? { razaoSemValor: pessoa.razaoSemValor } : {}),
    horasFeitas,
    acumuladoAno: null,
    acumuladoAdmissao: null,
    avulsos: avulsos.filter((a) => a.pessoaId === pessoa.pessoaId),
    equipamentos: equipamentos.filter((e) => e.pessoaId === pessoa.pessoaId),
    taxaExcecao: excecoes[pessoa.pessoaId] ?? null,
    composicao: composicaoDoCusto(
      { retribuicao: retribuicaoMes ?? 0, avulsos: atual.avulsos, encargos: atual.encargosTaxa, seguro: atual.seguro, equipamentos: atual.outrosCustos },
      atual.total,
    ),
  };
}
