// Gravar a «Nova lead» de Pessoas: a lead é a própria entidade. Insere UMA linha em anew_entities (organização, nome, contacto, extra,
// origem e campanha) e, se se escolheu um comercial, atribui-o com neg_atribuir_pessoa (o responsável não se escreve diretamente).
// Afasta-se de Leads em três pontos, de propósito: não reutiliza uma pessoa existente (em Pessoas uma pessoa que já existe bloqueia e
// nunca se reaproveita); não usa «Criar mesmo assim» (rpc_create_lead_duplicate_override) nem «Partilhar» (link_entity_to_org); já não
// passa por anew_leads nem pelos satélites de email e telefone. A pessoa criada nesta ação desfaz-se se a atribuição falhar.
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chamarNeg } from "../chamarNeg";
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
  /** A lead é a própria entidade: igual a `entityId`. */
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

const tabelaEntidades = () => (supabase as unknown as { from: (t: string) => any }).from("anew_entities");

const comValor = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

async function criarPessoa(p: PedidoGravar, extra: Record<string, unknown>): Promise<string> {
  const { data, error } = await tabelaEntidades().insert({
    organization_id: p.organizationId,
    type: "person",
    display_name: p.dados.displayName.trim(),
    first_name: p.dados.firstName,
    last_name: p.dados.lastName,
    email: comValor(p.dados.email),
    phone: comValor(p.dados.telefone),
    extra,
    origin_id: p.origemId,
    campaign_id: p.campanhaId,
  }).select("id").single();
  if (error) throw error;
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !id) throw new Error("A pessoa não foi criada.");
  return id;
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
  const { _assigned_to: atribuido, ...valoresLimpos } = p.valores as Record<string, unknown>;
  let entityId: string;
  try {
    entityId = await criarPessoa(p, valoresLimpos);
  } catch (causa) {
    throw new FalhaGravar(causa);
  }

  if (typeof atribuido === "string" && atribuido) {
    try {
      await chamarNeg("neg_atribuir_pessoa", { p_organization_id: p.organizationId, p_entity_id: entityId, p_assigned_to: atribuido });
    } catch (causa) {
      throw new FalhaGravar(causa, await desfazerPessoa(entityId));
    }
  }
  return { entityId, leadId: entityId };
}
