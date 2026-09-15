/**
 * client-portal-action — rede de segurança para os guardas de segurança.
 *
 * ── O que isto protege ──────────────────────────────────────────────────
 * `supabase/functions/client-portal-action/index.ts` é a única porta de
 * entrada do portal do cliente: aceitar orçamentos, assinar propostas e
 * contratos, descarregar PDFs. Serve todos os clientes em produção, o
 * deploy é manual e directo (não há staging) e, até agora, não tinha
 * teste nenhum. Estes testes fixam o comportamento dos quatro guardas que
 * separam um cliente do portal dos documentos de todos os outros:
 *
 *   1. assertOwnership    — guarda contra IDOR (o mais importante)
 *   2. consumeVerifiedOtp — uso único do OTP + janela de 10 minutos
 *   3. stripCosts         — custos/margens nunca chegam ao cliente
 *   4. sanitizeReason     — validação 10..500 caracteres + remoção de HTML
 *
 * ── Contra o que corremos ───────────────────────────────────────────────
 * Contra `portalGuards.mirror.ts`, um espelho literal dos helpers que
 * vivem dentro do `serve()` de `index.ts` (ver o cabeçalho desse ficheiro
 * para a justificação). `sourceDrift.test.ts` garante que o espelho não
 * diverge do original — se divergir, o CI falha.
 *
 * Nada aqui toca na base de dados real: o cliente Supabase é um duplo em
 * memória que aplica a semântica dos filtros do PostgREST.
 */

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  makePortalGuards,
  sanitizeReason,
  SENSITIVE_LINE_COLUMNS,
  stripCosts,
  type PortalQuery,
  type PortalResult,
  type PortalSupabaseLike,
} from "./portalGuards.mirror.ts";

// ── Duplo do cliente Supabase ───────────────────────────────────────────
//
// Aplica os filtros em memória com a mesma semântica que o PostgREST dá a
// .eq() / .is() / .not(col,"is",null) / .gte() / .order() / .limit(), e
// suporta o UPDATE..WHERE..RETURNING que o consumeVerifiedOtp usa para
// reclamar o OTP atomicamente.

type Row = Record<string, unknown>;

interface QueryLogEntry {
  table: string;
  mode: "select" | "update";
  filters: Array<{ op: string; column: string; value: unknown }>;
}

class FakeDb {
  readonly tables = new Map<string, Row[]>();
  readonly log: QueryLogEntry[] = [];
  /** Gancho para simular uma escrita concorrente entre o SELECT e o UPDATE. */
  onBeforeUpdate: (() => void) | null = null;

  constructor(seed: Record<string, Row[]>) {
    for (const [table, rows] of Object.entries(seed)) {
      this.tables.set(table, rows.map((row) => ({ ...row })));
    }
  }

  rowsOf(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  queriesFor(table: string): QueryLogEntry[] {
    return this.log.filter((entry) => entry.table === table);
  }
}

class FakeQuery implements PortalQuery {
  private mode: "select" | "update" = "select";
  private patch: Row = {};
  private returning = false;
  private filters: Array<{ op: string; column: string; value: unknown }> = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private logged = false;

  constructor(private db: FakeDb, private table: string) {}

  select(_columns?: string): PortalQuery {
    // Depois de um .update(), o .select() é o RETURNING — não volta a SELECT.
    if (this.mode === "update") this.returning = true;
    return this;
  }

  update(patch: Record<string, unknown>): PortalQuery {
    this.mode = "update";
    this.patch = patch;
    return this;
  }

  eq(column: string, value: unknown): PortalQuery {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown): PortalQuery {
    this.filters.push({ op: "is", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown): PortalQuery {
    this.filters.push({ op: `not.${operator}`, column, value });
    return this;
  }

  gte(column: string, value: unknown): PortalQuery {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): PortalQuery {
    this.orderKey = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(count: number): PortalQuery {
    this.limitN = count;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(({ op, column, value }) => {
      const cell = row[column] ?? null;
      switch (op) {
        case "eq":
          return cell === value;
        case "is":
          return value === null ? cell === null : cell === value;
        case "not.is":
          return value === null ? cell !== null : cell !== value;
        case "gte":
          // Datas ISO comparam-se lexicograficamente, tal como no Postgres.
          return cell !== null && String(cell) >= String(value);
        default:
          throw new Error(`Filtro não suportado no duplo: ${op}`);
      }
    });
  }

  private resolve(): PortalResult {
    if (!this.logged) {
      this.db.log.push({ table: this.table, mode: this.mode, filters: [...this.filters] });
      this.logged = true;
    }

    if (this.mode === "update") {
      this.db.onBeforeUpdate?.();
      const affected = this.db.rowsOf(this.table).filter((row) => this.matches(row));
      for (const row of affected) Object.assign(row, this.patch);
      return { data: this.returning ? affected.map((row) => ({ ...row })) : null, error: null };
    }

    let result = this.db.rowsOf(this.table).filter((row) => this.matches(row));
    if (this.orderKey) {
      const key = this.orderKey;
      const direction = this.orderAsc ? 1 : -1;
      result = [...result].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * direction);
    }
    if (this.limitN !== null) result = result.slice(0, this.limitN);
    return { data: result.map((row) => ({ ...row })), error: null };
  }

  maybeSingle(): Promise<PortalResult> {
    const { data, error } = this.resolve();
    if (error) return Promise.resolve({ data: null, error });
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return Promise.resolve({ data: null, error: null });
    if (rows.length > 1) {
      // Mesma reacção do PostgREST: mais do que uma linha é erro, não escolha.
      return Promise.resolve({
        data: null,
        error: { code: "PGRST116", message: "multiple rows returned" },
      });
    }
    return Promise.resolve({ data: rows[0], error: null });
  }

  then<TResult1 = PortalResult, TResult2 = never>(
    onFulfilled?: ((value: PortalResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onFulfilled, onRejected);
  }
}

function makeFakeSupabase(seed: Record<string, Row[]>): {
  supabase: PortalSupabaseLike;
  db: FakeDb;
} {
  const db = new FakeDb(seed);
  return {
    db,
    supabase: { from: (table: string) => new FakeQuery(db, table) },
  };
}

// ── Fixture multi-tenant ────────────────────────────────────────────────

const USER_OWNER = "auth-owner-1111";
const USER_INTRUDER = "auth-intruder-9999";

const ORG_A = "org-aaaa";
const ORG_B = "org-bbbb";

const ENTITY_A = "entity-aaaa";
const ENTITY_B = "entity-bbbb";

const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000).toISOString();

// ════════════════════════════════════════════════════════════════════════
// 1. assertOwnership — a guarda contra IDOR
// ════════════════════════════════════════════════════════════════════════

Deno.test("assertOwnership: o dono directo do documento passa", async () => {
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, quote_id: "quote-1", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    quotes: [{ id: "quote-1", entity_id: ENTITY_A, organization_id: ORG_A }],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assert(await assertOwnership("quote_id", "quote-1"));
});

Deno.test("assertOwnership: IDOR — o cliente de outra entidade é recusado", async () => {
  // O intruso tem portal legítimo para o SEU documento; tenta o do vizinho.
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, quote_id: "quote-1", entity_id: ENTITY_A, organization_id: ORG_A },
      { id: "cpu-2", auth_user_id: USER_INTRUDER, quote_id: "quote-2", entity_id: ENTITY_B, organization_id: ORG_B },
    ],
    quotes: [
      { id: "quote-1", entity_id: ENTITY_A, organization_id: ORG_A },
      { id: "quote-2", entity_id: ENTITY_B, organization_id: ORG_B },
    ],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_INTRUDER });

  assertFalse(await assertOwnership("quote_id", "quote-1"));
});

Deno.test("assertOwnership: recusa um utilizador sem qualquer linha de portal", async () => {
  const { supabase } = makeFakeSupabase({
    client_portal_users: [],
    proposals: [{ id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A }],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_INTRUDER });

  assertFalse(await assertOwnership("proposal_id", "prop-1"));
});

Deno.test("assertOwnership: id vazio é recusado sem sequer consultar a base de dados", async () => {
  const { supabase, db } = makeFakeSupabase({ client_portal_users: [] });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assertFalse(await assertOwnership("quote_id", ""));
  assertEquals(db.log.length, 0, "não deve haver qualquer query para um id vazio");
});

Deno.test("assertOwnership: fallback por entity_id + organization_id autoriza outro documento da mesma entidade", async () => {
  // Cenário real: o cliente recebeu o portal da proposta A e abre a
  // proposta B da mesma entidade/organização, sem linha de portal própria.
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, proposal_id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    proposals: [
      { id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A },
      { id: "prop-2", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assert(await assertOwnership("proposal_id", "prop-2"));
});

Deno.test("assertOwnership: o fallback exige entity_id E organization_id — mesma entidade noutra organização é recusada", async () => {
  // Mesma pessoa jurídica presente em duas organizações do CRM: o acesso
  // concedido numa NÃO pode transportar-se para a outra.
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, proposal_id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    proposals: [
      { id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A },
      { id: "prop-cross", entity_id: ENTITY_A, organization_id: ORG_B },
    ],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assertFalse(await assertOwnership("proposal_id", "prop-cross"));
});

Deno.test("assertOwnership: o fallback recusa quando o documento não tem entity_id/organization_id resolúveis", async () => {
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, proposal_id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    proposals: [{ id: "prop-orfa", entity_id: null, organization_id: null }],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assertFalse(await assertOwnership("proposal_id", "prop-orfa"));
});

Deno.test("assertOwnership: documento inexistente é recusado", async () => {
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, proposal_id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    proposals: [],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assertFalse(await assertOwnership("proposal_id", "prop-inexistente"));
});

Deno.test("assertOwnership: orçamento sem entity_id resolve pela proposta-mãe (cadeia quote→proposal)", async () => {
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, proposal_id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    quotes: [{ id: "quote-sem-entidade", entity_id: null, organization_id: null, proposal_id: "prop-1", deal_id: null }],
    proposals: [{ id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A }],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assert(await assertOwnership("quote_id", "quote-sem-entidade"));
});

Deno.test("assertOwnership: orçamento sem entity_id nem proposta resolve pelo negócio (cadeia quote→deal)", async () => {
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, quote_id: "quote-outro", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    quotes: [{ id: "quote-via-deal", entity_id: null, organization_id: null, proposal_id: null, deal_id: "deal-1" }],
    deals: [{ id: "deal-1", entity_id: ENTITY_A, organization_id: ORG_A }],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assert(await assertOwnership("quote_id", "quote-via-deal"));
});

Deno.test("assertOwnership: a cadeia quote→deal não contorna a organização — deal de outra org é recusado", async () => {
  const { supabase } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, quote_id: "quote-outro", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    quotes: [{ id: "quote-via-deal", entity_id: null, organization_id: null, proposal_id: null, deal_id: "deal-b" }],
    deals: [{ id: "deal-b", entity_id: ENTITY_B, organization_id: ORG_B }],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  assertFalse(await assertOwnership("quote_id", "quote-via-deal"));
});

Deno.test("assertOwnership: contrato — dono directo passa, intruso é recusado", async () => {
  const seed = {
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, contract_id: "ct-1", entity_id: ENTITY_A, organization_id: ORG_A },
      { id: "cpu-2", auth_user_id: USER_INTRUDER, contract_id: "ct-2", entity_id: ENTITY_B, organization_id: ORG_B },
    ],
    client_contracts: [
      { id: "ct-1", entity_id: ENTITY_A, organization_id: ORG_A },
      { id: "ct-2", entity_id: ENTITY_B, organization_id: ORG_B },
    ],
  };

  const owner = makeFakeSupabase(seed);
  assert(await makePortalGuards(owner.supabase, { id: USER_OWNER }).assertOwnership("contract_id", "ct-1"));

  const intruder = makeFakeSupabase(seed);
  assertFalse(await makePortalGuards(intruder.supabase, { id: USER_INTRUDER }).assertOwnership("contract_id", "ct-1"));
});

Deno.test("assertOwnership: TODAS as consultas a client_portal_users filtram por auth_user_id", async () => {
  // Guarda meta: se alguém remover o .eq("auth_user_id", user.id) de um dos
  // dois caminhos, a guarda deixa de separar clientes e este teste falha.
  const { supabase, db } = makeFakeSupabase({
    client_portal_users: [
      { id: "cpu-1", auth_user_id: USER_OWNER, proposal_id: "prop-1", entity_id: ENTITY_A, organization_id: ORG_A },
    ],
    proposals: [{ id: "prop-2", entity_id: ENTITY_A, organization_id: ORG_A }],
  });
  const { assertOwnership } = makePortalGuards(supabase, { id: USER_OWNER });

  await assertOwnership("proposal_id", "prop-2");

  const portalQueries = db.queriesFor("client_portal_users");
  assertEquals(portalQueries.length, 2, "esperado o caminho directo + o fallback por entidade");
  for (const query of portalQueries) {
    assert(
      query.filters.some((f) => f.op === "eq" && f.column === "auth_user_id" && f.value === USER_OWNER),
      "uma consulta a client_portal_users não filtrou por auth_user_id",
    );
  }
});

// ════════════════════════════════════════════════════════════════════════
// 2. consumeVerifiedOtp — uso único e janela temporal
// ════════════════════════════════════════════════════════════════════════

function otpRow(overrides: Row = {}): Row {
  return {
    id: "otp-1",
    auth_user_id: USER_OWNER,
    reference_id: "prop-1",
    reference_type: "proposal",
    purpose: "proposal_signature",
    verified_at: minutesAgo(1),
    consumed_at: null,
    ...overrides,
  };
}

Deno.test("consumeVerifiedOtp: um OTP válido é consumido e devolve sucesso", async () => {
  const { supabase, db } = makeFakeSupabase({ sms_otp_codes: [otpRow()] });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  const result = await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature");

  assertEquals(result.ok, true);
  assertEquals(result.otpId, "otp-1");
  assert(db.rowsOf("sms_otp_codes")[0].consumed_at !== null, "o OTP devia ficar marcado como consumido");
});

Deno.test("consumeVerifiedOtp: uso único — a segunda tentativa com o mesmo OTP falha", async () => {
  const { supabase } = makeFakeSupabase({ sms_otp_codes: [otpRow()] });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  const first = await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature");
  const second = await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature");

  assertEquals(first.ok, true);
  assertEquals(second.ok, false, "replay de um OTP já consumido tem de falhar");
});

Deno.test("consumeVerifiedOtp: OTP verificado há mais de 10 minutos falha", async () => {
  const { supabase, db } = makeFakeSupabase({
    sms_otp_codes: [otpRow({ verified_at: minutesAgo(11) })],
  });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  const result = await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature");

  assertEquals(result.ok, false);
  assertEquals(db.rowsOf("sms_otp_codes")[0].consumed_at, null, "um OTP expirado não pode ser consumido");
});

Deno.test("consumeVerifiedOtp: dentro da janela (9 minutos) ainda é aceite", async () => {
  const { supabase } = makeFakeSupabase({
    sms_otp_codes: [otpRow({ verified_at: minutesAgo(9) })],
  });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  assertEquals((await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature")).ok, true);
});

Deno.test("consumeVerifiedOtp: OTP emitido a outro auth_user_id não pode ser reutilizado", async () => {
  const { supabase, db } = makeFakeSupabase({
    sms_otp_codes: [otpRow({ auth_user_id: USER_OWNER })],
  });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_INTRUDER });

  const result = await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature");

  assertEquals(result.ok, false);
  assertEquals(db.rowsOf("sms_otp_codes")[0].consumed_at, null);
});

Deno.test("consumeVerifiedOtp: OTP anterior ao rollout (auth_user_id nulo) falha por desenho", async () => {
  const { supabase } = makeFakeSupabase({
    sms_otp_codes: [otpRow({ auth_user_id: null })],
  });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  assertEquals((await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature")).ok, false);
});

Deno.test("consumeVerifiedOtp: OTP nunca verificado falha", async () => {
  const { supabase } = makeFakeSupabase({
    sms_otp_codes: [otpRow({ verified_at: null })],
  });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  assertEquals((await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature")).ok, false);
});

Deno.test("consumeVerifiedOtp: o OTP de um documento não serve para outro documento", async () => {
  const { supabase } = makeFakeSupabase({
    sms_otp_codes: [otpRow({ reference_id: "prop-1" })],
  });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  assertEquals((await consumeVerifiedOtp("proposal", "prop-2", "proposal_signature")).ok, false);
});

Deno.test("consumeVerifiedOtp: um OTP de proposta não assina um contrato (reference_type/purpose)", async () => {
  const { supabase } = makeFakeSupabase({
    sms_otp_codes: [otpRow({ reference_id: "doc-1", reference_type: "proposal", purpose: "proposal_signature" })],
  });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  assertEquals((await consumeVerifiedOtp("contract", "doc-1", "contract_signature")).ok, false);
  assertEquals((await consumeVerifiedOtp("proposal", "doc-1", "contract_signature")).ok, false);
});

Deno.test("consumeVerifiedOtp: referenceId ou purpose em falta falham sem consultar a base de dados", async () => {
  const { supabase, db } = makeFakeSupabase({ sms_otp_codes: [otpRow()] });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  assertEquals((await consumeVerifiedOtp("proposal", "", "proposal_signature")).ok, false);
  assertEquals((await consumeVerifiedOtp("proposal", "prop-1", "")).ok, false);
  assertEquals(db.log.length, 0);
});

Deno.test("consumeVerifiedOtp: escolhe o OTP verificado mais recente", async () => {
  const { supabase } = makeFakeSupabase({
    sms_otp_codes: [
      otpRow({ id: "otp-antigo", verified_at: minutesAgo(8) }),
      otpRow({ id: "otp-recente", verified_at: minutesAgo(1) }),
    ],
  });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  assertEquals((await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature")).otpId, "otp-recente");
});

Deno.test("consumeVerifiedOtp: corrida — se outra chamada consumir o OTP entre o SELECT e o UPDATE, esta falha", async () => {
  // É para isto que serve o UPDATE ... WHERE consumed_at IS NULL: dois
  // pedidos simultâneos não podem ambos assinar com o mesmo código.
  const { supabase, db } = makeFakeSupabase({ sms_otp_codes: [otpRow()] });
  const { consumeVerifiedOtp } = makePortalGuards(supabase, { id: USER_OWNER });

  db.onBeforeUpdate = () => {
    db.rowsOf("sms_otp_codes")[0].consumed_at = new Date().toISOString();
    db.onBeforeUpdate = null;
  };

  assertEquals((await consumeVerifiedOtp("proposal", "prop-1", "proposal_signature")).ok, false);
});

// ════════════════════════════════════════════════════════════════════════
// 3. stripCosts — custos e margens nunca saem do servidor
// ════════════════════════════════════════════════════════════════════════

Deno.test("SENSITIVE_LINE_COLUMNS: cobre exactamente as quatro colunas internas", () => {
  assertEquals([...SENSITIVE_LINE_COLUMNS].sort(), [
    "cost_price",
    "custo_mao_obra_unit",
    "custo_material_unit",
    "margem_percent",
  ]);
});

Deno.test("stripCosts: remove custos e margem e deixa o resto intacto", () => {
  const line = {
    id: "ql-1",
    quote_id: "quote-1",
    descricao_snapshot: "Janela oscilobatente",
    qt: 3,
    preco_unit: 250.5,
    total_sem_iva: 751.5,
    total_com_iva: 924.35,
    iva_percent: 23,
    ordem: 1,
    products: { sku: "JAN-001" },
    services: null,
    // Internos — não podem chegar ao cliente:
    cost_price: 120,
    custo_mao_obra_unit: 30,
    custo_material_unit: 55.25,
    margem_percent: 42.7,
  };

  const clean = stripCosts(line);

  for (const key of SENSITIVE_LINE_COLUMNS) {
    assertFalse(key in clean, `${key} não pode sair para o cliente`);
  }
  assertEquals(clean, {
    id: "ql-1",
    quote_id: "quote-1",
    descricao_snapshot: "Janela oscilobatente",
    qt: 3,
    preco_unit: 250.5,
    total_sem_iva: 751.5,
    total_com_iva: 924.35,
    iva_percent: 23,
    ordem: 1,
    products: { sku: "JAN-001" },
    services: null,
  });
});

Deno.test("stripCosts: remove os custos mesmo quando valem 0, null ou string vazia", () => {
  // Um filtro escrito com `if (row[key])` deixaria passar o nome da coluna
  // com valor 0 — e 0 de margem também é informação interna.
  const clean = stripCosts({
    id: "ql-2",
    cost_price: 0,
    custo_mao_obra_unit: null,
    custo_material_unit: "",
    margem_percent: 0,
  });

  assertEquals(clean, { id: "ql-2" });
});

Deno.test("stripCosts: uma linha sem colunas sensíveis passa inalterada", () => {
  const line = { id: "ql-3", descricao: "Serviço", qt: 1, total_com_iva: 100 };
  assertEquals(stripCosts(line), line);
});

Deno.test("stripCosts: não modifica a linha original", () => {
  const line: Record<string, unknown> = { id: "ql-4", cost_price: 99 };
  stripCosts(line);
  assertEquals(line.cost_price, 99, "stripCosts tem de devolver uma cópia, não mutar a origem");
});

// ════════════════════════════════════════════════════════════════════════
// 4. sanitizeReason — 10..500 caracteres e sem HTML
// ════════════════════════════════════════════════════════════════════════

Deno.test("sanitizeReason: aceita um motivo válido", () => {
  assertEquals(sanitizeReason("Preço acima do orçamentado"), "Preço acima do orçamentado");
});

Deno.test("sanitizeReason: rejeita o que não é string", () => {
  for (const value of [null, undefined, 42, true, {}, [], new Date()]) {
    assertEquals(sanitizeReason(value), null, `devia rejeitar ${typeof value}`);
  }
});

Deno.test("sanitizeReason: aplica os limites 10..500 nas fronteiras exactas", () => {
  assertEquals(sanitizeReason("a".repeat(9)), null, "9 caracteres é curto demais");
  assertEquals(sanitizeReason("a".repeat(10)), "a".repeat(10), "10 caracteres é o mínimo aceite");
  assertEquals(sanitizeReason("a".repeat(500)), "a".repeat(500), "500 caracteres é o máximo aceite");
  assertEquals(sanitizeReason("a".repeat(501)), null, "501 caracteres é longo demais");
});

Deno.test("sanitizeReason: corta espaços antes de medir o comprimento", () => {
  assertEquals(sanitizeReason("   Motivo bom aqui   "), "Motivo bom aqui");
  assertEquals(sanitizeReason("          " + "curto" + "          "), null);
});

Deno.test("sanitizeReason: remove etiquetas HTML e mantém o texto", () => {
  assertEquals(
    sanitizeReason("<p>O preço <b>não</b> compensa para nós</p>"),
    "O preço não compensa para nós",
  );
});

Deno.test("sanitizeReason: o comprimento é medido DEPOIS de remover o HTML", () => {
  // O texto em bruto tem 30+ caracteres, mas só 5 sobrevivem à limpeza —
  // encher de etiquetas não pode servir para passar o mínimo de 10.
  assertEquals(sanitizeReason("<div><span><b>curto</b></span></div>"), null);
});

Deno.test("sanitizeReason: neutraliza uma tentativa de injecção de script", () => {
  // Comportamento real e documentado: as ETIQUETAS são removidas, o texto
  // interior não. O que sai é inerte como HTML, que é o que importa aqui.
  const result = sanitizeReason("<script>alert('xss')</script>O motivo verdadeiro é o prazo");

  assert(result !== null);
  assertFalse(result!.includes("<script>"), "não pode sobrar a etiqueta script");
  assertFalse(result!.includes("<"), "não pode sobrar qualquer etiqueta");
  assert(result!.includes("O motivo verdadeiro é o prazo"));
});

Deno.test("sanitizeReason: remove também atributos perigosos junto com a etiqueta", () => {
  const result = sanitizeReason('<img src=x onerror="alert(1)">Rejeitado por falta de prazo');
  assertEquals(result, "Rejeitado por falta de prazo");
});
