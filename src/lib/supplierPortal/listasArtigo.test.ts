import { describe, expect, it } from "vitest";
import { corCanonica, UNIDADES } from "./listasArtigo";

describe("listas do artigo", () => {
  it("a cor fica igual à que existe, sem duplicar por maiúsculas ou acentos", () => {
    expect(corCanonica("PRETO")).toBe("Preto");
    expect(corCanonica("  latao ")).toBe("Latão");
    expect(corCanonica("madeira   natural")).toBe("Madeira natural");
  });

  it("uma cor nova fica com maiúscula", () => {
    expect(corCanonica("verde água")).toBe("Verde água");
    expect(corCanonica("")).toBe("");
  });

  it("as unidades não se repetem", () => {
    expect(new Set(UNIDADES.map(([v]) => v)).size).toBe(UNIDADES.length);
  });
});
