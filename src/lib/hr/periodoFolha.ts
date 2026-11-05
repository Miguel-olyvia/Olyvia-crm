/**
 * O PERIODO DA FOLHA: uma so funcao de intervalo para toda a aplicacao.
 *
 * O periodo nao e o mes de calendario: abre num dia (o "dia de inicio", 1 a 28) e fecha no dia anterior do mes
 * seguinte. O NOME do periodo e o mes do FECHO: com dia de inicio 22, a folha de novembro vai de 22/10 a 21/11.
 * Dia de inicio 1 e o mes de calendario (o comportamento de antes de haver regra).
 *
 * Meses sao SEMPRE 1 a 12 aqui (quem tem o mes de 0 a 11, como `useRelatorioAssiduidadeMensal`, soma 1 ao chamar).
 * `de` e `ate` sao inclusivos e em ISO (AAAA-MM-DD), sem passar por UTC nem por fuso.
 *
 * As regras (`rpc_hr_periodo_folha_regras_listar`) sao versionadas: uma regra vale a partir da folha do mes
 * `valido_de`. A primeira folha depois de mudar o dia e de TRANSICAO: comeca no dia a seguir ao fim da folha anterior
 * (a mesma conta de `rpc_hr_processamento_periodo_abrir`), por isso nunca ha buracos nem sobreposicao.
 */

export interface RegraPeriodoFolha {
  dia_inicio: number;
  /** Sempre dia 1 do mes do fecho a partir do qual a regra vale (AAAA-MM-01). */
  valido_de: string;
  /** Preenchido quando a regra foi SUBSTITUIDA por outra para o mesmo mes: ja nao vale, so fica no historico. */
  substituida_em?: string | null;
}

export interface IntervaloDaFolha {
  de: string;
  ate: string;
}

export interface PeriodoDoDia extends IntervaloDaFolha {
  /** O mes do fecho, que da o nome a folha. */
  ano: number;
  mes: number;
}

export const DIA_INICIO_MIN = 1;
export const DIA_INICIO_MAX = 28;

const doisDigitos = (n: number): string => String(n).padStart(2, "0");
const iso = (ano: number, mes: number, dia: number): string => `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
const ultimoDiaDoMes = (ano: number, mes: number): number => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** O mes `n` meses depois (ou antes, se negativo) de (ano, mes). */
export function somarMeses(ano: number, mes: number, n: number): { ano: number; mes: number } {
  const indice = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1 };
}

function diaSeguinte(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const seguinte = new Date(Date.UTC(a, m - 1, d + 1));
  return iso(seguinte.getUTCFullYear(), seguinte.getUTCMonth() + 1, seguinte.getUTCDate());
}

/**
 * O intervalo da folha cujo mes do fecho e (ano, mes), para um dia de inicio fixo.
 * Dia de inicio 1 (ou omitido) = o mes de calendario.
 */
export function periodoDaFolha(ano: number, mes: number, diaInicio: number = 1): IntervaloDaFolha {
  if (!Number.isInteger(diaInicio) || diaInicio <= 1) {
    return { de: iso(ano, mes, 1), ate: iso(ano, mes, ultimoDiaDoMes(ano, mes)) };
  }
  const anterior = somarMeses(ano, mes, -1);
  return { de: iso(anterior.ano, anterior.mes, diaInicio), ate: iso(ano, mes, diaInicio - 1) };
}

/** O dia de inicio em vigor para a folha do mes (ano, mes): a regra NAO substituida de maior `valido_de` <= dia 1 desse mes; sem regra, 1. */
export function diaInicioEmVigor(regras: readonly RegraPeriodoFolha[], ano: number, mes: number): number {
  const primeiro = iso(ano, mes, 1);
  let escolhida: RegraPeriodoFolha | null = null;
  for (const regra of regras) {
    if (regra.substituida_em) continue; // a base so conta as nao substituidas (hr_periodo_folha_dia_inicio)
    if (regra.valido_de <= primeiro && (!escolhida || regra.valido_de >= escolhida.valido_de)) escolhida = regra;
  }
  return escolhida ? escolhida.dia_inicio : 1;
}

/** O intervalo da folha (ano, mes) pelas regras, com o periodo de transicao: o inicio e o dia a seguir ao fim da folha anterior. */
export function periodoDaFolhaPorRegras(ano: number, mes: number, regras: readonly RegraPeriodoFolha[]): IntervaloDaFolha {
  const ate = periodoDaFolha(ano, mes, diaInicioEmVigor(regras, ano, mes)).ate;
  const anterior = somarMeses(ano, mes, -1);
  const fimAnterior = periodoDaFolha(anterior.ano, anterior.mes, diaInicioEmVigor(regras, anterior.ano, anterior.mes)).ate;
  return { de: diaSeguinte(fimAnterior), ate };
}

/** A folha que CONTEM o dia (pelas regras): o mes do fecho e o intervalo. */
export function periodoDoDia(data: string, regras: readonly RegraPeriodoFolha[]): PeriodoDoDia {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const doMes = periodoDaFolhaPorRegras(ano, mes, regras);
  if (data <= doMes.ate) return { ano, mes, ...doMes };
  const seguinte = somarMeses(ano, mes, 1);
  return { ano: seguinte.ano, mes: seguinte.mes, ...periodoDaFolhaPorRegras(seguinte.ano, seguinte.mes, regras) };
}

/** O ultimo dia para justificar `data`: o fim da folha que a contem. Depois disso a falta fica injustificada. */
export function fimDoPeriodoDoDia(data: string, regras: readonly RegraPeriodoFolha[]): string {
  return periodoDoDia(data, regras).ate;
}

/** Os dias (ISO) de `de` a `ate`, inclusivos. */
export function diasDoPeriodo(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let dia = de; dia <= ate && dias.length < 70; dia = diaSeguinte(dia)) dias.push(dia);
  return dias;
}

/** Quantos dias de calendario de `de` a `ate` (0 se forem o mesmo dia ou se `ate` for antes). */
export function diasDeCalendarioEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
  return Math.max(dias, 0);
}

/** A lingua da interface (pt, en, es...) como «locale» do Intl; o portugues e o de Portugal. */
export function localeDaLingua(lingua: string): string {
  return lingua === "pt" ? "pt-PT" : lingua;
}

/** «22 out» (curto) ou «22 de outubro» (por extenso), pela lingua: o mes sai do Intl, nao de uma lista fixa. */
function diaEMes(dia: string, locale: string, mes: "short" | "long"): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: mes, timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, d)));
}

/**
 * O intervalo da folha por escrito: «22 out a 21 nov» (curto, para ver) ou «22 de outubro a 21 de novembro» (por extenso,
 * para leitores de ecra). `palavraA` e o «a» / «to» da lingua (chave de traducao), que quem chama passa.
 */
export function formatarIntervaloPeriodo(de: string, ate: string, locale: string, palavraA: string, mes: "short" | "long" = "short"): string {
  return `${diaEMes(de, locale, mes)} ${palavraA} ${diaEMes(ate, locale, mes)}`;
}
/** «novembro de 2026»: o nome da folha, pelo mes do fecho, na lingua pedida (Intl). */
export function nomeDaFolha(ano: number, mes: number, locale: string = "pt-PT"): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(ano, mes - 1, 1)));
}
/** O mes (AAAA-MM) do fecho de um intervalo: o que da nome a folha. */
export function mesDoFecho(ate: string): string {
  return ate.slice(0, 7);
}

/** Hoje (AAAA-MM-DD) em Lisboa, como a base: nao o fuso do navegador. */
export function hojeEmLisboa(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export interface IntervaloEfectivo extends IntervaloDaFolha {
  /**
   * `true` quando o periodo ja existe mas a base nao lhe deu as datas (base sem 20270107200000) e o intervalo vem so das regras:
   * o ecra di-lo, em vez de mostrar como certo um intervalo que a base nao confirmou.
   */
  estimado: boolean;
}

/**
 * O intervalo a usar para a folha (ano, mes do fecho): as datas do periodo, se ja existe e as tem (a base e a fonte de verdade);
 * senao o calculado pelas regras (periodo por abrir: e o que vai abrir).
 */
export function intervaloEfectivo(
  periodo: { data_inicio?: string | null; data_fim?: string | null } | null,
  ano: number,
  mes: number,
  regras: readonly RegraPeriodoFolha[],
): IntervaloEfectivo {
  if (periodo?.data_inicio && periodo?.data_fim) return { de: periodo.data_inicio, ate: periodo.data_fim, estimado: false };
  const calculado = periodoDaFolhaPorRegras(ano, mes, regras);
  return { ...calculado, estimado: periodo !== null && diaInicioEmVigor(regras, ano, mes) !== 1 };
}
/** «31 de outubro de 2026» (por extenso, pela lingua): para leitores de ecra e para a frase do prazo. */
export function formatarDataPorExtenso(dia: string, locale: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, d)));
}