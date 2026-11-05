// 05/11/2026 (ronda 2 de permissões): cancelar pelo assistente pede o mesmo que o servidor (soft_delete_business_entity):
// proposta = proposals.delete (+ proposals.delete_sent se já saiu de rascunho), pedido = deals.delete, orçamento = quotes.delete.
// Antes pré-verificava proposals.edit / deals.edit / quotes.edit e o servidor recusava depois com uma falha genérica.
// Run: deno test supabase/functions/ai-assistant/tools/cancelarPermissoes.test.ts
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ExecCtx, Handler } from "../shared/types.ts";
import { handlers as proposals } from "./proposals.ts";
import { handlers as deals } from "./deals.ts";
import { handlers as quotes } from "./quotes.ts";

const UUID = "11111111-1111-4111-8111-111111111111";

/** Supabase falso: from(t)...maybeSingle() devolve a linha de `linhas[t]`; qualquer rpc corre sem erro e fica registada. */
function supabaseFalso(linhas: Record<string, unknown>, rpcs: string[]): any {
  const cadeia = (tabela: string): any =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "maybeSingle" || prop === "single") return async () => ({ data: linhas[tabela] ?? null, error: null });
        if (prop === "then") return (ok: (v: unknown) => void) => ok({ data: [], error: null });
        return () => cadeia(tabela);
      },
      apply() {
        return cadeia(tabela);
      },
    });
  return {
    from: (tabela: string) => cadeia(tabela),
    rpc: async (nome: string) => {
      rpcs.push(nome);
      return { data: null, error: null };
    },
  };
}

function ctx(perms: string[], linhas: Record<string, unknown>, rpcs: string[]): ExecCtx {
  return {
    supabase: supabaseFalso(linhas, rpcs),
    authUid: "auth-1",
    businessUserId: UUID,
    organizationId: UUID,
    visibleOrgIds: [UUID],
    userContext: {},
    permissions: perms,
    memberships: [],
    isSystemAdmin: false,
    authHeader: "",
  } as ExecCtx;
}

async function correr(h: Handler, perms: string[], linhas: Record<string, unknown>, args: Record<string, unknown>) {
  const rpcs: string[] = [];
  const r = (await h(ctx(perms, linhas, rpcs), { ...args, confirm: true })) as { success: boolean; message: string };
  return { ...r, apagou: rpcs.includes("soft_delete_business_entity") };
}

const PROPOSTA = (status: string) => ({ proposals: { id: UUID, proposal_number: "P-2026-0001", accepted_at: null, status } });
const SEM = /Não tens permissão/;

Deno.test("cancel_proposal: só proposals.edit -> sem permissão, sem chamar o servidor", async () => {
  const r = await correr(proposals.cancel_proposal, ["proposals.edit", "proposals.view"], PROPOSTA("draft"), { proposal_id: UUID });
  assertEquals(r.success, false);
  assertMatch(r.message, SEM);
  assert(r.message.includes("cancelar propostas"));
  assertEquals(r.apagou, false);
});

Deno.test("cancel_proposal: proposals.delete em rascunho -> cancela", async () => {
  const r = await correr(proposals.cancel_proposal, ["proposals.delete"], PROPOSTA("draft"), { proposal_id: UUID });
  assertEquals(r.success, true);
  assertEquals(r.apagou, true);
});

Deno.test("cancel_proposal: enviada sem proposals.delete_sent -> sem permissão", async () => {
  const r = await correr(proposals.cancel_proposal, ["proposals.delete"], PROPOSTA("sent"), { proposal_id: UUID });
  assertEquals(r.success, false);
  assertMatch(r.message, SEM);
  assert(r.message.includes("já enviadas"));
  assertEquals(r.apagou, false);
});

Deno.test("cancel_proposal: enviada com proposals.delete + delete_sent -> cancela", async () => {
  const r = await correr(proposals.cancel_proposal, ["proposals.delete", "proposals.delete_sent"], PROPOSTA("sent"), { proposal_id: UUID });
  assertEquals(r.success, true);
  assertEquals(r.apagou, true);
});

Deno.test("cancel_deal: deals.edit -> sem permissão; deals.delete -> cancela", async () => {
  const linhas = { deals: { id: UUID, title: "PP teste", closed_at: null } };
  const sem = await correr(deals.cancel_deal, ["deals.edit", "deals.view"], linhas, { deal_id: UUID });
  assertEquals(sem.success, false);
  assertMatch(sem.message, SEM);
  assertEquals(sem.apagou, false);
  const com = await correr(deals.cancel_deal, ["deals.delete"], linhas, { deal_id: UUID });
  assertEquals(com.success, true);
  assertEquals(com.apagou, true);
});

Deno.test("delete_quote: quotes.edit -> sem permissão; quotes.delete -> cancela", async () => {
  const linhas = { quotes: { id: UUID, quote_number: "O-2026-0001", estado: "rascunho" } };
  const sem = await correr(quotes.delete_quote, ["quotes.edit", "quotes.view"], linhas, { quote_id: UUID });
  assertEquals(sem.success, false);
  assertMatch(sem.message, SEM);
  assertEquals(sem.apagou, false);
  const com = await correr(quotes.delete_quote, ["quotes.delete"], linhas, { quote_id: UUID });
  assertEquals(com.success, true);
  assertEquals(com.apagou, true);
});
