/**
 * Quem paga o subsidio de ferias e o de Natal num periodo da folha. Funcao pura, sem React nem base.
 *
 * A configuracao e POR ORGANIZACAO (`hr_subsidios_config`): `ativoDesde` (null = desligado), o mes em que se paga o de ferias e o
 * mes em que se paga o de Natal. Um periodo paga o subsidio quando o MES DO PERIODO (o do ultimo dia, `dataFim`) e o mes
 * configurado, a configuracao esta ligada e o periodo acaba a partir de `ativoDesde`.
 *
 * PROPORCAO: quem foi admitido no ano civil do periodo (o PRIMEIRO vinculo da cadeia continua, `vinculoContinuoDoPeriodo`: um contrato
 * renovado sem interrupcao conta como um so) recebe os dias de vinculo nesse ano a dividir pelos dias do ano (365/366); quem ja la
 * estava, o inteiro. Intervalo sem contrato dentro do ano: nao se paga e avisa. A CESSACAO (contrato que termina no ano do periodo) fica FORA desta versao: nao se paga e avisa-se.
 */
import type { SubsidiosExtraEntrada } from "@/lib/hr/processamentoTotais";

export interface SubsidiosConfig {
  /** `AAAA-MM-DD`; `null` = desligado. */
  ativoDesde: string | null;
  /** 1-12. */
  feriasMes: number;
  /** 1-12. */
  natalMes: number;
}

/** O periodo da folha: o mes (1-12) que lhe da o nome e o ultimo dia (`AAAA-MM-DD`). */
export interface PeriodoParaSubsidios {
  mes: number;
  dataFim: string;
}

/** O que se usa do vinculo que cobre o periodo. */
export interface VinculoParaSubsidios {
  dataInicio: string;
  /** `null` = sem fim. */
  dataFim: string | null;
  /** Ha dias sem contrato, dentro do ano do periodo, entre vinculos da pessoa: nao se paga (ver `vinculoContinuoDoPeriodo`). */
  comIntervalo?: boolean;
}

/** Os avisos proprios dos subsidios (nao entram em `AvisoProcessamento`, que o RH real consome em `Record` completos). */
export type AvisoSubsidio = "subsidio_sem_duodecimos" | "subsidio_sem_vinculo" | "subsidio_cessacao_por_tratar" | "subsidio_contratos_com_intervalo";

/** A chave de traducao de cada aviso dos subsidios. */
export const AVISO_SUBSIDIO_CHAVE: Record<AvisoSubsidio, string> = {
  subsidio_sem_duodecimos: "rhSubs.aviso.semDuodecimos",
  subsidio_sem_vinculo: "rhSubs.aviso.semVinculo",
  subsidio_cessacao_por_tratar: "rhSubs.aviso.cessacao",
  subsidio_contratos_com_intervalo: "rhSubs.aviso.contratosComIntervalo",
};

export const AVISOS_SUBSIDIO: ReadonlySet<string> = new Set(Object.keys(AVISO_SUBSIDIO_CHAVE));

export const eAvisoSubsidio = (aviso: string): aviso is AvisoSubsidio => AVISOS_SUBSIDIO.has(aviso);

const MS_DIA = 86_400_000;

/** 365 ou 366. */
export function diasDoAno(ano: number): number {
  return (Date.UTC(ano + 1, 0, 1) - Date.UTC(ano, 0, 1)) / MS_DIA;
}

/** Dias entre duas datas ISO, o primeiro e o ultimo incluidos. */
function diasInclusivos(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_DIA) + 1;
}

/** O periodo paga algum subsidio (configuracao ligada, periodo a acabar a partir de `ativoDesde` e no mes de ferias ou no de Natal). */
export function periodoPagaSubsidios(config: SubsidiosConfig | null | undefined, periodo: PeriodoParaSubsidios): boolean {
  if (!config || config.ativoDesde === null) return false;
  if (periodo.dataFim < config.ativoDesde) return false;
  return periodo.mes === config.feriasMes || periodo.mes === config.natalMes;
}

/**
 * Que subsidios o PERIODO paga, como a base o decide (`rpc_hr_subsidios_assinatura`: `paga_ferias` e `paga_natal`). E a unica fonte
 * do mes quando o periodo ja existe: o cliente nao volta a decidir o mes, so aplica a proporcao, os duodecimos e o vinculo.
 */
export interface DecisaoDoPeriodo {
  pagaFerias: boolean;
  pagaNatal: boolean;
}

/**
 * O que o periodo paga: `undefined` = nada (desligado, mes errado, ainda nao em vigor). Com algum subsidio devido, o `subsidiosExtra`
 * da entrada do calculo, com a proporcao decidida, ou o motivo de nao se calcular (`semVinculo`, `cessacao`).
 *
 * Com `decisao` (a da base), o mes vem dela e `config` nao conta. Sem `decisao` (periodo ainda sem registo na base) decide-se pelo mes
 * da configuracao, como sempre.
 */
export function decidirSubsidios(
  config: SubsidiosConfig | null | undefined,
  periodo: PeriodoParaSubsidios,
  vinculo: VinculoParaSubsidios | null | undefined,
  decisao?: DecisaoDoPeriodo | null,
): SubsidiosExtraEntrada | undefined {
  if (!decisao && (!config || !periodoPagaSubsidios(config, periodo))) return undefined;
  const ferias = decisao ? decisao.pagaFerias : periodo.mes === config?.feriasMes;
  const natal = decisao ? decisao.pagaNatal : periodo.mes === config?.natalMes;
  if (!ferias && !natal) return undefined;
  if (!vinculo) return { ferias, natal, proporcao: null, semVinculo: true };

  const ano = Number(periodo.dataFim.slice(0, 4));
  if (vinculo.comIntervalo) return { ferias, natal, proporcao: null, comIntervalo: true };
  if (vinculo.dataFim !== null && vinculo.dataFim.slice(0, 4) === String(ano)) return { ferias, natal, proporcao: null, cessacao: true };

  const inicioNoAno = vinculo.dataInicio.slice(0, 4) === String(ano);
  if (!inicioNoAno) return { ferias, natal, proporcao: 1 };
  const noAno = diasInclusivos(vinculo.dataInicio, `${ano}-12-31`);
  const doAno = diasDoAno(ano);
  return { ferias, natal, proporcao: noAno / doAno, diasNoAno: noAno, diasDoAno: doAno };
}
