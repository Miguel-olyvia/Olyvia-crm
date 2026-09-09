/**
 * Alertas derivados do estado de uma ordem.
 *
 * Cada um destes existe porque o levantamento encontrou o problema em
 * produção, sem que nada o sinalizasse:
 *
 *   · uma ordem em curso com progresso a 0% há meses;
 *   · dois agendamentos marcados ATRASADA no mesmo pedido, sem escalonamento;
 *   · uma pausa sem previsão de retoma nenhuma.
 *
 * O Infraspeak tem a informação toda. O que não tem é quem olhe por ela.
 */

import type { Estado } from "./tipos";
import { estaAtrasada } from "./estados";

export type Severidade = "aviso" | "critico";

export interface Alerta {
  chave: "atrasada" | "parada" | "retoma_ultrapassada" | "por_aprovar_ha_muito";
  severidade: Severidade;
  texto: string;
}

export interface OrdemParaAlertas {
  estado: Estado;
  agendadaPara: Date | null;
  iniciadaEm: Date | null;
  ultimaAtividadeEm: Date | null;
  pausaRetomaPrevista: Date | null;
  criadaEm: Date | null;
}

/** Dias inteiros entre duas datas. */
export function diasEntre(de: Date, ate: Date): number {
  return Math.floor((ate.getTime() - de.getTime()) / 86_400_000);
}

function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural_}`;
}

/** Quantos dias uma ordem em curso pode ficar sem atividade antes de gritar. */
const DIAS_ATE_PARADA = 7;
/** Quantos dias uma ordem pode esperar aprovação antes de gritar. */
const DIAS_ATE_APROVACAO_TARDIA = 2;

export function alertasDaOrdem(
  o: OrdemParaAlertas,
  agora: Date = new Date()
): Alerta[] {
  const alertas: Alerta[] = [];

  if (estaAtrasada(o.estado, o.agendadaPara, agora) && o.agendadaPara) {
    const dias = diasEntre(o.agendadaPara, agora);
    alertas.push({
      chave: "atrasada",
      severidade: dias >= 7 ? "critico" : "aviso",
      texto:
        dias >= 1
          ? `Atrasada ${plural(dias, "dia", "dias")}`
          : "Atrasada",
    });
  }

  // Ordem em curso sem sinal de vida. A referência do Infraspeak: uma ordem
  // em curso há sete meses, com progresso a zero.
  if (o.estado === "em_curso") {
    const desde = o.ultimaAtividadeEm ?? o.iniciadaEm;
    if (desde) {
      const dias = diasEntre(desde, agora);
      if (dias >= DIAS_ATE_PARADA) {
        alertas.push({
          chave: "parada",
          severidade: dias >= 30 ? "critico" : "aviso",
          texto: `Parada há ${plural(dias, "dia", "dias")}`,
        });
      }
    }
  }

  if (
    o.estado === "pausada" &&
    o.pausaRetomaPrevista &&
    o.pausaRetomaPrevista.getTime() < agora.getTime()
  ) {
    const dias = diasEntre(o.pausaRetomaPrevista, agora);
    alertas.push({
      chave: "retoma_ultrapassada",
      severidade: dias >= 7 ? "critico" : "aviso",
      texto:
        dias >= 1
          ? `Retoma ultrapassada há ${plural(dias, "dia", "dias")}`
          : "Retoma ultrapassada",
    });
  }

  if (o.estado === "por_aprovar" && o.criadaEm) {
    const dias = diasEntre(o.criadaEm, agora);
    if (dias >= DIAS_ATE_APROVACAO_TARDIA) {
      alertas.push({
        chave: "por_aprovar_ha_muito",
        severidade: dias >= 7 ? "critico" : "aviso",
        texto: `Por aprovar há ${plural(dias, "dia", "dias")}`,
      });
    }
  }

  return alertas;
}

/** A severidade que a linha deve mostrar. `null` = nada a assinalar. */
export function severidadeMaxima(alertas: readonly Alerta[]): Severidade | null {
  if (alertas.some((a) => a.severidade === "critico")) return "critico";
  if (alertas.length > 0) return "aviso";
  return null;
}
