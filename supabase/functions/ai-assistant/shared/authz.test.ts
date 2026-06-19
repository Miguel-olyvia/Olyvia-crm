// Unit tests for requireActionPermission + permission alias expansion.
// Run: deno test supabase/functions/ai-assistant/shared/authz.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireActionPermission, can } from "./authz.ts";
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

