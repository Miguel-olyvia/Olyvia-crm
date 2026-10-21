// Classificar à mão a lead de uma pessoa (MQL, SQL ou limpar). Com a bandeira da migration C ligada grava SÓ a classificação, por `neg_classificar_lead`
// (a função audita e escreve o histórico sozinha). Desligada (enquanto a migration não está aplicada), como o cartão «Qualificação comercial» da página
// de Leads (LeadQualificationCard): a MESMA função da base, rpc_update_lead, com o contexto de auditoria e os mesmos parâmetros. Essa função regrava a
// linha inteira (campos, estado, origem, notas, responsável), por isso lê-se a linha atual e devolve-se tal como está; só a qualificação muda.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { withAuditContext } from "@/utils/auditContext";
import { useClassificarLeadAtivo } from "./bandeirasNegocio";
import { ErroNeg } from "./chamarNeg";
import { chaveDoErro, CHAVE_ERRO_GENERICO, codigoDoErro } from "./errosNeg";
import { invalidarPessoas } from "./invalidarPessoas";
import { useFontePessoas } from "./useFontePessoas";

/** `null` limpa a classificação. */
export type TipoQualificacao = "mql" | "sql" | null;

export interface QualificarLead {
  classificar: (tipo: TipoQualificacao) => Promise<void>;
}

interface LinhaLead {
  id: string;
  field_values: Record<string, unknown> | null;
  status: string;
  source: string | null;
  notes: string | null;
  assigned_to: string | null;
}

const COLUNAS = "id, field_values, status, source, notes, assigned_to";

const erroGenerico = () => new ErroNeg(null, null, CHAVE_ERRO_GENERICO);

function comoErroNeg(erro: unknown): ErroNeg {
  if (erro instanceof ErroNeg) return erro;
  const codigo = codigoDoErro(erro);
  // Os códigos NG e 42501 são esperados e a ficha mostra a mensagem; o resto é avaria.
  if (!codigo) captureFlowError(erro, "pessoas-qualificar-lead");
  return new ErroNeg(erro, codigo, chaveDoErro(erro));
}

/** O caminho novo: uma só chamada, com a organização, a lead e o tipo; a função decide a permissão, a auditoria e o histórico. */
async function classificarPorFuncao(organizationId: string, leadId: string, tipo: TipoQualificacao): Promise<void> {
  const { error } = await (supabase as any).rpc("neg_classificar_lead", { p_organization_id: organizationId, p_lead_id: leadId, p_tipo: tipo });
  if (error) throw error;
}

/** O caminho antigo (rpc_update_lead): relê a linha e devolve-a tal como está, com o contexto de auditoria. */
async function classificarPorRegravar(organizationId: string, utilizadorId: string, leadId: string, tipo: TipoQualificacao): Promise<void> {
  const lead = await lerLead(organizationId, leadId);
  await withAuditContext(supabase, utilizadorId, async () => {
    // `null` tem de ir como null (um `undefined` desaparece do pedido e a função deixa de se reconhecer); os tipos gerados não o admitem.
    const { error } = await (supabase as any).rpc("rpc_update_lead", {
      p_lead_id: lead.id,
      p_field_values: lead.field_values ?? {},
      p_status: lead.status,
      p_source: lead.source ?? null,
      p_notes: lead.notes ?? null,
      p_assigned_to: lead.assigned_to ?? null,
      p_status_changed: false,
      p_workflow_stage_id: null,
      p_display_name: null,
      p_first_name: null,
      p_last_name: null,
      p_qualification_type: tipo,
      p_qualification_changed: true,
    });
    if (error) throw error;
  });
}

async function lerLead(organizationId: string, leadId: string): Promise<LinhaLead> {
  const { data, error } = await (supabase as any)
    .from("anew_leads").select(COLUNAS).eq("id", leadId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw erroGenerico();
  return data as LinhaLead;
}

/**
 * Lança `ErroNeg` se falhar (nada se grava: nem sem lead, nem sem utilizador, nem no exemplo). Depois de gravar refaz a ficha e as
 * listas (e só termina quando elas foram refeitas); a falha da releitura não desfaz a escrita.
 */
export function useQualificarLeadPessoa(pessoaId: string, leadId: string): QualificarLead {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const utilizadorId = fonte.modo === "real" ? fonte.utilizadorId ?? null : null;
  const porFuncao = useClassificarLeadAtivo();
  const classificar = useCallback(async (tipo: TipoQualificacao): Promise<void> => {
    // A função nova decide pela sessão da base; o caminho antigo precisa do utilizador para o contexto de auditoria.
    if (!organizationId || !leadId || (!porFuncao && !utilizadorId)) throw erroGenerico();
    try {
      if (porFuncao) await classificarPorFuncao(organizationId, leadId, tipo);
      else await classificarPorRegravar(organizationId, utilizadorId as string, leadId, tipo);
    } catch (erro) {
      throw comoErroNeg(erro);
    }
    try {
      await invalidarPessoas(client, organizationId, pessoaId);
    } catch {
      // A ficha refaz-se na próxima leitura; a escrita já está feita.
    }
  }, [organizationId, utilizadorId, leadId, pessoaId, client, porFuncao]);
  return { classificar };
}
