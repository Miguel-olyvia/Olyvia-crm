import { describe, expect, it } from "vitest";
import type { IndicacaoContrato } from "@/lib/hr/fimContrato";
import { indicacaoDoCiclo } from "./indicacaoResponsavel";

const ind = (extra: Partial<IndicacaoContrato>): IndicacaoContrato => ({
  id: "i1",
  vinculo_id: "v1",
  ciclo_fim: "2026-12-31",
  resposta: "pretendo_continuar",
  indicada_em: "2026-11-05T10:00:00Z",
  ...extra,
});

describe("indicacaoDoCiclo: o que o responsável indicou para o contrato de agora", () => {
  it("devolve a indicação do contrato e do ciclo atual (a data de fim de agora)", () => {
    const lista = [ind({})];
    expect(indicacaoDoCiclo(lista, "v1", "2026-12-31")?.resposta).toBe("pretendo_continuar");
  });

  it("ignora as indicações de ciclos anteriores: depois de uma renovação recomeça por decidir", () => {
    const lista = [ind({ ciclo_fim: "2026-06-30", resposta: "nao_pretendo_continuar" })];
    expect(indicacaoDoCiclo(lista, "v1", "2026-12-31")).toBeNull();
  });

  it("ignora as indicações de outro contrato", () => {
    expect(indicacaoDoCiclo([ind({ vinculo_id: "v2" })], "v1", "2026-12-31")).toBeNull();
  });

  it("se houver mais do que uma no mesmo ciclo, vale a última (por data), seja qual for a ordem da lista", () => {
    const antiga = ind({ id: "a", resposta: "pretendo_continuar", indicada_em: "2026-11-05T10:00:00Z" });
    const nova = ind({ id: "b", resposta: "nao_pretendo_continuar", indicada_em: "2026-11-06T09:00:00Z" });
    expect(indicacaoDoCiclo([nova, antiga], "v1", "2026-12-31")?.id).toBe("b");
    expect(indicacaoDoCiclo([antiga, nova], "v1", "2026-12-31")?.id).toBe("b");
  });

  it("sem data de fim (contrato sem termo) não há ciclo, logo não há indicação", () => {
    expect(indicacaoDoCiclo([ind({})], "v1", null)).toBeNull();
  });

  it("sem indicações devolve null", () => {
    expect(indicacaoDoCiclo([], "v1", "2026-12-31")).toBeNull();
  });
});
