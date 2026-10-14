import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { atualizarFicha, lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useCargosRetribuicoesDivergentes } from "@/components/rh-exemplo/hooks/useCargosRetribuicoesDivergentes";
import { retribuicoesDivergentes } from "./cargosDivergencias";

beforeEach(() => repor());

describe("retribuições divergentes do cargo", () => {
  it("os dados de exemplo nascem alinhados: zero divergências", () => {
    const e = lerEstado();
    expect(retribuicoesDivergentes(e.fichas, e.cargos, e.cargosPeriodos, hojeIso())).toEqual([]);
  });

  it("uma retribuição escrita à mão com outro valor aparece, com o valor esperado do cargo", () => {
    atualizarFicha("p-tiago", (f) => ({ ...f, retribuicoes: f.retribuicoes.map((r) => ({ ...r, valor_base: r.valor_base + 50 })) }));
    const { result } = renderHook(() => useCargosRetribuicoesDivergentes());
    expect(result.current.divergencias).toHaveLength(1);
    expect(result.current.divergencias[0]).toMatchObject({ pessoa_id: "p-tiago" });
    expect(result.current.divergencias[0].valor_base).toBe(result.current.divergencias[0].esperado_valor_base + 50);
  });

  it("subir o salário do cargo atualiza quem o tem e não cria divergências", async () => {
    const cargo = renderHook(() => useCargos());
    const cargoId = lerEstado().fichas["p-tiago"].pessoa.cargo_id ?? "";
    await act(async () => {
      await cargo.result.current.definirSalario(cargoId, 2000, "mensal", hojeIso(), "Revisão anual");
    });
    const e = lerEstado();
    expect(retribuicoesDivergentes(e.fichas, e.cargos, e.cargosPeriodos, hojeIso())).toEqual([]);
    expect(e.fichas["p-tiago"].retribuicoes.at(-1)?.valor_base).toBe(2000);
  });
});
