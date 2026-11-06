/**
 * O total bruto estimado do mes de UMA pessoa, a partir de dados JA
 * calculados noutro sitio (assiduidade, retribuicao, regra salarial em vigor,
 * codigos activos da organizacao, lancamentos do periodo). Funcao pura: sem
 * React, sem I/O, sem `Date.now()`/`Math.random()`. So aritmetica sobre o que
 * entra.
 *
 * NAO E UM MOTOR DE PROCESSAMENTO SALARIAL COMPLETO
 * ---------------------------------------------------
 * E uma ESTIMATIVA para o ecra ver antes de fechar o periodo -- os valores
 * legais exactos (retencoes, seguranca social, IRS) ficam fora de ambito.
 *
 * REGRAS SALARIAIS DA ORGANIZACAO (Entrega C)
 * --------------------------------------------
 * Os valores do subsidio de almoco, as percentagens das horas extra, as faixas
 * noturnas, o IHT, os km e as ajudas de custo vem da `regra` em vigor
 * (`hr_regras_salariais`), nunca da pessoa. Por pessoa existe so o DIREITO a
 * IHT, km e ajudas. O VALOR HORA e as conversoes por periodicidade NAO mudam.
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
  FaixaNoturna,
  HrCodigoProcessamento,
  HrCodigoProcessamentoOrigemAutomatica,
  HrProcessamentoLancamento,
  RegraSalarial,
} from "@/components/rh-exemplo/tipos";
import type { DiaRelatorioMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";

export type Periodicidade = "hora" | "diaria" | "semanal" | "mensal" | "anual";

export interface RetribuicaoParaCalculo {
  valorBase: number;
  periodicidade: Periodicidade;
  duodecimosPct: 0 | 50 | 100 | null;
}

/** O que o calculo usa da regra salarial em vigor (um subconjunto de `RegraSalarial`). */
export type RegraParaCalculo = Pick<
  RegraSalarial,
  | "subsidio_limite_min"
  | "subsidio_valor_hora"
  | "subsidio_valor_dia"
  | "he_pct_dia_util"
  | "he_pct_feriado"
  | "he_pct_descanso"
  | "iht_pct"
> & { noturnas: ReadonlyArray<Pick<FaixaNoturna, "percentagem" | "preco_hora">> };

export type OrigemAutomaticaCodigo = HrCodigoProcessamentoOrigemAutomatica;

export interface EntradaProcessamentoPessoa {
  totais: {
    planeadoMinutos: number;
    realizadoMinutos: number;
    minutosExtraNormal: number;
    minutosFeriadoTrabalhado: number;
    minutosDescansoTrabalhado: number;
    /**
     * LEGADO: ja nao entra no calculo. As horas noturnas pagam-se por faixa da regra
     * (`minutosNoturnosPorFaixa`). Fica no contrato para nao partir quem o preenche.
     */
    horasExtraNoturnasMinutos: number;
    /**
     * Minutos PLANEADOS cobertos por uma ausencia aprovada de dia inteiro e
     * remunerada (ferias, tipicamente). Um dia de ferias e ausencia
     * remunerada -- continua a contar como planeado (a base a hora paga-o),
     * nao tem picagem, e NAO e uma falta. Sem esta subtracao no desconto de
     * faltas, 8h planeadas + 0h picadas saiam descontadas a 100% e o dia de
     * ferias valia 0 EUR. Obrigatorio (contrato interno fechado): quem
     * chamar `calcularProcessamentoPessoa` tem de decidir este numero, nunca
     * esquece-lo em silencio.
     */
    minutosAusenciaRemunerada: number;
    diasFeriadoTrabalhados: number;
    /** Ver nota de topo do ficheiro -- ainda nao existe em `TotaisRelatorioMensal`. */
    diasDescansoTrabalhado: number;
  };
  /**
   * Os minutos trabalhados de CADA dia do mes (um numero por dia, sem os dias de ausencia). O subsidio de
   * almoco calcula-se dia a dia por estes minutos.
   */
  minutosPorDia: readonly number[];
  /** Os minutos realizados dentro de cada faixa noturna da regra, pela MESMA ordem de `regra.noturnas`. */
  minutosNoturnosPorFaixa: readonly number[];
  /** A regra salarial em vigor no ultimo dia do periodo; `null` = sem regra (nada que dependa dela se calcula). */
  regra: RegraParaCalculo | null;
  /** A pessoa tem direito a IHT (`pessoas_direitos_salariais.iht`). */
  direitoIht: boolean;
  retribuicao: RetribuicaoParaCalculo | null;
  /** So os codigos ACTIVOS da organizacao. */
  codigos: readonly HrCodigoProcessamento[];
  /** Os lancamentos do periodo, da pessoa. */
  lancamentos: readonly HrProcessamentoLancamento[];
}

export type AvisoProcessamento =
  | "sem_retribuicao"
  | "periodicidade_nao_convertivel"
  | "duodecimos_por_decidir"
  | "sem_regra_salarial"
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

/** Uma linha que vem da regra salarial (nao de um codigo): noturnas por faixa, IHT, km, ajudas. */
export interface LinhaRegraSalarial {
  tipo: "noturnas" | "iht" | "km" | "ajudas";
  /** Noturnas: a faixa ("HH:MM" sem segundos nao se conhece aqui, so a posicao). Outros: `null`. */
  faixa: number | null;
  /** Horas (noturnas) ou quantidade (km, dias de ajudas); `null` no IHT. */
  quantidade: number | null;
  valor: number;
}

export interface ResultadoProcessamentoPessoa {
  valorHoraReal: number | null;
  baseMes: number | null;
  divisorDuodecimos: number | null;
  linhasAutomaticas: readonly LinhaCodigoAplicado[];
  totalCodigosAutomaticos: number;
  /** Noturnas por faixa, IHT, km e ajudas. */
  linhasRegra: readonly LinhaRegraSalarial[];
  totalRegras: number;
  descontoFaltas: number;
  subsidioAlimentacao: number;
  /** So os lancamentos do tipo manual (premios, valores negociados). */
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

/** A percentagem da regra para cada origem automatica; as noturnas pagam-se por faixa, nao aqui. */
function percentagemDaRegra(origem: OrigemAutomaticaCodigo, regra: RegraParaCalculo): number | null {
  switch (origem) {
    case "horas_extra":
      return regra.he_pct_dia_util;
    case "feriado_trabalhado":
      return regra.he_pct_feriado;
    case "descanso_trabalhado":
      return regra.he_pct_descanso;
    default:
      return null;
  }
}

/** Arredonda ao centimo (duas casas), sem o erro de binario de `x * 100`. */
const arredondarAoCentimo = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

/**
 * Retribuicao mensal equivalente `R`, a partir do valor base e periodicidade.
 * `null` quando nao ha retribuicao ou a periodicidade nao e convertivel
 * (diaria -- nao se inventam dias uteis do mes).
 *
 * "hora": calculo DIRECTO a partir das horas REALMENTE planeadas neste mes
 * (`planeadoMinutos`), nao de uma media anual. Com `planeadoMinutos <= 0` o
 * resultado e `0`, nao `null`: quem e pago a hora e nao tem horas planeadas
 * nesse mes nao ganha base, mas continua a poder ter subsidio de alimentacao e
 * lancamentos pontuais -- `totalBrutoEstimado` fica `0`/finito, nunca `null`.
 */
function calcularRetribuicaoMensal(
  retribuicao: RetribuicaoParaCalculo | null,
  planeadoMinutos: number,
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
      return (Math.max(planeadoMinutos, 0) / 60) * retribuicao.valorBase;
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
 * `baseMes / 0` daria `Infinity` e contaminaria todo o resultado.
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
 * Confirmado com a contabilidade (22/09): a 50%, de CADA subsidio (ferias e
 * Natal) so METADE se dilui no mes -- a outra metade continua a pagar-se a
 * parte, tal como a 0%.
 *
 *   diluido = 12 x R  +  2 x (pct/100) x R   (2 subsidios, cada um pct% diluido)
 *   baseMes = diluido / 12 = R x (12 + 2 x pct/100) / 12
 *
 * O "divisor" devolvido aqui e so a forma de encaixar essa conta na mesma
 * formula `baseMes = retribuicaoMensal * 14 / divisor` que 0% e 100% ja
 * usam: divisor = 168 / (12 + 2*pct/100). A 0%: 14. A 100%: 12. A 50%: 168/13.
 */
function calcularDivisorDuodecimos(
  duodecimosPct: 0 | 50 | 100 | null,
  avisos: AvisoProcessamento[],
): number {
  if (duodecimosPct === null) {
    avisos.push("duodecimos_por_decidir");
    return 14;
  }
  return 168 / (12 + 2 * (duodecimosPct / 100));
}

/**
 * As linhas dos codigos automaticos aplicados a este mes desta pessoa.
 *
 * As PERCENTAGENS das horas extra vem da regra salarial (dia util, feriado,
 * descanso), nao da percentagem do codigo: o codigo diz SE se paga, a regra diz
 * QUANTO. Sem regra, a linha existe mas vale 0 (e o aviso `sem_regra_salarial`
 * fica registado por quem chama). As horas noturnas por codigo
 * (`horas_extra_noturnas`) ja nao geram linha: pagam-se por faixa em
 * `calcularLinhasRegra`.
 */
function calcularLinhasAutomaticas(
  codigos: readonly HrCodigoProcessamento[],
  totais: EntradaProcessamentoPessoa["totais"],
  valorHoraReal: number | null,
  regra: RegraParaCalculo | null,
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
        valor: arredondarAoCentimo(codigo.valor_fixo ?? 0),
      });
      continue;
    }

    const origem = codigo.origem_automatica;
    if (!origem) continue;

    if (codigo.modo_calculo === "percentagem_hora_normal") {
      // As noturnas pagam-se por faixa; um codigo antigo com esta origem nao paga uma segunda vez.
      if (origem === "horas_extra_noturnas") continue;
      const minutos = totais[MINUTOS_POR_ORIGEM[origem]];
      const horas = minutos / 60;
      const percentagem = regra ? (percentagemDaRegra(origem, regra) ?? 0) : 0;
      const valor = valorHoraReal === null ? 0 : arredondarAoCentimo(horas * valorHoraReal * (percentagem / 100));
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
        // natural -- combinacao nao suportada, ignora-se silenciosamente.
        continue;
      }
      const ocorrencias = totais[chaveOcorrencias];
      const valor = arredondarAoCentimo(ocorrencias * (codigo.valor_fixo ?? 0));
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

/**
 * As linhas que vem da regra salarial: noturnas por faixa (percentagem sobre o valor hora OU preco fixo
 * por hora), IHT (percentagem do ordenado base, so com direito) e km e ajudas (o valor ja vem gravado no
 * lancamento: quantidade x valor da regra, calculado pela base).
 */
function calcularLinhasRegra(
  entrada: EntradaProcessamentoPessoa,
  retribuicaoMensal: number | null,
  valorHoraReal: number | null,
): LinhaRegraSalarial[] {
  const { regra } = entrada;
  const linhas: LinhaRegraSalarial[] = [];

  if (regra) {
    regra.noturnas.forEach((faixa, indice) => {
      const minutos = entrada.minutosNoturnosPorFaixa[indice] ?? 0;
      if (minutos <= 0) return;
      const horas = minutos / 60;
      const precoHora =
        faixa.preco_hora !== null && faixa.preco_hora !== undefined
          ? faixa.preco_hora
          : valorHoraReal === null
            ? 0
            : valorHoraReal * ((faixa.percentagem ?? 0) / 100);
      linhas.push({ tipo: "noturnas", faixa: indice, quantidade: horas, valor: arredondarAoCentimo(horas * precoHora) });
    });

    if (entrada.direitoIht && retribuicaoMensal !== null) {
      linhas.push({
        tipo: "iht",
        faixa: null,
        quantidade: null,
        valor: arredondarAoCentimo(retribuicaoMensal * (regra.iht_pct / 100)),
      });
    }
  }

  for (const tipo of ["km", "ajudas"] as const) {
    const doTipo = entrada.lancamentos.filter((l) => l.anulado_em === null && l.tipo === tipo);
    if (doTipo.length === 0) continue;
    linhas.push({
      tipo,
      faixa: null,
      quantidade: doTipo.reduce((soma, l) => soma + (l.quantidade ?? 0), 0),
      valor: arredondarAoCentimo(doTipo.reduce((soma, l) => soma + l.valor, 0)),
    });
  }

  return linhas;
}

/**
 * O subsidio de alimentacao, DIA A DIA pelos minutos trabalhados de cada dia, com os valores da regra:
 * menos do limite (5 h) = valor por hora x horas trabalhadas (minutos proporcionais); o limite ou mais
 * (exactamente 5 h conta como «a partir de 5 h») = valor por dia. Cada dia arredonda-se ao centimo ANTES
 * de somar o mes. Sem regra o subsidio e 0 e fica o aviso.
 */
function calcularSubsidioAlimentacao(
  regra: RegraParaCalculo | null,
  minutosPorDia: readonly number[],
  avisos: AvisoProcessamento[],
): number {
  if (!regra) {
    avisos.push("sem_regra_salarial");
    return 0;
  }
  const centimosHora = Math.round(regra.subsidio_valor_hora * 100);
  const centimosDia = Math.round(regra.subsidio_valor_dia * 100);
  const totalCentimos = minutosPorDia.reduce((soma, minutos) => {
    if (!(minutos > 0)) return soma;
    if (minutos >= regra.subsidio_limite_min) return soma + centimosDia;
    return soma + Math.round((minutos * centimosHora) / 60);
  }, 0);
  return totalCentimos / 100;
}

type DiaParaSubsidio = Pick<DiaRelatorioMensal, "estado" | "realizadoMinutos"> &
  Partial<Pick<DiaRelatorioMensal, "iso" | "realizadoIntervalos">>;

const minutosDaHora = (hora: string): number => {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
};

const FIM_DO_DIA_MINUTOS = 23 * 60 + 59;

/** Dia civil anterior, em ISO (so aritmetica de calendario, sem fuso nem `Date.now()`). */
function diaAnteriorIso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Os minutos trabalhados de cada dia que contam para o subsidio de alimentacao: o realizado dos dias
 * que nao sao uma ausencia -- a mesma exclusao que `contaParaTotais` ja aplica em
 * `useRelatorioAssiduidadeMensal.ts` aos outros totais do relatorio. Dias sem trabalho ficam de fora.
 *
 * TURNO QUE ATRAVESSA A MEIA-NOITE: `pessoas_horario_realizado` nunca atravessa a meia-noite (uma linha por
 * dia), por isso um turno 22:00-06:00 chega partido em dois dias (22:00-23:59 e 00:00-06:00). Para o subsidio
 * e UM dia de trabalho: o primeiro intervalo do dia que comeca as 00:00, logo a seguir a um dia que acabou as
 * 23:59, soma-se ao dia anterior (a data em que o turno comecou). O resto desse dia fica como dia seu.
 * Sem intervalos (fixtures antigos) nao ha como saber, e cada dia conta por si.
 */
export function minutosTrabalhadosPorDia(dias: readonly DiaParaSubsidio[]): number[] {
  const porDia: { iso: string | undefined; minutos: number; acabaAMeiaNoite: boolean }[] = [];
  for (const dia of dias) {
    if (dia.estado === "ausencia" || !(dia.realizadoMinutos > 0)) continue;
    const intervalos = dia.realizadoIntervalos ?? [];
    const primeiro = intervalos[0];
    const ultimo = intervalos[intervalos.length - 1];
    const anterior = porDia[porDia.length - 1];
    const acabaAMeiaNoite = !!ultimo && minutosDaHora(ultimo.hora_fim) >= FIM_DO_DIA_MINUTOS;
    const continuaTurno =
      !!anterior &&
      anterior.acabaAMeiaNoite &&
      !!dia.iso &&
      anterior.iso === diaAnteriorIso(dia.iso) &&
      !!primeiro &&
      minutosDaHora(primeiro.hora_inicio) === 0;
    if (!continuaTurno) {
      porDia.push({ iso: dia.iso, minutos: dia.realizadoMinutos, acabaAMeiaNoite });
      continue;
    }
    const minutosDoPrimeiro = minutosDaHora(primeiro.hora_fim) - minutosDaHora(primeiro.hora_inicio);
    const juntos = Math.min(Math.max(minutosDoPrimeiro, 0), dia.realizadoMinutos);
    anterior.minutos += juntos;
    // O turno acaba onde acaba o primeiro intervalo; so o que sobra fica como dia seu.
    anterior.acabaAMeiaNoite = false;
    const resto = dia.realizadoMinutos - juntos;
    if (resto > 0) porDia.push({ iso: dia.iso, minutos: resto, acabaAMeiaNoite });
  }
  return porDia.map((dia) => dia.minutos);
}

/**
 * Os minutos de falta a descontar: o defice entre planeado e realizado,
 * DEPOIS de tirar as ausencias aprovadas e remuneradas. Nunca negativo:
 * `minutosAusenciaRemunerada` acima do defice nao gera credito.
 */
function calcularMinutosDeFalta(totais: EntradaProcessamentoPessoa["totais"]): number {
  return Math.max(
    totais.planeadoMinutos - totais.realizadoMinutos - totais.minutosAusenciaRemunerada,
    0,
  );
}

/** Os lancamentos pontuais anulados nao contam; km e ajudas tem linha propria (`calcularLinhasRegra`). */
function calcularLancamentosPontuais(lancamentos: readonly HrProcessamentoLancamento[]): number {
  return lancamentos.reduce(
    (soma, lancamento) =>
      lancamento.anulado_em === null && (lancamento.tipo ?? "manual") === "manual" ? soma + lancamento.valor : soma,
    0,
  );
}

export function calcularProcessamentoPessoa(
  entrada: EntradaProcessamentoPessoa,
): ResultadoProcessamentoPessoa {
  const avisos: AvisoProcessamento[] = [];

  const retribuicaoMensal = calcularRetribuicaoMensal(
    entrada.retribuicao,
    entrada.totais.planeadoMinutos,
    avisos,
  );
  const divisorDuodecimos =
    retribuicaoMensal === null ? null : calcularDivisorDuodecimos(entrada.retribuicao?.duodecimosPct ?? null, avisos);
  const baseMes =
    retribuicaoMensal === null || divisorDuodecimos === null
      ? null
      : (retribuicaoMensal * 14) / divisorDuodecimos;

  const valorHoraReal = calcularValorHoraReal(baseMes, entrada.totais.planeadoMinutos, avisos);

  const linhasAutomaticas = calcularLinhasAutomaticas(entrada.codigos, entrada.totais, valorHoraReal, entrada.regra);
  const totalCodigosAutomaticos = arredondarAoCentimo(linhasAutomaticas.reduce((soma, linha) => soma + linha.valor, 0));

  const linhasRegra = calcularLinhasRegra(entrada, retribuicaoMensal, valorHoraReal);
  const totalRegras = arredondarAoCentimo(linhasRegra.reduce((soma, linha) => soma + linha.valor, 0));

  const descontoFaltas =
    valorHoraReal === null ? 0 : arredondarAoCentimo((calcularMinutosDeFalta(entrada.totais) / 60) * valorHoraReal);

  const subsidioAlimentacao = calcularSubsidioAlimentacao(entrada.regra, entrada.minutosPorDia, avisos);

  const lancamentosPontuais = calcularLancamentosPontuais(entrada.lancamentos);

  // Nunca negativo: mesmo que o desconto de faltas supere a base, o total fica 0, nao uma divida da pessoa
  // a empresa. So se aplica quando ha base para calcular -- `null` continua `null`.
  const totalBrutoEstimado =
    baseMes === null
      ? null
      : Math.max(
          0,
          baseMes +
            totalCodigosAutomaticos +
            totalRegras -
            descontoFaltas +
            subsidioAlimentacao +
            lancamentosPontuais,
        );

  return {
    valorHoraReal,
    baseMes,
    divisorDuodecimos,
    linhasAutomaticas,
    totalCodigosAutomaticos,
    linhasRegra,
    totalRegras,
    descontoFaltas,
    subsidioAlimentacao,
    lancamentosPontuais,
    totalBrutoEstimado,
    avisos,
  };
}
