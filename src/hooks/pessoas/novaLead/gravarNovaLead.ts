// Gravar a «Nova lead» de Pessoas: cria a pessoa NOVA (create_lead_entity_for_org), liga-a à organização e cria a lead com
// rpc_create_lead_manual (uma só chamada, atómica para email, telefone, lead e papel). Cópia de AnewLeads.tsx:3700-3781 e 3932-3981.
// Afasta-se de Leads em três pontos, de propósito: não reutiliza uma pessoa existente (nem pela coerência de identidade nem no
// fallback de 42501: em Pessoas uma pessoa que já existe bloqueia e nunca se reaproveita); não usa «Criar mesmo assim»
// (rpc_create_lead_duplicate_override) nem «Partilhar» (link_entity_to_org). A pessoa criada nesta ação desfaz-se se a lead falhar.
import { supabase } from "@/integrations/supabase/client";
import { ensureEntityOrgLink } from "@/utils/orgEntity";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { DadosLead } from "./fluxoNovaLead";

export interface PedidoGravar {
  organizationId: string;
  rootOrganizationId: string;
  dados: DadosLead;
  /** Os valores do formulário já limpos (com `_assigned_to` se se escolheu um comercial). */
  valores: Readonly<Record<string, unknown>>;
  origemId: string | null;
  /** O nome da origem escolhida, ou «manual». */
  origemNome: string;
  campanhaId: string | null;
}

export interface LeadGravada {
  entityId: string;
  leadId: string | null;
}

/** A gravação falhou. `limpezaFalhou`: a pessoa criada nesta ação não se conseguiu desfazer (quem chama diz-o ao utilizador). */
export class FalhaGravar extends Error {
  readonly causa: unknown;
  readonly limpezaFalhou: boolean;
  constructor(causa: unknown, limpezaFalhou = false) {
    super(causa instanceof Error ? causa.message : "falha ao gravar a lead");
    this.name = "FalhaGravar";
    this.causa = causa;
    this.limpezaFalhou = limpezaFalhou;
  }
}

type Rpc = (nome: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
const chamarRpc: Rpc = (nome, params) => (supabase as unknown as { rpc: Rpc }).rpc(nome, params);

async function criarPessoa(p: PedidoGravar): Promise<string> {
  const { data, error } = await chamarRpc("create_lead_entity_for_org", {
    p_organization_id: p.organizationId,
    p_display_name: p.dados.displayName.trim(),
    p_first_name: p.dados.firstName,
    p_last_name: p.dados.lastName,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("A pessoa não foi criada.");
  return data;
}

/** Desfaz a pessoa criada nesta ação. Devolve true se não conseguiu (a limpeza é «melhor esforço»). */
async function desfazerPessoa(entityId: string): Promise<boolean> {
  try {
    const { error } = await (supabase as unknown as { from: (t: string) => any }).from("anew_entities").delete().eq("id", entityId);
    if (error) captureFlowError(error, "lead-lifecycle");
    return Boolean(error);
  } catch (excecao) {
    captureFlowError(excecao, "lead-lifecycle");
    return true;
  }
}

export async function gravarNovaLead(p: PedidoGravar): Promise<LeadGravada> {
  let entityId: string;
  try {
    entityId = await criarPessoa(p);
  } catch (causa) {
    throw new FalhaGravar(causa);
  }

  // A ligação local é idempotente e a pessoa é «principal» aqui (foi criada aqui). Uma falha não é fatal.
  try {
    await ensureEntityOrgLink({ entityId, organizationId: p.organizationId, isPrimary: true });
  } catch (causa) {
    captureFlowError(causa, "lead-lifecycle");
  }

  const { _assigned_to: atribuido, ...valoresLimpos } = p.valores as Record<string, unknown>;
  try {
    const { data, error } = await chamarRpc("rpc_create_lead_manual", {
      p_organization_id: p.organizationId,
      p_root_organization_id: p.rootOrganizationId,
      p_entity_id: entityId,
      // Verdadeiro: a pessoa foi criada aqui (em Pessoas nunca se reutiliza uma que já existia).
      p_entity_created_here: true,
      p_field_values: valoresLimpos,
      p_email: p.dados.email || null,
      p_phone: p.dados.telefone || null,
      p_source: p.origemNome,
      p_source_id: p.origemId,
      p_campaign_id: p.campanhaId,
      p_assigned_to: typeof atribuido === "string" && atribuido ? atribuido : null,
    });
    if (error) throw error;
    const lead = data as { id?: string } | null;
    return { entityId, leadId: lead?.id ?? null };
  } catch (causa) {
    throw new FalhaGravar(causa, await desfazerPessoa(entityId));
  }
}
