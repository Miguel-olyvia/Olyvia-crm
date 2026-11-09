/**
 * O resultado do processamento de UMA pessoa num mes, a partir do que a base ja devolveu (relatorio de assiduidade,
 * retribuicoes vigentes, codigos activos, lancamentos do periodo e a regra salarial em vigor). Funcao pura, sem React.
 *
 * E a MESMA conta do separador «Visao geral» (`calcularProcessamentoPessoa` + `escolherRetribuicaoVigente` +
 * `minutosTrabalhadosPorDia`): o «Calculo do mes», os «Custos» e o valor da hora do desconto de uma falta usam esta
 * funcao para nunca divergirem dela. Lacuna herdada do modulo real: `diasDescansoTrabalhado` fica a 0, porque
 * `TotaisRelatorioMensal` nao tem essa contagem (ver o cabecalho de `lib/processamentoTotais.ts`).
 */
import type { DiaRelatorioMensal, TotaisRelatorioMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";
import {
  escolherRetribuicaoVigente,
  type RetribuicaoVigenteLinha,
} from "@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao";
import {
  calcularProcessamentoPessoa,
  minutosTrabalhadosPorDia,
  type RegraParaCalculo,
  type ResultadoProcessamentoPessoa,
} from "@/components/rh-exemplo/lib/processamentoTotais";
import type { HrCodigoProcessamento, HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";

export interface EntradaCalculoReal {
  totais: TotaisRelatorioMensal;
  dias: readonly DiaRelatorioMensal[];
  /** Todas as versoes de retribuicao que tocam o mes (pode ser nenhuma). */
  versoes: readonly RetribuicaoVigenteLinha[];
  /** Ultimo dia do mes (AAAA-MM-DD): vale a retribuicao em vigor nesse dia. */
  ultimoDia: string;
  lancamentos: readonly HrProcessamentoLancamento[];
  /** So os codigos activos da organizacao. */
  codigosActivos: readonly HrCodigoProcessamento[];
  /** A regra salarial em vigor no ultimo dia do periodo; `null` = sem regra (o subsidio e o resto que dela depende ficam a 0). */
  regra: RegraParaCalculo | null;
  /** A pessoa tem direito a IHT (os direitos a km e ajudas ja se verificaram ao lancar). */
  direitoIht: boolean;
}

export interface ResultadoCalculoReal {
  resultado: ResultadoProcessamentoPessoa;
  valorBase: number | null;
  periodicidade: string | null;
  mudouAMeioDoMes: boolean;
  totais: TotaisRelatorioMensal;
}

/** Os minutos planeados e realizados que o fecho grava (os que o ecra Custos usa); `undefined` se a pessoa ainda nao tem calculo. */
export function minutosDoCalculo(
  calculo: { totais: { planeadoMinutos: number; realizadoMinutos: number } } | undefined,
): { planeado: number; realizado: number } | undefined {
  return calculo ? { planeado: calculo.totais.planeadoMinutos, realizado: calculo.totais.realizadoMinutos } : undefined;
}

export function calcularResultadoReal(entrada: EntradaCalculoReal): ResultadoCalculoReal {
  const { totais } = entrada;
  const { retribuicao, mudouAMeioDoMes } = escolherRetribuicaoVigente(entrada.versoes, entrada.ultimoDia);
  const resultado = calcularProcessamentoPessoa({
    totais: {
      planeadoMinutos: totais.planeadoMinutos,
      realizadoMinutos: totais.realizadoMinutos,
      // Margem de tempo: o desconto de faltas usa o que CONTA; sem margem e o realizado, como sempre.
      contadoMinutos: totais.contadoMinutos,
      // Horas extra aprovadas: os minutos por origem ja vem nos totais; a fonte so fica registada nas linhas gravadas.
      horasExtraFonte: totais.horasExtraFonte,
      minutosExtraNormal: totais.minutosExtraNormal,
      minutosFeriadoTrabalhado: totais.minutosFeriadoTrabalhado,
      minutosDescansoTrabalhado: totais.minutosDescansoTrabalhado,
      horasExtraNoturnasMinutos: totais.horasExtraNoturnasMinutos,
      minutosAusenciaRemunerada: totais.minutosAusenciaRemunerada ?? 0,
      faltas: totais.faltasParaDesconto ?? [],
      limiteFaltaPorDia: totais.limiteFaltaPorDia,
      diasFeriadoTrabalhados: totais.diasFeriadoTrabalhados,
      diasDescansoTrabalhado: 0,
    },
    minutosPorDia: minutosTrabalhadosPorDia(entrada.dias),
    minutosNoturnosPorFaixa: totais.minutosNoturnosPorFaixa ?? [],
    regra: entrada.regra,
    direitoIht: entrada.direitoIht,
    retribuicao: retribuicao
      ? {
          valorBase: retribuicao.valor_base,
          periodicidade: retribuicao.periodicidade,
          duodecimosPct: retribuicao.duodecimos_pct,
        }
      : null,
    codigos: entrada.codigosActivos,
    lancamentos: entrada.lancamentos,
  });
  return {
    resultado,
    valorBase: retribuicao?.valor_base ?? null,
    periodicidade: retribuicao?.periodicidade ?? null,
    mudouAMeioDoMes,
    totais,
  };
}

export interface TotalDoMes {
  /** Soma dos totais brutos estimados das pessoas que tem valor. */
  total: number;
  /** Quantas pessoas ficam de fora da soma por nao terem retribuicao (total `null`). */
  semValor: number;
}

/** O total bruto do mes: so entram as pessoas com valor, e diz-se quantas ficaram de fora. */
export function totalDoMes(resultados: Iterable<{ resultado: Pick<ResultadoProcessamentoPessoa, "totalBrutoEstimado"> }>): TotalDoMes {
  let total = 0;
  let semValor = 0;
  for (const r of resultados) {
    const valor = r.resultado.totalBrutoEstimado;
    if (valor === null) semValor += 1;
    else total += valor;
  }
  return { total, semValor };
}
