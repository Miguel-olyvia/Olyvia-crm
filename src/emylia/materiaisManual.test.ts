// 27/11 (Rúben: «permitir ajustar à mão os materiais (gerir) no plano da obra, tab materiais»)
import { describe, expect, it } from "vitest";
import { aplicarManual, type Mat } from "./obraOps";

const base: Mat = { n: "Base de Duche STONE PLUS 90x160", q: 1, un: "un", estado: "encomendado" };

describe("materiais geridos à mão", () => {
  it("a data prevista à mão põe o material «a chegar» nessa data", () => {
    const x = aplicarManual(base, { chega: "2026-12-04" });
    expect(x.estado).toBe("a chegar");
    expect(x.quando).toBe("04/12");
    expect(x.chega).toBe("2026-12-04");
  });
  it("recebido à mão fica recebido (garantido)", () => {
    expect(aplicarManual(base, { recebido: "2026-11-27", chega: "2026-12-04" }).estado).toBe("recebido");
  });
  it("o que o Inventário já dá como no armazém ou na obra não muda", () => {
    const naObra: Mat = { ...base, estado: "na obra" };
    expect(aplicarManual(naObra, { chega: "2026-12-04" })).toBe(naObra);
  });
  it("sem nada escrito à mão fica igual", () => {
    expect(aplicarManual(base, undefined)).toBe(base);
  });
});
