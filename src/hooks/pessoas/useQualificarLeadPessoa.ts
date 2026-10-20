// Classificar à mão a lead de uma pessoa (MQL, SQL ou limpar), como o cartão «Qualificação comercial» da página de Leads
// (LeadQualificationCard): a MESMA função da base, rpc_update_lead, com o contexto de auditoria e os mesmos parâmetros. A função regrava a
// linha inteira (campos, estado, origem, notas, responsável), por isso lê-se a linha atual e devolve-se tal como está; só a qualificação muda.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { withAuditContext } from "@/utils/auditContext";
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
  const classificar = useCallback(async (tipo: TipoQualificacao): Promise<void> => {
    if (!organizationId || !utilizadorId || !leadId) throw erroGenerico();
    try {
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
    } catch (erro) {
      throw comoErroNeg(erro);
    }
    try {
      await invalidarPessoas(client, organizationId, pessoaId);
    } catch {
      // A ficha refaz-se na próxima leitura; a escrita já está feita.
    }
  }, [organizationId, utilizadorId, leadId, pessoaId, client]);
  return { classificar };
}
