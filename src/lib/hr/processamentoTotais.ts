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
} from "@/types/hr";
import type { DiaRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";
import { detalheDasFaltas, type FaltaDoPeriodo } from "@/lib/hr/descontoFalta";
import type { FonteHorasExtra } from "@/lib/hr/horasExtraRelatorio";
import type { AvisoSubsidio } from "@/lib/hr/subsidiosExtra";

export type Periodicidade = "hora" | "diaria" | "semanal" | "mensal" | "anual";

export interface RetribuicaoParaCalculo {
  valorBase: number;
  periodicidade: Periodicidade;
  duodecimosPct: 0 | 50 | 100 | null;
}

/**
 * Os subsidios de ferias e de Natal que ESTE periodo paga, ja decididos por quem chama (`decidirSubsidios`, em `subsidiosExtra.ts`):
 * quais, a proporcao (dias de vinculo no ano / dias do ano; 1 = o inteiro) e, quando nao se pode calcular, o porque. Ausente = nada
 * se paga e o resultado e o de sempre.
 */
export interface SubsidiosExtraEntrada {
  ferias: boolean;
  natal: boolean;
  /** `null` = nao se sabe (sem vinculo ou cessacao): nao se paga. */
  proporcao: number | null;
  /** Nao ha contrato conhecido que cubra o periodo. */
  semVinculo?: boolean;
  /** O contrato termina no ano do periodo: o subsidio proporcional da cessacao fica fora desta versao. */
  cessacao?: boolean;
  /** Ha dias sem contrato, dentro do ano do periodo, entre vinculos da pessoa: nao se paga. */
  comIntervalo?: boolean;
  /** Para a formula das contas: os dias de vinculo no ano civil e os dias do ano (so com admissao nesse ano). */
  diasNoAno?: number;
  diasDoAno?: number;
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
    /**
     * Margem de tempo: os minutos que CONTAM (planeado dentro da margem ou por validar; realizado quando o desvio foi validado
     * como hora extra ou aceite). So o desconto de faltas o usa; `realizadoMinutos` e o que se picou. Ausente = `realizadoMinutos`
     * (sem margem configurada o resultado e o de sempre).
     */
    contadoMinutos?: number;
    /**
     * De onde vem `minutosExtraNormal`, `minutosFeriadoTrabalhado` e `minutosDescansoTrabalhado`. Com horas extra APROVADAS (interruptor
     * ligado) sao os minutos CONFIRMADOS por ORIGEM da hora extra: diaria e semanal em `minutosExtraNormal` (escalao `he_pct_dia_util`),
     * feriado em `minutosFeriadoTrabalhado` (`he_pct_feriado`), descanso em `minutosDescansoTrabalhado` (`he_pct_descanso`). A conta
     * e a mesma; esta fonte so fica registada nas linhas gravadas (`fonte_horas_extra`). Ausente = nao se regista.
     */
    horasExtraFonte?: FonteHorasExtra;
    minutosExtraNormal: number;
    minutosFeriadoTrabalhado: number;
    minutosDescansoTrabalhado: number;
    /**
     * LEGADO: ja nao entra no calculo. As horas noturnas pagam-se por faixa da regra
     * (`minutosNoturnosPorFaixa`). Fica no contrato para nao partir quem o preenche.
     */
    horasExtraNoturnasMinutos: number;
    /**
     * Minutos PLANEADOS cobertos por uma ausencia aprovada de dia inteiro e remunerada (ferias, tipicamente).
     * INFORMATIVO: o desconto de faltas ja nao o usa (desconta-se por falta, ver `faltas`); um dia de ferias nao tem falta
     * nem "dia sem picagem", por isso nunca chega ao desconto. Fica no contrato para nao partir quem o preenche.
     */
    minutosAusenciaRemunerada: number;
    /**
     * As faltas do periodo que podem descontar, UMA por falta (ver `descontoFalta.ts`): as faltas marcadas em vigor
     * (`pessoas_faltas`) e, por cada dia planeado ja passado sem falta e sem picagem, uma falta NAO justificada
     * (`semRegisto`) com o defice do dia. O desconto e a soma por falta: as horas extra de um dia nao pagam a falta de outro.
     * Obrigatorio: quem chamar tem de decidir esta lista, nunca a esquecer em silencio.
     */
    faltas: readonly (FaltaDoPeriodo & { semRegisto?: boolean })[];
    /**
     * Por dia (ISO), o maximo de minutos de falta depois de tirar o que uma ausencia aprovada, remunerada e PARCIAL
     * (meio dia) ja cobre. So tem os dias com esse caso.
     */
    limiteFaltaPorDia?: Readonly<Record<string, number>>;
    diasFeriadoTrabalhados: number;
    /** Ver nota de topo do ficheiro -- ainda nao existe em `TotaisRelatorioMensal`. */
    diasDescansoTrabalhado: number;
  };
  /**
   * Os minutos trabalhados de CADA dia do mes (um numero por dia, sem os dias de ausencia). O subsidio de
   * almoco calcula-se dia a dia por estes minutos.
   */
  minutosPorDia: readonly number[];
  /**
   * PEDE O DETALHE (`subsidioDetalhe` e `faltasDetalhe` no resultado): os mesmos dias de `minutosPorDia`, mas com a data
   * (`minutosTrabalhadosPorDiaComData`). Quando vem, o subsidio calcula-se por estes dias (que tem de ser os mesmos minutos);
   * ausente, o resultado e identico ao de sempre e nao leva os campos novos. ATENCAO: se vierem os dois e os minutos divergirem,
   * `diasComData` TEM PRECEDENCIA, em silencio (sem aviso): `minutosPorDia` e ignorado no subsidio. Quem chama passa os mesmos dias.
   */
  diasComData?: readonly { iso: string | null; minutos: number }[];
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
  /** Os subsidios de ferias e de Natal que este periodo paga (ver `SubsidiosExtraEntrada`). Ausente = nenhum: nada muda. */
  subsidiosExtra?: SubsidiosExtraEntrada;
}

export type AvisoProcessamento =
  | "sem_retribuicao"
  | "periodicidade_nao_convertivel"
  | "duodecimos_por_decidir"
  | "sem_regra_salarial"
  | "sem_horas_planeadas_no_mes"
  | "faltas_provisorias"
  | "dias_sem_picagem_descontados";

export interface LinhaCodigoAplicado {
  codigoId: string;
  codigo: string;
  nome: string;
  /** `null` = `valor_fixo_mensal` sem origem automatica. */
  origem: OrigemAutomaticaCodigo | null;
  horas: number | null;
  valor: number;
  /** So nas linhas de horas extra, feriado e descanso trabalhados, e so quando a fonte NAO e bruto (aprovadas ou misto). */
  fonteHorasExtra?: FonteHorasExtra;
  /** Os minutos pagos nesta linha (so com `fonteHorasExtra`). */
  minutos?: number;
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

/** Os minutos trabalhados num dia; `data` (AAAA-MM-DD) e `null` quando o dia nao a traz. */
export interface DiaComMinutos {
  data: string | null;
  minutos: number;
}

/** De onde vem o subsidio de alimentacao: os dias pagos pelo valor do dia e os pagos pelo valor da hora, com a regra usada. */
export interface DetalheSubsidio {
  limiteMin: number;
  valorDia: number;
  valorHora: number;
  /** Dias com minutos >= limite: pagam o valor do dia. */
  diasPeloDia: DiaComMinutos[];
  /** Dias com minutos abaixo do limite: pagam o valor da hora (arredondado ao centimo POR DIA). */
  diasPelaHora: DiaComMinutos[];
  totalPeloDia: number;
  totalPelaHora: number;
}

/** De onde vem o desconto de faltas: os dias, os minutos que descontaram e a conta. */
export interface DetalheFaltas {
  dias: string[];
  minutosDescontados: number;
  valorHoraReal: number;
  valor: number;
}

/** De onde vem o subsidio de ferias e de Natal: a retribuicao `R`, os duodecimos, a proporcao e os valores. So quando algum se paga. */
export interface DetalheSubsidiosFeriasNatal {
  r: number;
  duodecimosPct: 0 | 50 | 100;
  proporcao: number;
  ferias: number;
  natal: number;
  diasNoAno?: number;
  diasDoAno?: number;
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
  /**
   * Subsidio de ferias e de Natal pagos neste periodo (0 quando nao se pagam). Opcionais no tipo para quem monta um resultado a mao
   * (o RH real nao os usa); o motor devolve-os SEMPRE.
   */
  subsidioFerias?: number;
  subsidioNatal?: number;
  /** Porque um subsidio nao se pagou (duodecimos por definir, sem contrato, cessacao). Separado de `avisos` para nao alterar o tipo que o RH real consome. */
  avisosSubsidios?: readonly AvisoSubsidio[];
  /** So quando se paga algum subsidio de ferias ou de Natal. NAO se grava no fecho. */
  subsidiosDetalhe?: DetalheSubsidiosFeriasNatal;
  /** So quando se pediu (`diasComData`) e ha regra salarial. NAO se grava no fecho. */
  subsidioDetalhe?: DetalheSubsidio;
  /** So quando se pediu (`diasComData`) e ha valor da hora. NAO se grava no fecho. */
  faltasDetalhe?: DetalheFaltas;
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
        // So quando a fonte NAO e bruto: com o interruptor desligado a linha gravada fica exactamente como sempre.
        ...(totais.horasExtraFonte && totais.horasExtraFonte !== "bruto" ? { fonteHorasExtra: totais.horasExtraFonte, minutos: Number(minutos) } : {}),
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
  dias: readonly DiaComMinutos[],
  avisos: AvisoProcessamento[],
): { total: number; detalhe: DetalheSubsidio | null } {
  if (!regra) {
    avisos.push("sem_regra_salarial");
    return { total: 0, detalhe: null };
  }
  const centimosHora = Math.round(regra.subsidio_valor_hora * 100);
  const centimosDia = Math.round(regra.subsidio_valor_dia * 100);
  const diasPeloDia: DiaComMinutos[] = [];
  const diasPelaHora: DiaComMinutos[] = [];
  let centimosPeloDia = 0;
  let centimosPelaHora = 0;
  for (const dia of dias) {
    if (!(dia.minutos > 0)) continue;
    if (dia.minutos >= regra.subsidio_limite_min) {
      diasPeloDia.push(dia);
      centimosPeloDia += centimosDia;
    } else {
      diasPelaHora.push(dia);
      centimosPelaHora += Math.round((dia.minutos * centimosHora) / 60);
    }
  }
  return {
    total: (centimosPeloDia + centimosPelaHora) / 100,
    detalhe: {
      limiteMin: regra.subsidio_limite_min,
      valorDia: regra.subsidio_valor_dia,
      valorHora: regra.subsidio_valor_hora,
      diasPeloDia,
      diasPelaHora,
      totalPeloDia: centimosPeloDia / 100,
      totalPelaHora: centimosPelaHora / 100,
    },
  };
}

type DiaParaSubsidio = Pick<DiaRelatorioMensal, "estado" | "realizadoMinutos"> &
  Partial<Pick<DiaRelatorioMensal, "iso" | "realizadoIntervalos" | "contadoMinutos">>;

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
  return minutosTrabalhadosPorDiaComData(dias).map((dia) => dia.minutos);
}

/**
 * A mesma conta de `minutosTrabalhadosPorDia` (a mesma juncao dos turnos que atravessam a meia-noite), mas com a data de cada dia:
 * a data em que o turno COMECOU. `iso` e `null` quando o dia nao a traz (fixtures antigos).
 */
export function minutosTrabalhadosPorDiaComData(dias: readonly DiaParaSubsidio[]): { iso: string | null; minutos: number }[] {
  const porDia: { iso: string | undefined; minutos: number; acabaAMeiaNoite: boolean }[] = [];
  for (const dia of dias) {
    if (dia.estado === "ausencia" || !(dia.realizadoMinutos > 0)) continue;
    // Margem de tempo: contam os minutos do dia que a margem manda contar (sem margem, o realizado).
    const minutosDoDia = dia.contadoMinutos ?? dia.realizadoMinutos;
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
      porDia.push({ iso: dia.iso, minutos: minutosDoDia, acabaAMeiaNoite });
      continue;
    }
    const minutosDoPrimeiro = minutosDaHora(primeiro.hora_fim) - minutosDaHora(primeiro.hora_inicio);
    const juntos = Math.min(Math.max(minutosDoPrimeiro, 0), minutosDoDia);
    anterior.minutos += juntos;
    // O turno acaba onde acaba o primeiro intervalo; so o que sobra fica como dia seu.
    anterior.acabaAMeiaNoite = false;
    const resto = minutosDoDia - juntos;
    if (resto > 0) porDia.push({ iso: dia.iso, minutos: resto, acabaAMeiaNoite });
  }
  return porDia.map((dia) => ({ iso: dia.iso ?? null, minutos: dia.minutos }));
}

/**
 * O desconto de faltas, POR FALTA (nunca o defice agregado do mes): a soma de `descontoDaFalta` de cada falta, com o valor
 * hora real. Um dia planeado sem falta e sem picagem entra como falta NAO justificada ate o RH aprovar uma justificacao.
 * Avisos: desconto provisorio (falta pendente de documento) e dias descontados por falta de picagem.
 */
function calcularDescontoFaltas(
  totais: EntradaProcessamentoPessoa["totais"],
  valorHoraReal: number | null,
  avisos: AvisoProcessamento[],
): { valor: number; detalhe: DetalheFaltas | null } {
  if (valorHoraReal === null) return { valor: 0, detalhe: null };
  const faltas = totais.faltas ?? [];
  const { valor, provisorio, minutosDescontados, dias } = detalheDasFaltas(faltas, valorHoraReal, totais.limiteFaltaPorDia);
  if (provisorio) avisos.push("faltas_provisorias");
  const semPicagem = faltas.some((f) => f.semRegisto === true && f.minutos > 0);
  if (semPicagem) avisos.push("dias_sem_picagem_descontados");
  return { valor, detalhe: { dias, minutosDescontados, valorHoraReal, valor } };
}

interface SubsidiosFeriasNatalCalculados {
  ferias: number;
  natal: number;
  avisos: AvisoSubsidio[];
  detalhe: DetalheSubsidiosFeriasNatal | null;
}

/**
 * Cada subsidio = R x (100 - duodecimos %) / 100 x proporcao, arredondado ao centimo; R e a retribuicao mensal equivalente (o salario
 * base, sem duodecimos nem alimentacao). Duodecimos a 100 %: ja vai tudo nos duodecimos, nada a pagar (sem aviso). Sem contrato,
 * com cessacao ou com os duodecimos por definir nao se paga e diz-se porque.
 */
function calcularSubsidiosFeriasNatal(
  extra: SubsidiosExtraEntrada | undefined,
  retribuicao: RetribuicaoParaCalculo | null,
  retribuicaoMensal: number | null,
): SubsidiosFeriasNatalCalculados {
  const nada: SubsidiosFeriasNatalCalculados = { ferias: 0, natal: 0, avisos: [], detalhe: null };
  if (!extra || (!extra.ferias && !extra.natal)) return nada;
  // Sem retribuicao nao ha R: o aviso de `sem_retribuicao` (ou o de periodicidade) ja la esta.
  if (retribuicaoMensal === null || !retribuicao) return nada;
  const avisos: AvisoSubsidio[] = [];
  if (extra.semVinculo) avisos.push("subsidio_sem_vinculo");
  if (extra.cessacao) avisos.push("subsidio_cessacao_por_tratar");
  if (extra.comIntervalo) avisos.push("subsidio_contratos_com_intervalo");
  const duodecimosPct = retribuicao.duodecimosPct;
  if (duodecimosPct === null) avisos.push("subsidio_sem_duodecimos");
  if (avisos.length > 0 || duodecimosPct === null || extra.proporcao === null || !Number.isFinite(extra.proporcao)) return { ...nada, avisos };
  const valor = arredondarAoCentimo((retribuicaoMensal * (100 - duodecimosPct) * extra.proporcao) / 100);
  const ferias = extra.ferias ? valor : 0;
  const natal = extra.natal ? valor : 0;
  if (ferias + natal === 0) return nada;
  return {
    ferias,
    natal,
    avisos,
    detalhe: {
      r: retribuicaoMensal,
      duodecimosPct,
      proporcao: extra.proporcao,
      ferias,
      natal,
      ...(extra.diasNoAno !== undefined && extra.diasDoAno !== undefined ? { diasNoAno: extra.diasNoAno, diasDoAno: extra.diasDoAno } : {}),
    },
  };
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

  const { valor: descontoFaltas, detalhe: faltasDetalhe } = calcularDescontoFaltas(entrada.totais, valorHoraReal, avisos);

  const diasDoSubsidio: readonly DiaComMinutos[] =
    entrada.diasComData?.map((dia) => ({ data: dia.iso, minutos: dia.minutos })) ?? entrada.minutosPorDia.map((minutos) => ({ data: null, minutos }));
  const { total: subsidioAlimentacao, detalhe: subsidioDetalhe } = calcularSubsidioAlimentacao(entrada.regra, diasDoSubsidio, avisos);
  const pedirDetalhe = entrada.diasComData !== undefined;

  const lancamentosPontuais = calcularLancamentosPontuais(entrada.lancamentos);
  const subsidios = calcularSubsidiosFeriasNatal(entrada.subsidiosExtra, entrada.retribuicao, retribuicaoMensal);

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
            subsidios.ferias +
            subsidios.natal +
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
    subsidioFerias: subsidios.ferias,
    subsidioNatal: subsidios.natal,
    ...(subsidios.avisos.length > 0 ? { avisosSubsidios: subsidios.avisos } : {}),
    ...(subsidios.detalhe ? { subsidiosDetalhe: subsidios.detalhe } : {}),
    ...(pedirDetalhe && subsidioDetalhe ? { subsidioDetalhe } : {}),
    ...(pedirDetalhe && faltasDetalhe ? { faltasDetalhe } : {}),
    lancamentosPontuais,
    totalBrutoEstimado,
    avisos,
  };
}
