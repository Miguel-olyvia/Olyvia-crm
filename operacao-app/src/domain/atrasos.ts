/**
 * Atrasos de tarefas de obra e alertas do supervisor — as regras puras.
 *
 * A base (db/obras.sql, secção 11b) é quem decide; isto é o que o ecrã
 * precisa para pedir bem e mostrar bem: os motivos, a conversão "mais 2 h"
 * → mão de obra, e os rótulos dos alertas.
 */

import { MINUTOS_POR_DIA, distanciaUteis } from "./obras";

export const MOTIVOS_ATRASO = [
  "secagem",
  "condicoes_edificio",
  "material_em_falta",
  "trabalho_imprevisto",
  "acesso_cliente",
  "meteorologia",
  "equipa",
  "outro",
] as const;
export type MotivoAtraso = (typeof MOTIVOS_ATRASO)[number];

export const ROTULO_MOTIVO_ATRASO: Record<MotivoAtraso, string> = {
  secagem: "Secagem / cura",
  condicoes_edificio: "Condições do edifício",
  material_em_falta: "Material em falta",
  trabalho_imprevisto: "Trabalho imprevisto",
  acesso_cliente: "Acesso / cliente",
  meteorologia: "Meteorologia",
  equipa: "Equipa (faltas, doença)",
  outro: "Outro",
};

export function rotuloMotivoAtraso(m: string | null | undefined): string {
  return (m && ROTULO_MOTIVO_ATRASO[m as MotivoAtraso]) || "Outro";
}

/** O contexto tem de dizer alguma coisa: é o que o supervisor e o cliente leem. */
export const CONTEXTO_MINIMO = 5;

export type TipoAlerta = "fim_ultrapassado" | "nao_iniciada" | "cliente_por_avisar";

export const ROTULO_TIPO_ALERTA: Record<TipoAlerta, string> = {
  fim_ultrapassado: "Fim ultrapassado",
  nao_iniciada: "Não iniciada a tempo",
  cliente_por_avisar: "Cliente por avisar",
};

/** O título de um bloco de alertas: "2 tarefas não iniciadas a tempo". */
export function rotuloContagemAlerta(tipo: TipoAlerta, n: number): string {
  const um = n === 1;
  switch (tipo) {
    case "fim_ultrapassado":
      return um ? "1 tarefa passou do fim previsto" : `${n} tarefas passaram do fim previsto`;
    case "nao_iniciada":
      return um ? "1 tarefa não iniciada a tempo" : `${n} tarefas não iniciadas a tempo`;
    case "cliente_por_avisar":
      return um ? "1 atraso por avisar ao cliente" : `${n} atrasos por avisar ao cliente`;
  }
}

export type UnidadeExtra = "horas" | "dias";

/**
 * "Mais quanto tempo?" → minutos de mão de obra (pessoa × min), que é o que
 * a base guarda. Em horas: horas de calendário da equipa da tarefa. Em dias:
 * dias de trabalho (minutos_por_dia) dessa equipa.
 */
export function minutosExtra(
  quantidade: number,
  unidade: UnidadeExtra,
  pessoas = 1,
  minutosPorDia: number = MINUTOS_POR_DIA
): number | null {
  if (!Number.isFinite(quantidade) || quantidade <= 0) return null;
  const k = Math.max(1, Math.round(pessoas || 1));
  const calendario = unidade === "horas" ? quantidade * 60 : quantidade * minutosPorDia;
  return Math.max(1, Math.round(calendario * k));
}

export interface PedidoAtraso {
  motivo: MotivoAtraso | "";
  contexto: string;
  /** Minutos de mão de obra a mais (já convertidos), ou null. */
  minutosExtra: number | null;
  /** Nova data de fim (yyyy-mm-dd), ou vazio. */
  novoFim: string;
  /** O fim previsto agora, para recusar uma data para trás. */
  fimAtual?: string | null;
}

/** O que falta para poder gravar (null = pode). As mesmas regras da base. */
export function validarAtraso(p: PedidoAtraso): string | null {
  if (!p.motivo) return "Escolhe o motivo do atraso.";
  if (p.contexto.trim().length < CONTEXTO_MINIMO)
    return "Escreve o contexto (pelo menos 5 letras): é o que o supervisor e o cliente vão ler.";
  if (!p.minutosExtra && !p.novoFim) return "Diz quanto tempo a mais (horas ou dias) ou a nova data de fim.";
  if (p.novoFim && p.fimAtual && p.novoFim < p.fimAtual) return "A nova data de fim é antes do fim previsto.";
  return null;
}

/** Quantos dias úteis o fim andou em relação ao plano original (0 se não andou). */
export function diasDeDesvio(original: string | null | undefined, atual: string | null | undefined): number {
  if (!original || !atual) return 0;
  return distanciaUteis(original, atual);
}

/** "+3 dias úteis", "−1 dia útil", "" (sem desvio). */
export function formatarDesvio(dias: number): string {
  if (!dias) return "";
  const abs = Math.abs(dias);
  return `${dias > 0 ? "+" : "−"}${abs} ${abs === 1 ? "dia útil" : "dias úteis"}`;
}
