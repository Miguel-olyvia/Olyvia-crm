import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuoteRenderContext } from "@/utils/buildQuoteRenderContext";
import { cenariosPdf, renderPdf, textoDoPdf } from "@/components/__tests__/QuotePDFDocument.fixtures";

// O PDF que o cliente descarrega no portal tem de ter a secao CLIENTE igual ao
// do CRM para a MESMA proposta. Aqui corre-se o codigo verdadeiro dos dois lados:
//   - CRM: buildQuoteRenderContext -> resolveQuotePdfClient (browser com sessao do CRM,
//     que le `deals` e `proposals`; as RPC resolve_quote_contact/address devolvem os dados).
//   - Portal: o index.ts REAL da Edge Function client-portal-action (get_proposal_pdf_data,
//     com a base em memoria) devolve o orcamento com o entity_id resolvido; depois o
//     browser do cliente (RLS limitada: sem `deals` nem `proposals`, RPC vazias) corre o
//     mesmo buildQuoteRenderContext sobre esse orcamento.
//   - A secao CLIENTE e a que o QuotePDFDocument verdadeiro desenha (a arvore e expandida
//     sem gerar PDF), nao uma recomposicao feita no teste.
// Supabase simulado nos dois lados.

const FICHA_A = { id: "e1", display_name: "EVOLAR MÓVEIS LDA", first_name: "Rui", last_name: "Costa", type: "person" };
const FICHA_B = { id: "e2", display_name: "OUTRA EMPRESA SA", first_name: "Rita", last_name: "Lopes", type: "organization" };
const FICHAS: Record<string, any> = { e1: FICHA_A, e2: FICHA_B };
const EMAILS = [{ email: "geral@evolar.pt" }];
const PHONES = [{ phone_number: "912345678", country_code: "+351" }];
const MORADA = { street: "Rua das Flores", number: "12", postal_code: "4000-001", city: "Porto", district: "Porto" };
const ADDRESS_LINKS = [{ address_id: "a1", is_primary: true, address_type: "billing", valid_to: null, created_at: "2026-01-01T00:00:00Z", anew_addresses: MORADA }];

let mode: "crm" | "portal" = "crm";
let entityReadable = true;
const tables: Record<string, any> = {};

const rpcResult = (name: string) => {
  if (mode === "portal") return name === "resolve_quote_address" ? { data: [], error: null } : { data: null, error: null };
  if (name === "resolve_quote_address") return { data: [{ ...MORADA, address_id: "a1", address_type: "billing", is_primary: true }], error: null };
  return { data: { email: EMAILS[0].email, phone_number: PHONES[0].phone_number, country_code: PHONES[0].country_code }, error: null };
};

vi.mock("@/lib/nif/callNifReveal", () => ({ callNifRevealSingle: vi.fn(async () => "509876543") }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const b: any = {};
    const filters: Record<string, any> = {};
    for (const m of ["select", "order", "limit", "in"]) b[m] = () => b;
    b.eq = (c: string, v: any) => { filters[c] = v; return b; };
    const rows = () => {
      if (table === "anew_entities") return entityReadable ? FICHAS[filters.id] ?? null : null;
      return tables[table];
    };
    b.maybeSingle = () => Promise.resolve({ data: Array.isArray(rows()) ? rows()[0] : rows() ?? null, error: null });
    b.then = (ok: any, err: any) => Promise.resolve({ data: rows() ?? [], error: null }).then(ok, err);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (name: string) => ({ maybeSingle: () => Promise.resolve(rpcResult(name)), then: (ok: any, err: any) => Promise.resolve(rpcResult(name)).then(ok, err) }),
      auth: { getUser: async () => ({ data: { user: { id: "auth-1", email: "conta@x.pt", user_metadata: { full_name: "Nome Antigo da Conta" } } } }) },
    },
  };
});

const EDGE_FUNCTION = "../../../supabase/functions/client-portal-action/index.ts";

// ── Edge Function verdadeira, com a base em memoria ─────────────────────────────
type Row = Record<string, any>;
const edge = vi.hoisted(() => ({ handler: null as null | ((req: Request) => Promise<Response>), db: null as any }));
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({ serve: (h: (req: Request) => Promise<Response>) => { edge.handler = h; } }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => edge.db.client }));
vi.mock("../../../supabase/functions/_shared/sentry.ts", () => ({ initSentry: () => {}, captureError: () => {} }));
vi.mock("../../../supabase/functions/_shared/notificationSettings.ts", () => ({ isNotificationEnabled: async () => true }));
vi.mock("../../../supabase/functions/_shared/portalNotifyTarget.ts", () => ({ resolveNotifyTarget: async () => ({ orgId: "org-1", commercialAuthId: "com-1" }) }));
vi.mock("../../../supabase/functions/_shared/proposalWorkflowStage.ts", () => ({ resolveProposalStageId: async () => null }));
vi.mock("../../../supabase/functions/_shared/cors.ts", () => ({ getCorsHeaders: () => ({ "Access-Control-Allow-Origin": "*" }) }));

class EdgeQ {
  private filters: Array<[string, any]> = [];
  constructor(private tbl: Record<string, Row[]>, private table: string) {}
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
    return (this.tbl[this.table] ?? []).filter((r) => this.filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v)));
  }
}

const edgeProposalPdfData = async (tbl: Record<string, Row[]>) => {
  edge.db = {
    client: {
      auth: { getUser: async () => ({ data: { user: { id: "auth-1", email: "c@x.pt", user_metadata: {} } }, error: null }) },
      rpc: async () => ({ data: null, error: null }),
      from: (t: string) => new EdgeQ(tbl, t),
    },
  };
  const res = await edge.handler!(new Request("https://x.test/fn", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_proposal_pdf_data", params: { proposal_id: "p1" } }),
  }));
  return (await res.json()) as { quotes: Array<{ quote: Row }> };
};

// ── Situacoes: de onde vem a ficha do orcamento ─────────────────────────────────
interface Situacao { nome: string; quote: Row; dealEntity: string | null; proposalEntity: string | null; ficha: typeof FICHA_A }
const SITUACOES: Situacao[] = [
  { nome: "orcamento com entity_id", quote: { id: "q1", entity_id: "e1", deal_id: "d1", proposal_id: "p1", organization_id: "org-1" }, dealEntity: "e2", proposalEntity: "e2", ficha: FICHA_A },
  { nome: "orcamento SEM entity_id, negocio e proposta com fichas diferentes (o do bug)", quote: { id: "q1", entity_id: null, deal_id: "d1", proposal_id: "p1", organization_id: "org-1" }, dealEntity: "e1", proposalEntity: "e2", ficha: FICHA_A },
  { nome: "orcamento SEM entity_id e sem negocio: a ficha da proposta", quote: { id: "q1", entity_id: null, deal_id: null, proposal_id: "p1", organization_id: "org-1" }, dealEntity: null, proposalEntity: "e2", ficha: FICHA_B },
];

const secaoCliente = async (quoteData: Row) => {
  const { ctx, raw } = await buildQuoteRenderContext({ quoteData, organizationId: "org-1" });
  const base: any = cenariosPdf.propostaPadrao;
  const arvore = renderPdf({ ...base, quote: { ...base.quote, ...quoteData }, client: raw.client, company: raw.company, user: raw.user, renderContext: ctx });
  const texto = textoDoPdf(arvore);
  const inicio = texto.indexOf("CLIENTE");
  const fim = texto.indexOf("DETALHES", inicio);
  return { ctx, raw, texto: texto.slice(inicio, fim) };
};

const crm = async (s: Situacao) => {
  mode = "crm";
  tables.deals = s.dealEntity ? { id: "d1", entity_id: s.dealEntity } : null;
  tables.proposals = { id: "p1", entity_id: s.proposalEntity, deal_id: null, client_id: null };
  return secaoCliente(s.quote);
};

const portal = async (s: Situacao) => {
  const resposta = await edgeProposalPdfData({
    proposals: [{ id: "p1", entity_id: s.proposalEntity, deal_id: null, client_id: null, organization_id: "org-1" }],
    quotes: [s.quote],
    deals: s.dealEntity ? [{ id: "d1", entity_id: s.dealEntity }] : [],
  });
  mode = "portal";
  // Browser do cliente: a RLS nao deixa ler `deals` nem `proposals`.
  delete tables.deals;
  delete tables.proposals;
  return secaoCliente(resposta.quotes[0].quote);
};

beforeEach(async () => {
  mode = "crm";
  entityReadable = true;
  for (const k of Object.keys(tables)) delete tables[k];
  tables.anew_entity_emails = EMAILS;
  tables.anew_entity_phones = PHONES;
  tables.anew_entity_fiscal_entities = [{ fiscal_entity_id: "f1" }];
  tables.anew_entity_addresses = ADDRESS_LINKS;
  vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "SUPABASE_URL" ? "https://db.test" : "k") } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  // Caminho em variavel de proposito: o tsconfig.app.json nao deve seguir o index.ts da Edge
  // Function (e de Deno, os tipos dele nao pertencem a este projecto).
  if (!edge.handler) await import(/* @vite-ignore */ EDGE_FUNCTION);
});

describe("PDF do portal vs PDF do CRM: secao CLIENTE (codigo real dos dois lados)", () => {
  it.each(SITUACOES)("$nome: mesmo texto no CRM e no portal", async (s) => {
    const doCrm = await crm(s);
    const doPortal = await portal(s);
    expect(doCrm.texto).toContain(`Nome:${s.ficha.display_name}`);
    expect(doCrm.texto).toContain("NIF:509876543");
    expect(doCrm.texto).toContain("Email:geral@evolar.pt");
    expect(doCrm.texto).toContain("Telefone:912345678");
    expect(doCrm.texto).toContain("Morada fiscal:Rua das Flores, 12, 4000-001, Porto");
    expect(doPortal.texto).toBe(doCrm.texto);
    expect(doPortal.ctx.client).toEqual(doCrm.ctx.client);
    expect(doPortal.raw.client).toEqual(doCrm.raw.client);
  });

  it("o nome vem da ficha, nunca dos metadados da conta de quem descarrega", async () => {
    const doPortal = await portal(SITUACOES[1]);
    expect(doPortal.ctx.client.display_name).toBe("EVOLAR MÓVEIS LDA");
    expect(doPortal.texto).not.toContain("Nome Antigo da Conta");
  });

  it("se o portal nao conseguir LER a ficha (RLS), o PDF sai sem bloco de cliente: e a unica forma de divergir", async () => {
    const resposta = await edgeProposalPdfData({
      proposals: [{ id: "p1", entity_id: "e1", organization_id: "org-1" }],
      quotes: [SITUACOES[1].quote],
      deals: [],
    });
    mode = "portal";
    entityReadable = false;
    const doPortal = await secaoCliente(resposta.quotes[0].quote);
    expect(doPortal.raw.client).toBeNull();
    expect(doPortal.ctx.client.display_name).toBe("");
  });
});
