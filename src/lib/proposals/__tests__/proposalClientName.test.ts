import { describe, expect, it, vi } from "vitest";
import { buildEntityNameMap, mapProposalContactToClient } from "@/lib/proposals/proposalClientName";
import { getEntityDisplayName } from "@/lib/entityDisplayName";
import { resolveQuotePdfClient } from "@/utils/quotePdfClient";

// A MESMA ficha tem de dar o MESMO nome na lista de propostas, na ficha da
// proposta e no PDF. Caso real: ficha `person` (nao `organization`) cujo
// display_name e o nome da empresa, com nome e apelido da pessoa a parte.

const rpc = vi.fn();
const tables: Record<string, any> = {};

vi.mock("@/lib/nif/callNifReveal", () => ({ callNifRevealSingle: vi.fn(async () => "") }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const b: any = {};
    for (const m of ["select", "eq", "order", "limit", "in"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: Array.isArray(tables[table]) ? tables[table][0] : tables[table], error: null });
    b.then = (ok: any, err: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok, err);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (...a: any[]) => ({ maybeSingle: () => rpc(...a), then: (ok: any, err: any) => Promise.resolve(rpc(...a)).then(ok, err) }),
    },
  };
});

const FICHA = { entity_id: "e1", entity_type: "person", display_name: "Empresa X, Lda", first_name: "Ana", last_name: "Silva" };

describe("mesmo cliente, mesmo nome", () => {
  it("ficha da proposta (person): mostra o display_name, nao nome + apelido", () => {
    const client = mapProposalContactToClient({ ...FICHA, email: "a@x.pt", phone_number: "911" });
    expect(getEntityDisplayName(client, "Cliente")).toBe("Empresa X, Lda");
    expect(client.email).toBe("a@x.pt");
    expect(client.phone).toBe("911");
  });

  it("ficha da proposta (organization): o mesmo nome", () => {
    const client = mapProposalContactToClient({ ...FICHA, entity_type: "organization" });
    expect(getEntityDisplayName(client, "Cliente")).toBe("Empresa X, Lda");
  });

  it("lista de propostas: o nome vem do display_name da ficha", () => {
    const names = buildEntityNameMap([
      { entity_id: "e1", display_name: "Empresa X, Lda" },
      { entity_id: "e2", display_name: "" , first_name: "Rui", last_name: "Costa" } as any,
      { entity_id: null, display_name: "ignorada" } as any,
    ]);
    expect(names).toEqual({ e1: "Empresa X, Lda", e2: "Rui Costa" });
  });

  it("PDF (ficha person): o cliente do PDF tem o mesmo nome que a lista e a ficha", async () => {
    tables.anew_entities = { id: "e1", display_name: "Empresa X, Lda", first_name: "Ana", last_name: "Silva", type: "person" };
    rpc.mockImplementation(async () => ({ data: null, error: null }));
    const { client } = await resolveQuotePdfClient({ entityId: "e1" });
    const lista = buildEntityNameMap([{ entity_id: "e1", display_name: "Empresa X, Lda" }]).e1;
    const ficha = getEntityDisplayName(mapProposalContactToClient(FICHA), "Cliente");
    const pdf = getEntityDisplayName(client, "");
    expect(pdf).toBe("Empresa X, Lda");
    expect(new Set([lista, ficha, pdf]).size).toBe(1);
  });

  it("PDF: so as fichas `organization` ficam com tipo empresa (o tipo 'company' nao existe)", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: null }));
    tables.anew_entities = { id: "e2", display_name: "Empresa Y", first_name: null, last_name: null, type: "organization" };
    const org = (await resolveQuotePdfClient({ entityId: "e2" })).client;
    expect(org?.client_type).toBe("company");
    expect(org?.company_name).toBe("Empresa Y");
    expect(org?.first_name).toBe("");

    tables.anew_entities = { id: "e1", display_name: "Ana Silva", first_name: "Ana", last_name: "Silva", type: "person" };
    const person = (await resolveQuotePdfClient({ entityId: "e1" })).client;
    expect(person?.client_type).toBe("individual");
    expect(person?.company_name).toBe("");
    expect(person?.first_name).toBe("Ana");
  });
});
