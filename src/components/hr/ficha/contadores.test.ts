import { describe, expect, it } from "vitest";
import { contadoresDaFicha } from "./contadores";

describe("contadoresDaFicha", () => {
  it("sem ficha, o contador de contratos é zero", () => {
    expect(contadoresDaFicha(null)).toEqual({ contratos: 0 });
  });

  it("conta os contratos (vínculos) da ficha real, e mais nada", () => {
    const ficha = { vinculos: [{ id: "v1" }, { id: "v2" }, { id: "v3" }] };
    expect(contadoresDaFicha(ficha)).toEqual({ contratos: 3 });
  });

  it("uma ficha sem vínculos dá zero", () => {
    expect(contadoresDaFicha({ vinculos: [] })).toEqual({ contratos: 0 });
  });

  it("não inventa contadores de documentos nem de ausências (ainda sem fonte real)", () => {
    expect(Object.keys(contadoresDaFicha({ vinculos: [{ id: "v1" }] }))).toEqual(["contratos"]);
  });
});
