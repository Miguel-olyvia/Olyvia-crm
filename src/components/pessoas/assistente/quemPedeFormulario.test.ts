// A regra do grupo «Quem pede» do passo Chamada: o NIF (9 dígitos com o dígito de controlo, só gravado se foi tocado) e o tipo de cliente.
import { describe, expect, it } from "vitest";
import { nifValido, normalizarNif, pedidoDeNif, tipoClienteDeIdentidade, tipoIdentidadeDe } from "./quemPedeFormulario";

describe("normalizarNif / nifValido", () => {
  it("tira espaços, pontos e hífenes", () => {
    expect(normalizarNif(" 123 456-789 ")).toBe("123456789");
    expect(normalizarNif("123.456.789")).toBe("123456789");
  });

  it("aceita 9 dígitos com o dígito de controlo certo, escritos de qualquer forma", () => {
    expect(nifValido("123456789")).toBe(true);
    expect(nifValido("123 456 789")).toBe(true);
    expect(nifValido("123-456-789")).toBe(true);
  });

  it("recusa o dígito de controlo errado, o tamanho errado e letras", () => {
    expect(nifValido("123456780")).toBe(false);
    expect(nifValido("12345678")).toBe(false);
    expect(nifValido("1234567890")).toBe(false);
    expect(nifValido("12345678a")).toBe(false);
    expect(nifValido("")).toBe(false);
    expect(nifValido("         ")).toBe(false);
  });
});

describe("pedidoDeNif", () => {
  const sem = { nifUltimos3: null, temNif: false, nif: null };

  it("sem tocar no campo nunca grava nem limpa (a pessoa pode já ter NIF que o ecrã não mostra)", () => {
    expect(pedidoDeNif("", false, { nifUltimos3: "789", temNif: true, nif: null })).toEqual({ estado: "semAlteracao" });
    expect(pedidoDeNif("123456789", false, sem)).toEqual({ estado: "semAlteracao" });
  });

  it("tocado e vazio: pede SEMPRE limpar (a função é idempotente), mesmo que a ficha não diga que há NIF", () => {
    expect(pedidoDeNif("  ", true, sem)).toEqual({ estado: "limpar" });
    expect(pedidoDeNif("", true, {})).toEqual({ estado: "limpar" });
    expect(pedidoDeNif("", true, { nifUltimos3: "789", temNif: false, nif: null })).toEqual({ estado: "limpar" });
    expect(pedidoDeNif("", true, { nifUltimos3: null, temNif: true, nif: null })).toEqual({ estado: "limpar" });
  });

  it("tocado e válido: grava só os dígitos", () => {
    expect(pedidoDeNif(" 123 456 789 ", true, sem)).toEqual({ estado: "guardar", nif: "123456789" });
  });

  it("tocado e inválido: diz que é inválido e não grava", () => {
    expect(pedidoDeNif("123456780", true, sem)).toEqual({ estado: "invalido" });
    expect(pedidoDeNif("12345", true, sem)).toEqual({ estado: "invalido" });
  });

  it("igual ao NIF que a ficha já mostra: sem alteração", () => {
    expect(pedidoDeNif("123 456 789", true, { nifUltimos3: null, temNif: true, nif: "123456789" })).toEqual({ estado: "semAlteracao" });
  });
});

describe("tipo de cliente e tipo de identidade", () => {
  it("particular é pessoa, empresa é organização, condomínio fica condomínio; sem tipo não se sabe", () => {
    expect(tipoIdentidadeDe("particular")).toBe("person");
    expect(tipoIdentidadeDe("empresa")).toBe("organization");
    expect(tipoIdentidadeDe("condominio")).toBe("condominio");
    expect(tipoIdentidadeDe(undefined)).toBeNull();
    expect(tipoClienteDeIdentidade("person")).toBe("particular");
    expect(tipoClienteDeIdentidade("organization")).toBe("empresa");
    expect(tipoClienteDeIdentidade("condominio")).toBe("condominio");
  });
});
