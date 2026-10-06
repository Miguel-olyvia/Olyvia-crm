import { describe, it, expect } from "vitest";
import {
  MORADA_VAZIA,
  MENSAGENS_MORADA,
  codigoPostalValido,
  limparErrosAlterados,
  moradaVazia,
  normalizarCodigoPostal,
  normalizarMorada,
  primeiroErroMorada,
  validarMorada,
} from "../validarMorada";

const completa = {
  street: "Rua X",
  number: "12",
  floor: "3º",
  unit: "Esq",
  postal_code: "1000-001",
  city: "Lisboa",
};

describe("normalizarCodigoPostal", () => {
  it("põe o hífen em 7 dígitos seguidos", () => {
    expect(normalizarCodigoPostal("1000001")).toBe("1000-001");
  });
  it("tira espaços", () => {
    expect(normalizarCodigoPostal(" 1000 001 ")).toBe("1000-001");
    expect(normalizarCodigoPostal("1000 - 001")).toBe("1000-001");
  });
  it("troca travessões por hífen", () => {
    expect(normalizarCodigoPostal("1000–001")).toBe("1000-001");
  });
  it("deixa como está o que não consegue normalizar", () => {
    expect(normalizarCodigoPostal("1000")).toBe("1000");
    expect(normalizarCodigoPostal("ABCD-EFG")).toBe("ABCD-EFG");
  });
  it("aceita null/undefined", () => {
    expect(normalizarCodigoPostal(null)).toBe("");
    expect(normalizarCodigoPostal(undefined)).toBe("");
  });
});

describe("codigoPostalValido", () => {
  it("aceita 0000-000 válido e recusa o resto", () => {
    expect(codigoPostalValido("4000-100")).toBe(true);
    expect(codigoPostalValido("4000100")).toBe(true);
    expect(codigoPostalValido("0000-000")).toBe(false);
    expect(codigoPostalValido("0000000")).toBe(false);
    expect(codigoPostalValido("4000")).toBe(false);
    expect(codigoPostalValido("4000-10")).toBe(false);
    expect(codigoPostalValido("40000-100")).toBe(false);
    expect(codigoPostalValido("")).toBe(false);
  });
});

describe("validarMorada (obrigatória)", () => {
  it("aceita uma morada completa", () => {
    expect(validarMorada(completa, { obrigatoria: true })).toEqual({ valido: true, erros: {} });
  });

  it("número, andar e fração são opcionais", () => {
    const r = validarMorada({ ...completa, number: "", floor: "", unit: "" }, { obrigatoria: true });
    expect(r.valido).toBe(true);
  });

  it("vazia não é válida e assinala rua, código postal e localidade", () => {
    const r = validarMorada(MORADA_VAZIA, { obrigatoria: true });
    expect(r.valido).toBe(false);
    expect(r.erros).toEqual({
      street: MENSAGENS_MORADA.ruaObrigatoria,
      postal_code: MENSAGENS_MORADA.codigoPostalObrigatorio,
      city: MENSAGENS_MORADA.localidadeObrigatoria,
    });
  });

  it("só espaços conta como vazio", () => {
    const r = validarMorada({ ...completa, street: "   ", city: " " }, { obrigatoria: true });
    expect(r.erros.street).toBe(MENSAGENS_MORADA.ruaObrigatoria);
    expect(r.erros.city).toBe(MENSAGENS_MORADA.localidadeObrigatoria);
  });

  it("recusa código postal mal formado e 0000-000", () => {
    for (const cp of ["1000", "1000-01", "ABCD-123", "0000-000", "0000000"]) {
      const r = validarMorada({ ...completa, postal_code: cp }, { obrigatoria: true });
      expect(r.valido).toBe(false);
      expect(r.erros.postal_code).toBe(MENSAGENS_MORADA.codigoPostalInvalido);
    }
  });

  it("aceita o código postal sem hífen (é normalizado)", () => {
    expect(validarMorada({ ...completa, postal_code: "1000001" }, { obrigatoria: true }).valido).toBe(true);
  });

  it("aplica os limites de tamanho", () => {
    const r = validarMorada(
      { ...completa, street: "a".repeat(256), number: "1".repeat(21), floor: "x".repeat(21), unit: "y".repeat(21), city: "c".repeat(101) },
      { obrigatoria: true },
    );
    expect(r.valido).toBe(false);
    expect(Object.keys(r.erros).sort()).toEqual(["city", "floor", "number", "street", "unit"]);
    expect(r.erros.street).toBe(MENSAGENS_MORADA.demasiadoLongo(255));
  });
});

describe("validarMorada (opcional — morada principal do cliente)", () => {
  it("todos os campos vazios é válido", () => {
    expect(validarMorada(MORADA_VAZIA, { obrigatoria: false })).toEqual({ valido: true, erros: {} });
    expect(validarMorada({ street: "  ", city: "" }, { obrigatoria: false }).valido).toBe(true);
    expect(validarMorada(null, { obrigatoria: false }).valido).toBe(true);
  });

  it("um campo preenchido obriga aos outros", () => {
    const r = validarMorada({ ...MORADA_VAZIA, floor: "2º" }, { obrigatoria: false });
    expect(r.valido).toBe(false);
    expect(Object.keys(r.erros).sort()).toEqual(["city", "postal_code", "street"]);
  });

  it("só a rua (o caso que antes se perdia em silêncio) é inválido", () => {
    const r = validarMorada({ ...MORADA_VAZIA, street: "Rua X" }, { obrigatoria: false });
    expect(r.erros.postal_code).toBe(MENSAGENS_MORADA.codigoPostalObrigatorio);
    expect(r.erros.city).toBe(MENSAGENS_MORADA.localidadeObrigatoria);
  });
});

describe("normalizarMorada / moradaVazia / primeiroErroMorada", () => {
  it("tira espaços e normaliza o código postal", () => {
    expect(normalizarMorada({ street: " Rua X ", postal_code: "1000 001", city: " Lisboa" })).toEqual({
      street: "Rua X", number: "", floor: "", unit: "", postal_code: "1000-001", city: "Lisboa",
    });
  });
  it("moradaVazia", () => {
    expect(moradaVazia(MORADA_VAZIA)).toBe(true);
    expect(moradaVazia({ unit: "B" })).toBe(false);
  });
  it("limparErrosAlterados tira só os erros dos campos que mudaram", () => {
    const erros = { street: "r", city: "c" };
    expect(limparErrosAlterados(erros, { street: "", city: "" }, { street: "R", city: "" })).toEqual({ city: "c" });
    expect(limparErrosAlterados(erros, { street: "", city: "" }, { street: "", city: "" })).toBe(erros);
  });
  it("primeiroErroMorada segue a ordem dos campos", () => {
    expect(primeiroErroMorada({ city: "c", street: "r" })).toBe("r");
    expect(primeiroErroMorada({})).toBeUndefined();
  });
});
