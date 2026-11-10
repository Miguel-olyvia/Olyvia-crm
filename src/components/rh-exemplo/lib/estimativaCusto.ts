/**
 * A estimativa do custo pelo salario do cargo, SO para os Custos (o Processamento, o fecho e o calculo real nao a usam: la a
 * retribuicao continua a ser exigida, porque os duodecimos mudam o que se paga). Serve a pessoa que tem cargo mas ainda nao
 * tem retribuicao em vigor: em vez de tudo a zero, o custo parte do salario base do cargo, so se for MENSAL, e sempre marcado.
 *
 * Usa o cargo ACTUAL da pessoa, por isso so estima o mes corrente e os futuros (um mes passado ainda aberto fica sem valor: o
 * cargo e o salario podem ter sido outros). Usa `periodoDoCargoEm` (`cargosPeriodos.ts`) no primeiro dia do mes, mas em versao
 * estrita: um periodo que comeca depois desse dia nunca serve. Sem estimativa devolve a razao, para o ecra a dizer em texto.
 */
import type { Periodicidade } from "@/components/rh-exemplo/tipos";
import { hojeEmLisboa } from "@/lib/hr/periodoFolha";
import { periodoDoCargoEm, type HrCargoPeriodo } from "./cargosPeriodos";

/**
 * Porque nao ha estimativa: sem cargo, sem periodo de salario valido no mes, salario que nao e mensal, mes passado (o cargo
 * actual pode nao ser o de entao) ou falha a ler os periodos dos cargos (nao se sabe se ha salario).
 */
export type RazaoSemEstimativa = "sem_cargo" | "sem_periodo" | "nao_mensal" | "mes_passado" | "erro_periodos";

export interface EstimadoPeloCargo {
  cargo: string;
  /** O salario base mensal do cargo no mes (so o base, sem duodecimos nem subsidios). */
  salario: number;
}

export type EstimativaCargo = ({ estado: "estimado" } & EstimadoPeloCargo) | { estado: "sem"; razao: RazaoSemEstimativa };

export interface EntradaEstimativa {
  cargoId: string | null;
  cargoNome: string | null;
  periodos: readonly HrCargoPeriodo[];
  /** AAAA-MM. */
  mes: string;
  /** AAAA-MM-DD em Lisboa; omissao: hoje. So serve para os testes fixarem o dia. */
  hoje?: string;
}

const PERIODICIDADE_ESTIMAVEL: Periodicidade = "mensal";

export function estimativaPeloCargo({ cargoId, cargoNome, periodos, mes, hoje = hojeEmLisboa() }: EntradaEstimativa): EstimativaCargo {
  if (!cargoId) return { estado: "sem", razao: "sem_cargo" };
  if (mes < hoje.slice(0, 7)) return { estado: "sem", razao: "mes_passado" };
  const primeiroDia = `${mes}-01`;
  const periodo = periodoDoCargoEm(periodos, cargoId, primeiroDia);
  // `periodoDoCargoEm` devolve o primeiro periodo para datas anteriores a ele: aqui isso nao serve.
  if (!periodo || periodo.valido_de > primeiroDia || !(periodo.salario_base > 0)) return { estado: "sem", razao: "sem_periodo" };
  if (periodo.periodicidade !== PERIODICIDADE_ESTIMAVEL) return { estado: "sem", razao: "nao_mensal" };
  return { estado: "estimado", cargo: cargoNome ?? "", salario: periodo.salario_base };
}
