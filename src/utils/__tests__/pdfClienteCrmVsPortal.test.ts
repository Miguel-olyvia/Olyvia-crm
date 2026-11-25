import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuoteRenderContext } from "@/utils/buildQuoteRenderContext";
import { getEntityDisplayName } from "@/lib/entityDisplayName";

// O PDF que o cliente descarrega no portal tem de ter a secao CLIENTE igual ao
// do CRM para a MESMA proposta. Os dois chamam generateProposalPdfBlob ->
// generateQuotePdfBlob -> buildQuoteRenderContext -> resolveQuotePdfClient; o
// que muda e o que a base devolve a cada sessao:
//   - CRM: as RPC resolve_quote_contact / resolve_quote_address (SECURITY
//     DEFINER, exigem quotes.view numa org do CRM) devolvem o contacto e a morada.
//   - Portal: as mesmas RPC devolvem VAZIO (o cliente nao tem quotes.view) e o
//     codigo cai na leitura directa, que a RLS do portal permite para a ficha.
// Supabase simulado; so a resposta das RPC muda entre os dois modos.

const FICHA = { id: "e1", display_name: "EVOLAR MÓVEIS LDA", first_name: "Rui", last_name: "Costa", type: "person" };
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
    for (const m of ["select", "eq", "order", "limit", "in"]) b[m] = () => b;
    const rows = () => {
      if (table === "anew_entities" && !entityReadable) return null;
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

const QUOTE = { id: "q1", entity_id: "e1", organization_id: "org-1", client_name: null, assigned_to: null, created_by: null };

beforeEach(() => {
  mode = "crm";
  entityReadable = true;
  for (const k of Object.keys(tables)) delete tables[k];
  tables.anew_entities = FICHA;
  tables.anew_entity_emails = EMAILS;
  tables.anew_entity_phones = PHONES;
  tables.anew_entity_fiscal_entities = [{ fiscal_entity_id: "f1" }];
  tables.anew_entity_addresses = ADDRESS_LINKS;
});

const clienteSection = async (m: "crm" | "portal") => {
  mode = m;
  const { ctx, raw } = await buildQuoteRenderContext({ quoteData: QUOTE, organizationId: "org-1" });
  // O texto da secao CLIENTE como o QuotePDFDocument o compoe a partir do
  // cliente cru (nome, NIF, email, telefone, morada principal).
  const c = raw.client;
  const principal = c?.client_addresses?.find((a: any) => a.is_primary) || c?.client_addresses?.[0];
  const morada = principal ? [principal.street, principal.number, principal.postal_code, principal.city].filter(Boolean).join(", ") : "";
  const text = [getEntityDisplayName(c, QUOTE.client_name || ""), c?.vat || "", c?.email || "", c?.phone || "", morada].join(" | ");
  return { ctx, raw, text };
};

describe("PDF do portal vs PDF do CRM: secao CLIENTE", () => {
  it("mesma proposta, mesmo texto: nome, NIF, email, telefone e morada", async () => {
    const crm = await clienteSection("crm");
    const portal = await clienteSection("portal");
    expect(crm.text).toBe("EVOLAR MÓVEIS LDA | 509876543 | geral@evolar.pt | 912345678 | Rua das Flores, 12, 4000-001, Porto");
    expect(portal.text).toBe(crm.text);
    expect(portal.ctx.client).toEqual(crm.ctx.client);
    expect(portal.raw.client).toEqual(crm.raw.client);
  });

  it("o nome vem da ficha, nunca dos metadados da conta de quem descarrega", async () => {
    const portal = await clienteSection("portal");
    expect(portal.ctx.client.display_name).toBe("EVOLAR MÓVEIS LDA");
    expect(portal.text).not.toContain("Nome Antigo da Conta");
  });

  it("se o portal nao conseguir LER a ficha (RLS), o PDF sai sem bloco de cliente: e a unica forma de divergir", async () => {
    entityReadable = false;
    const portal = await clienteSection("portal");
    expect(portal.raw.client).toBeNull();
    expect(portal.ctx.client.display_name).toBe("");
  });
});
