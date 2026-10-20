// A regra do formulário de identidade: quando o nome visível não diz onde acaba o nome próprio (três ou mais palavras), o formulário avisa.
import { describe, expect, it } from "vitest";
import { formularioInicial, nomeAmbiguo, partirNome, pedidoDeIdentidade, temNomeEmPartes } from "./identidadeFormulario";

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

describe("nome em duas partes vindo da base (first_name e last_name)", () => {
  const atual = { nome: "Ana Maria Silva", tipo: "person" as const, empresaNome: null, nomeProprio: "Ana Maria", apelido: "Silva" };

  it("o formulário abre com first_name e last_name, sem partir o nome na primeira palavra", () => {
    expect(formularioInicial(atual)).toMatchObject({ nomeProprio: "Ana Maria", apelido: "Silva" });
  });

  it("temNomeEmPartes só quando os dois existem (aparados)", () => {
    expect(temNomeEmPartes(atual)).toBe(true);
    expect(temNomeEmPartes({ ...atual, apelido: null })).toBe(false);
    expect(temNomeEmPartes({ ...atual, nomeProprio: "  " })).toBe(false);
    expect(temNomeEmPartes({ nome: "Ana Lopes", tipo: "person", empresaNome: null })).toBe(false);
  });

  it("sem um dos dois, mantém o palpite da primeira palavra", () => {
    expect(formularioInicial({ ...atual, apelido: null })).toMatchObject({ nomeProprio: "Ana", apelido: "Maria Silva" });
  });

  it("sem tocar em nada não há alteração; mudar só o apelido guarda os dois", () => {
    expect(pedidoDeIdentidade({ tipo: "person", nomeEmpresa: "", nomeProprio: "Ana Maria", apelido: "Silva" }, atual)).toEqual({ estado: "semAlteracao" });
    expect(pedidoDeIdentidade({ tipo: "person", nomeEmpresa: "", nomeProprio: "Ana Maria", apelido: "Santos" }, atual)).toEqual({
      estado: "guardar", dados: { tipo: "person", nomeProprio: "Ana Maria", apelido: "Santos" },
    });
  });

  it("uma empresa ignora first_name e last_name", () => {
    expect(formularioInicial({ nome: "Obras", tipo: "organization", empresaNome: "Obras", nomeProprio: "X", apelido: "Y" })).toMatchObject({ nomeProprio: "", apelido: "", nomeEmpresa: "Obras" });
  });
});
