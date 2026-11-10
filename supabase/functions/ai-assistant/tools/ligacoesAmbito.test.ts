// Âmbito nas ligações devolvidas pelas tools (auditoria Administração F6, continuação):
//  - list_workflow_logs só devolve execuções cujo registo de origem o utilizador vê (RLS) na organização ativa;
//  - get_deal_details / get_proposal_details / get_contract_details / get_lead_details / get_schedule_item só devolvem
//    ids de ligações (pessoa, orçamentos, propostas, contratos, PP, clientes…) que o utilizador vê.
// Run: deno test --no-check -A supabase/functions/ai-assistant/tools/ligacoesAmbito.test.ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ExecCtx } from "../shared/types.ts";
import { ScopeError, visibleLinkIds, visibleLinkOrNull } from "../shared/scope.ts";
import { handlers as deals } from "./deals.ts";
import { handlers as proposals } from "./proposals.ts";
import { handlers as contracts } from "./contracts.ts";
import { handlers as crm } from "./crm.ts";
import { handlers as schedule } from "./schedule.ts";
import { scopeWorkflowLogs } from "./workflows.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "11111111-1111-4111-8111-111111111112";
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

const DEAL = id(1);
const PROP_VIS = id(2), PROP_ESC = id(3);
const Q_VIS = id(4), Q_ESC = id(5);
const C_VIS = id(6), C_ESC = id(7);
const ENT = id(8);
const LEAD_VIS = id(9), LEAD_ESC = id(10), LEAD_OUTRA_ORG = id(11);
const NEG_VIS = id(12);
const CLI_ESC = id(13);
const CONTACT_VIS = id(14);
const DEAL_ESC = id(15);
const ITEM = id(16);

type Row = Record<string, any>;

/** Cliente falso em memória: select/eq/in/is(null)/order/limit/maybeSingle/single/then e {count, head}. */
function fakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let head = false;
      const q: any = {
        select(_c?: string, opts?: { head?: boolean }) { head = !!opts?.head; return q; },
        eq(col: string, v: any) { rows = rows.filter((r) => r[col] === v); return q; },
        in(col: string, vals: any[]) { rows = rows.filter((r) => vals.includes(r[col])); return q; },
        is(col: string, v: any) { rows = rows.filter((r) => (r[col] ?? null) === v); return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        single() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(res: any, rej: any) {
          return Promise.resolve(head ? { data: null, count: rows.length, error: null } : { data: rows, count: rows.length, error: null })
            .then(res, rej);
        },
      };
      return q;
    },
    rpc() { return Promise.resolve({ data: null, error: null }); },
  };
}

const base: Record<string, Row[]> = {
  deals: [
    { id: DEAL, organization_id: ORG, title: "PP 1", value: 10, stage_id: null, assigned_to: null, entity_id: ENT, created_at: "x", closed_at: null, created_by: null, deleted_at: null },
    { id: DEAL_ESC, organization_id: ORG, title: "PP 2", deleted_at: null },
  ],
  proposals: [
    { id: PROP_VIS, organization_id: ORG, proposal_number: "P1", title: "P1", status: "draft", value: 1, entity_id: ENT, deleted_at: null },
    { id: PROP_ESC, organization_id: ORG, proposal_number: "P2", deleted_at: null },
  ],
  quotes: [{ id: Q_VIS, organization_id: ORG }, { id: Q_ESC, organization_id: ORG }],
  client_contracts: [
    { id: C_VIS, organization_id: ORG, contract_number: "C1", client_id: CLI_ESC, proposal_id: PROP_ESC, quote_id: Q_VIS },
    { id: C_ESC, organization_id: ORG },
  ],
  anew_entities: [{ id: ENT, display_name: "Cliente X" }],
  anew_leads: [
    { id: LEAD_VIS, organization_id: ORG, status: "new", entity_id: null, converted_to_contact_id: CONTACT_VIS, converted_to_client_id: CLI_ESC, deleted_at: null },
    { id: LEAD_ESC, organization_id: ORG },
    { id: LEAD_OUTRA_ORG, organization_id: OUTRA_ORG },
  ],
  anew_contacts: [{ id: CONTACT_VIS, organization_id: ORG }],
  anew_clients: [{ id: CLI_ESC, organization_id: ORG, name: "Cli" }],
  negocios: [{ id: NEG_VIS, organization_id: ORG }],
  schedule_items: [
    { id: ITEM, organization_id: ORG, title: "Visita", client_id: CLI_ESC, contact_id: CONTACT_VIS, deal_id: DEAL_ESC },
  ],
  pipeline_links: [
    { deal_id: DEAL, proposal_id: PROP_VIS, quote_id: Q_VIS, contract_id: C_VIS, organization_id: ORG, status: "active" },
    { deal_id: DEAL, proposal_id: PROP_ESC, quote_id: Q_ESC, contract_id: C_ESC, organization_id: ORG, status: "active" },
    { deal_id: DEAL_ESC, proposal_id: PROP_VIS, quote_id: Q_ESC, contract_id: null, organization_id: ORG, status: "active" },
  ],
};

/** O que a RLS do utilizador deixa ver (por tabela). LEAD_OUTRA_ORG é visível (membro das duas) mas não é da org ativa. */
function ctxCom(visiveis: Record<string, string[]>, opts: { semUser?: boolean; perms?: string[] } = {}): ExecCtx {
  const userTables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(base)) userTables[t] = rows.filter((r) => (visiveis[t] ?? []).includes(r.id));
  return {
    supabase: fakeClient(base),
    userSupabase: opts.semUser ? undefined : fakeClient(userTables),
    authUid: "auth-eu",
    businessUserId: "eu",
    organizationId: ORG,
    visibleOrgIds: [ORG, OUTRA_ORG],
    userContext: {},
    permissions: opts.perms ?? ["deals.view", "proposals.view", "client_contracts.view", "leads.view", "scheduling.items.view"],
    memberships: [],
    isSystemAdmin: false,
    authHeader: "Bearer x",
  } as ExecCtx;
}

const VIS = {
  deals: [DEAL],
  proposals: [PROP_VIS],
  quotes: [Q_VIS],
  client_contracts: [C_VIS],
  anew_leads: [LEAD_VIS, LEAD_OUTRA_ORG],
  anew_contacts: [CONTACT_VIS],
  negocios: [NEG_VIS],
};

Deno.test("visibleLinkIds: só os visíveis, sem duplicados, ordem preservada; visibleLinkOrNull", async () => {
  const ctx = ctxCom(VIS);
  assertEquals(await visibleLinkIds(ctx, "quotes", [Q_ESC, Q_VIS, null, Q_VIS, "x"]), [Q_VIS]);
  assertEquals(await visibleLinkOrNull(ctx, "quotes", Q_VIS), Q_VIS);
  assertEquals(await visibleLinkOrNull(ctx, "quotes", Q_ESC), null);
  assertEquals(await visibleLinkOrNull(ctx, "quotes", null), null);
});

Deno.test("sem sessão do utilizador: ligações fecham (ScopeError)", async () => {
  const ctx = ctxCom(VIS, { semUser: true });
  await assertRejects(() => visibleLinkIds(ctx, "quotes", [Q_VIS]), ScopeError);
});

Deno.test("get_deal_details: ligações e pessoa filtradas pela RLS", async () => {
  const r = await deals.get_deal_details(ctxCom(VIS), { deal_id: DEAL });
  assertEquals(r.success, true);
  assertEquals(r.data.pipeline, { quote_ids: [Q_VIS], proposal_ids: [PROP_VIS], contract_ids: [C_VIS] });
  assertEquals(r.data.client, null); // pessoa não visível
  const com = await deals.get_deal_details(ctxCom({ ...VIS, anew_entities: [ENT] }), { deal_id: DEAL });
  assertEquals(com.data.client, { id: ENT, name: "Cliente X" });
});

Deno.test("get_proposal_details: orçamentos/PP ligados filtrados pela RLS", async () => {
  // PROP_VIS está ligada a DEAL (visível) e DEAL_ESC (não), Q_VIS e Q_ESC.
  const r = await proposals.get_proposal_details(ctxCom(VIS), { proposal_id: PROP_VIS });
  assertEquals(r.success, true);
  assertEquals(r.data.pipeline, { quote_ids: [Q_VIS], deal_ids: [DEAL] });
  assertEquals(r.data.client, null);
});

Deno.test("get_contract_details: client_id/proposal_id/quote_id só se visíveis", async () => {
  const r = await contracts.get_contract_details(ctxCom(VIS), { contract_id: C_VIS });
  assertEquals(r.success, true);
  assertEquals([r.data.client_id, r.data.proposal_id, r.data.quote_id], [null, null, Q_VIS]);
});

Deno.test("get_lead_details: converted_to_* só se visíveis", async () => {
  const r = await crm.get_lead_details(ctxCom(VIS), { lead_id: LEAD_VIS });
  assertEquals(r.success, true);
  assertEquals([r.data.converted_to_contact_id, r.data.converted_to_client_id], [CONTACT_VIS, null]);
});

Deno.test("get_schedule_item: client_id/contact_id/deal_id só se visíveis", async () => {
  const r = await schedule.get_schedule_item(ctxCom(VIS), { item_id: ITEM });
  assertEquals(r.success, true);
  assertEquals([r.data.client_id, r.data.contact_id, r.data.deal_id], [null, CONTACT_VIS, null]);
});

Deno.test("list_workflow_logs (scopeWorkflowLogs): origem visível na org ativa; destino escondido fica sem id", async () => {
  const logs = [
    { id: "l1", source_entity: "lead", source_record_id: LEAD_VIS, target_entity: "deal", target_record_id: DEAL },
    { id: "l2", source_entity: "lead", source_record_id: LEAD_ESC, target_entity: "deal", target_record_id: DEAL },
    { id: "l3", source_entity: "lead", source_record_id: LEAD_OUTRA_ORG, target_entity: null, target_record_id: null },
    { id: "l4", source_entity: "negocio", source_record_id: NEG_VIS, target_entity: "client", target_record_id: CLI_ESC },
    { id: "l5", source_entity: "contract", source_record_id: C_VIS, target_entity: "purchase_order", target_record_id: id(99) },
    { id: "l6", source_entity: "purchase_order", source_record_id: id(98), target_entity: null, target_record_id: null },
    { id: "l7", source_entity: "deal", source_record_id: null, target_entity: null, target_record_id: null },
  ];
  const out = await scopeWorkflowLogs(ctxCom(VIS), logs);
  assertEquals(out.map((r) => r.id), ["l1", "l4", "l5"]);
  assertEquals(out.map((r) => r.target_record_id), [DEAL, null, null]);
});
