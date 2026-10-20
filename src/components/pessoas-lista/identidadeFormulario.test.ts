// A regra do formulário de identidade: quando o nome visível não diz onde acaba o nome próprio (três ou mais palavras), o formulário avisa.
import { describe, expect, it } from "vitest";
import { nomeAmbiguo, partirNome, pedidoDeIdentidade } from "./identidadeFormulario";

describe("nomeAmbiguo", () => {
  it.each([
    ["Madonna", false], ["Ana Lopes", false], ["  Ana   Lopes ", false],
    ["Ana Maria Lopes", true], ["João Pedro de Sousa", true],
  ])("%s -> %s", (nome, esperado) => {
    expect(nomeAmbiguo(nome)).toBe(esperado);
  });

  it("vazio não é ambíguo", () => {
    expect(nomeAmbiguo("")).toBe(false);
    expect(nomeAmbiguo("   ")).toBe(false);
  });
});

describe("partirNome e pedidoDeIdentidade com um nome de várias palavras", () => {
  const atual = { nome: "Ana Maria Silva", tipo: "person" as const, empresaNome: null };

  it("o ponto de partida é a primeira palavra e o resto (só para editar)", () => {
    expect(partirNome("Ana Maria Silva")).toEqual({ nomeProprio: "Ana", apelido: "Maria Silva" });
  });

  it("sem tocar em nada, não há alteração (a base não muda o nome em silêncio)", () => {
    expect(pedidoDeIdentidade({ tipo: "person", nomeEmpresa: "", nomeProprio: "Ana", apelido: "Maria Silva" }, atual)).toEqual({ estado: "semAlteracao" });
  });

  it("mudar só o apelido manda os dois campos tal como estão no formulário", () => {
    expect(pedidoDeIdentidade({ tipo: "person", nomeEmpresa: "", nomeProprio: "Ana", apelido: "Maria Santos" }, atual)).toEqual({
      estado: "guardar", dados: { tipo: "person", nomeProprio: "Ana", apelido: "Maria Santos" },
    });
  });
});
