/**
 * sign_contract no portal — um contrato anulado (ou que já não esta disponivel)
 * nao se assina e nada se dispara. Corre o index.ts verdadeiro: o `serve()` e
 * capturado e chamado com um Request, com um cliente Supabase em memoria.
 * Sem base de dados, sem rede.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const state = vi.hoisted(() => ({
  handler: null as null | ((req: Request) => Promise<Response>),
  db: null as any,
}));

vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({
  serve: (h: (req: Request) => Promise<Response>) => { state.handler = h; },
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => state.db.client,
}));

vi.mock("../_shared/sentry.ts", () => ({ initSentry: () => {}, captureError: () => {} }));
vi.mock("../_shared/notificationSettings.ts", () => ({ isNotificationEnabled: async () => true }));
vi.mock("../_shared/portalNotifyTarget.ts", () => ({
  resolveNotifyTarget: async () => ({ orgId: "org-1", commercialAuthId: "com-1" }),
}));
vi.mock("../_shared/proposalWorkflowStage.ts", () => ({ resolveProposalStageId: async () => null }));
vi.mock("../_shared/cors.ts", () => ({ getCorsHeaders: () => ({ "Access-Control-Allow-Origin": "*" }) }));

const USER = { id: "auth-1", email: "c@example.test", user_metadata: {} };

class FakeDb {
  contract: Row;
  otpAvailable = true;
  /** Resultado forcado do UPDATE de assinatura (erro do gatilho ou corrida). */
  signUpdate: null | { data: Row[] | null; error: Row | null } = null;
  /** Erro forcado na leitura inicial do estado do contrato. */
  readError: Row | null = null;
  /** Gancho entre a leitura e o UPDATE (contrato muda a meio). */
  onBeforeSignUpdate: (() => void) | null = null;
  writes: Array<{ table: string; patch: Row }> = [];
  inserts: string[] = [];
  fetchCalls = 0;

  constructor(contract: Row) {
    this.contract = { id: "c1", entity_id: "e1", organization_id: "org-1", deleted_at: null, ...contract };
  }

  client = {
    auth: { getUser: async () => ({ data: { user: USER }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => new Q(this, table),
  };
}

class Q {
  private patch: Row | null = null;
  private filters: Array<[string, string, any]> = [];
  private isInsert = false;
  constructor(private db: FakeDb, private table: string) {}
  select() { return this; }
  update(p: Row) { this.patch = p; return this; }
  insert() { this.isInsert = true; this.db.inserts.push(this.table); return this; }
  eq(c: string, v: any) { this.filters.push(["eq", c, v]); return this; }
  in(c: string, v: any[]) { this.filters.push(["in", c, v]); return this; }
  is(c: string, v: any) { this.filters.push(["is", c, v]); return this; }
  not() { return this; }
  gte() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this.run(true); }
  then(res: any, rej: any) { return this.run(false).then(res, rej); }

  private async run(single: boolean): Promise<{ data: any; error: any }> {
    const { table, db } = this;
    if (this.isInsert) return { data: null, error: null };
    if (this.patch) {
      db.writes.push({ table, patch: this.patch });
      if (table === "sms_otp_codes") {
        if (this.patch.consumed_at === null) {
          db.otpAvailable = true; // OTP reposto
          return { data: [{ id: "otp1" }], error: null };
        }
        if (!db.otpAvailable) return { data: [], error: null };
        db.otpAvailable = false;
        return { data: [{ id: "otp1" }], error: null };
      }
      if (table === "client_contracts") {
        db.onBeforeSignUpdate?.();
        if (db.signUpdate) return db.signUpdate;
        const st = this.filters.find((f) => f[0] === "in" && f[1] === "status");
        if (st && !st[2].includes(db.contract.status)) return { data: [], error: null };
        const notDeleted = this.filters.some((f) => f[0] === "is" && f[1] === "deleted_at" && f[2] === null);
        if (notDeleted && db.contract.deleted_at) return { data: [], error: null };
        db.contract = { ...db.contract, ...this.patch };
        return { data: [{ id: "c1" }], error: null };
      }
      return { data: [], error: null };
    }
    if (table === "client_portal_users") return { data: single ? { id: "pu1" } : [{ id: "pu1" }], error: null };
    if (table === "sms_otp_codes") return { data: db.otpAvailable ? { id: "otp1" } : null, error: null };
    if (table === "client_contracts") {
      if (db.readError) return { data: null, error: db.readError };
      return { data: { ...db.contract }, error: null };
    }
    if (table === "anew_entities") return { data: { display_name: "Cliente Teste" }, error: null };
    return { data: null, error: null };
  }
}

async function callSign(db: FakeDb) {
  state.db = db;
  const req = new Request("https://x.test/fn", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "sign_contract",
      params: { contract_id: "c1", signature_image: "OTP_SMS_VERIFIED" },
    }),
  });
  const res = await state.handler!(req);
  return { status: res.status, body: await res.json() };
}

function stubFetch(db: FakeDb) {
  vi.stubGlobal("fetch", async () => {
    db.fetchCalls += 1;
    return new Response("{}");
  });
}

function expectNoEffects(db: FakeDb) {
  expect(db.writes.filter((w) => w.table === "client_portal_users")).toEqual([]);
  expect(db.fetchCalls).toBe(0);
  expect(db.inserts).toEqual([]);
}

const NOT_SIGNABLE = {
  error: "contract_not_signable",
  message: "Este contrato já não está disponível para assinatura.",
};

beforeEach(async () => {
  vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "SUPABASE_URL" ? "https://db.test" : "k") } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  if (!state.handler) await import("./index.ts");
});

describe("sign_contract no portal", () => {
  it("contrato anulado: 409, sem consumir o OTP, sem UPDATE, sem portal_status, sem workflow, sem notificacao", async () => {
    const db = new FakeDb({ status: "cancelled" });
    stubFetch(db);
    const r = await callSign(db);
    expect(r.status).toBe(409);
    expect(r.body).toEqual(NOT_SIGNABLE);
    expect(db.otpAvailable).toBe(true);
    expect(db.writes).toEqual([]);
    expectNoEffects(db);
  });

  it("contrato enviado (pending_signature): assina com os mesmos efeitos de sempre", async () => {
    const db = new FakeDb({ status: "pending_signature" });
    stubFetch(db);
    const r = await callSign(db);
    expect(r).toEqual({ status: 200, body: { success: true } });
    expect(db.otpAvailable).toBe(false);
    expect(db.contract.status).toBe("signed");
    expect(db.writes.find((w) => w.table === "client_portal_users")?.patch).toEqual({ portal_status: "signed" });
    expect(db.fetchCalls).toBe(1);
    expect(db.inserts).toEqual(["notifications"]);
  });

  it("corrida, UPDATE devolve o erro do gatilho: 409 e nada se dispara", async () => {
    const db = new FakeDb({ status: "pending_signature" });
    db.signUpdate = { data: null, error: { code: "23514", message: "contract_cancelled_cannot_reopen" } };
    stubFetch(db);
    const r = await callSign(db);
    expect(r.status).toBe(409);
    expect(r.body).toEqual(NOT_SIGNABLE);
    expectNoEffects(db);
  });

  it("corrida, UPDATE com 0 linhas: 409 e nada se dispara", async () => {
    const db = new FakeDb({ status: "pending_signature" });
    db.signUpdate = { data: [], error: null };
    stubFetch(db);
    const r = await callSign(db);
    expect(r.status).toBe(409);
    expectNoEffects(db);
  });

  it("contrato eliminado: 409 sem consumir o OTP", async () => {
    const db = new FakeDb({ status: "pending_signature", deleted_at: "2026-01-01T00:00:00Z" });
    stubFetch(db);
    const r = await callSign(db);
    expect(r.status).toBe(409);
    expect(db.otpAvailable).toBe(true);
    expectNoEffects(db);
  });

  it("contrato ja assinado: 409 sem consumir o OTP", async () => {
    const db = new FakeDb({ status: "signed" });
    stubFetch(db);
    const r = await callSign(db);
    expect(r.status).toBe(409);
    expect(db.otpAvailable).toBe(true);
    expectNoEffects(db);
  });

  it.each(["draft", "pending", "sent"])("estado %s: permitido, assina", async (status) => {
    const db = new FakeDb({ status });
    stubFetch(db);
    const r = await callSign(db);
    expect(r).toEqual({ status: 200, body: { success: true } });
    expect(db.contract.status).toBe("signed");
  });

  it("erro a ler o estado: 503, sem consumir o OTP e sem efeitos", async () => {
    const db = new FakeDb({ status: "pending_signature" });
    db.readError = { code: "XX000", message: "internal" };
    stubFetch(db);
    const r = await callSign(db);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("contract_check_unavailable");
    expect(db.otpAvailable).toBe(true);
    expect(db.writes).toEqual([]);
    expectNoEffects(db);
  });

  it("erro transitorio no UPDATE: 503, OTP reposto e sem efeitos", async () => {
    const db = new FakeDb({ status: "pending_signature" });
    db.signUpdate = { data: null, error: { code: "XX000", message: "internal" } };
    stubFetch(db);
    const r = await callSign(db);
    expect(r.status).toBe(503);
    expect(r.body).toEqual({
      error: "sign_unavailable",
      message: "Não foi possível registar a assinatura. Tente novamente dentro de instantes.",
    });
    expect(db.otpAvailable).toBe(true);
    expect(db.contract.status).toBe("pending_signature");
    expectNoEffects(db);
  });

  it("contrato eliminado entre a leitura e o UPDATE: o filtro deleted_at IS NULL da 0 linhas, 409", async () => {
    const db = new FakeDb({ status: "pending_signature" });
    db.onBeforeSignUpdate = () => { db.contract = { ...db.contract, deleted_at: "2026-01-01T00:00:00Z" }; };
    stubFetch(db);
    const r = await callSign(db);
    expect(r.status).toBe(409);
    expect(r.body).toEqual(NOT_SIGNABLE);
    expect(db.contract.status).toBe("pending_signature");
    expectNoEffects(db);
  });
});
