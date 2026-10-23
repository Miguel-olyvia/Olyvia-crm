/**
 * O valor da hora de uma pessoa, para o calculo de exemplo do desconto: retribuicao mensal em vigor a dividir
 * pelas horas planeadas do mes (horas semanais x 4). Sem retribuicao mensal na ficha usa-se o valor do
 * documento (6,25 EUR = 1.000 EUR / 160 h) e diz-se que e de exemplo.
 */
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { valorHoraDeExemplo } from "@/components/rh-exemplo/lib/faltasB";

export interface ValorHora {
  valorHora: number;
  valorMensal: number | null;
  horasSemanais: number | null;
  /** `true` quando nao ha dados na ficha e se usou o valor do documento. */
  porOmissao: boolean;
}

const VALOR_DO_DOCUMENTO = 6.25;

export function valorHoraDaFicha(ficha: FichaRh | null | undefined): ValorHora {
  const retribuicao = ficha?.retribuicoes.find((r) => r.valido_ate === null && r.periodicidade === "mensal");
  const horas = ficha?.horasVersoes.find((h) => h.valido_ate === null)?.horas_semanais_equivalentes ?? null;
  if (!retribuicao || !horas || horas <= 0) {
    return { valorHora: VALOR_DO_DOCUMENTO, valorMensal: null, horasSemanais: null, porOmissao: true };
  }
  return {
    valorHora: valorHoraDeExemplo(retribuicao.valor_base, horas),
    valorMensal: retribuicao.valor_base,
    horasSemanais: horas,
    porOmissao: false,
  };
}
