/**
 * Fluxo 7 (Faltas): o sistema so SUGERE, o RH MARCA. Funcoes puras: cruzamentos, estado da justificacao,
 * prazo e desconto de vencimento. O estado em memoria vive em `dados/lojaFluxosB.ts` e em `lojaGestao`.
 *
 * Desconto (documento, fluxo 7, «no fecho do mes»): desconta a falta marcada que NAO seja justificada E
 * paga (sem justificacao, recusada, justificada nao paga, ou ainda pendente de documento, de forma
 * provisoria), mais os atrasos acima da tolerancia. Falta anulada ou corrigida nao conta.
 */
import { somarDiasUteis } from "@/components/rh-exemplo/lib/diasUteis";
import {
  TOLERANCIA_ATRASO_MINUTOS,
  minutosDeHora,
  motivoValido,
} from "@/components/rh-exemplo/lib/horarioTipos";
import type { AlertaDia } from "@/components/rh-exemplo/lib/alertasFimDia";
import type { EstadoFalta, EstadoJustificacao, MotivoFalta } from "@/components/rh-exemplo/tiposAssiduidade";

/** A omissao (5), de um so sitio: o prazo REAL e o da organizacao (`usePrazoJustificacao`), nao esta constante. */
export { PRAZO_JUSTIFICACAO_OMISSAO as PRAZO_JUSTIFICACAO_FALTA_DIAS_UTEIS } from "@/components/rh-exemplo/hooks/prazoJustificacao";
/** Convencao de exemplo: um meio dia de ausencia aprovado cobre a manha (ate as 13:00). */
const FIM_DA_MANHA_MINUTOS = 13 * 60;

export interface PeriodoFalta {
  data: string;
  inicio: string;
  fim: string;
}

export interface ContextoFalta {
  realizado: Array<{ data: string; hora_inicio: string; hora_fim: string }>;
  faltas: Array<{ data: string; hora_inicio: string; hora_fim: string; estado: EstadoFalta }>;
  ausencias: Array<{ data: string; fraccao_dia: number; estado: string }>;
}

export type TipoCruzamento = "tempo_trabalhado" | "outra_falta" | "ausencia_dia_inteiro" | "ausencia_meio_dia";

export type ResultadoMarcacao =
  | { ok: true; avisos: string[] }
  | { ok: false; erro: string; detalhe?: string };

const hhmm = (hora: string): string => hora.slice(0, 5);

function sobrepoe(inicio: string, fim: string, outroInicio: string, outroFim: string): boolean {
  const [a, b, c, d] = [inicio, fim, outroInicio, outroFim].map((h) => minutosDeHora(h) ?? 0);
  return a < d && c < b;
}

export function minutosDoPeriodo(inicio: string, fim: string): number {
  const a = minutosDeHora(inicio);
  const b = minutosDeHora(fim);
  return a === null || b === null || b <= a ? 0 : b - a;
}

function primeiroCruzamento(periodo: PeriodoFalta, contexto: ContextoFalta): { tipo: TipoCruzamento; detalhe: string } | null {
  const noDia = <T extends { data: string }>(linhas: T[]): T[] => linhas.filter((l) => l.data === periodo.data);
  const trabalhado = noDia(contexto.realizado).find((r) => sobrepoe(periodo.inicio, periodo.fim, r.hora_inicio, r.hora_fim));
  if (trabalhado) return { tipo: "tempo_trabalhado", detalhe: `${hhmm(trabalhado.hora_inicio)}-${hhmm(trabalhado.hora_fim)}` };
  const outra = noDia(contexto.faltas).find(
    (f) => f.estado === "activa" && sobrepoe(periodo.inicio, periodo.fim, f.hora_inicio, f.hora_fim),
  );
  if (outra) return { tipo: "outra_falta", detalhe: `${hhmm(outra.hora_inicio)}-${hhmm(outra.hora_fim)}` };
  const aprovada = noDia(contexto.ausencias).find((a) => a.estado === "aprovado");
  if (!aprovada) return null;
  if (aprovada.fraccao_dia >= 1) return { tipo: "ausencia_dia_inteiro", detalhe: periodo.data };
  return (minutosDeHora(periodo.inicio) ?? 0) < FIM_DA_MANHA_MINUTOS ? { tipo: "ausencia_meio_dia", detalhe: periodo.data } : null;
}

/** Marcar falta: valida o periodo e o motivo e recusa o que cruza tempo trabalhado, outra falta ou ausencia aprovada. */
export function validarMarcacaoFalta(periodo: PeriodoFalta, motivo: string, contexto: ContextoFalta): ResultadoMarcacao {
  if (!periodo.data || minutosDeHora(periodo.inicio) === null || minutosDeHora(periodo.fim) === null) {
    return { ok: false, erro: "rhExemplo.fal.erro.semPeriodo" };
  }
  if (minutosDoPeriodo(periodo.inicio, periodo.fim) <= 0) return { ok: false, erro: "rhExemplo.fal.erro.fimAntesInicio" };
  if (!motivoValido(motivo)) return { ok: false, erro: "rhExemplo.fal.erro.motivoCurto" };
  const cruzamento = primeiroCruzamento(periodo, contexto);
  if (cruzamento) return { ok: false, erro: `rhExemplo.fal.erro.${cruzamento.tipo}`, detalhe: cruzamento.detalhe };
  const avisos: string[] = [];
  if (contexto.ausencias.some((a) => a.data === periodo.data && a.estado.startsWith("pendente"))) {
    avisos.push("rhExemplo.fal.aviso.ausenciaPendente");
  }
  if (contexto.ausencias.some((a) => a.data === periodo.data && a.estado === "aprovado" && a.fraccao_dia < 1)) {
    avisos.push("rhExemplo.fal.aviso.outraMetade");
  }
  return { ok: true, avisos };
}

export type FaltaComPessoa = ContextoFalta["faltas"][number] & { pessoa_id: string };

export interface SugestaoFalta {
  alertaId: string;
  pessoaId: string;
  data: string;
  inicio: string;
  fim: string;
  minutos: number;
}

/** Sugestoes (so uma linha na lista do RH, nao descontam nada): periodos planeados sem tempo feito, ainda sem falta. */
export function sugestoesDeFalta(alertas: AlertaDia[], faltas: FaltaComPessoa[]): SugestaoFalta[] {
  return alertas
    .filter((a) => (a.tipo === "planeado_sem_realizado" || a.tipo === "parcialmente_realizado") && a.estado === "pendente")
    .filter((a) => a.horaInicio && a.horaFim && (a.minutos ?? 0) > 0)
    .filter(
      (a) =>
        !faltas.some(
          (f) =>
            f.pessoa_id === a.pessoaId &&
            f.data === a.data &&
            f.estado === "activa" &&
            sobrepoe(a.horaInicio ?? "", a.horaFim ?? "", f.hora_inicio, f.hora_fim),
        ),
    )
    .map((a) => ({
      alertaId: a.id,
      pessoaId: a.pessoaId,
      data: a.data,
      inicio: hhmm(a.horaInicio ?? ""),
      fim: hhmm(a.horaFim ?? ""),
      minutos: a.minutos ?? 0,
    }));
}

/* ---- Justificacao ---- */

export type RotuloJustificacao =
  | "sem_justificacao"
  | "pendente_documento"
  | "justificada_paga"
  | "justificada_nao_paga"
  | "recusada";

export function rotuloDaJustificacao(falta: { justificacao_estado: EstadoJustificacao; remunerada: boolean }): RotuloJustificacao {
  if (falta.justificacao_estado === "justificada") return falta.remunerada ? "justificada_paga" : "justificada_nao_paga";
  return falta.justificacao_estado;
}

export function prazoParaJustificar(dataDaFalta: string, prazoDias: number): string {
  return somarDiasUteis(dataDaFalta, prazoDias);
}

export function foraDoPrazoDeJustificar(dataDaFalta: string, hoje: string, prazoDias: number): boolean {
  return hoje > prazoParaJustificar(dataDaFalta, prazoDias);
}

/** Registar a justificacao: pendente de documento dentro do prazo da organizacao; fora dele fica sem justificacao. */
export function registarJustificacao(
  falta: { data: string; estado: EstadoFalta },
  dados: { texto: string; hoje: string; prazoDias: number },
): { ok: true; estado: "pendente_documento" | "sem_justificacao"; foraDoPrazo: boolean } | { ok: false; erro: string } {
  if (falta.estado !== "activa") return { ok: false, erro: "rhExemplo.fal.erro.faltaAnulada" };
  if (!motivoValido(dados.texto)) return { ok: false, erro: "rhExemplo.fal.erro.semTexto" };
  const fora = foraDoPrazoDeJustificar(falta.data, dados.hoje, dados.prazoDias);
  return { ok: true, estado: fora ? "sem_justificacao" : "pendente_documento", foraDoPrazo: fora };
}

export type DecisaoJustificacaoFalta = "justificada_paga" | "justificada_nao_paga" | "recusada";

export interface PatchJustificacao {
  justificacao_estado: EstadoJustificacao;
  justificada: boolean;
  remunerada: boolean;
  justificacao_motivo: string | null;
}

/** O RH decide: justificada (paga ou nao) ou recusada com motivo. So sobre uma falta ativa pendente de documento. */
export function decidirJustificacaoFalta(
  falta: { estado: EstadoFalta; justificacao_estado: EstadoJustificacao },
  decisao: DecisaoJustificacaoFalta,
  motivo: string,
): { ok: true; patch: PatchJustificacao } | { ok: false; erro: string } {
  if (falta.estado !== "activa") return { ok: false, erro: "rhExemplo.fal.erro.faltaAnulada" };
  if (falta.justificacao_estado !== "pendente_documento") return { ok: false, erro: "rhExemplo.fal.erro.naoPendente" };
  if (decisao === "recusada") {
    if (!motivoValido(motivo)) return { ok: false, erro: "rhExemplo.fal.erro.motivoCurto" };
    return { ok: true, patch: { justificacao_estado: "recusada", justificada: false, remunerada: false, justificacao_motivo: motivo.trim() } };
  }
  return {
    ok: true,
    patch: {
      justificacao_estado: "justificada",
      justificada: true,
      remunerada: decisao === "justificada_paga",
      justificacao_motivo: motivo.trim() === "" ? null : motivo.trim(),
    },
  };
}

/* ---- Desconto ---- */

export type RazaoDesconto =
  | "anulada"
  | "justificada_paga"
  | "atraso_dentro_tolerancia"
  | "sem_justificacao"
  | "pendente_documento"
  | "justificada_nao_paga"
  | "recusada";

export interface DescontoDaFalta {
  desconta: boolean;
  minutos: number;
  valor: number;
  razao: RazaoDesconto;
  /** Pendente de documento: conta ja, mas pode deixar de contar se for justificada e paga. */
  provisorio: boolean;
}

export interface FaltaParaDesconto {
  minutos: number;
  estado: EstadoFalta;
  justificacao_estado: EstadoJustificacao;
  remunerada: boolean;
  motivo_codigo: MotivoFalta;
}

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

/** Valor da hora de exemplo: retribuicao mensal / (horas semanais x 4), como nos exemplos do documento (1000 / 160). */
export function valorHoraDeExemplo(valorMensal: number, horasSemanais: number): number {
  return horasSemanais > 0 ? arredondar(valorMensal / (horasSemanais * 4)) : 0;
}

export function descontoDaFalta(
  falta: FaltaParaDesconto,
  valorHora: number,
  tolerancia: number = TOLERANCIA_ATRASO_MINUTOS,
): DescontoDaFalta {
  const sem = (razao: RazaoDesconto): DescontoDaFalta => ({ desconta: false, minutos: 0, valor: 0, razao, provisorio: false });
  if (falta.estado !== "activa") return sem("anulada");
  if (falta.justificacao_estado === "justificada" && falta.remunerada) return sem("justificada_paga");
  if (falta.motivo_codigo === "atraso" && falta.minutos <= tolerancia) return sem("atraso_dentro_tolerancia");
  const razao: RazaoDesconto =
    falta.justificacao_estado === "justificada" ? "justificada_nao_paga" : (falta.justificacao_estado as RazaoDesconto);
  return {
    desconta: true,
    minutos: falta.minutos,
    valor: arredondar((falta.minutos / 60) * valorHora),
    razao,
    provisorio: falta.justificacao_estado === "pendente_documento",
  };
}

export function totalDeDescontos(faltas: FaltaParaDesconto[], valorHora: number, tolerancia?: number): number {
  return arredondar(faltas.reduce((soma, f) => soma + descontoDaFalta(f, valorHora, tolerancia).valor, 0));
}
