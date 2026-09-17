/**
 * O total bruto estimado do mes de UMA pessoa, a partir de dados JA
 * calculados noutro sitio (assiduidade, retribuicao, codigos activos da
 * organizacao, lancamentos do periodo). Funcao pura: sem React, sem I/O, sem
 * `Date.now()`/`Math.random()`. So aritmetica sobre o que entra.
 *
 * NAO E UM MOTOR DE PROCESSAMENTO SALARIAL COMPLETO
 * ---------------------------------------------------
 * E uma ESTIMATIVA para o ecra ver antes de fechar o periodo -- os valores
 * legais exactos (retencoes, seguranca social, IRS) ficam fora de ambito.
 *
 * `diasDescansoTrabalhado`: LACUNA CONHECIDA
 * -------------------------------------------
 * `TotaisRelatorioMensal` (useRelatorioAssiduidadeMensal.ts) tem
 * `minutosDescansoTrabalhado` mas NAO tem uma contagem de DIAS de descanso
 * trabalhado equivalente a `diasFeriadoTrabalhados`. Este modulo aceita
 * `diasDescansoTrabalhado` como campo separado na entrada (o chamador decide
 * como o obter) precisamente porque nao existe ainda no relatorio de origem --
 * nao se inventou aqui uma contagem que a base/relatorio nao fornece.
 */
import type {
  HrCodigoProcessamento,
  HrCodigoProcessamentoOrigemAutomatica,
  HrProcessamentoLancamento,
} from "@/types/hr";
import type { DiaRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

export type Periodicidade = "hora" | "diaria" | "semanal" | "mensal" | "anual";

export interface RetribuicaoParaCalculo {
  valorBase: number;
  periodicidade: Periodicidade;
  duodecimosPct: 0 | 50 | 100 | null;
  /** Excepcao por pessoa -- ganha a regra da organizacao quando preenchida. */
  subsidioAlimentacaoPessoa: number | null;
}

export type OrigemAutomaticaCodigo = HrCodigoProcessamentoOrigemAutomatica;

export interface EntradaProcessamentoPessoa {
  totais: {
    planeadoMinutos: number;
    realizadoMinutos: number;
    minutosExtraNormal: number;
    minutosFeriadoTrabalhado: number;
    minutosDescansoTrabalhado: number;
    horasExtraNoturnasMinutos: number;
    diasFeriadoTrabalhados: number;
    /** Ver nota de topo do ficheiro -- ainda nao existe em `TotaisRelatorioMensal`. */
    diasDescansoTrabalhado: number;
  };
  diasElegiveisSubsidio: number;
  retribuicao: RetribuicaoParaCalculo | null;
  horasSemanaisEquivalentes: number | null;
  /** So os codigos ACTIVOS da organizacao. */
  codigos: readonly HrCodigoProcessamento[];
  /** Os lancamentos do periodo, da pessoa. */
  lancamentos: readonly HrProcessamentoLancamento[];
  regraSubsidio: { valorDiario: number } | null;
}

export type AvisoProcessamento =
  | "sem_retribuicao"
  | "sem_horas_semanais"
  | "periodicidade_nao_convertivel"
  | "duodecimos_por_decidir"
  | "duodecimos_50_aproximado"
  | "sem_regra_subsidio"
  | "sem_horas_planeadas_no_mes";

export interface LinhaCodigoAplicado {
  codigoId: string;
  codigo: string;
  nome: string;
  /** `null` = `valor_fixo_mensal` sem origem automatica. */
  origem: OrigemAutomaticaCodigo | null;
  horas: number | null;
  valor: number;
}

export interface ResultadoProcessamentoPessoa {
  valorHoraReal: number | null;
  baseMes: number | null;
  divisorDuodecimos: number | null;
  linhasAutomaticas: readonly LinhaCodigoAplicado[];
  totalCodigosAutomaticos: number;
  descontoFaltas: number;
  subsidioAlimentacao: number;
  lancamentosPontuais: number;
  totalBrutoEstimado: number | null;
  avisos: readonly AvisoProcessamento[];
}

/** Minutos/ocorrencias por origem automatica, para os dois modos calculaveis. */
const MINUTOS_POR_ORIGEM: Record<OrigemAutomaticaCodigo, keyof EntradaProcessamentoPessoa["totais"]> = {
  horas_extra: "minutosExtraNormal",
  horas_extra_noturnas: "horasExtraNoturnasMinutos",
  feriado_trabalhado: "minutosFeriadoTrabalhado",
  descanso_trabalhado: "minutosDescansoTrabalhado",
};

const OCORRENCIAS_POR_ORIGEM: Partial<Record<OrigemAutomaticaCodigo, keyof EntradaProcessamentoPessoa["totais"]>> = {
  feriado_trabalhado: "diasFeriadoTrabalhados",
  descanso_trabalhado: "diasDescansoTrabalhado",
  // horas_extra / horas_extra_noturnas nao tem contagem de ocorrencias --
  // ver combinacao nao suportada mais abaixo.
};

/**
 * Retribuicao mensal equivalente `R`, a partir do valor base e periodicidade.
 * `null` quando nao ha retribuicao, falta um dado necessario, ou a
 * periodicidade nao e convertivel (diaria -- nao se inventam dias uteis do mes).
 */
function calcularRetribuicaoMensal(
  retribuicao: RetribuicaoParaCalculo | null,
  horasSemanaisEquivalentes: number | null,
  avisos: AvisoProcessamento[],
): number | null {
  if (!retribuicao) {
    avisos.push("sem_retribuicao");
    return null;
  }
  switch (retribuicao.periodicidade) {
    case "mensal":
      return retribuicao.valorBase;
    case "anual":
      return retribuicao.valorBase / 12;
    case "semanal":
      return (retribuicao.valorBase * 52) / 12;
    case "hora":
      if (horasSemanaisEquivalentes === null) {
        avisos.push("sem_horas_semanais");
        return null;
      }
      return (retribuicao.valorBase * horasSemanaisEquivalentes * 52) / 12;
    case "diaria":
      avisos.push("periodicidade_nao_convertivel");
      return null;
    default:
      return null;
  }
}

/**
 * Valor da hora REAL -- baseado nas horas efectivamente planeadas do mes a
 * processar, nao numa media anual. `null` se `baseMes` for `null` ou se nao
 * houver horas planeadas positivas neste mes (`planeadoMinutos <= 0`), caso
 * em que emite o aviso `sem_horas_planeadas_no_mes` -- sem esta guarda,
 * `baseMes / 0` daria `Infinity` e contaminaria todo o resultado
 * (`totalCodigosAutomaticos`, `totalBrutoEstimado`).
 */
function calcularValorHoraReal(
  baseMes: number | null,
  planeadoMinutos: number,
  avisos: AvisoProcessamento[],
): number | null {
  if (baseMes === null) return null;
  if (planeadoMinutos <= 0) {
    avisos.push("sem_horas_planeadas_no_mes");
    return null;
  }
  return baseMes / (planeadoMinutos / 60);
}

/**
 * Divisor de duodecimos e o aviso correspondente.
 *
 * `50` usa uma APROXIMACAO LINEAR (divisor 13) ASSUMIDA, nao confirmada com a
 * contabilidade: a mistura exacta do regime a 50% -- metade de cada subsidio
 * diluida no mes, metade paga a parte -- ainda esta por decidir. O divisor
 * 13 e so um ponto intermedio entre 14 (0%) e 12 (100%), nao o calculo legal
 * definitivo.
 */
function calcularDivisorDuodecimos(
  duodecimosPct: 0 | 50 | 100 | null,
  avisos: AvisoProcessamento[],
): number {
  if (duodecimosPct === null) {
    avisos.push("duodecimos_por_decidir");
    return 14;
  }
  if (duodecimosPct === 50) {
    avisos.push("duodecimos_50_aproximado");
    return 13;
  }
  // 12 + 2 * (1 - pct/100): 0 -> 14, 100 -> 12.
  return 12 + 2 * (1 - duodecimosPct / 100);
}

/**
 * As linhas dos codigos automaticos aplicados a este mes desta pessoa.
 *
 * IMPORTANTE -- decisao de produto ja confirmada, nao se reabre aqui: as
 * horas nocturnas (`horas_extra_noturnas`) sao TRANSVERSAIS -- empilham com
 * feriado/descanso trabalhado, NAO se subtraem de la. Se existirem codigos
 * activos para `feriado_trabalhado` E `horas_extra_noturnas` na mesma
 * organizacao, AMBOS entram na lista e os dois valores somam-se ao total --
 * nao e uma escolha entre um dos dois. Nao "corrigir" isto para tirar a
 * dupla contagem: nao e dupla contagem, e a mesma hora vista por dois
 * angulos que a organizacao decidiu pagar os dois.
 */
function calcularLinhasAutomaticas(
  codigos: readonly HrCodigoProcessamento[],
  totais: EntradaProcessamentoPessoa["totais"],
  valorHoraReal: number | null,
): LinhaCodigoAplicado[] {
  const linhas: LinhaCodigoAplicado[] = [];

  for (const codigo of codigos) {
    if (!codigo.activo) continue;

    if (codigo.modo_calculo === "valor_fixo_mensal") {
      // Nunca tem origem automatica (CHECK na base) -- entra sempre, uma vez.
      linhas.push({
        codigoId: codigo.id,
        codigo: codigo.codigo,
        nome: codigo.nome,
        origem: null,
        horas: null,
        valor: codigo.valor_fixo ?? 0,
      });
      continue;
    }

    const origem = codigo.origem_automatica;
    if (!origem) continue;

    if (codigo.modo_calculo === "percentagem_hora_normal") {
      const minutos = totais[MINUTOS_POR_ORIGEM[origem]];
      const horas = minutos / 60;
      const percentagem = codigo.percentagem ?? 0;
      const valor = valorHoraReal === null ? 0 : horas * valorHoraReal * (percentagem / 100);
      linhas.push({
        codigoId: codigo.id,
        codigo: codigo.codigo,
        nome: codigo.nome,
        origem,
        horas,
        valor,
      });
      continue;
    }

    if (codigo.modo_calculo === "valor_fixo_ocorrencia") {
      const chaveOcorrencias = OCORRENCIAS_POR_ORIGEM[origem];
      if (!chaveOcorrencias) {
        // horas_extra / horas_extra_noturnas nao tem contagem de ocorrencias
        // natural -- combinacao nao suportada, ignora-se silenciosamente (a
        // UI, num passo futuro, nao deve nem oferecer esta combinacao).
        continue;
      }
      const ocorrencias = totais[chaveOcorrencias];
      const valor = ocorrencias * (codigo.valor_fixo ?? 0);
      linhas.push({
        codigoId: codigo.id,
        codigo: codigo.codigo,
        nome: codigo.nome,
        origem,
        horas: null,
        valor,
      });
    }
    // "manual" nunca gera linha automatica.
  }

  return linhas;
}

function calcularSubsidioAlimentacao(
  retribuicao: RetribuicaoParaCalculo | null,
  regraSubsidio: { valorDiario: number } | null,
  diasElegiveisSubsidio: number,
  avisos: AvisoProcessamento[],
): number {
  const valorDia = retribuicao?.subsidioAlimentacaoPessoa ?? regraSubsidio?.valorDiario ?? null;
  if (valorDia === null) {
    avisos.push("sem_regra_subsidio");
    return 0;
  }
  return diasElegiveisSubsidio * valorDia;
}

/**
 * Quantos dias do mes dao direito ao subsidio de alimentacao: a pessoa
 * trabalhou pelo menos `minutosMinimosDia` nesse dia (regra da organizacao,
 * `hr_regras_subsidio_alimentacao.minutos_minimos_dia`) e o dia nao e uma
 * ausencia -- a mesma exclusao que `contaParaTotais` ja aplica em
 * `useRelatorioAssiduidadeMensal.ts` aos outros totais do relatorio.
 */
export function contarDiasElegiveisSubsidio(
  dias: readonly Pick<DiaRelatorioMensal, "estado" | "realizadoMinutos">[],
  minutosMinimosDia: number,
): number {
  return dias.reduce(
    (soma, dia) =>
      dia.estado !== "ausencia" && dia.realizadoMinutos >= minutosMinimosDia ? soma + 1 : soma,
    0,
  );
}

function calcularLancamentosPontuais(lancamentos: readonly HrProcessamentoLancamento[]): number {
  return lancamentos.reduce(
    (soma, lancamento) => (lancamento.anulado_em === null ? soma + lancamento.valor : soma),
    0,
  );
}

export function calcularProcessamentoPessoa(
  entrada: EntradaProcessamentoPessoa,
): ResultadoProcessamentoPessoa {
  const avisos: AvisoProcessamento[] = [];

  const retribuicaoMensal = calcularRetribuicaoMensal(
    entrada.retribuicao,
    entrada.horasSemanaisEquivalentes,
    avisos,
  );
  const divisorDuodecimos =
    retribuicaoMensal === null ? null : calcularDivisorDuodecimos(entrada.retribuicao?.duodecimosPct ?? null, avisos);
  const baseMes =
    retribuicaoMensal === null || divisorDuodecimos === null
      ? null
      : (retribuicaoMensal * 14) / divisorDuodecimos;

  const valorHoraReal = calcularValorHoraReal(baseMes, entrada.totais.planeadoMinutos, avisos);

  const linhasAutomaticas = calcularLinhasAutomaticas(entrada.codigos, entrada.totais, valorHoraReal);
  const totalCodigosAutomaticos = linhasAutomaticas.reduce((soma, linha) => soma + linha.valor, 0);

  const descontoFaltas =
    valorHoraReal === null
      ? 0
      : (Math.max(entrada.totais.planeadoMinutos - entrada.totais.realizadoMinutos, 0) / 60) *
        valorHoraReal;

  const subsidioAlimentacao = calcularSubsidioAlimentacao(
    entrada.retribuicao,
    entrada.regraSubsidio,
    entrada.diasElegiveisSubsidio,
    avisos,
  );

  const lancamentosPontuais = calcularLancamentosPontuais(entrada.lancamentos);

  // Nunca negativo: mesmo que o desconto de faltas supere a base (a pessoa
  // nao trabalhou nenhum dos dias planeados), o total fica 0, nao uma divida
  // da pessoa a empresa. So se aplica quando ha base para calcular -- `null`
  // continua `null`, essa lacuna nao muda aqui.
  const totalBrutoEstimado =
    baseMes === null
      ? null
      : Math.max(
          0,
          baseMes + totalCodigosAutomaticos - descontoFaltas + subsidioAlimentacao + lancamentosPontuais,
        );

  return {
    valorHoraReal,
    baseMes,
    divisorDuodecimos,
    linhasAutomaticas,
    totalCodigosAutomaticos,
    descontoFaltas,
    subsidioAlimentacao,
    lancamentosPontuais,
    totalBrutoEstimado,
    avisos,
  };
}
