import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveNotifyTarget } from "../portalNotifyTarget.ts";

// O que se testa: a QUEM (e em que ORGANIZAÇÃO) vai a notificação de uma ação
// do portal. A regra é que o destinatário sai SEMPRE do documento assinado —
// nunca de uma ficha de portal escolhida só pelo login. Um login que é cliente
// em várias empresas tem de notificar o comercial da empresa DAQUELA proposta.

type Row = Record<string, unknown>;

/** Mock mínimo do client Supabase: .from(t).select().eq().eq().maybeSingle() */
function makeSupabase(dataset: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = dataset[table] ?? [];
      const filters: Array<[string, unknown]> = [];
      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return builder;
        },
        async maybeSingle() {
          const match = rows.find((r) => filters.every(([c, v]) => r[c] === v));
          return { data: match ?? null, error: null };
        },
      };
      return builder;
    },
  };
}

// Duas propostas da MESMA entidade (ent-x), uma na Mudelar e outra na nike, cada
// uma com o seu comercial. É o cenário do bug: o mesmo cliente com portal nas
// duas empresas.
const DATASET: Record<string, Row[]> = {
  proposals: [
    { id: "prop-mud", organization_id: "org-mud", assigned_to: "u-ricardo", entity_id: "ent-x", deal_id: null, created_by: "u-ricardo" },
    { id: "prop-nike", organization_id: "org-nike", assigned_to: "u-nike", entity_id: "ent-x", deal_id: null, created_by: "u-nike" },
    { id: "prop-sem-assign", organization_id: "org-a", assigned_to: null, entity_id: "ent-y", deal_id: null, created_by: "u-creator" },
    { id: "prop-via-deal", organization_id: "org-a", assigned_to: null, entity_id: null, deal_id: "deal-1", created_by: "u-creator" },
    { id: "prop-deal-cross", organization_id: "org-a", assigned_to: null, entity_id: "ent-sem-cliente", deal_id: "deal-outra-org", created_by: "u-creator" },
    { id: "prop-so-creator", organization_id: "org-a", assigned_to: null, entity_id: "ent-sem-cliente", deal_id: null, created_by: "u-creator" },
  ],
  client_contracts: [
    { id: "ct-nike", organization_id: "org-nike", assigned_to: "u-nike", entity_id: "ent-x", deal_id: null, created_by: "u-nike" },
  ],
  anew_clients: [
    // A MESMA entidade é cliente em duas orgs, com responsáveis diferentes.
    { entity_id: "ent-y", organization_id: "org-a", assigned_to: "u-resp-a" },
    { entity_id: "ent-y", organization_id: "org-outra", assigned_to: "u-resp-errado" },
  ],
  deals: [
    { id: "deal-1", organization_id: "org-a", assigned_to: "u-deal" },
    // Negócio doutra organização — nunca deve ser escolhido para um documento de org-a.
    { id: "deal-outra-org", organization_id: "org-outra", assigned_to: "u-deal-errado" },
  ],
  anew_users: [
    { id: "u-ricardo", auth_user_id: "auth-ricardo" },
    { id: "u-nike", auth_user_id: "auth-nike" },
    { id: "u-resp-a", auth_user_id: "auth-resp-a" },
    { id: "u-deal", auth_user_id: "auth-deal" },
    { id: "u-creator", auth_user_id: "auth-creator" },
  ],
};

Deno.test("1) usa o comercial atribuído à proposta, na org da proposta", async () => {
  const supabase = makeSupabase(DATASET);
  const t = await resolveNotifyTarget(supabase, "proposal_id", "prop-mud");
  assertEquals(t, { orgId: "org-mud", commercialAuthId: "auth-ricardo" });
});

Deno.test("2) REGRESSÃO multi-org: a mesma entidade em duas empresas notifica o comercial de CADA empresa", async () => {
  const supabase = makeSupabase(DATASET);
  const mud = await resolveNotifyTarget(supabase, "proposal_id", "prop-mud");
  const nike = await resolveNotifyTarget(supabase, "proposal_id", "prop-nike");
  // Nunca se cruzam: cada proposta resolve para a SUA org e o SEU comercial.
  assertEquals(mud, { orgId: "org-mud", commercialAuthId: "auth-ricardo" });
  assertEquals(nike, { orgId: "org-nike", commercialAuthId: "auth-nike" });
});

Deno.test("3) sem comercial na proposta: usa o responsável da entidade NESSA org (não noutra)", async () => {
  const supabase = makeSupabase(DATASET);
  const t = await resolveNotifyTarget(supabase, "proposal_id", "prop-sem-assign");
  assertEquals(t, { orgId: "org-a", commercialAuthId: "auth-resp-a" });
});

Deno.test("4) sem comercial e sem cliente da entidade: cai no comercial do negócio", async () => {
  const supabase = makeSupabase(DATASET);
  const t = await resolveNotifyTarget(supabase, "proposal_id", "prop-via-deal");
  assertEquals(t, { orgId: "org-a", commercialAuthId: "auth-deal" });
});

Deno.test("4b) negócio de OUTRA organização não é escolhido — cai no criador do documento", async () => {
  const supabase = makeSupabase(DATASET);
  const t = await resolveNotifyTarget(supabase, "proposal_id", "prop-deal-cross");
  // deal-outra-org é de org-outra; o documento é de org-a → o negócio é ignorado.
  assertEquals(t, { orgId: "org-a", commercialAuthId: "auth-creator" });
});

Deno.test("5) último recurso: quem criou o documento (utilizador do CRM da mesma org)", async () => {
  const supabase = makeSupabase(DATASET);
  const t = await resolveNotifyTarget(supabase, "proposal_id", "prop-so-creator");
  assertEquals(t, { orgId: "org-a", commercialAuthId: "auth-creator" });
});

Deno.test("6) contrato resolve pela tabela client_contracts", async () => {
  const supabase = makeSupabase(DATASET);
  const t = await resolveNotifyTarget(supabase, "contract_id", "ct-nike");
  assertEquals(t, { orgId: "org-nike", commercialAuthId: "auth-nike" });
});

Deno.test("7) documento inexistente: sem org e sem comercial (não notifica ninguém)", async () => {
  const supabase = makeSupabase(DATASET);
  const t = await resolveNotifyTarget(supabase, "proposal_id", "nao-existe");
  assertEquals(t, { orgId: null, commercialAuthId: null });
});
