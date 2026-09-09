import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDedupNotificationContent,
  DEDUP_CONFLICT_NOTIFICATION_TYPE,
  DEDUP_MATCH_NOTIFICATION_TYPE,
  emitDedupSubmissionNotification,
} from "../entityScopedLookup.ts";

// O que se testa aqui: o TEXTO por resultado (01 a 06) e QUEM recebe.
//
// Porquê o "quem recebe" e não só o texto: a regra é que sem comercial não se
// notifica ninguém — não há destinatário de recurso. E no CONFLITO (06) são
// DOIS comerciais, um por entidade, que podem ser a mesma pessoa.

const ORG = "22222222-2222-2222-2222-222222222222";
const ENTITY = "11111111-1111-1111-1111-111111111111";

Deno.test("01 encontrou: 'voltou a submeter o formulário <NOME>.'", () => {
  const content = buildDedupNotificationContent(
    { kind: "MATCH_FORTE", entityId: ENTITY },
    { displayName: "Ana Silva", formName: "Pedido de avaliação" },
  );
  assertEquals(content?.type, DEDUP_MATCH_NOTIFICATION_TYPE);
  assertEquals(content?.message, "A Ana Silva voltou a submeter o formulário Pedido de avaliação.");
});

Deno.test("03 email bate, telefone diferente: acrescenta o dado novo", () => {
  const content = buildDedupNotificationContent(
    { kind: "MATCH_EMAIL", entityId: ENTITY, novoTelefone: "912345678" },
    { displayName: "Ana Silva", formName: "Pedido de avaliação" },
  );
  assertEquals(
    content?.message,
    "A Ana Silva voltou a submeter o formulário Pedido de avaliação e indicou um telefone diferente do que está na ficha.",
  );
});

Deno.test("05 telefone bate, email diferente: acrescenta o dado novo", () => {
  const content = buildDedupNotificationContent(
    { kind: "MATCH_TELEFONE", entityId: ENTITY, novoEmail: "outro@exemplo.pt" },
    { displayName: "Ana Silva", formName: "Pedido de avaliação" },
  );
  assertEquals(
    content?.message,
    "A Ana Silva voltou a submeter o formulário Pedido de avaliação e indicou um email diferente do que está na ficha.",
  );
});

Deno.test("02/04 sem dado novo: fica na frase simples", () => {
  const soEmail = buildDedupNotificationContent(
    { kind: "MATCH_EMAIL", entityId: ENTITY },
    { displayName: "Ana Silva", formName: "Contacto" },
  );
  assertEquals(soEmail?.message, "A Ana Silva voltou a submeter o formulário Contacto.");
});

Deno.test("06 conflito: texto próprio", () => {
  const content = buildDedupNotificationContent({
    kind: "CONFLITO",
    entityIdEmail: "entity-a",
    entityIdTelefone: "entity-b",
  });
  assertEquals(content?.type, DEDUP_CONFLICT_NOTIFICATION_TYPE);
  assertEquals(content?.message, "Uma submissão tem o email de um contacto seu e o telefone de outro.");
});

Deno.test("07/08 não geram notificação nenhuma", () => {
  assertEquals(buildDedupNotificationContent({ kind: "SEM_MATCH" }), null);
  assertEquals(buildDedupNotificationContent({ kind: "NAO_VERIFICAVEL" }), null);
});

type Inserted = Record<string, unknown>;

/**
 * Supabase falso do tamanho exacto do que `emitDedupSubmissionNotification`
 * usa: `alert_settings` (maybeSingle), `anew_users` (select .in) e
 * `notifications` (insert -> select -> single).
 */
function fakeSupabase(users: Record<string, string>, inserts: Inserted[]) {
  return {
    from(table: string) {
      if (table === "alert_settings") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        chain.maybeSingle = () => Promise.resolve({ data: null });
        return chain;
      }
      if (table === "anew_users") {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) => Promise.resolve({
              data: ids.filter((id) => users[id]).map((id) => ({ auth_user_id: users[id] })),
            }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: (row: Inserted) => {
            inserts.push(row);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: `notif-${inserts.length}` }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

Deno.test("sem comercial não se notifica ninguém — e não há destinatário de recurso", async () => {
  const inserts: Inserted[] = [];
  const written = await emitDedupSubmissionNotification({
    supabase: fakeSupabase({}, inserts),
    organizationId: ORG,
    entityId: ENTITY,
    outcome: { kind: "MATCH_FORTE", entityId: ENTITY },
    target: { targetType: "lead", targetId: "lead-1", assigneeAnewUserId: null },
  });
  assertEquals(written, []);
  assertEquals(inserts.length, 0);
});

Deno.test("a ligação abre a lead em /leads?open=<id>", async () => {
  const inserts: Inserted[] = [];
  await emitDedupSubmissionNotification({
    supabase: fakeSupabase({ "user-1": "auth-1" }, inserts),
    organizationId: ORG,
    entityId: ENTITY,
    outcome: { kind: "MATCH_FORTE", entityId: ENTITY },
    target: { targetType: "lead", targetId: "lead-1", assigneeAnewUserId: "user-1" },
  });
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].link, "/leads?open=lead-1");
  assertEquals(inserts[0].user_id, "auth-1");
  assertEquals(inserts[0].kind, "notification");
});

Deno.test("06 conflito: os DOIS comerciais recebem", async () => {
  const inserts: Inserted[] = [];
  const written = await emitDedupSubmissionNotification({
    supabase: fakeSupabase({ "user-1": "auth-1", "user-2": "auth-2" }, inserts),
    organizationId: ORG,
    entityId: ENTITY,
    outcome: { kind: "CONFLITO", entityIdEmail: ENTITY, entityIdTelefone: "entity-b" },
    target: { targetType: "lead", targetId: "lead-1", assigneeAnewUserId: "user-1" },
    conflictTarget: { targetType: "lead", targetId: "lead-2", assigneeAnewUserId: "user-2" },
  });
  assertEquals(written.length, 2);
  assertEquals(inserts.map((i) => i.user_id).sort(), ["auth-1", "auth-2"]);
  // Ambas as notificações abrem o registo do lado do email, que é o que ficou
  // ligado à submissão.
  assertEquals(new Set(inserts.map((i) => i.link)), new Set(["/leads?open=lead-1"]));
});

Deno.test("06 conflito com o mesmo comercial dos dois lados: uma só notificação", async () => {
  const inserts: Inserted[] = [];
  const written = await emitDedupSubmissionNotification({
    supabase: fakeSupabase({ "user-1": "auth-1" }, inserts),
    organizationId: ORG,
    entityId: ENTITY,
    outcome: { kind: "CONFLITO", entityIdEmail: ENTITY, entityIdTelefone: "entity-b" },
    target: { targetType: "lead", targetId: "lead-1", assigneeAnewUserId: "user-1" },
    conflictTarget: { targetType: "lead", targetId: "lead-2", assigneeAnewUserId: "user-1" },
  });
  assertEquals(written.length, 1);
  assertEquals(inserts.length, 1);
});

/**
 * Supabase falso em que o insert em `notifications` bate no indice unico
 * `notifications_dedup` — o que acontece a partir da SEGUNDA submissao da mesma
 * pessoa, enquanto a notificacao anterior nao estiver resolvida.
 *
 * Guarda o que foi actualizado, para se poder verificar que o aviso volta ao
 * sino em vez de se perder em silencio.
 */
function fakeSupabaseComColisao(
  existente: Record<string, unknown> | null,
  updates: Inserted[],
  opts?: { readError?: string; updateError?: string },
) {
  return {
    from(table: string) {
      if (table === "alert_settings") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        chain.maybeSingle = () => Promise.resolve({ data: null });
        return chain;
      }
      if (table === "anew_users") {
        return {
          select: () => ({
            in: (_c: string, ids: string[]) =>
              Promise.resolve({ data: ids.map((id) => ({ auth_user_id: `auth-${id}` })) }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: null,
                error: { code: "23505", message: 'duplicate key value violates unique constraint "notifications_dedup"' },
              }),
            }),
          }),
          select: () => {
            const chain: Record<string, unknown> = {};
            chain.eq = () => chain;
            chain.maybeSingle = () => Promise.resolve({
              data: existente,
              error: opts?.readError ? { message: opts.readError } : null,
            });
            return chain;
          },
          update: (row: Inserted) => {
            updates.push(row);
            return {
              eq: () => Promise.resolve({
                error: opts?.updateError ? { message: opts.updateError } : null,
              }),
            };
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

Deno.test("segunda submissao: o aviso volta ao sino em vez de se perder", async () => {
  const updates: Inserted[] = [];
  const written = await emitDedupSubmissionNotification({
    supabase: fakeSupabaseComColisao({ id: "notif-existente", data: { submission_count: 1 } }, updates),
    organizationId: ORG,
    entityId: ENTITY,
    outcome: { kind: "MATCH_FORTE", entityId: ENTITY },
    target: { targetType: "lead", targetId: "lead-1", assigneeAnewUserId: "user-1" },
    displayName: "Sino Teste",
  });

  assertEquals(written, ["notif-existente"]);
  assertEquals(updates.length, 1);
  // Volta a ficar por ler, e por ler é o que a faz reaparecer no sino.
  assertEquals(updates[0].is_read, false);
  assertEquals(updates[0].read_at, null);
  assertEquals(updates[0].is_dismissed, false);
  // E diz-se ao comercial que já vai na segunda.
  assertEquals(String(updates[0].message).includes("(2.ª submissão)"), true);
  assertEquals((updates[0].data as { submission_count: number }).submission_count, 2);
});

Deno.test("terceira submissao: a contagem continua a subir", async () => {
  const updates: Inserted[] = [];
  await emitDedupSubmissionNotification({
    supabase: fakeSupabaseComColisao({ id: "notif-existente", data: { submission_count: 2 } }, updates),
    organizationId: ORG,
    entityId: ENTITY,
    outcome: { kind: "MATCH_FORTE", entityId: ENTITY },
    target: { targetType: "lead", targetId: "lead-1", assigneeAnewUserId: "user-1" },
  });
  assertEquals((updates[0].data as { submission_count: number }).submission_count, 3);
  assertEquals(String(updates[0].message).includes("(3.ª submissão)"), true);
});

Deno.test("notificacao antiga sem contagem: assume-se que era a primeira", async () => {
  const updates: Inserted[] = [];
  await emitDedupSubmissionNotification({
    supabase: fakeSupabaseComColisao({ id: "notif-antiga", data: null }, updates),
    organizationId: ORG,
    entityId: ENTITY,
    outcome: { kind: "MATCH_FORTE", entityId: ENTITY },
    target: { targetType: "lead", targetId: "lead-1", assigneeAnewUserId: "user-1" },
  });
  assertEquals((updates[0].data as { submission_count: number }).submission_count, 2);
});

Deno.test("se nem repor for possivel, nao rebenta — devolve vazio", async () => {
  const updates: Inserted[] = [];
  const written = await emitDedupSubmissionNotification({
    supabase: fakeSupabaseComColisao(null, updates, { readError: "sem acesso" }),
    organizationId: ORG,
    entityId: ENTITY,
    outcome: { kind: "MATCH_FORTE", entityId: ENTITY },
    target: { targetType: "lead", targetId: "lead-1", assigneeAnewUserId: "user-1" },
  });
  assertEquals(written, []);
  assertEquals(updates.length, 0);
});
