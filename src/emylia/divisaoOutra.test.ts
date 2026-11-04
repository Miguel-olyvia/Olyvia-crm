import { describe, expect, it } from "vitest";
import { AREA, alternarVarios, divisoesEscolhidas, gruposArea, juntarOutra, opcoesVarios, prefixoDivisao } from "./campos";

const DIV = AREA.campos.find((c) => c.k === "diag_tipo_area")!;

describe("3/11: divisões escritas à mão na área de intervenção", () => {
  it("o comercial junta quantas quiser, com o nome que quiser, e ficam escolhidas", () => {
    let v = "Casa de banho";
    v = juntarOutra(DIV, v, "Escritório");
    v = juntarOutra(DIV, v, "  Garagem  ");
    expect(v).toBe("Casa de banho, Escritório, Garagem");
    expect(opcoesVarios(DIV, v)).toEqual(["Casa de banho", "Cozinha", "Sala", "Quarto", "Escritório", "Garagem"]);
  });

  it("carregar numa escrita à mão tira-a; as outras escolhas não se perdem", () => {
    const v = "Casa de banho, Escritório, Garagem";
    expect(alternarVarios(opcoesVarios(DIV, v), v, "Escritório")).toBe("Casa de banho, Garagem");
    expect(alternarVarios(opcoesVarios(DIV, v), v, "Cozinha")).toBe("Casa de banho, Cozinha, Escritório, Garagem");
  });

  it("um nome que já existe (com outras maiúsculas) escolhe esse; vazio ou sem letras não junta nada; as vírgulas saem", () => {
    expect(juntarOutra(DIV, "Casa de banho", "cozinha")).toBe("Casa de banho, Cozinha");
    expect(juntarOutra(DIV, "Casa de banho, Escritório", "escritório")).toBe("Casa de banho, Escritório");
    expect(juntarOutra(DIV, "Sala", "   ")).toBe("Sala");
    expect(juntarOutra(DIV, "Sala", "!!")).toBe("Sala");
    expect(juntarOutra(DIV, "Sala", "Sótão, arrumos")).toBe("Sala, Sótão arrumos");
  });

  it("cada divisão escrita à mão tem os campos da área com o seu prefixo, como as da lista", () => {
    const f = { diag_tipo_area: "Casa de banho, Escritório" };
    expect(divisoesEscolhidas(f)).toEqual(["Casa de banho", "Escritório"]);
    const [, escritorio] = gruposArea(undefined, f);
    expect(escritorio.titulo).toBe("Área de intervenção · Escritório");
    expect(escritorio.campos.every((c) => c.k.startsWith(prefixoDivisao("Escritório")))).toBe(true);
    // os campos só de casa de banho (ex.: o toalheiro) não entram
    expect(escritorio.campos.some((c) => c.k.endsWith("diag_toalheiro"))).toBe(false);
  });

  it("os negócios que já tinham «Outra» continuam com ela", () => {
    expect(opcoesVarios(DIV, "Sala, Outra")).toContain("Outra");
  });
});
