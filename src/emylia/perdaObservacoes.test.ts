import { describe, expect, it } from "vitest";
import { acoes, seed } from "./motor";

// 4/11 (Rúben): «quando for marcado como perdida, ter observações para preencher»
describe("as observações ao marcar como perdido", () => {
  it("ficam como motivo da perda e no histórico", () => {
    const S = seed(); S.role = "comercial";
    const d = S.deals.find((x) => x.fase === 1 && !x.perdido)!;
    acoes(S, () => {}, (fn) => fn()).perderSim(d.id, "  Preço · vai pensar até janeiro ");
    expect(d.perdido).toBe(true);
    expect(d.motivoPerda).toBe("Preço · vai pensar até janeiro");
    expect(d.hist[0].t).toBe("Marcado como perdido · Preço · vai pensar até janeiro");
  });
  it("sem observações, como antes", () => {
    const S = seed(); S.role = "comercial";
    const d = S.deals.find((x) => x.fase === 1 && !x.perdido)!;
    acoes(S, () => {}, (fn) => fn()).perderSim(d.id, "");
    expect(d.hist[0].t).toBe("Marcado como perdido");
  });
});
