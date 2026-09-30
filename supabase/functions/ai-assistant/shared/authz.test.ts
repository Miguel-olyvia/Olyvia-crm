// Unit tests for requireActionPermission + permission alias expansion.
// Run: deno test supabase/functions/ai-assistant/shared/authz.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireActionPermission, can, canAny, canViewWorkflowModule } from "./authz.ts";
import { isUserConfirmed, buildSendEmailConfirmation } from "./emailConfirmation.ts";
import type { ExecCtx } from "./types.ts";

function mkCtx(perms: string[], opts: Partial<ExecCtx> = {}): ExecCtx {
  return {
    supabase: null as any,
    authUid: "auth-1",
    businessUserId: "user-1",
    organizationId: "org-1",
    visibleOrgIds: ["org-1"],
    userContext: {},
    permissions: perms,
    memberships: [],
    isSystemAdmin: false,
    authHeader: "",
    ...opts,
  } as ExecCtx;
}

const MUTABLE = ["rascunho"] as const;
const RECORD_OWN_DRAFT = { created_by: "user-1", status: "rascunho" };
const RECORD_OTHER_DRAFT = { created_by: "user-2", status: "rascunho" };
const RECORD_OWN_SENT = { created_by: "user-1", status: "enviado" };

Deno.test("edit-strict: sem permissão recusa mesmo sendo o dono em rascunho", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "editar orçamento",
    mode: "edit-strict",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OWN_DRAFT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r?.code, "forbidden");
  assertEquals(r?.missing_permission, "quotes.edit");
});

Deno.test("populate: create + dono + rascunho => permite", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "adicionar linhas",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OWN_DRAFT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r, null);
});

Deno.test("populate: create + registo alheio => recusa", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "adicionar linhas",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OTHER_DRAFT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r?.code, "forbidden");
});

Deno.test("populate: create + dono mas estado não mutável => recusa", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "adicionar linhas",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OWN_SENT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r?.code, "forbidden");
});

Deno.test("populate: sem record => degrada para edit-strict (recusa)", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "adicionar linhas",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    mutableStatuses: MUTABLE,
  });
  assertEquals(r?.code, "forbidden");
});

Deno.test("populate: com quotes.edit directo => permite (sem precisar de record)", () => {
  const ctx = mkCtx(["quotes.edit"]);
  const r = requireActionPermission(ctx, {
    action: "adicionar linhas",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    mutableStatuses: MUTABLE,
  });
  assertEquals(r, null);
});

Deno.test("terminal: nunca herda, mesmo com create + dono + rascunho", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "enviar orçamento",
    mode: "terminal",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OWN_DRAFT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r?.code, "forbidden");
});

Deno.test("alias edit↔update resolve em qualquer modo", () => {
  // user tem quotes.update; basePermission pede quotes.edit
  const ctx = mkCtx(["quotes.update"]);
  assertEquals(can(ctx, "quotes.edit"), true);
  const r = requireActionPermission(ctx, {
    action: "editar",
    mode: "edit-strict",
    basePermission: "quotes.edit",
  });
  assertEquals(r, null);
});

Deno.test("isSystemAdmin curto-circuita", () => {
  const ctx = mkCtx([], { isSystemAdmin: true });
  const r = requireActionPermission(ctx, {
    action: "x",
    mode: "terminal",
    basePermission: "quotes.edit",
  });
  assertEquals(r, null);
});

// set_quote_template usa mode:"populate", basePermission:"quotes.edit",
// inheritFrom:"quotes.create", mutableStatuses:['rascunho']. Mesma semântica
// de add_quote_items — validar 3 cenários canónicos.
Deno.test("set_quote_template: dono + rascunho + quotes.create => permite", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "associar layout",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OWN_DRAFT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r, null);
});

Deno.test("set_quote_template: alheio em rascunho + quotes.create => recusa", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "associar layout",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OTHER_DRAFT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r?.code, "forbidden");
  assertEquals(r?.missing_permission, "quotes.edit");
});

Deno.test("set_quote_template: dono mas estado 'enviado' => recusa (mutableStatuses falha)", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "associar layout",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OWN_SENT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r?.code, "forbidden");
});

// set_quote_model partilha a mesma semântica de populate; sanity check rápido.
Deno.test("set_quote_model: dono + rascunho + quotes.create => permite", () => {
  const ctx = mkCtx(["quotes.create"]);
  const r = requireActionPermission(ctx, {
    action: "associar modelo rápido",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: RECORD_OWN_DRAFT,
    mutableStatuses: MUTABLE,
  });
  assertEquals(r, null);
});


// ── canAny / canViewWorkflowModule ──
Deno.test("canAny: passa com uma das permissões (inclui alias .update)", () => {
  assertEquals(canAny(mkCtx(["quotes.update"]), ["products.view", "quotes.edit"]), true);
  assertEquals(canAny(mkCtx(["leads.view"]), ["products.view", "quotes.edit"]), false);
});

Deno.test("canViewWorkflowModule: <modulo>.view ou workflows.edit", () => {
  assertEquals(canViewWorkflowModule(mkCtx(["leads.view"]), "lead"), true);
  assertEquals(canViewWorkflowModule(mkCtx(["leads.view"]), "deal"), false);
  assertEquals(canViewWorkflowModule(mkCtx(["workflows.edit"]), "proposal"), true);
  assertEquals(canViewWorkflowModule(mkCtx(["leads.view"]), null), false);
  assertEquals(canViewWorkflowModule(mkCtx([], { isSystemAdmin: true }), "quote"), true);
});

// ── Confirmação de envio de email ──
Deno.test("isUserConfirmed: só aceita o booleano true", () => {
  assertEquals(isUserConfirmed({ user_confirmed: true }), true);
  assertEquals(isUserConfirmed({ user_confirmed: "true" }), false);
  assertEquals(isUserConfirmed({ user_confirmed: 1 }), false);
  assertEquals(isUserConfirmed({}), false);
  assertEquals(isUserConfirmed(null), false);
});

Deno.test("buildSendEmailConfirmation: devolve requires_confirmation send_email com resumo", () => {
  const r = buildSendEmailConfirmation({
    documentType: "quote",
    documentNumber: "Q-2026-0001",
    documentTitle: "Cozinha",
    recipientEmail: "a@b.pt",
    args: { cc: ["c@d.pt", ""], subject: "Orçamento", message: "x".repeat(400) },
  });
  assertEquals(r.success, false);
  assertEquals(r.requires_confirmation, true);
  assertEquals(r.confirmation_type, "send_email");
  assertEquals(r.summary.document_number, "Q-2026-0001");
  assertEquals(r.summary.cc, ["c@d.pt"]);
  assertEquals(r.summary.recipients, []);
  assertEquals(r.summary.message_preview.length, 301);
});
