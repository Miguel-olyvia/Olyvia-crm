// Verificação de âmbito ANTES de cada tool que age sobre um registo concreto (auditoria Administração F6).
//
// Chamada por executeTool (index.ts) para todas as tools, num só sítio: a tabela abaixo diz, para cada tool, que
// registo ela toca (pelo argumento) e se é para ver ou alterar. As regras estão em shared/scope.ts (RLS e funções de
// âmbito do próprio utilizador). Tools que listam/pesquisam filtram o resultado no próprio handler (filterVisible).
// Tools de catálogo/configuração (produtos, serviços, etapas, regras de workflow, ações de etapa, utilizadores,
// navegação, notificações próprias) não têm registos com dono: ficam só com a permissão, agora calculada na
// organização ativa (shared/context.ts).
//
// Também aqui: mudar o responsável (assigned_to) de um lead pede leads.assign (a permissão de «atribuir comercial»).

import type { ExecCtx, ToolResult } from "./types.ts";
import { requirePermission } from "./authz.ts";
import { guardEdit, guardEntity, guardEntityFacetsVisible, guardView, isUuid, type ScopedTable } from "./scope.ts";

type Rule =
  | { kind: "record"; table: ScopedTable; arg: string; mode: "view" | "edit"; label: string }
  | { kind: "custom"; check: (ctx: ExecCtx, args: any) => Promise<ToolResult | null> };

const rec = (table: ScopedTable, arg: string, mode: "view" | "edit", label: string): Rule => ({
  kind: "record",
  table,
  arg,
  mode,
  label,
});

const ENTITY_TABLE_BY_ARG: Array<[string, ScopedTable]> = [
  ["contact_id", "anew_contacts"],
  ["lead_id", "anew_leads"],
  ["client_id", "anew_clients"],
];

/** Entidade alvo das tools de entities.ts: entity_id direto, ou a entidade do contacto/lead/cliente indicado. */
async function entidadeAlvo(ctx: ExecCtx, args: any): Promise<string | null> {
  if (isUuid(args?.entity_id)) return args.entity_id;
  for (const [key, table] of ENTITY_TABLE_BY_ARG) {
    if (!isUuid(args?.[key])) continue;
    const { data } = await ctx.supabase.from(table).select("entity_id").eq("id", args[key]).maybeSingle();
    return (data?.entity_id as string) ?? null;
  }
  return null;
}

async function entidadeDoFacet(ctx: ExecCtx, table: "anew_entity_emails" | "anew_entity_phones", id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await ctx.supabase.from(table).select("entity_id").eq("id", id).maybeSingle();
  return (data?.entity_id as string) ?? null;
}

const entityRule = (mode: "view" | "insert" | "edit" | "delete"): Rule => ({
  kind: "custom",
  check: async (ctx, args) => guardEntity(ctx, await entidadeAlvo(ctx, args), mode),
});

const facetRule = (table: "anew_entity_emails" | "anew_entity_phones", arg: string, mode: "edit" | "delete"): Rule => ({
  kind: "custom",
  check: async (ctx, args) => guardEntity(ctx, await entidadeDoFacet(ctx, table, args?.[arg]), mode),
});

/** Mudar o responsável de um lead: leads.assign, só quando o valor muda de facto. */
async function guardLeadAssign(ctx: ExecCtx, leadId: unknown, novo: unknown): Promise<ToolResult | null> {
  if (novo === undefined || !isUuid(leadId)) return null;
  const { data } = await ctx.supabase.from("anew_leads").select("assigned_to").eq("id", leadId).maybeSingle();
  if (data && (data.assigned_to ?? null) === (novo ?? null)) return null;
  return requirePermission(ctx, "leads.assign", "mudar o responsável de um lead");
}

const WORKFLOW_TABLE: Record<string, ScopedTable> = {
  lead: "anew_leads",
  deal: "deals",
  quote: "quotes",
  proposal: "proposals",
};
const ASSIGN_TABLE: Record<string, ScopedTable> = {
  lead: "anew_leads",
  deal: "deals",
  contact: "anew_contacts",
};

export const TOOL_SCOPE: Record<string, Rule[]> = {
  // ── crm.ts ──
  update_lead_status: [rec("anew_leads", "lead_id", "edit", "lead")],
  update_lead: [
    rec("anew_leads", "id", "edit", "lead"),
    { kind: "custom", check: (ctx, a) => guardLeadAssign(ctx, a?.id, a?.assigned_to) },
  ],
  convert_lead: [rec("anew_leads", "lead_id", "edit", "lead")],
  get_lead_details: [rec("anew_leads", "lead_id", "view", "Lead")],
  delete_lead: [rec("anew_leads", "lead_id", "edit", "lead")],
  update_contact: [rec("anew_contacts", "id", "edit", "contacto")],
  get_contact_details: [rec("anew_contacts", "contact_id", "view", "Contacto")],
  update_contact_notes: [rec("anew_contacts", "contact_id", "edit", "contacto")],
  delete_contact: [rec("anew_contacts", "contact_id", "edit", "contacto")],
  get_client_details: [rec("anew_clients", "client_id", "view", "Cliente")],
  update_client: [rec("anew_clients", "client_id", "edit", "cliente")],
  delete_client: [rec("anew_clients", "client_id", "edit", "cliente")],

  // ── deals.ts ──
  create_deal_from_lead: [rec("anew_leads", "lead_id", "edit", "lead")],
  update_deal: [rec("deals", "id", "edit", "PP")],
  close_deal: [rec("deals", "id", "edit", "PP")],
  get_deal_details: [rec("deals", "deal_id", "view", "PP")],
  cancel_deal: [rec("deals", "deal_id", "edit", "PP")],

  // ── proposals.ts ──
  send_proposal: [rec("proposals", "proposal_id", "edit", "proposta")],
  get_proposal_details: [rec("proposals", "proposal_id", "view", "Proposta")],
  update_proposal: [rec("proposals", "proposal_id", "edit", "proposta")],
  cancel_proposal: [rec("proposals", "proposal_id", "edit", "proposta")],

  // ── quotes.ts ──
  set_quote_template: [rec("quotes", "quote_id", "edit", "orçamento")],
  set_quote_model: [rec("quotes", "quote_id", "edit", "orçamento")],
  send_quote: [rec("quotes", "quote_id", "edit", "orçamento")],
  duplicate_quote: [rec("quotes", "quote_id", "view", "Orçamento")],
  add_quote_items: [rec("quotes", "quote_id", "edit", "orçamento")],
  get_quote_details: [rec("quotes", "quote_id", "view", "Orçamento")],
  remove_quote_lines: [rec("quotes", "quote_id", "edit", "orçamento")],
  update_quote_line: [rec("quotes", "quote_id", "edit", "orçamento")],
  update_quote: [rec("quotes", "quote_id", "edit", "orçamento")],
  delete_quote: [rec("quotes", "quote_id", "edit", "orçamento")],
  list_quote_fees: [rec("quotes", "quote_id", "view", "Orçamento")],
  add_quote_fee: [rec("quotes", "quote_id", "edit", "orçamento")],
  remove_quote_fee: [rec("quotes", "quote_id", "edit", "orçamento")],

  // ── contracts.ts ──
  get_contract_details: [rec("client_contracts", "contract_id", "view", "Contrato")],
  update_contract: [rec("client_contracts", "contract_id", "edit", "contrato")],
  cancel_contract: [rec("client_contracts", "contract_id", "edit", "contrato")],
  restore_contract: [rec("client_contracts", "id", "edit", "contrato")],

  // ── entities.ts ──
  add_entity_email: [entityRule("insert")],
  delete_entity_email: [facetRule("anew_entity_emails", "email_id", "delete")],
  set_primary_email: [facetRule("anew_entity_emails", "email_id", "edit")],
  add_entity_phone: [entityRule("insert")],
  delete_entity_phone: [facetRule("anew_entity_phones", "phone_id", "delete")],
  set_primary_phone: [facetRule("anew_entity_phones", "phone_id", "edit")],
  set_entity_address: [entityRule("insert")],
  add_contact_tag: [entityRule("view")],
  remove_contact_tag: [entityRule("view")],
  list_contact_tags: [entityRule("view")],
  restore_lead: [rec("anew_leads", "id", "edit", "lead")],
  restore_contact: [rec("anew_contacts", "id", "edit", "contacto")],
  restore_client: [rec("anew_clients", "id", "edit", "cliente")],

  // ── activities.ts ──
  add_note: [{ kind: "custom", check: (ctx, a) => guardEntityFacetsVisible(ctx, a?.entity_id) }],
  log_call: [{ kind: "custom", check: (ctx, a) => guardEntityFacetsVisible(ctx, a?.entity_id) }],
  list_activities: [{ kind: "custom", check: (ctx, a) => guardEntityFacetsVisible(ctx, a?.entity_id) }],

  // ── schedule.ts ──
  create_schedule_item: [
    rec("anew_clients", "client_id", "view", "Cliente"),
    rec("anew_contacts", "contact_id", "view", "Contacto"),
    rec("deals", "deal_id", "view", "PP"),
  ],
  update_schedule_item: [rec("schedule_items", "id", "edit", "item da agenda")],
  get_schedule_item: [rec("schedule_items", "item_id", "view", "Item da agenda")],
  complete_schedule_item: [rec("schedule_items", "item_id", "edit", "item da agenda")],
  cancel_schedule_item: [rec("schedule_items", "item_id", "edit", "item da agenda")],
  reschedule_schedule_item: [rec("schedule_items", "item_id", "edit", "item da agenda")],
  assign_schedule_item: [rec("schedule_items", "item_id", "edit", "item da agenda")],

  // ── users.ts ──
  assign_crm_record: [{
    kind: "custom",
    check: async (ctx, a) => {
      const table = ASSIGN_TABLE[a?.entity_type];
      if (!table) return null; // o handler rejeita o entity_type
      const deny = await guardEdit(ctx, table, a?.record_id, a.entity_type === "deal" ? "PP" : a.entity_type);
      if (deny) return deny;
      return a.entity_type === "lead" ? guardLeadAssign(ctx, a?.record_id, a?.assignee_user_id) : null;
    },
  }],

  // ── workflows.ts ──
  execute_workflow: [{
    kind: "custom",
    check: (ctx, a) => {
      const table = WORKFLOW_TABLE[a?.source_entity];
      return table ? guardEdit(ctx, table, a?.record_id, String(a.source_entity)) : Promise.resolve(null);
    },
  }],
};

/** null = pode avançar; senão o ToolResult de recusa. Erros de verificação propagam (executeTool fecha). */
export async function checkToolScope(ctx: ExecCtx, toolName: string, args: any): Promise<ToolResult | null> {
  const rules = TOOL_SCOPE[toolName];
  if (!rules) return null;
  for (const rule of rules) {
    const deny = rule.kind === "record"
      ? (rule.mode === "view"
        ? await guardView(ctx, rule.table, args?.[rule.arg], rule.label)
        : await guardEdit(ctx, rule.table, args?.[rule.arg], rule.label))
      : await rule.check(ctx, args);
    if (deny) return deny;
  }
  return null;
}
