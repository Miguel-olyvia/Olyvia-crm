/**
 * Minimal in-memory Supabase stand-in for the Stripe vitest suites.
 * Supports the query shapes used by checkoutPolicy / stripeWebhookLogic.
 */
type Row = Record<string, unknown>;
type Op = "insert" | "select" | "update";

export interface FakeDb {
  tables: Record<string, Row[]>;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  rpcResults: Record<string, { data: unknown; error: { message: string } | null }>;
  /** Dynamic rpc behaviour (wins over rpcResults). */
  rpcHandlers: Record<string, (args: Record<string, unknown>, db: FakeDb) => { data: unknown; error: { message: string } | null }>;
  /** Make every `op` on `table` return this error. */
  failOn: (table: string, op: Op, error?: { message: string; code?: string }) => void;
  from: (table: string) => Builder;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

interface Builder extends PromiseLike<{ data: unknown; error: unknown }> {
  insert: (row: Row) => Builder;
  update: (patch: Row) => Builder;
  select: (cols?: string) => Builder;
  eq: (col: string, val: unknown) => Builder;
  neq: (col: string, val: unknown) => Builder;
  lt: (col: string, val: string) => Builder;
  is: (col: string, val: unknown) => Builder;
  limit: (n: number) => Builder;
  maybeSingle: () => Builder;
  single: () => Builder;
}

export function createFakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const failures = new Map<string, { message: string; code?: string }>();

  const db: FakeDb = {
    tables,
    rpcCalls: [],
    rpcResults: {},
    rpcHandlers: {},
    failOn(table, op, error = { message: `forced ${op} failure` }) {
      failures.set(`${table}:${op}`, error);
    },
    rpc(fn, args) {
      db.rpcCalls.push({ fn, args });
      if (db.rpcHandlers[fn]) return Promise.resolve(db.rpcHandlers[fn](args, db));
      return Promise.resolve(db.rpcResults[fn] ?? { data: null, error: null });
    },
    from(table) {
      tables[table] ??= [];
      let op: Op = "select";
      let patch: Row = {};
      let inserted: Row | null = null;
      let returning = false;
      let single = false;
      let max = Infinity;
      const filters: Array<(r: Row) => boolean> = [];

      const run = () => {
        const failure = failures.get(`${table}:${op}`);
        if (failure) return { data: null, error: failure };
        if (op === "insert") {
          const row = inserted as Row;
          const pk = table === "stripe_webhook_events" ? "event_id" : "id";
          if (pk in row && tables[table].some((r) => r[pk] === row[pk])) {
            return { data: null, error: { message: "duplicate key", code: "23505" } };
          }
          tables[table].push({ ...row });
          return { data: returning ? [{ ...row }] : null, error: null };
        }
        const matched = tables[table].filter((r) => filters.every((f) => f(r)));
        if (op === "update") {
          matched.forEach((r) => Object.assign(r, patch));
          const data = returning ? matched.map((r) => ({ ...r })) : null;
          return { data, error: null };
        }
        const rows = matched.slice(0, max).map((r) => ({ ...r }));
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      };

      const b: Builder = {
        insert(row) { op = "insert"; inserted = row; return b; },
        update(p) { op = "update"; patch = p; return b; },
        select() { returning = true; return b; },
        eq(col, val) { filters.push((r) => r[col] === val); return b; },
        neq(col, val) { filters.push((r) => r[col] !== val); return b; },
        lt(col, val) { filters.push((r) => typeof r[col] === "string" && (r[col] as string) < val); return b; },
        is(col, val) { filters.push((r) => (r[col] ?? null) === val); return b; },
        limit(n) { max = n; return b; },
        maybeSingle() { single = true; return b; },
        single() { single = true; return b; },
        then(onFulfilled, onRejected) {
          return Promise.resolve(run()).then(onFulfilled, onRejected);
        },
      };
      return b;
    },
  };
  return db;
}
