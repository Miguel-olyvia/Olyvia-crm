// Âmbito nas tools do assistente (auditoria Administração F6): verificações com a RLS do utilizador.
// deno test --no-check -A supabase/functions/ai-assistant/shared/scope.test.ts
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ExecCtx } from "./types.ts";
import { filterVisible, guardEdit, guardView, rowMatchesKeys, ScopeError } from "./scope.ts";
import { checkToolScope } from "./toolScope.ts";
import { scopeResolveOutcome } from "./scopeResolve.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const OUTRO = "33333333-3333-4333-8333-333333333333";
const L_MEU = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const L_OUTRO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const L_ESCONDIDO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

type Row = Record<string, any>;

/** Cliente falso: `from(t).select().in("id", ids)` / `.eq("id", x).maybeSingle()` sobre tabelas em memória. */
function fakeClient(tables: Record<string, Row[]>, rpcs: Record<string, (args: any) => any> = {}) {
  const calls: Array<{ kind: string; name: string; args?: any }> = [];
  const client = {
    calls,
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q: any = {
        select() { return q; },
        in(col: string, vals: string[]) { rows = rows.filter((r) => vals.includes(r[col])); return q; },
        eq(col: string, v: any) { rows = rows.filter((r) => r[col] === v); return q; },
        is() { return q; },
        limit() { return q; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(res: any, rej: any) { return Promise.resolve({ data: rows, error: null }).then(res, rej); },
      };
      calls.push({ kind: "from", name: table });
      return q;
    },
    rpc(name: string, args: any) {
      calls.push({ kind: "rpc", name, args });
      const f = rpcs[name];
      return Promise.resolve(f ? { data: f(args), error: null } : { data: null, error: { message: `rpc ${name} em falta` } });
    },
  };
  return client;
}

const leads = [
  { id: L_MEU, organization_id: ORG, assigned_to: EU, created_by: OUTRO },
  { id: L_OUTRO, organization_id: ORG, assigned_to: OUTRO, created_by: OUTRO },
  { id: L_ESCONDIDO, organization_id: ORG, assigned_to: OUTRO, created_by: OUTRO },
];

function ctxCom(opts: { visiveis: string[]; keys: Record<string, string[]>; perms?: string[]; semUser?: boolean }): ExecCtx {
  const svc = fakeClient({ anew_leads: leads, deals: leads.map((l) => ({ ...l })), proposals: leads.map((l) => ({ ...l })) });
  const user = fakeClient(
    {
      anew_leads: leads.filter((l) => opts.visiveis.includes(l.id)),
      deals: leads.filter((l) => opts.visiveis.includes(l.id)),
      proposals: leads.filter((l) => opts.visiveis.includes(l.id)),
    },
    { crm_scope_keys: ({ p_permission_code }) => opts.keys[p_permission_code] ?? [] },
  );
  return {
    supabase: svc,
    userSupabase: opts.semUser ? undefined : user,
    authUid: "auth-eu",
    businessUserId: EU,
    organizationId: ORG,
    visibleOrgIds: [ORG],
    userContext: {},
    permissions: opts.perms ?? ["leads.view", "leads.edit"],
    memberships: [],
    isSystemAdmin: false,
    authHeader: "Bearer x",
  } as ExecCtx;
}

const OWNED_EU = [`${ORG}:${EU}`];
const ORG_TODA = [`${ORG}:*`];

Deno.test("rowMatchesKeys: org:*, assigned_to e created_by", () => {
  assert(rowMatchesKeys(ORG_TODA, { organization_id: ORG }));
  assert(rowMatchesKeys(OWNED_EU, { organization_id: ORG, assigned_to: EU }));
  assert(rowMatchesKeys(OWNED_EU, { organization_id: ORG, created_by: EU }));
  assert(!rowMatchesKeys(OWNED_EU, { organization_id: ORG, assigned_to: OUTRO, created_by: OUTRO }));
  assert(!rowMatchesKeys(ORG_TODA, { organization_id: OUTRO }));
});

Deno.test("guardView: só o que a RLS do utilizador devolve", async () => {
  const ctx = ctxCom({ visiveis: [L_MEU], keys: {} });
  assertEquals(await guardView(ctx, "anew_leads", L_MEU, "Lead"), null);
  const r = await guardView(ctx, "anew_leads", L_ESCONDIDO, "Lead");
  assertEquals(r?.success, false);
  assertEquals(r?.code, "forbidden");
});

Deno.test("guardEdit leads: ver não chega; leads.edit OWNED só nos seus", async () => {
  const ctx = ctxCom({ visiveis: [L_MEU, L_OUTRO], keys: { "leads.edit": OWNED_EU } });
  assertEquals(await guardEdit(ctx, "anew_leads", L_MEU, "lead"), null);
  assertEquals((await guardEdit(ctx, "anew_leads", L_OUTRO, "lead"))?.success, false);
  const ctxOrg = ctxCom({ visiveis: [L_MEU, L_OUTRO], keys: { "leads.edit": ORG_TODA } });
  assertEquals(await guardEdit(ctxOrg, "anew_leads", L_OUTRO, "lead"), null);
});

Deno.test("guardEdit deals usa as chaves de deals.view (como a política de UPDATE)", async () => {
  const ctx = ctxCom({ visiveis: [L_OUTRO], keys: { "deals.view": ORG_TODA, "deals.edit": OWNED_EU } });
  assertEquals(await guardEdit(ctx, "deals", L_OUTRO, "PP"), null);
});

Deno.test("guardEdit proposals: o criador passa mesmo sem chave", async () => {
  const ctx = ctxCom({ visiveis: [L_MEU, L_OUTRO], keys: { "proposals.edit": [] } });
  const svcProps = fakeClient({ proposals: [{ id: L_OUTRO, organization_id: ORG, assigned_to: OUTRO, created_by: EU }] });
  ctx.supabase = svcProps;
  assertEquals(await guardEdit(ctx, "proposals", L_OUTRO, "proposta"), null);
});

Deno.test("sem sessão do utilizador: fecha (ScopeError)", async () => {
  const ctx = ctxCom({ visiveis: [L_MEU], keys: {}, semUser: true });
  await assertRejects(() => guardView(ctx, "anew_leads", L_MEU, "Lead"), ScopeError);
});

Deno.test("filterVisible mantém só as linhas visíveis e a ordem", async () => {
  const ctx = ctxCom({ visiveis: [L_OUTRO, L_MEU], keys: {} });
  const out = await filterVisible(ctx, "anew_leads", [{ id: L_ESCONDIDO }, { id: L_OUTRO }, { id: L_MEU }]);
  assertEquals(out.map((r) => r.id), [L_OUTRO, L_MEU]);
});

Deno.test("update_lead: mudar assigned_to pede leads.assign; manter o mesmo não", async () => {
  const keys = { "leads.edit": ORG_TODA };
  const sem = ctxCom({ visiveis: [L_MEU], keys, perms: ["leads.view", "leads.edit"] });
  const r = await checkToolScope(sem, "update_lead", { id: L_MEU, assigned_to: OUTRO });
  assertEquals(r?.missing_permission, "leads.assign");
  assertEquals(await checkToolScope(sem, "update_lead", { id: L_MEU, assigned_to: EU }), null);
  assertEquals(await checkToolScope(sem, "update_lead", { id: L_MEU, status: "contacted" }), null);
  const com = ctxCom({ visiveis: [L_MEU], keys, perms: ["leads.view", "leads.edit", "leads.assign"] });
  assertEquals(await checkToolScope(com, "update_lead", { id: L_MEU, assigned_to: OUTRO }), null);
});

Deno.test("assign_crm_record (lead): âmbito de edição + leads.assign", async () => {
  const ctx = ctxCom({ visiveis: [L_MEU, L_OUTRO], keys: { "leads.edit": OWNED_EU }, perms: ["leads.edit", "leads.assign"] });
  assertEquals((await checkToolScope(ctx, "assign_crm_record", { entity_type: "lead", record_id: L_OUTRO, assignee_user_id: EU }))?.success, false);
  assertEquals(await checkToolScope(ctx, "assign_crm_record", { entity_type: "lead", record_id: L_MEU, assignee_user_id: OUTRO }), null);
  const semAssign = ctxCom({ visiveis: [L_MEU], keys: { "leads.edit": OWNED_EU }, perms: ["leads.edit"] });
  assertEquals((await checkToolScope(semAssign, "assign_crm_record", { entity_type: "lead", record_id: L_MEU, assignee_user_id: OUTRO }))?.missing_permission, "leads.assign");
});

Deno.test("get_lead_details de um lead fora do âmbito é recusado antes do handler", async () => {
  const ctx = ctxCom({ visiveis: [L_MEU], keys: {} });
  assertEquals((await checkToolScope(ctx, "get_lead_details", { lead_id: L_OUTRO }))?.success, false);
  assertEquals(await checkToolScope(ctx, "get_lead_details", { lead_id: L_MEU }), null);
  assertEquals(await checkToolScope(ctx, "search_products", { query: "x" }), null); // sem regra
});

Deno.test("resolução por nome: só candidatos visíveis", async () => {
  const ctx = ctxCom({ visiveis: [L_MEU], keys: {} });
  assertEquals(
    await scopeResolveOutcome(ctx, "lead", { ambiguous: [{ id: L_OUTRO, label: "a" }, { id: L_MEU, label: "b" }] }),
    { uuid: L_MEU },
  );
  assertEquals(await scopeResolveOutcome(ctx, "lead", { uuid: L_OUTRO }), { notFound: true });
  assertEquals(await scopeResolveOutcome(ctx, "product", { uuid: L_OUTRO }), { uuid: L_OUTRO });
});
