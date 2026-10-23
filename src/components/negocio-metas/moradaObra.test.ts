import { describe, expect, it } from "vitest";
import { MORADA_VAZIA, moradaAparada, moradaDoContacto, temMorada, validarCodigoPostal } from "./moradaObra";

describe("validarCodigoPostal", () => {
  it("vazio é válido (a morada é opcional) e o formato 0000-000 também", () => {
    expect(validarCodigoPostal("")).toBeNull();
    expect(validarCodigoPostal("   ")).toBeNull();
    expect(validarCodigoPostal("1000-001")).toBeNull();
    expect(validarCodigoPostal(" 4000-123 ")).toBeNull();
  });

  it.each(["1000", "1000001", "1000-01", "100-0001", "abcd-efg", "1000 001", "1000-0011", "1000-001 Lisboa"])("recusa %s", (texto) => {
    expect(validarCodigoPostal(texto)).toBe("invalido");
  });
});

describe("temMorada e moradaAparada", () => {
  it("só há morada se algum campo tem texto (espaços não contam)", () => {
    expect(temMorada(undefined)).toBe(false);
    expect(temMorada(MORADA_VAZIA)).toBe(false);
    expect(temMorada({ ...MORADA_VAZIA, rua: "   " })).toBe(false);
    expect(temMorada({ ...MORADA_VAZIA, andar: "3.º Esq." })).toBe(true);
  });

  it("apara os quatro campos", () => {
    expect(moradaAparada({ rua: " Rua A 1 ", codigoPostal: " 1000-001", localidade: "Lisboa ", andar: " 2.º " })).toEqual({
      rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "2.º",
    });
  });
});

describe("moradaDoContacto", () => {
  it("parte 'rua, código postal localidade'", () => {
    expect(moradaDoContacto("Rua A, 1000-001 Lisboa")).toEqual({ rua: "Rua A", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" });
    expect(moradaDoContacto("Av. da Liberdade 10 4000-123 Porto")).toEqual({
      rua: "Av. da Liberdade 10", codigoPostal: "4000-123", localidade: "Porto", andar: "",
    });
  });

  it("sem código postal põe tudo na rua; vazio dá morada vazia", () => {
    expect(moradaDoContacto(" Rua B 5, Faro ")).toEqual({ ...MORADA_VAZIA, rua: "Rua B 5, Faro" });
    expect(moradaDoContacto("")).toEqual(MORADA_VAZIA);
  });
});
