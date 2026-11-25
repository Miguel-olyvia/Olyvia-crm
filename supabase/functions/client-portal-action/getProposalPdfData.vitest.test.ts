/**
 * get_proposal_pdf_data no portal -- o PDF que o cliente descarrega tem de ter a
 * secao CLIENTE igual ao do CRM. O browser resolve a ficha pelo entity_id do
 * orcamento, com a sessao do cliente (sem acesso a `deals`). Um orcamento sem
 * entity_id proprio (ligado so pela proposta ou pelo negocio) ficava sem
 * cliente no PDF do portal; a funcao resolve-o e envia-o no orcamento.
 * Corre o index.ts verdadeiro, com um cliente Supabase em memoria.
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

const USER = { id: "auth-1", email: "c@example.test", user_metadata: { full_name: "Nome Antigo da Conta" } };

class FakeDb {
  constructor(public tables: Record<string, Row[]>) {}
  client = {
    auth: { getUser: async () => ({ data: { user: USER }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => new Q(this, table),
  };
}

class Q {
  private filters: Array<[string, any]> = [];
  constructor(private db: FakeDb, private table: string) {}
  select() { return this; }
  eq(c: string, v: any) { this.filters.push([c, v]); return this; }
  in(c: string, v: any[]) { this.filters.push([c, v]); return this; }
  is() { return this; }
  not() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this.run().then((rows) => ({ data: rows[0] ?? null, error: null })); }
  then(res: any, rej: any) { return this.run().then((rows) => ({ data: rows, error: null })).then(res, rej); }
  private async run(): Promise<Row[]> {
    if (this.table === "client_portal_users") return [{ id: "pu1" }];
    const rows = this.db.tables[this.table] ?? [];
    return rows.filter((r) => this.filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v)));
  }
}

async function callPdfData() {
  const req = new Request("https://x.test/fn", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_proposal_pdf_data", params: { proposal_id: "p1" } }),
  });
  const res = await state.handler!(req);
  return { status: res.status, body: await res.json() };
}

beforeEach(async () => {
  vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "SUPABASE_URL" ? "https://db.test" : "k") } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  if (!state.handler) await import("./index.ts");
});

describe("get_proposal_pdf_data: entity_id do cliente no orcamento", () => {
  it("orcamento sem entity_id: segue com o da proposta, para o PDF do portal ter o mesmo cliente que o do CRM", async () => {
    state.db = new FakeDb({
      proposals: [{ id: "p1", entity_id: "e1", organization_id: "org-1", proposal_number: "P-1" }],
      quotes: [{ id: "q1", proposal_id: "p1", entity_id: null, deal_id: "d1", organization_id: "org-1" }],
      quote_lines: [],
      quote_fees: [],
    });
    const r = await callPdfData();
    expect(r.status).toBe(200);
    expect(r.body.quotes).toHaveLength(1);
    expect(r.body.quotes[0].quote.entity_id).toBe("e1");
  });

  it("orcamento com entity_id proprio: nao se mexe", async () => {
    state.db = new FakeDb({
      proposals: [{ id: "p1", entity_id: "e-proposta", organization_id: "org-1" }],
      quotes: [{ id: "q1", proposal_id: "p1", entity_id: "e-orcamento", organization_id: "org-1" }],
    });
    const r = await callPdfData();
    expect(r.body.quotes[0].quote.entity_id).toBe("e-orcamento");
  });

  it("sem ficha em lado nenhum: continua sem entity_id (nao inventa)", async () => {
    state.db = new FakeDb({
      proposals: [{ id: "p1", entity_id: null, organization_id: "org-1" }],
      quotes: [{ id: "q1", proposal_id: "p1", entity_id: null, organization_id: "org-1" }],
    });
    const r = await callPdfData();
    expect(r.body.quotes[0].quote.entity_id).toBeNull();
  });
});

describe("get_proposal_pdf_data: a mesma ficha que o CRM escolheria (negocio, depois proposta)", () => {
  // CRM: quotePdfClient.resolveQuotePdfEntityId -> entity_id do orcamento; negocio do
  // orcamento (entity_id, lead, contacto, cliente); proposta (entity_id, negocio, cliente);
  // por fim lead/contacto/cliente do proprio orcamento.
  const proposta = (extra: Row = {}) => ({ id: "p1", entity_id: "e-proposta", organization_id: "org-1", deal_id: null, client_id: null, ...extra });
  const orcamento = (extra: Row = {}) => ({ id: "q1", proposal_id: "p1", entity_id: null, deal_id: "d1", organization_id: "org-1", ...extra });

  it("orcamento sem entity_id, negocio e proposta com fichas diferentes: a do negocio (como no CRM)", async () => {
    state.db = new FakeDb({
      proposals: [proposta()],
      quotes: [orcamento()],
      deals: [{ id: "d1", entity_id: "e-negocio", lead_id: null, contact_id: null, client_id: null }],
    });
    const r = await callPdfData();
    expect(r.body.quotes[0].quote.entity_id).toBe("e-negocio");
  });

  it("negocio sem ficha propria mas com lead: a ficha da lead, antes da proposta (como no CRM)", async () => {
    state.db = new FakeDb({
      proposals: [proposta()],
      quotes: [orcamento()],
      deals: [{ id: "d1", entity_id: null, lead_id: "l1", contact_id: null, client_id: null }],
      anew_leads: [{ id: "l1", entity_id: "e-lead" }],
    });
    const r = await callPdfData();
    expect(r.body.quotes[0].quote.entity_id).toBe("e-lead");
  });

  it("sem negocio: a ficha da proposta", async () => {
    state.db = new FakeDb({
      proposals: [proposta()],
      quotes: [orcamento({ deal_id: null })],
    });
    const r = await callPdfData();
    expect(r.body.quotes[0].quote.entity_id).toBe("e-proposta");
  });

  it("proposta sem entity_id: o negocio da proposta, depois o cliente da proposta", async () => {
    state.db = new FakeDb({
      proposals: [proposta({ entity_id: null, deal_id: "d2" })],
      quotes: [orcamento({ deal_id: null })],
      deals: [{ id: "d2", entity_id: "e-negocio-proposta" }],
    });
    expect((await callPdfData()).body.quotes[0].quote.entity_id).toBe("e-negocio-proposta");

    state.db = new FakeDb({
      proposals: [proposta({ entity_id: null, client_id: "c1" })],
      quotes: [orcamento({ deal_id: null })],
      anew_clients: [{ id: "c1", entity_id: "e-cliente" }],
    });
    expect((await callPdfData()).body.quotes[0].quote.entity_id).toBe("e-cliente");
  });

  it("so o orcamento aponta para uma lead: a ficha da lead do orcamento (ultimo recurso do CRM)", async () => {
    state.db = new FakeDb({
      proposals: [proposta({ entity_id: null })],
      quotes: [orcamento({ deal_id: null, lead_id: "l9" })],
      anew_leads: [{ id: "l9", entity_id: "e-lead-orcamento" }],
    });
    expect((await callPdfData()).body.quotes[0].quote.entity_id).toBe("e-lead-orcamento");
  });
});
