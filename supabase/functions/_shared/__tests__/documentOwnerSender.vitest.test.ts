import { describe, expect, it } from "vitest";
import { resolveDocumentOwner } from "../documentOwnerSender";

// O que se testa: quem aparece como remetente ("De:") de uma proposta,
// orcamento ou contrato enviado por email deve ser o COMERCIAL DONO do
// negocio a que o documento pertence -- nunca quem clicou em "enviar" (esse
// continua a ser a auditoria, sent_by, e este helper nunca lhe toca).

type Row = Record<string, unknown>;

const ORG = "org-a";
const OTHER_ORG = "org-b";

/** Colunas que cada tabela REALMENTE tem, para o mock falhar como o PostgREST
 * falharia se o codigo pedisse uma coluna inexistente (ex.: deal_id em
 * client_contracts, que nao existe). */
const SCHEMA: Record<string, string[]> = {
  proposals: ["id", "organization_id", "assigned_to", "deal_id"],
  quotes: ["id", "organization_id", "assigned_to", "deal_id", "proposal_id"],
  client_contracts: ["id", "organization_id", "assigned_to", "proposal_id", "quote_id"],
  deals: ["id", "organization_id", "assigned_to", "created_by"],
  anew_users: ["id", "auth_user_id", "display_name"],
  anew_memberships: ["id", "user_id", "organization_id", "status"],
};

function makeSupabase(dataset: Record<string, Row[]>, opts: { throwOnFrom?: string } = {}) {
  return {
    from(table: string) {
      if (opts.throwOnFrom === table) {
        throw new Error(`simulated failure on ${table}`);
      }
      const rows = dataset[table] ?? [];
      const filters: Array<[string, unknown]> = [];
      let columns: string[] = [];
      let limitApplied: number | null = null;
      const builder: any = {
        select(cols?: string) {
          columns = (cols ?? "").split(",").map((c) => c.trim()).filter(Boolean);
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return builder;
        },
        limit(n: number) {
          limitApplied = n;
          return builder;
        },
        async maybeSingle() {
          const known = SCHEMA[table] ?? [];
          const missing = columns.find((c) => !known.includes(c));
          if (missing) {
            return { data: null, error: { message: `column ${table}.${missing} does not exist` } };
          }
          let matches = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
          if (limitApplied != null) matches = matches.slice(0, limitApplied);
          const match = matches[0];
          if (!match) return { data: null, error: null };
          const projected: Row = {};
          for (const c of columns) projected[c] = match[c] ?? null;
          return { data: projected, error: null };
        },
      };
      return builder;
    },
  };
}

const DATASET: Record<string, Row[]> = {
  proposals: [
    { id: "prop-a", organization_id: ORG, assigned_to: "u-A", deal_id: null },
    { id: "prop-b", organization_id: ORG, assigned_to: null, deal_id: "deal-b" },
    { id: "prop-c", organization_id: ORG, assigned_to: null, deal_id: "deal-c" },
    { id: "prop-d", organization_id: ORG, assigned_to: null, deal_id: null },
    { id: "prop-e", organization_id: ORG, assigned_to: "u-E", deal_id: "deal-b" },
    { id: "prop-other-org", organization_id: OTHER_ORG, assigned_to: "u-A", deal_id: null },
  ],
  quotes: [
    { id: "quote-a", organization_id: ORG, assigned_to: null, deal_id: null, proposal_id: "prop-e" },
    { id: "quote-none", organization_id: ORG, assigned_to: null, deal_id: null, proposal_id: null },
    { id: "quote-d", organization_id: ORG, assigned_to: "u-D", deal_id: null, proposal_id: null },
  ],
  client_contracts: [
    { id: "ct-a", organization_id: ORG, assigned_to: "u-A", proposal_id: null, quote_id: null },
    { id: "ct-b", organization_id: ORG, assigned_to: null, proposal_id: null, quote_id: "quote-d" },
    { id: "ct-none", organization_id: ORG, assigned_to: null, proposal_id: null, quote_id: null },
  ],
  deals: [
    { id: "deal-b", organization_id: ORG, assigned_to: "u-B", created_by: "u-B-creator" },
    { id: "deal-c", organization_id: ORG, assigned_to: null, created_by: "u-C" },
  ],
  anew_users: [
    { id: "u-A", auth_user_id: "auth-A", display_name: "Ana" },
    { id: "u-B", auth_user_id: "auth-B", display_name: "Bruno" },
    { id: "u-C", auth_user_id: "auth-C", display_name: "Carla" },
    { id: "u-D", auth_user_id: "auth-D", display_name: "Duarte" },
    { id: "u-D-esperado", auth_user_id: "auth-D-esperado", display_name: "Duarte" },
    // u-E existe mas sem membership activa em ORG (saiu da organizacao).
    { id: "u-E", auth_user_id: "auth-E", display_name: "Eva" },
  ],
  anew_memberships: [
    { id: "m1", user_id: "u-A", organization_id: ORG, status: "active" },
    { id: "m2", user_id: "u-B", organization_id: ORG, status: "active" },
    { id: "m3", user_id: "u-C", organization_id: ORG, status: "active" },
    { id: "m4", user_id: "u-D", organization_id: ORG, status: "active" },
    // u-E nao tem membership activa em ORG.
  ],
};

describe("resolveDocumentOwner", () => {
  it("1) proposta com assigned_to: devolve esse comercial", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "proposal", "prop-a", ORG);
    expect(owner).toEqual({ anewUserId: "u-A", authUserId: "auth-A", displayName: "Ana" });
  });

  it("2) proposta sem assigned_to, deal com assigned_to: devolve o do deal", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "proposal", "prop-b", ORG);
    expect(owner?.anewUserId).toBe("u-B");
  });

  it("3) proposta sem assigned_to, deal sem assigned_to: cai no created_by do deal", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "proposal", "prop-c", ORG);
    expect(owner?.anewUserId).toBe("u-C");
  });

  it("4) proposta sem assigned_to e sem deal_id: null (caller fica como fallback)", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "proposal", "prop-d", ORG);
    expect(owner).toBeNull();
  });

  it("5) orcamento sem assigned_to/deal_id, via proposal_id ate ao deal: devolve o do deal", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "quote", "quote-a", ORG);
    expect(owner?.anewUserId).toBe("u-B");
  });

  it("6) orcamento sem assigned_to, deal_id nem proposal_id: null", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "quote", "quote-none", ORG);
    expect(owner).toBeNull();
  });

  it("7) contrato com assigned_to: devolve esse comercial, e nunca pede deal_id a client_contracts", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "contract", "ct-a", ORG);
    expect(owner?.anewUserId).toBe("u-A");
    // Se o codigo pedisse deal_id a client_contracts, o mock devolveria erro
    // de coluna inexistente e owner ficaria null -- confirma que nao pede.
  });

  it("8) contrato sem assigned_to/proposal_id, via quote_id: devolve o do orcamento", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "contract", "ct-b", ORG);
    expect(owner?.anewUserId).toBe("u-D");
  });

  it("9) contrato sem assigned_to, proposal_id nem quote_id: null", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "contract", "ct-none", ORG);
    expect(owner).toBeNull();
  });

  it("10) assigned_to sem membership activa: salta para o candidato seguinte", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "proposal", "prop-e", ORG);
    // prop-e.assigned_to = u-E (sem membership activa) -> deal-b.assigned_to = u-B
    expect(owner?.anewUserId).toBe("u-B");
  });

  it("11) documento de outra organizacao: null", async () => {
    const supabase = makeSupabase(DATASET);
    const owner = await resolveDocumentOwner(supabase, "proposal", "prop-other-org", ORG);
    expect(owner).toBeNull();
  });

  it("12) erro na leitura: devolve null sem rejeitar", async () => {
    const supabase = makeSupabase(DATASET, { throwOnFrom: "proposals" });
    await expect(resolveDocumentOwner(supabase, "proposal", "prop-a", ORG)).resolves.toBeNull();
  });

  it("13) organizationId nulo ou documentId vazio: null", async () => {
    const supabase = makeSupabase(DATASET);
    expect(await resolveDocumentOwner(supabase, "proposal", "prop-a", null)).toBeNull();
    expect(await resolveDocumentOwner(supabase, "proposal", "", ORG)).toBeNull();
  });
});
