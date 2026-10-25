// A resposta do cliente a uma proposta, feita a partir do guia do negócio (sem sair da ficha): aceitar ou recusar. São as mesmas escritas que a página
// de propostas faz (`handleAcceptProposal` e `rejectProposalCore`): a etapa «ganha» ou «perdida» da organização é a que tem a bandeira `is_won` ou
// `is_lost` (nunca o nome), o estado, a data e o motivo, a cascata do motivo para os orçamentos ligados, o recálculo do valor e o workflow da etapa.
// Falham com um Error de mensagem legível; o chamador mostra-a. O workflow é a única parte «a melhor esforço»: devolve `workflowFailed`.
import { supabase } from "@/integrations/supabase/client";
import { exigirPermissao } from "@/lib/exigirPermissao";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { runProposalStageWorkflow } from "@/lib/proposals/runStageWorkflow";

/** O motivo da recusa tal como o diálogo de motivos o entrega. */
export interface MotivoDaRecusa {
  reasonId: string | null;
  code: string;
  label: string;
  notes: string | null;
}

interface EtapaDaProposta {
  id: string;
  is_active: boolean;
  is_won: boolean;
  is_lost: boolean;
}

interface PedidoBase {
  propostaId: string;
  organizationId: string;
  /** As permissões da sessão; sem `proposals.edit` (a que a página de propostas exige) a gravação recusa-se, e sem lista conhecida (`undefined`) também. */
  permissoes: readonly string[] | undefined;
}

export interface ResultadoDaResposta {
  workflowFailed: boolean;
}

const SEM_LINHA = "A proposta não foi alterada: já não está disponível ou não tem permissão para a alterar.";

const COLUNAS_ETAPA = "id, name, label, stage_order, is_active, is_won, is_lost";

/** As etapas ativas da organização; sem etapas próprias valem as globais (a mesma regra da página de propostas). */
async function etapasAtivas(organizationId: string): Promise<EtapaDaProposta[]> {
  const [propria, global] = await Promise.all([
    supabase.from("proposal_workflow_stages").select(COLUNAS_ETAPA).eq("organization_id", organizationId).order("stage_order"),
    supabase.from("proposal_workflow_stages").select(COLUNAS_ETAPA).is("organization_id", null).order("stage_order"),
  ]);
  // Uma leitura que falha não é «sem etapas»: cair nas globais gravaria uma etapa que não é da organização, e um erro de configuração falso esconderia a falha.
  if (propria.error) throw propria.error;
  const daOrg = (propria.data ?? []) as EtapaDaProposta[];
  if (daOrg.length > 0) return daOrg.filter((e) => e.is_active);
  // As globais só valem se a leitura própria correu bem e veio vazia.
  if (global.error) throw global.error;
  return ((global.data ?? []) as EtapaDaProposta[]).filter((e) => e.is_active);
}

/** A etapa em que a proposta está agora (a de onde sai); a leitura é da organização pedida e uma proposta que não é dela não existe. */
async function etapaAtualDaProposta(pedido: PedidoBase): Promise<string | null> {
  const { data, error } = await supabase.from("proposals").select("stage_id").eq("id", pedido.propostaId).eq("organization_id", pedido.organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("A proposta já não está disponível.");
  return ((data as { stage_id: string | null }).stage_id) ?? null;
}

/** `recalculate_proposal_value` não consta dos tipos gerados da base: chama-se sem eles. */
const rpcSemTipos = (nome: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ error: unknown }> }).rpc(nome, args);

/** Quem escreve: a sessão (para o workflow) e o utilizador de negócio (para a auditoria). */
async function quemEscreve(): Promise<{ authId: string }> {
  const { data: { user }, error: erroSessao } = await supabase.auth.getUser();
  if (erroSessao) throw erroSessao;
  if (!user) throw new Error("Not authenticated");
  const negocioUser = await resolveCurrentBusinessUserId();
  if (!negocioUser) throw new Error("Utilizador não identificado");
  // Sem o contexto de auditoria a escrita ficaria sem autor: não se escreve.
  const { error: erroAuditoria } = await supabase.rpc("set_audit_context", { p_user_id: negocioUser, p_source: "ui" });
  if (erroAuditoria) throw erroAuditoria;
  return { authId: user.id };
}

export async function aceitarProposta(pedido: PedidoBase): Promise<ResultadoDaResposta> {
  exigirPermissao(pedido.permissoes, "proposals.edit", "aceitar a proposta");
  const etapa = (await etapasAtivas(pedido.organizationId)).find((e) => e.is_won);
  if (!etapa) throw new Error("Estágio 'Aceite' não encontrado");
  const antes = await etapaAtualDaProposta(pedido);
  const { authId } = await quemEscreve();
  const { data, error } = await supabase.from("proposals")
    .update({ stage_id: etapa.id, status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", pedido.propostaId).eq("organization_id", pedido.organizationId).select("id");
  if (error) throw error;
  // A RLS que recusa devolve sem erro e sem linhas: sem esta confirmação o ecrã dizia «registado» sem nada gravado.
  if (!data || data.length === 0) throw new Error(SEM_LINHA);
  const workflowFailed = await runProposalStageWorkflow({
    entityId: pedido.propostaId, newStageId: etapa.id, oldStageId: antes, organizationId: pedido.organizationId, triggeredBy: authId,
  });
  return { workflowFailed };
}

export async function recusarProposta(pedido: PedidoBase & { motivo: MotivoDaRecusa }): Promise<ResultadoDaResposta> {
  exigirPermissao(pedido.permissoes, "proposals.edit", "recusar a proposta");
  const etapa = (await etapasAtivas(pedido.organizationId)).find((e) => e.is_lost);
  if (!etapa) throw new Error("Estágio 'Rejeitada' não encontrado");
  const antes = await etapaAtualDaProposta(pedido);
  const { authId } = await quemEscreve();
  const { motivo } = pedido;
  const { data, error } = await supabase.from("proposals").update({
    stage_id: etapa.id, status: "rejected", rejected_at: new Date().toISOString(),
    rejection_reason_id: motivo.reasonId, rejection_reason_code: motivo.code, rejection_reason: motivo.label, rejection_notes: motivo.notes,
  }).eq("id", pedido.propostaId).eq("organization_id", pedido.organizationId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(SEM_LINHA);

  // A cascata do mesmo motivo para os orçamentos ligados que ainda estão em rascunho ou enviados. Uma falha aqui não desfaz a recusa (já gravada).
  // `.select("id")` faz a base devolver as linhas tocadas; zero linhas é legítimo (a proposta pode não ter orçamentos por rejeitar), um erro não.
  const { error: erroOrcamentos } = await supabase.from("quotes")
    .update({ estado: "rejeitado", lost_reason: motivo.label } as never)
    .eq("proposal_id", pedido.propostaId).eq("organization_id", pedido.organizationId).in("estado", ["rascunho", "enviado"]).select("id");
  if (erroOrcamentos) console.error("Erro ao rejeitar orçamentos ligados à proposta:", erroOrcamentos);

  // O valor da proposta recalcula-se já, antes de quem chamou reler a ficha.
  const { error: erroValor } = await rpcSemTipos("recalculate_proposal_value", { p_proposal_id: pedido.propostaId });
  if (erroValor) {
    console.error("Erro ao recalcular valor da proposta após recusa:", erroValor);
    captureFlowError(erroValor, "proposal-value-recalculation");
  }

  const workflowFailed = await runProposalStageWorkflow({
    entityId: pedido.propostaId, newStageId: etapa.id, oldStageId: antes, organizationId: pedido.organizationId, triggeredBy: authId,
  });
  return { workflowFailed };
}
