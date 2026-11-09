/**
 * A logica pura dos desvios de horario e de tempo (margem de tempo configuravel).
 *
 * A base (SQL) implementa a MESMA regra; os dois lados provam os mesmos casos de
 * `__fixtures__/desvios-casos.json`. Se mudares uma regra aqui, muda o JSON e a base.
 *
 * Tudo em minutos desde as 00:00. Planeado e realizado sao listas de intervalos
 * `{hora_inicio, hora_fim}` ja DESCONTADOS de faltas e ausencias parciais aprovadas.
 *
 * Nada aqui toca em base, hooks ou ecras.
 */
import { minutosDe } from "@/lib/hr/horario";
import type { Periodo } from "@/lib/hr/assiduidade";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * O tipo de horario da pessoa. Hoje so existe `padrao` e o vinculo com
 * isencao de horario; os restantes sao o gancho para os tipos futuros.
 */
export type TipoHorario =
  | "padrao"
  | "isencao_horario"
  | "livre"
  | "banco_horas"
  | "repartido"
  | "outro";

export type ModoDesvios = "padrao" | "sem_desvios" | "nao_definido";

export interface IntervalosEsperados {
  modo: ModoDesvios;
  /** As janelas contra as quais se mede o realizado. Vazio fora do modo `padrao`. */
  janelas: Periodo[];
  /** Por que nao ha desvios (so fora do modo `padrao`). */
  motivo: string | null;
}

export interface MedidasDia {
  planeadoMin: number;
  realizadoMin: number;
  /** Realizado fora das janelas planeadas. */
  foraMin: number;
  /** Janelas planeadas nao cobertas pelo realizado. */
  emFaltaMin: number;
  /** realizado - planeado, com sinal. */
  diferencaMin: number;
  /** min(fora, emFalta): o acumulado do dia (D5). */
  desvioHorarioMin: number;
}

export type NaturezaDesvio = "hora_extra" | "desvio_horario" | "tempo_a_menos";

export interface ClassificacaoDia {
  temDesvioTempo: boolean;
  temDesvioHorario: boolean;
  natureza: NaturezaDesvio | null;
}

export type DecisaoDesvio = "normal" | "hora_extra" | "aceitar_desvio" | "a_validar";

export interface DiaParaContar {
  planeadoMin: number;
  realizadoMin: number;
  /** O dia tem desvio (fora da margem)? Dentro da margem conta o planeado. */
  temDesvio: boolean;
}

export interface MinutosQueContam {
  contadoMin: number;
  extraMin: number;
}

// ---------------------------------------------------------------------------
// Intervalos em minutos
// ---------------------------------------------------------------------------

type Faixa = readonly [number, number];

/** Converte para faixas validas (fim > inicio), ordenadas e fundidas (sem sobreposicao). */
function fundir(periodos: readonly Periodo[]): Faixa[] {
  const faixas: Array<[number, number]> = [];
  for (const p of periodos) {
    const de = minutosDe(p.hora_inicio);
    const ate = minutosDe(p.hora_fim);
    if (de === null || ate === null || ate <= de) continue;
    faixas.push([de, ate]);
  }
  faixas.sort((a, b) => a[0] - b[0]);
  const fundidas: Array<[number, number]> = [];
  for (const f of faixas) {
    const ultima = fundidas[fundidas.length - 1];
    if (ultima && f[0] <= ultima[1]) {
      ultima[1] = Math.max(ultima[1], f[1]);
    } else {
      fundidas.push([f[0], f[1]]);
    }
  }
  return fundidas;
}

function total(faixas: readonly Faixa[]): number {
  return faixas.reduce((soma, [de, ate]) => soma + (ate - de), 0);
}

/** Minutos comuns a duas listas de faixas ja fundidas. */
function sobreposicao(a: readonly Faixa[], b: readonly Faixa[]): number {
  let soma = 0;
  for (const [aDe, aAte] of a) {
    for (const [bDe, bAte] of b) {
      const de = Math.max(aDe, bDe);
      const ate = Math.min(aAte, bAte);
      if (ate > de) soma += ate - de;
    }
  }
  return soma;
}

// ---------------------------------------------------------------------------
// 1. Ponto de extensao dos tipos de horario
// ---------------------------------------------------------------------------

/**
 * O que se espera de uma pessoa num dia, segundo o tipo de horario.
 * Nao se inventam regras: o que nao esta definido devolve o motivo.
 */
export function intervalosEsperados(
  planeadoDoDia: readonly Periodo[],
  tipoHorario: TipoHorario,
): IntervalosEsperados {
  switch (tipoHorario) {
    case "padrao":
      return { modo: "padrao", janelas: [...planeadoDoDia], motivo: null };
    case "isencao_horario":
      return {
        modo: "sem_desvios",
        janelas: [],
        motivo: "Vinculo com isencao de horario: nao ha desvios de horario.",
      };
    case "livre":
    case "banco_horas":
      return {
        modo: "sem_desvios",
        janelas: [],
        motivo: "Horario livre ou em banco de horas: nao ha desvios de horario.",
      };
    case "repartido":
    case "outro":
    default:
      return {
        modo: "nao_definido",
        janelas: [],
        motivo: "Tipo de horario sem regra de desvios definida.",
      };
  }
}

// ---------------------------------------------------------------------------
// 2. Medidas de um dia
// ---------------------------------------------------------------------------

/**
 * Mede o dia. So ha medidas quando planeado > 0 e realizado > 0; caso
 * contrario devolve `null` (realizado 0 com planeado > 0 e uma falta, fluxo
 * existente; planeado 0 e feriado/descanso, D4).
 */
export function medirDia(
  planeado: readonly Periodo[],
  realizado: readonly Periodo[],
): MedidasDia | null {
  const faixasPlaneado = fundir(planeado);
  const faixasRealizado = fundir(realizado);
  const planeadoMin = total(faixasPlaneado);
  const realizadoMin = total(faixasRealizado);
  if (planeadoMin <= 0 || realizadoMin <= 0) return null;

  const coberto = sobreposicao(faixasPlaneado, faixasRealizado);
  const foraMin = realizadoMin - coberto;
  const emFaltaMin = planeadoMin - coberto;
  return {
    planeadoMin,
    realizadoMin,
    foraMin,
    emFaltaMin,
    diferencaMin: realizadoMin - planeadoMin,
    desvioHorarioMin: Math.min(foraMin, emFaltaMin),
  };
}

// ---------------------------------------------------------------------------
// 3. Classificacao contra a margem
// ---------------------------------------------------------------------------

/**
 * Desvio quando o valor absoluto e MAIOR que a margem (igual nao e desvio).
 * Cada medida em separado. A natureza: o tempo manda (mais = hora extra,
 * menos = tempo a menos); sem desvio de tempo, o de horario.
 */
export function classificarDia(
  medidas: MedidasDia | null,
  margemMin: number,
): ClassificacaoDia {
  if (!medidas) return { temDesvioTempo: false, temDesvioHorario: false, natureza: null };
  const temDesvioTempo = Math.abs(medidas.diferencaMin) > margemMin;
  const temDesvioHorario = Math.abs(medidas.desvioHorarioMin) > margemMin;
  let natureza: NaturezaDesvio | null = null;
  if (temDesvioTempo) {
    natureza = medidas.diferencaMin > 0 ? "hora_extra" : "tempo_a_menos";
  } else if (temDesvioHorario) {
    natureza = "desvio_horario";
  }
  return { temDesvioTempo, temDesvioHorario, natureza };
}

// ---------------------------------------------------------------------------
// 4. Minutos que contam
// ---------------------------------------------------------------------------

/**
 * Quantos minutos contam do dia, e quantos desses sao hora extra validada.
 * - sem desvio (dentro da margem): o planeado;
 * - normal: o planeado, sem extra;
 * - hora_extra: o realizado; extra = realizado - planeado (nunca negativo);
 * - aceitar_desvio: o realizado, sem extra (D1);
 * - a_validar (ou sem decisao): provisoriamente o planeado.
 */
export function minutosQueContam(
  dia: DiaParaContar,
  decisao: DecisaoDesvio | null,
): MinutosQueContam {
  if (!dia.temDesvio) return { contadoMin: dia.planeadoMin, extraMin: 0 };
  switch (decisao) {
    case "hora_extra":
      return {
        contadoMin: dia.realizadoMin,
        extraMin: Math.max(dia.realizadoMin - dia.planeadoMin, 0),
      };
    case "aceitar_desvio":
      return { contadoMin: dia.realizadoMin, extraMin: 0 };
    case "normal":
    case "a_validar":
    default:
      return { contadoMin: dia.planeadoMin, extraMin: 0 };
  }
}
