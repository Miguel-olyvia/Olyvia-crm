// Os passos «registar a resposta do cliente» (proposta enviada) e «registar a assinatura» (contrato pendente). Funções puras: reaproveitam
// `aplicarEvento` (o Workflow decide o que acontece) e devolvem o que passa a valer; quem as chama grava com `gravarAplicacao`.
// Recusar a proposta perde SEMPRE o negócio, com motivo (perde-se em qualquer fase): não passa pela célula «Proposta perdida» do Workflow.
import { aplicarEvento, type Aplicacao } from "@/components/negocio-metas/negocioAcoes";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { ConfigWorkflow } from "@/components/negocio-metas/workflowNegocio";
import { simularEvento } from "@/components/negocio-metas/workflowSimulacao";
import { passoDoItem } from "./passosProcesso";
import type { FaltaProcesso } from "./portoesProcesso";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";

export type RespostaCliente = "aceite" | "recusada";

export interface DadosResposta {
  resposta: RespostaCliente;
  /** O que fazer quando a proposta é aceite, se o Workflow pergunta (`criarContrato` ou `fecharSemContrato`). */
  escolha?: string;
  /** O motivo, quando a resposta é recusar (já resolvido: o texto livre vem em lugar de «Outro»). */
  motivo?: string;
}

/** O que a transição devolve: o que passa a valer, ou o que falta (vazio = não se aplica a este item, nada a explicar). */
export type ResultadoFase = { ok: true; aplicacao: Aplicacao } | { ok: false; emFalta: FaltaProcesso[] };

const NAO_SE_APLICA: ResultadoFase = { ok: false, emFalta: [] };
const falta = (emFalta: FaltaProcesso[]): ResultadoFase => ({ ok: false, emFalta });
const noPasso = (item: ItemProcesso, passo: PassoProcesso): boolean => passoDoItem(item).id === passo;

/** Quando a configuração pergunta o que fazer ao aceitar a proposta, há uma escolha por fazer? */
export function perguntaAoAceitar(config: ConfigWorkflow, negocio: NegocioMes): boolean {
  const sim = simularEvento(config, "aceitarProposta", negocio);
  return sim.tipo === "resultado" && sim.estado.tipo === "pergunta";
}

/** A resposta do cliente à proposta: aceitar (o Workflow diz se há contrato) ou recusar (perde o negócio, com motivo). */
export function registarResposta(negocio: NegocioMes, item: ItemProcesso, dados: DadosResposta, config: ConfigWorkflow, hoje: string): ResultadoFase {
  if (!noPasso(item, "registarRespostaCliente")) return NAO_SE_APLICA;
  if (dados.resposta === "recusada") {
    const motivo = dados.motivo?.trim() ?? "";
    return motivo === "" ? falta(["motivoEmFalta"]) : { ok: true, aplicacao: { tipo: "perdido", negocio, motivo } };
  }
  const aplicacao = aplicarEvento(config, "aceitarProposta", negocio, { escolha: dados.escolha, hoje });
  if (aplicacao) return { ok: true, aplicacao };
  return perguntaAoAceitar(config, negocio) ? falta(["escolhaEmFalta"]) : NAO_SE_APLICA;
}

/** A assinatura do contrato: o negócio fecha como ganho. */
export function registarAssinatura(negocio: NegocioMes, item: ItemProcesso, config: ConfigWorkflow, hoje: string): ResultadoFase {
  if (!noPasso(item, "registarAssinatura")) return NAO_SE_APLICA;
  const aplicacao = aplicarEvento(config, "assinarContrato", negocio, { hoje });
  return aplicacao ? { ok: true, aplicacao } : NAO_SE_APLICA;
}
