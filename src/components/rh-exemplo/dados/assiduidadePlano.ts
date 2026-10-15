/**
 * O guiao da assiduidade de exemplo: o que acontece, pessoa a pessoa, nos dias que fogem ao normal.
 * Dados puros (sem logica). O gerador (`assiduidadeSetembro.ts`) preenche com dias normais tudo o resto.
 *
 * SETEMBRO DE 2026 e o mes que ja pode ser processado: tem um caso de cada coisa e as horas extra ficam todas
 * decididas, menos UMA pendente de proposito (a do Andre, a 30/09), para o Processamento mostrar um aviso que nao
 * bloqueia. Outubro e o mes corrente: tem pendentes para o RH decidir.
 *
 * Codigos de justificacao das faltas: jp = justificada e paga, jn = justificada e nao paga,
 * pd = pendente de documento, sj = sem justificacao.
 * Estados de uma hora extra: c = confirmada, r = rejeitada, p = pendente.
 */
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import type { MotivoFalta } from "@/components/rh-exemplo/tiposAssiduidade";
import type { EstadoPedido } from "@/components/rh-exemplo/tiposAusencias";

export type CodigoJustificacao = "jp" | "jn" | "pd" | "sj";
export type EstadoDecisao = "c" | "r" | "p";

export type EventoDia =
  /** Entrada tardia. Acima da tolerancia gera uma falta de atraso (salvo `semFalta`). */
  | { k: "atr"; min: number; just?: CodigoJustificacao; id?: string; semFalta?: boolean }
  /** Saida tardia: tempo a mais. Gera hora extra (ou credito no banco de horas). */
  | { k: "ext"; min: number; est: EstadoDecisao; estAcima?: EstadoDecisao; origem: string; decisao?: string; nocturno?: number }
  /** Saida antecipada. */
  | { k: "sai"; min: number; just?: CodigoJustificacao }
  /** Falta ao primeiro periodo (m), ao ultimo (t) ou ao dia todo (d). */
  | { k: "fal"; per: "m" | "t" | "d"; motivo: MotivoFalta; just: CodigoJustificacao; id?: string; decididaPor?: string }
  /** Uma picagem a mais de 200 m do local. */
  | { k: "fora" }
  /** Folga gozada por banco de horas. */
  | { k: "folga" }
  /** Trabalho num dia de descanso ou feriado: o tempo todo e hora extra. */
  | { k: "trab"; inicio: string; fim: string; est: EstadoDecisao; origem: string };

export type PlanoDasPessoas = Record<string, Record<string, EventoDia[]>>;

export const PLANO_ASSIDUIDADE: PlanoDasPessoas = {
  "p-sofia": {
    "2026-09-03": [{ k: "ext", min: 120, est: "c", origem: "fecho de inventário, saiu às 20:00" }],
    "2026-09-08": [{ k: "atr", min: 3 }],
    "2026-09-09": [{ k: "atr", min: 20, just: "sj" }],
    "2026-09-17": [{ k: "ext", min: 90, est: "r", origem: "saiu às 19:30", decisao: "Foi tempo de formação, não trabalho extra" }],
    "2026-09-22": [{ k: "fora" }],
    "2026-09-24": [{ k: "ext", min: 180, est: "c", estAcima: "c", origem: "3 h a mais: passa as 2 h por dia", decisao: "Autorizado pela direção" }],
    "2026-09-29": [{ k: "fal", per: "m", motivo: "luto", just: "jp", decididaPor: "p-marta" }],
    "2026-10-06": [{ k: "ext", min: 90, est: "p", origem: "saiu às 19:30" }],
    "2026-10-08": [{ k: "atr", min: 12, semFalta: true }],
    "2026-10-09": [{ k: "ext", min: 180, est: "p", estAcima: "p", origem: "3 h a mais: passa as 2 h por dia" }],
  },
  "p-andre": {
    "2026-09-04": [{ k: "fal", per: "m", motivo: "doenca", just: "jp", decididaPor: "p-marta" }],
    "2026-09-10": [{ k: "ext", min: 45, est: "r", origem: "descarga de camião fora de horas", decisao: "Sem autorização da chefia" }],
    "2026-09-11": [{ k: "fal", per: "t", motivo: "assuntos_pessoais", just: "jn", decididaPor: "p-marta" }],
    "2026-09-15": [{ k: "atr", min: 8, just: "sj" }],
    "2026-09-30": [{ k: "ext", min: 120, est: "p", origem: "fecho do mês, saiu às 20:00" }],
    // Atraso de 14 min justificado (consulta médica) e aceite pelo RH como paga: a falta nasce justificada e paga.
    "2026-10-06": [{ k: "atr", min: 14, just: "jp", id: "fa-andre-justificada" }],
    "2026-10-07": [{ k: "ext", min: 45, est: "p", origem: "descarga de camião fora de horas" }],
  },
  "p-rui": {
    "2026-09-04": [{ k: "ext", min: 60, est: "c", origem: "inventário" }],
    "2026-09-11": [{ k: "ext", min: 120, est: "c", origem: "inventário" }],
    "2026-09-12": [{ k: "sai", min: 60 }],
    "2026-09-13": [{ k: "trab", inicio: "09:00", fim: "11:00", est: "c", origem: "domingo de descanso trabalhado" }],
    "2026-09-18": [{ k: "folga" }],
    "2026-10-05": [{ k: "trab", inicio: "09:00", fim: "11:00", est: "c", origem: "feriado trabalhado" }],
    "2026-10-09": [{ k: "ext", min: 90, est: "c", origem: "inventário" }],
    "2026-10-11": [{ k: "trab", inicio: "09:00", fim: "10:30", est: "p", origem: "domingo de descanso trabalhado" }],
    "2026-10-13": [{ k: "atr", min: 20, just: "sj", id: "fa-rui" }],
  },
  "p-ines": {
    "2026-09-17": [{ k: "ext", min: 150, est: "c", origem: "semana com 2 h 30 a mais" }],
    "2026-09-24": [{ k: "fal", per: "d", motivo: "ausencia_nao_comunicada", just: "sj" }],
    // Atraso de 15 min sem falta marcada (falta sugerida): a Inês justificou e a justificação espera decisão do RH.
    "2026-10-07": [{ k: "atr", min: 15, semFalta: true }],
    "2026-10-09": [{ k: "ext", min: 150, est: "p", origem: "semana com 2 h 30 a mais" }],
  },
  "p-tiago": {
    "2026-09-04": [{ k: "atr", min: 15, just: "jp" }],
    "2026-09-12": [{ k: "ext", min: 60, est: "c", origem: "saiu às 19:00" }],
    "2026-09-18": [{ k: "fora" }],
    "2026-10-08": [{ k: "fal", per: "m", motivo: "doenca", just: "pd", id: "fa-tiago" }],
    "2026-10-09": [{ k: "ext", min: 60, est: "p", origem: "saiu às 19:00" }],
  },
  "p-carolina": {
    "2026-09-08": [{ k: "atr", min: 6, just: "jn" }],
    "2026-09-12": [{ k: "ext", min: 40, est: "p", origem: "saiu às 18:40" }],
    "2026-09-16": [{ k: "fal", per: "d", motivo: "doenca", just: "jn" }],
    "2026-10-06": [{ k: "fal", per: "m", motivo: "ausencia_nao_comunicada", just: "sj", id: "fa-carolina" }],
  },
  "p-hugo": {
    "2026-09-08": [{ k: "fal", per: "m", motivo: "assuntos_pessoais", just: "jn" }],
    "2026-09-15": [{ k: "atr", min: 25, just: "sj" }],
    "2026-09-19": [{ k: "ext", min: 60, est: "c", origem: "saiu à meia-noite", nocturno: 60 }],
    "2026-09-26": [{ k: "ext", min: 30, est: "r", origem: "saiu às 23:30", nocturno: 30, decisao: "Sem autorização da chefia" }],
    "2026-09-27": [{ k: "trab", inicio: "19:00", fim: "21:00", est: "c", origem: "domingo de descanso trabalhado" }],
    "2026-10-07": [{ k: "ext", min: 45, est: "p", origem: "saiu às 23:45", nocturno: 45 }],
    "2026-10-09": [{ k: "fal", per: "t", motivo: "assuntos_pessoais", just: "jp", id: "fa-hugo", decididaPor: "p-ines" }],
  },
  "p-beatriz": {
    "2026-09-04": [{ k: "atr", min: 3 }],
    "2026-09-19": [{ k: "ext", min: 30, est: "p", origem: "saiu às 18:30" }],
    // Atraso de 12 min sem falta marcada: a justificação da Beatriz foi recusada e ainda há prazo para voltar a enviar.
    "2026-10-09": [{ k: "atr", min: 12, semFalta: true }],
  },
  "p-daniel": {
    "2026-09-16": [{ k: "fal", per: "d", motivo: "doenca", just: "pd" }],
    "2026-09-23": [{ k: "atr", min: 2 }],
  },
};

export interface AusenciaDoPlano {
  codigo: string;
  de: string;
  ate: string;
  estado: EstadoPedido;
}

/** Ausencias com datas fixas (Setembro). As relativas a hoje, mais antigas, juntam-se em `ausenciasDoPlano`. */
export const AUSENCIAS_FIXAS: Record<string, AusenciaDoPlano[]> = {
  "p-sofia": [{ codigo: "FERIAS", de: "2026-09-14", ate: "2026-09-16", estado: "aprovado" }],
  "p-andre": [{ codigo: "FERIAS", de: "2026-09-21", ate: "2026-09-25", estado: "aprovado" }],
  "p-marta": [{ codigo: "FERIAS", de: "2026-09-28", ate: "2026-10-02", estado: "aprovado" }],
  "p-ines": [{ codigo: "BAIXA_MEDICA", de: "2026-09-09", ate: "2026-09-09", estado: "aprovado" }],
  "p-beatriz": [{ codigo: "FERIAS", de: "2026-09-08", ate: "2026-09-10", estado: "aprovado" }],
  "p-joana": [{ codigo: "BAIXA_MEDICA", de: "2026-09-01", ate: "2026-10-31", estado: "aprovado" }],
};

/** As mais antigas, que ja existiam, em dias relativos a hoje: [codigo, de, ate, estado]. */
export const AUSENCIAS_RELATIVAS: Record<string, Array<[string, number, number, EstadoPedido]>> = {
  "p-rui": [["FERIAS", -60, -49, "aprovado"], ["FERIAS", 30, 37, "pendente_chefia"]],
  "p-tiago": [["BAIXA_MEDICA", -20, -18, "aprovado"]],
  "p-carolina": [["FERIAS", 50, 52, "pendente_chefia"]],
  "p-hugo": [["FERIAS", 70, 77, "aprovado"]],
  "p-sofia": [["TELETRABALHO", -10, -10, "aprovado"]],
  "p-ines": [["FERIAS", -120, -110, "aprovado"]],
};

/** Todas as ausencias da pessoa, com datas absolutas: as fixas de Setembro e as relativas a hoje. */
export function ausenciasDoPlano(pessoaId: string): AusenciaDoPlano[] {
  const relativas = (AUSENCIAS_RELATIVAS[pessoaId] ?? []).map(([codigo, de, ate, estado]) => ({
    codigo, de: diaIso(de), ate: diaIso(ate), estado,
  }));
  return [...relativas, ...(AUSENCIAS_FIXAS[pessoaId] ?? [])];
}
