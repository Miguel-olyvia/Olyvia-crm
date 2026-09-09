import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyEntityInOrg } from "../entityScopedLookup.ts";

// O que se testa aqui são DUAS coisas.
//
// 1. Os papéis que a entidade tem vêm TODOS preenchidos, não só o vencedor.
//    `targetType` dá precedência ao cliente. Enquanto `activeLeadId` só era
//    preenchido no ramo do `else`, quem era cliente E lead saía com
//    `activeLeadId = null` — e o create-lead, que pergunta "esta entidade já
//    tem lead?", ouvia "não" e criava outra.
//
// 2. Contactos NÃO CONTAM, nunca. O módulo de Contactos foi retirado do
//    produto: `/contacts` reencaminha para `/leads` e não há ecrã nenhum onde
//    um contacto possa ser visto. Classificar alguém como contacto era colar a
//    submissão a um registo invisível. Quem é apenas contacto conta como quem
//    não tem nada — e é assim que ganha uma lead nova, que é a invariante
//    acordada.

type Row = Record<string, unknown>;

/**
 * Supabase falso, do tamanho exacto do que `classifyEntityInOrg` usa: os
 * `select` encadeados que acabam em `.limit(1)` e devolvem `{ data }`.
 *
 * `contacts` continua a poder ser passado de propósito: serve para provar que
 * a tabela dos contactos NÃO é sequer lida.
 */
function fakeSupabase(
  rows: { leads?: Row[]; contacts?: Row[]; clients?: Row[] },
  /** Recebe, por tabela, os filtros `.is(col, value)` pedidos. */
  isFilters?: Record<string, Array<[string, unknown]>>,
  /** Recebe o nome de cada tabela consultada, por ordem. */
  tabelasLidas?: string[],
) {
  const byTable: Record<string, Row[]> = {
    anew_leads: rows.leads ?? [],
    anew_contacts: rows.contacts ?? [],
    anew_clients: rows.clients ?? [],
  };
  return {
    from(table: string) {
      tabelasLidas?.push(table);
      const result = { data: byTable[table] ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "order"]) {
        chain[method] = () => chain;
      }
      chain.is = (column: string, value: unknown) => {
        if (isFilters) {
          isFilters[table] = [...(isFilters[table] ?? []), [column, value]];
        }
        return chain;
      };
      chain.limit = () => Promise.resolve(result);
      return chain;
    },
  };
}

const ENTITY = "11111111-1111-1111-1111-111111111111";
const ORG = "22222222-2222-2222-2222-222222222222";

Deno.test("a tabela dos contactos nunca é lida", async () => {
  const tabelasLidas: string[] = [];
  await classifyEntityInOrg({
    supabase: fakeSupabase({ contacts: [{ id: "contact-1" }] }, undefined, tabelasLidas),
    entityId: ENTITY,
    organizationId: ORG,
  });
  assertEquals(tabelasLidas.includes("anew_contacts"), false);
  assertEquals(new Set(tabelasLidas), new Set(["anew_leads", "anew_clients"]));
});

Deno.test("só contacto: conta como quem não tem nada, e nasce lead nova", async () => {
  const summary = await classifyEntityInOrg({
    supabase: fakeSupabase({ contacts: [{ id: "contact-1", assigned_to: "user-c", created_by: null }] }),
    entityId: ENTITY,
    organizationId: ORG,
  });
  // Nada encontrado -> o create-lead segue o caminho normal e cria a lead.
  assertEquals(summary.targetType, null);
  assertEquals(summary.targetId, null);
  assertEquals(summary.activeLeadId, null);
  assertEquals(summary.clientId, null);
  assertEquals(summary.hasClient, false);
});

Deno.test("contacto E lead: ganha a lead, porque o contacto não existe para nada", async () => {
  const summary = await classifyEntityInOrg({
    supabase: fakeSupabase({
      leads: [{ id: "lead-1", status: "new", assigned_to: "user-l", created_by: null }],
      contacts: [{ id: "contact-1", assigned_to: "user-c", created_by: null }],
    }),
    entityId: ENTITY,
    organizationId: ORG,
  });
  assertEquals(summary.targetType, "lead");
  assertEquals(summary.targetId, "lead-1");
  assertEquals(summary.activeLeadId, "lead-1");
  // O comercial avisado é o da LEAD, não o do contacto.
  assertEquals(summary.assigneeAnewUserId, "user-l");
  assertEquals(summary.activeLeadAssigneeAnewUserId, "user-l");
});

Deno.test("cliente E lead: ganha o cliente, mas a lead não se perde", async () => {
  const summary = await classifyEntityInOrg({
    supabase: fakeSupabase({
      leads: [{ id: "lead-1", status: "new", assigned_to: "user-l", created_by: null }],
      clients: [{ id: "client-1", assigned_to: "user-cl", created_by: null }],
    }),
    entityId: ENTITY,
    organizationId: ORG,
  });
  assertEquals(summary.targetType, "client");
  assertEquals(summary.targetId, "client-1");
  assertEquals(summary.assigneeAnewUserId, "user-cl");
  // A lead continua visível para quem precisa dela — é isto que impede o
  // create-lead de criar uma segunda lead a quem já tem uma.
  assertEquals(summary.activeLeadId, "lead-1");
  assertEquals(summary.activeLeadAssigneeAnewUserId, "user-l");
  assertEquals(summary.hasClient, true);
  assertEquals(summary.clientId, "client-1");
});

Deno.test("sem lead e sem cliente: não há nada a que colar a submissão", async () => {
  const summary = await classifyEntityInOrg({
    supabase: fakeSupabase({}),
    entityId: ENTITY,
    organizationId: ORG,
  });
  assertEquals(summary.targetType, null);
  assertEquals(summary.targetId, null);
  assertEquals(summary.activeLeadId, null);
  assertEquals(summary.clientId, null);
  assertEquals(summary.hasClient, false);
  assertEquals(summary.assigneeAnewUserId, null);
});

Deno.test("o comercial cai para quem criou quando não há atribuído", async () => {
  const summary = await classifyEntityInOrg({
    supabase: fakeSupabase({
      leads: [{ id: "lead-1", status: "new", assigned_to: null, created_by: "user-criador" }],
    }),
    entityId: ENTITY,
    organizationId: ORG,
  });
  assertEquals(summary.assigneeAnewUserId, "user-criador");
  assertEquals(summary.activeLeadAssigneeAnewUserId, "user-criador");
});

Deno.test("as duas tabelas são lidas com deleted_at is null", async () => {
  // Um registo apagado não é um registo existente. Sem este filtro, a
  // submissão de quem teve a lead apagada ligava-se a essa lead morta:
  // desaparecia, e a pessoa também não ganhava lead nova.
  const isFilters: Record<string, Array<[string, unknown]>> = {};
  await classifyEntityInOrg({
    supabase: fakeSupabase({}, isFilters),
    entityId: ENTITY,
    organizationId: ORG,
  });

  for (const table of ["anew_leads", "anew_clients"]) {
    assertEquals(isFilters[table], [["deleted_at", null]], table);
  }
  assertEquals(isFilters["anew_contacts"], undefined);
});
