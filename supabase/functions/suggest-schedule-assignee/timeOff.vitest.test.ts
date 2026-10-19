import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findUserIdsOnTimeOff } from "../_shared/timeOffAvailability";

const ORG = "org-nike";
const OTHER_ORG = "org-other";
const DAY_START = "2026-10-20T00:00:00.000Z";
const DAY_END = "2026-10-20T23:59:59.000Z";

interface ItemRow {
  user_id: string | null;
  all_day: boolean | null;
  organization_id: string | null;
  status: string;
  approval_status: string | null;
  start_datetime: string;
  end_datetime: string;
  schedule_boards: { board_type: string | null; organization_id: string | null };
}

function row(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    user_id: "u1",
    all_day: true,
    organization_id: ORG,
    status: "scheduled",
    approval_status: "approved",
    start_datetime: "2026-10-19T00:00:00.000Z",
    end_datetime: "2026-10-23T23:59:59.000Z",
    schedule_boards: { board_type: "time_off", organization_id: ORG },
    ...overrides,
  };
}

type Predicate = (r: Record<string, unknown>) => boolean;

function pick(r: Record<string, unknown>, column: string): unknown {
  return column.split(".").reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown> | null | undefined)?.[key],
    r,
  );
}

// Interpreta clausulas simples de `.or("col.is.null,col.neq.valor")`.
function orPredicate(expr: string): Predicate {
  const clauses = expr.split(",").map((c) => c.split("."));
  return (r) =>
    clauses.some(([col, op, val]) => {
      const v = pick(r, col);
      if (op === "is" && val === "null") return v === null || v === undefined;
      if (op === "neq") return v !== null && v !== undefined && v !== val;
      if (op === "eq") return v === val;
      throw new Error(`or() nao suportado no mock: ${expr}`);
    });
}

/**
 * Supabase simulado que FILTRA de verdade com os filtros que recebe: se o
 * codigo deixar de pedir um filtro, o resultado muda como mudaria na base.
 */
function makeMockClient(rows: ItemRow[], error: { message: string } | null = null) {
  const calls: Array<{ table: string; filters: string[]; columns: string[] }> = [];

  const client = {
    from(table: string) {
      const preds: Predicate[] = [];
      const filters: string[] = [];
      const columns: string[] = [];
      calls.push({ table, filters, columns });
      const builder = {
        select: (cols: string) => {
          columns.push(cols);
          return builder;
        },
        eq: (c: string, v: unknown) => {
          filters.push(`eq:${c}=${String(v)}`);
          preds.push((r) => pick(r, c) === v);
          return builder;
        },
        neq: (c: string, v: unknown) => {
          filters.push(`neq:${c}=${String(v)}`);
          preds.push((r) => pick(r, c) !== v);
          return builder;
        },
        in: (c: string, vs: unknown[]) => {
          filters.push(`in:${c}`);
          preds.push((r) => vs.includes(pick(r, c)));
          return builder;
        },
        lte: (c: string, v: string) => {
          filters.push(`lte:${c}`);
          preds.push((r) => String(pick(r, c)) <= v);
          return builder;
        },
        gte: (c: string, v: string) => {
          filters.push(`gte:${c}`);
          preds.push((r) => String(pick(r, c)) >= v);
          return builder;
        },
        or: (expr: string) => {
          filters.push(`or:${expr}`);
          preds.push(orPredicate(expr));
          return builder;
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (error) return resolve({ data: null, error });
          const data = rows.filter((r) =>
            preds.every((p) => p(r as unknown as Record<string, unknown>)),
          );
          return resolve({ data, error: null });
        },
      };
      return builder;
    },
  };

  return { client, calls };
}

async function run(
  rows: ItemRow[],
  userIds: string[] = ["u1", "u2", "u3"],
  requestedRange?: { startIso: string; endIso: string } | null,
) {
  const { client, calls } = makeMockClient(rows);
  const result = await findUserIdsOnTimeOff(
    client,
    ORG,
    userIds,
    DAY_START,
    DAY_END,
    requestedRange,
  );
  return { result, calls };
}

// Ferias parciais (all_day=false) das 12:00 as 14:00 desse dia.
function partial(overrides: Partial<ItemRow> = {}): ItemRow {
  return row({
    all_day: false,
    start_datetime: "2026-10-20T12:00:00.000Z",
    end_datetime: "2026-10-20T14:00:00.000Z",
    ...overrides,
  });
}
const at = (h: string, m = "00") => `2026-10-20T${h}:${m}:00.000Z`;

describe("findUserIdsOnTimeOff", () => {
  it("marca como ausente quem tem ferias aprovadas a cobrir o dia", async () => {
    const { result } = await run([row({ user_id: "u1" })]);
    expect([...result]).toEqual(["u1"]);
  });

  it("ferias pendentes tambem contam", async () => {
    const { result } = await run([row({ approval_status: "pending" })]);
    expect(result.has("u1")).toBe(true);
  });

  it("ferias com esclarecimento pedido (clarification_requested) tambem contam: so rejected fica de fora", async () => {
    const { result } = await run([row({ approval_status: "clarification_requested" })]);
    expect(result.has("u1")).toBe(true);
  });

  it("approval_status nulo conta (distinto de rejected, nao excluido por NULL)", async () => {
    const { result } = await run([row({ approval_status: null })]);
    expect(result.has("u1")).toBe(true);
  });

  it("ferias rejeitadas nao contam", async () => {
    const { result } = await run([row({ approval_status: "rejected" })]);
    expect(result.size).toBe(0);
  });

  it("ferias canceladas nao contam", async () => {
    const { result } = await run([row({ status: "cancelled" })]);
    expect(result.size).toBe(0);
  });

  it("so conta quadros do tipo time_off (uma visita normal nao e ausencia)", async () => {
    const { result } = await run([
      row({ schedule_boards: { board_type: "visits", organization_id: ORG } }),
    ]);
    expect(result.size).toBe(0);
  });

  it("nao conta ferias de outra organizacao", async () => {
    const { result } = await run([
      row({
        organization_id: OTHER_ORG,
        schedule_boards: { board_type: "time_off", organization_id: OTHER_ORG },
      }),
    ]);
    expect(result.size).toBe(0);
  });

  it("nao conta ferias que acabam antes ou comecam depois do dia", async () => {
    const { result } = await run([
      row({ user_id: "u1", start_datetime: "2026-10-10T00:00:00.000Z", end_datetime: "2026-10-19T23:59:59.000Z" }),
      row({ user_id: "u2", start_datetime: "2026-10-21T00:00:00.000Z", end_datetime: "2026-10-25T23:59:59.000Z" }),
    ]);
    expect(result.size).toBe(0);
  });

  it("conta ausencias de um so dia e que tocam apenas o inicio ou o fim do dia", async () => {
    const { result } = await run([
      row({ user_id: "u1", start_datetime: DAY_START, end_datetime: DAY_END }),
      row({ user_id: "u2", start_datetime: "2026-10-15T00:00:00.000Z", end_datetime: DAY_START }),
      row({ user_id: "u3", start_datetime: DAY_END, end_datetime: "2026-10-25T00:00:00.000Z" }),
    ]);
    expect([...result].sort()).toEqual(["u1", "u2", "u3"]);
  });

  it("nao bloqueia o dia para os outros: so sai quem tem ferias", async () => {
    const { result } = await run([row({ user_id: "u2" })]);
    expect(result.has("u1")).toBe(false);
    expect(result.has("u2")).toBe(true);
    expect(result.has("u3")).toBe(false);
  });

  it("ignora ausencias de utilizadores que nao sao candidatos", async () => {
    const { result } = await run([row({ user_id: "estranho" })]);
    expect(result.size).toBe(0);
  });

  it("faz uma so consulta para todos os candidatos, com organization_id explicito", async () => {
    const { calls } = await run([row()], ["u1", "u2", "u3", "u4"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("schedule_items");
    expect(calls[0].filters).toContain(`eq:organization_id=${ORG}`);
    expect(calls[0].filters).toContain("in:user_id");
  });

  it("pede tambem all_day, start_datetime e end_datetime dos itens", async () => {
    const { calls } = await run([row()]);
    for (const col of ["all_day", "start_datetime", "end_datetime"]) {
      expect(calls[0].columns.join(" ")).toContain(col);
    }
  });

  describe("ferias de dia inteiro (all_day=true)", () => {
    it("tiram o candidato mesmo com hora pedida", async () => {
      const { result } = await run([row({ all_day: true })], ["u1"], {
        startIso: at("09"),
        endIso: at("10"),
      });
      expect(result.has("u1")).toBe(true);
    });

    it("all_day nulo conta como ferias com horas: so bloqueia a faixa gravada, nunca o dia inteiro", async () => {
      const fora = await run([partial({ all_day: null })], ["u1"], {
        startIso: at("09"),
        endIso: at("10"),
      });
      expect(fora.result.has("u1")).toBe(false);

      const sem = await run([partial({ all_day: null })], ["u1"], null);
      expect(sem.result.has("u1")).toBe(false);

      const dentro = await run([partial({ all_day: null })], ["u1"], {
        startIso: at("13"),
        endIso: at("14", "30"),
      });
      expect(dentro.result.has("u1")).toBe(true);
    });
  });

  describe("ferias parciais (all_day=false)", () => {
    it("sem hora pedida o candidato fica: tem horas livres no dia", async () => {
      const { result } = await run([partial()], ["u1"], null);
      expect(result.size).toBe(0);
      const sem = await run([partial()], ["u1"]);
      expect(sem.result.size).toBe(0);
    });

    it("sai se a hora pedida se sobrepoe as horas das ferias", async () => {
      const { result } = await run([partial()], ["u1"], {
        startIso: at("13"),
        endIso: at("14", "30"),
      });
      expect(result.has("u1")).toBe(true);
    });

    it("sai se o pedido comeca antes e acaba dentro das ferias", async () => {
      const { result } = await run([partial()], ["u1"], {
        startIso: at("11", "30"),
        endIso: at("12", "30"),
      });
      expect(result.has("u1")).toBe(true);
    });

    it("sai se o pedido cobre as ferias por inteiro", async () => {
      const { result } = await run([partial()], ["u1"], {
        startIso: at("11"),
        endIso: at("15"),
      });
      expect(result.has("u1")).toBe(true);
    });

    it("fica se o pedido acaba antes das ferias ou comeca depois", async () => {
      const before = await run([partial()], ["u1"], { startIso: at("10"), endIso: at("11") });
      const after = await run([partial()], ["u1"], { startIso: at("15"), endIso: at("16") });
      expect(before.result.size).toBe(0);
      expect(after.result.size).toBe(0);
    });

    it("encostar so no limite nao e sobreposicao", async () => {
      const endsAtStart = await run([partial()], ["u1"], { startIso: at("11"), endIso: at("12") });
      const startsAtEnd = await run([partial()], ["u1"], { startIso: at("14"), endIso: at("15") });
      expect(endsAtStart.result.size).toBe(0);
      expect(startsAtEnd.result.size).toBe(0);
    });

    it("so tira quem se sobrepoe: os outros candidatos ficam", async () => {
      const { result } = await run(
        [partial({ user_id: "u1" }), partial({ user_id: "u2", start_datetime: at("16"), end_datetime: at("18") })],
        ["u1", "u2", "u3"],
        { startIso: at("13"), endIso: at("14") },
      );
      expect([...result]).toEqual(["u1"]);
    });

    it("parciais rejeitadas ou canceladas continuam a nao contar", async () => {
      const range = { startIso: at("13"), endIso: at("14") };
      const a = await run([partial({ approval_status: "rejected" })], ["u1"], range);
      const b = await run([partial({ status: "cancelled" })], ["u1"], range);
      expect(a.result.size + b.result.size).toBe(0);
    });
  });

  it("um candidato com parcial que nao se sobrepoe e dia inteiro noutro item sai", async () => {
    const { result } = await run(
      [partial({ user_id: "u1", start_datetime: at("16"), end_datetime: at("18") }), row({ user_id: "u1", all_day: true })],
      ["u1"],
      { startIso: at("09"), endIso: at("10") },
    );
    expect(result.has("u1")).toBe(true);
  });

  it("sem candidatos nao consulta a base", async () => {
    const { result, calls } = await run([row()], []);
    expect(result.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("recusa organization_id vazio em vez de consultar sem filtro", async () => {
    const { client } = makeMockClient([row()]);
    await expect(
      findUserIdsOnTimeOff(client, "", ["u1"], DAY_START, DAY_END),
    ).rejects.toThrow(/organizationId/);
  });

  it("um erro da base nao se engole: deixar passar candidatos de ferias seria silencioso", async () => {
    const { client } = makeMockClient([], { message: "boom" });
    await expect(
      findUserIdsOnTimeOff(client, ORG, ["u1"], DAY_START, DAY_END),
    ).rejects.toThrow(/boom/);
  });
});

// index.ts nao se importa (corre `serve(...)` ao carregar), por isso esta guarda
// de ligacao le o ficheiro: o filtro tem de correr antes de contar carga e de
// montar o prompt da IA.
describe("suggest-schedule-assignee/index.ts usa o filtro de ferias", () => {
  const source = readFileSync(
    resolve(process.cwd(), "supabase/functions/suggest-schedule-assignee/index.ts"),
    "utf8",
  );

  it("chama findUserIdsOnTimeOff antes de pesquisar a carga e antes do prompt", () => {
    const call = source.indexOf("findUserIdsOnTimeOff(");
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(source.indexOf("const resourceIds"));
    expect(call).toBeLessThan(source.indexOf("const prompt"));
  });

  it("passa ao filtro o intervalo pedido (hora + duracao), calculado antes da chamada", () => {
    const call = source.indexOf("findUserIdsOnTimeOff(");
    expect(source.indexOf("const requestedRange")).toBeLessThan(call);
    expect(source).toMatch(/findUserIdsOnTimeOff\([\s\S]*?dateEnd,\s*requestedRange,?\s*\)/);
  });

  it("consulta com o cliente service role e o organization_id do pedido", () => {
    expect(source).toMatch(/findUserIdsOnTimeOff\(\s*supabaseAdmin,\s*organization_id,/);
  });
});
