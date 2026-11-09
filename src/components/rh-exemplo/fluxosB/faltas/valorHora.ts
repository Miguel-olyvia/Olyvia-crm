/**
 * O valor da hora usado no desconto de uma falta.
 *
 * `valorHoraDoCalculo` e o valor REAL: o do processamento salarial do mes da falta (base do mes a dividir pelas horas
 * planeadas do mes), o mesmo que a «Visao geral» e o «Calculo do mes» usam para descontar faltas. Sem retribuicao ou sem
 * horas planeadas no mes devolve `valorHora: null` e NAO inventa um valor.
 *
 * `valorHoraDaFicha` e o valor de EXEMPLO (retribuicao mensal da ficha em memoria a dividir por horas semanais x 4, ou
 * 6,25 EUR do documento): ja nao serve o cartao do desconto da falta; ainda serve a justificacao do dia, que nao esta
 * ligada a base.
 */
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { ResultadoCalculoReal } from "@/components/rh-exemplo/processamento/calculoReal";
import { valorHoraDeExemplo } from "@/components/rh-exemplo/lib/faltasB";

export interface ValorHoraReal {
  /** `null` = nao se pode calcular (sem retribuicao ou sem horas planeadas no mes). */
  valorHora: number | null;
  /** A base do mes (retribuicao mensal ja com os duodecimos). */
  baseMes: number | null;
  horasPlaneadas: number;
}

export function valorHoraDoCalculo(calculo: ResultadoCalculoReal | null): ValorHoraReal | null {
  if (!calculo) return null;
  return {
    valorHora: calculo.resultado.valorHoraReal,
    baseMes: calculo.resultado.baseMes,
    horasPlaneadas: calculo.totais.planeadoMinutos / 60,
  };
}

export interface ValorHora {
  valorHora: number;
  valorMensal: number | null;
  horasSemanais: number | null;
  /** `true` quando nao ha dados na ficha e se usou o valor do documento. */
  porOmissao: boolean;
}

const VALOR_DO_DOCUMENTO = 6.25;

/** O ordenado mensal equivalente de uma retribuicao em aberto: mensal, semanal (x 52 / 12) ou anual (/ 12); as outras nao se convertem aqui. */
function valorMensalDe(r: { valor_base: number; periodicidade: string }): number | null {
  if (r.periodicidade === "mensal") return r.valor_base;
  if (r.periodicidade === "semanal") return (r.valor_base * 52) / 12;
  if (r.periodicidade === "anual") return r.valor_base / 12;
  return null;
}

export function valorHoraDaFicha(ficha: FichaRh | null | undefined): ValorHora {
  const aberta = ficha?.retribuicoes.find((r) => r.valido_ate === null);
  const valorMensal = aberta ? valorMensalDe(aberta) : null;
  const horas = ficha?.horasVersoes.find((h) => h.valido_ate === null)?.horas_semanais_equivalentes ?? null;
  if (valorMensal === null || !horas || horas <= 0) {
    return { valorHora: VALOR_DO_DOCUMENTO, valorMensal: null, horasSemanais: null, porOmissao: true };
  }
  return {
    valorHora: valorHoraDeExemplo(valorMensal, horas),
    valorMensal,
    horasSemanais: horas,
    porOmissao: false,
  };
}
