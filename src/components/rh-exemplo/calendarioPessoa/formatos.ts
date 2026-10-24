/**
 * Formatos de texto do calendario da pessoa. Funcoes puras; os textos traduzidos entram por `t`.
 */
import type { IntervaloFeito } from "./diferenca";
import type { PrevistoDoDia } from "./previsto";

/** O id do botao de um dia: serve a navegacao pelas setas e os testes. */
export const idDaCelula = (data: string): string => `cal-dia-${data}`;

export type Traduzir = (chave: string, parametros?: Record<string, string>) => string;

/** 70 -> «1 h 10 min», 120 -> «2 h», 45 -> «45 min». O sinal nao entra. */
export function duracao(minutos: number): string {
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

export function duracaoComSinal(minutos: number): string {
  return `${minutos < 0 ? "−" : "+"}${duracao(minutos)}`;
}

/** «09:00–13:00 · 14:00–18:00». */
export function intervalosTexto(intervalos: readonly IntervaloFeito[]): string {
  return intervalos.map((i) => `${i.inicio}–${i.fim}`).join(" · ");
}

/** O texto do horario previsto de um dia (feriado, ausencia, folga ou horas). */
export function textoPrevisto(prev: PrevistoDoDia, t: Traduzir): string {
  switch (prev.kind) {
    case "sem_contrato":
      return t("rhCal.dia.semContrato");
    case "sem_horario":
      return t("rhCal.dia.semHorario");
    case "feriado":
      return t("rhCal.dia.feriado", { nome: t(`rhCal.feriado.${prev.feriado ?? "outro"}`) });
    case "nao_trabalha":
      return t("rhCal.dia.naoTrabalha");
    case "ausencia":
      return t("rhCal.dia.ausencia", { tipo: prev.ausencia?.nome ?? "" });
    case "trabalha":
      return textoDeTrabalho(prev, t);
  }
}

function textoDeTrabalho(prev: PrevistoDoDia, t: Traduzir): string {
  if (prev.tipo === "isencao") return t("rhCal.previsto.isencao", { t: duracao(prev.minutos) });
  if (prev.tipo === "livre") return t("rhCal.previsto.livre", { h: String(prev.horasSemanais ?? 0).replace(".", ",") });
  const base = intervalosTexto(prev.intervalos);
  const pausa = prev.pausaMin > 0 ? ` · ${t("rhCal.previsto.pausa", { t: duracao(prev.pausaMin) })}` : "";
  const excecao = prev.porExcecao ? ` · ${t("rhCal.previsto.excecao")}` : "";
  const meio = prev.ausencia ? ` · ${t("rhCal.previsto.parcial", { tipo: prev.ausencia.nome })}` : "";
  return `${base}${pausa}${excecao}${meio}`;
}

export interface EntradaTextoFeito {
  previsto: PrevistoDoDia;
  feitos: readonly IntervaloFeito[];
  feitoMin: number;
  passado: boolean;
  hoje: boolean;
}

/** O texto do que foi feito (vazio quando nao havia nada para fazer). */
export function textoFeito(a: EntradaTextoFeito, t: Traduzir): string {
  if (a.feitos.length > 0) {
    const base = `${intervalosTexto(a.feitos)} · ${duracao(a.feitoMin)}`;
    return a.hoje ? `${base} · ${t("rhCal.feito.emCurso")}` : base;
  }
  if (a.previsto.tipo === "isencao" && a.previsto.kind === "trabalha") {
    return a.passado ? t("rhCal.feito.isencao") : "";
  }
  if (a.previsto.kind === "trabalha" && a.passado) return t("rhCal.feito.semRegisto");
  return a.hoje && a.previsto.kind === "trabalha" ? t("rhCal.feito.emCurso") : "";
}
