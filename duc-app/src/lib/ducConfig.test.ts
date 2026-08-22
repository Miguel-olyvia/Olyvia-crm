import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock do cliente Supabase. Cada método devolve um builder encadeável cujo
// resultado final é resolvido via `maybeSingle` (fetch) ou diretamente pela
// própria promessa (upsert/delete). Controlamos o resultado por teste.
// ---------------------------------------------------------------------------
const state: {
  fetchResult: { data: unknown; error: { message: string } | null };
  upsertResult: { error: { message: string } | null };
  deleteResult: { error: { message: string } | null };
  lastUpsertArgs: unknown[];
} = {
  fetchResult: { data: null, error: null },
  upsertResult: { error: null },
  deleteResult: { error: null },
  lastUpsertArgs: [],
};

// Cadeia de leitura: select().eq().order().limit() → { data: linhas[], error }.
const limit = vi.fn(async () => state.fetchResult);
const order = vi.fn(() => ({ limit }));
const eqSelect = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq: eqSelect }));

// delete().eq() é "thenable": a implementação faz `await ...delete().eq(...)`.
const eqDelete = vi.fn(async () => state.deleteResult);
const del = vi.fn(() => ({ eq: eqDelete }));

const upsert = vi.fn(async (...args: unknown[]) => {
  state.lastUpsertArgs = args;
  return state.upsertResult;
});

const from = vi.fn((..._a: unknown[]) => ({ select, upsert, delete: del }));

vi.mock("./supabase", () => ({
  supabase: { from: (...a: unknown[]): unknown => from(...a) },
}));

import { baseStages, stagesForVariant } from "./ducConfig";
import { DUC_STAGES, stageAppliesToVariant } from "./ducSchema";
import type { DucVariant } from "./types";

beforeEach(() => {
  vi.clearAllMocks();
  state.fetchResult = { data: null, error: null };
  state.upsertResult = { error: null };
  state.deleteResult = { error: null };
  state.lastUpsertArgs = [];
});

describe("baseStages", () => {
  it("devolve o mesmo conteúdo que DUC_STAGES", () => {
    expect(baseStages()).toEqual(DUC_STAGES);
  });

  it("é uma cópia profunda distinta (identidade diferente)", () => {
    const clone = baseStages();
    expect(clone).not.toBe(DUC_STAGES);
    expect(clone[0]).not.toBe(DUC_STAGES[0]);
    expect(clone[0].fields).not.toBe(DUC_STAGES[0].fields);
    expect(clone[0].fields[0]).not.toBe(DUC_STAGES[0].fields[0]);
  });

  it("mutar o resultado NÃO afeta DUC_STAGES", () => {
    const clone = baseStages();
    clone[0].title = "MUTADO";
    clone[0].fields.push({ key: "hacked", label: "H", type: "text" });
    clone.length = 0;
    expect(DUC_STAGES[0].title).not.toBe("MUTADO");
    expect(DUC_STAGES[0].fields.some((f) => f.key === "hacked")).toBe(false);
    expect(DUC_STAGES).toHaveLength(9);
  });

  it("duas chamadas devolvem objetos independentes", () => {
    const a = baseStages();
    const b = baseStages();
    a[0].title = "X";
    expect(b[0].title).not.toBe("X");
  });
});

describe("stagesForVariant", () => {
  it("só inclui etapas aplicáveis à variante", () => {
    for (const v of ["universal", "mudelar_obra", "bmg_contrato"] as DucVariant[]) {
      const stages = stagesForVariant(v);
      const expectedKeys = DUC_STAGES.filter((s) => stageAppliesToVariant(s, v)).map(
        (s) => s.key
      );
      expect(stages.map((s) => s.key)).toEqual(expectedKeys);
    }
  });

  it("exclui a etapa posvenda para universal", () => {
    const keys = stagesForVariant("universal").map((s) => s.key);
    expect(keys).not.toContain("posvenda");
  });

  it("inclui posvenda para mudelar_obra e bmg_contrato", () => {
    expect(stagesForVariant("mudelar_obra").map((s) => s.key)).toContain("posvenda");
    expect(stagesForVariant("bmg_contrato").map((s) => s.key)).toContain("posvenda");
  });

  it("remove a tag `variants` de todos os campos resolvidos (fica undefined)", () => {
    for (const v of ["universal", "mudelar_obra", "bmg_contrato"] as DucVariant[]) {
      const stages = stagesForVariant(v);
      for (const s of stages) {
        for (const f of s.fields) {
          expect(f.variants).toBeUndefined();
        }
      }
    }
  });

  it("os campos resultantes são apenas os aplicáveis à variante", () => {
    // O bloco comercial tem campos M e B; em universal só ficam os sem variante.
    const universal = stagesForVariant("universal").find((s) => s.key === "comercial")!;
    const keys = universal.fields.map((f) => f.key);
    expect(keys).not.toContain("tipo_obra"); // mudelar
    expect(keys).not.toContain("tipo_contrato"); // bmg
    expect(keys).toContain("cliente_ref"); // universal

    const mudelar = stagesForVariant("mudelar_obra").find((s) => s.key === "comercial")!;
    expect(mudelar.fields.map((f) => f.key)).toContain("tipo_obra");
    expect(mudelar.fields.map((f) => f.key)).not.toContain("tipo_contrato");
  });

  it("resolve itemSections filtradas por variante (service_map só em bmg)", () => {
    const bmg = stagesForVariant("bmg_contrato").find((s) => s.key === "operacao")!;
    expect((bmg.itemSections ?? []).map((s) => s.section)).toContain("service_map");

    const mudelar = stagesForVariant("mudelar_obra").find((s) => s.key === "operacao")!;
    expect((mudelar.itemSections ?? []).map((s) => s.section)).not.toContain("service_map");
  });

  it("não muta DUC_STAGES (os campos originais mantêm as suas variants)", () => {
    stagesForVariant("universal");
    const comercial = DUC_STAGES.find((s) => s.key === "comercial")!;
    const tipoObra = comercial.fields.find((f) => f.key === "tipo_obra")!;
    expect(tipoObra.variants).toEqual(["mudelar_obra"]);
  });
});

describe("fetchEffectiveStages", () => {
  it("devolve o template (custom:false) quando não há linha guardada", async () => {
    const { fetchEffectiveStages } = await import("./ducConfig");
    state.fetchResult = { data: null, error: null };
    const res = await fetchEffectiveStages("org-1", "universal");
    expect(res.custom).toBe(false);
    expect(res.stages.map((s) => s.key)).toEqual(
      stagesForVariant("universal").map((s) => s.key)
    );
    expect(from).toHaveBeenCalledWith("anew_client_duc_configs");
  });

  it("devolve o template quando o config existe mas stages está vazio", async () => {
    const { fetchEffectiveStages } = await import("./ducConfig");
    state.fetchResult = { data: [{ config: { stages: [] } }], error: null };
    const res = await fetchEffectiveStages("org-1", "mudelar_obra");
    expect(res.custom).toBe(false);
    expect(res.stages.map((s) => s.key)).toEqual(
      stagesForVariant("mudelar_obra").map((s) => s.key)
    );
  });

  it("devolve as stages guardadas (custom:true) quando há um config válido", async () => {
    const { fetchEffectiveStages } = await import("./ducConfig");
    const saved = [
      { no: 1, key: "custom", title: "Custom", responsible: "R", fields: [] },
    ];
    state.fetchResult = { data: [{ config: { stages: saved } }], error: null };
    const res = await fetchEffectiveStages("org-1", "bmg_contrato");
    expect(res.custom).toBe(true);
    expect(res.stages).toEqual(saved);
  });
});

describe("saveDucConfig", () => {
  it("devolve null em sucesso e faz upsert com onConflict organization_id", async () => {
    const { saveDucConfig } = await import("./ducConfig");
    state.upsertResult = { error: null };
    const stages = baseStages();
    const err = await saveDucConfig("org-9", stages, "user-1");
    expect(err).toBeNull();
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, opts] = state.lastUpsertArgs as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(payload).toMatchObject({
      organization_id: "org-9",
      config: { stages },
      updated_by: "user-1",
    });
    expect(opts).toEqual({ onConflict: "organization_id" });
  });

  it("aceita userId null", async () => {
    const { saveDucConfig } = await import("./ducConfig");
    await saveDucConfig("org-9", baseStages(), null);
    const [payload] = state.lastUpsertArgs as [Record<string, unknown>];
    expect(payload.updated_by).toBeNull();
  });

  it("devolve a mensagem de erro quando o upsert falha", async () => {
    const { saveDucConfig } = await import("./ducConfig");
    state.upsertResult = { error: { message: "boom" } };
    const err = await saveDucConfig("org-9", baseStages(), "user-1");
    expect(err).toBe("boom");
  });
});

describe("resetDucConfig", () => {
  it("devolve null em sucesso e apaga por organization_id", async () => {
    const { resetDucConfig } = await import("./ducConfig");
    state.deleteResult = { error: null };
    const err = await resetDucConfig("org-2");
    expect(err).toBeNull();
    expect(del).toHaveBeenCalled();
    expect(eqDelete).toHaveBeenCalledWith("organization_id", "org-2");
  });

  it("devolve a mensagem de erro quando o delete falha", async () => {
    const { resetDucConfig } = await import("./ducConfig");
    state.deleteResult = { error: { message: "cannot delete" } };
    const err = await resetDucConfig("org-2");
    expect(err).toBe("cannot delete");
  });
});
