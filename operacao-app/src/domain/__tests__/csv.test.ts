import { describe, expect, it } from "vitest";
import { celula, nomeDeFicheiro, paraCSV } from "../csv";

describe("uma célula, como o Excel português a quer", () => {
  it("um número usa vírgula decimal", () => {
    // Com ponto, o Excel português lê 12.5 como texto ou como doze mil e
    // quinhentos. Nenhuma das duas é o valor que o técnico leu.
    expect(celula(12.5)).toBe("12,5");
    expect(celula(-0.25)).toBe("-0,25");
  });

  it("um inteiro fica inteiro", () => {
    expect(celula(46100)).toBe("46100");
  });

  it("um booleano sai em português, não como true", () => {
    expect(celula(true)).toBe("Sim");
    expect(celula(false)).toBe("Não");
  });

  it("vazio é vazio — nunca a palavra null", () => {
    expect(celula(null)).toBe("");
    expect(celula(undefined)).toBe("");
    expect(celula(Number.NaN)).toBe("");
  });

  it("um texto com ponto e vírgula vai entre aspas", () => {
    // Sem isto, "Silva; Costa Lda" partia-se em duas colunas e desalinhava
    // a linha inteira a partir dali.
    expect(celula("Silva; Costa Lda")).toBe('"Silva; Costa Lda"');
  });

  it("as aspas lá dentro duplicam-se", () => {
    expect(celula('O portão dito "novo"')).toBe('"O portão dito ""novo"""');
  });

  it("uma mudança de linha também obriga a aspas", () => {
    expect(celula("primeira\nsegunda")).toBe('"primeira\nsegunda"');
  });

  it("um texto normal fica como está", () => {
    expect(celula("Extintor 3")).toBe("Extintor 3");
  });
});

describe("o ficheiro inteiro", () => {
  const csv = paraCSV(
    ["Data", "Equipamento", "Valor", "Conforme"],
    [["10/01/2026", "Extintor 3", 12.5, true]]
  );

  it("começa com o BOM — sem ele os acentos partem-se no Excel", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("declara o separador logo a seguir", () => {
    expect(csv.slice(1)).toMatch(/^sep=;\r\n/);
  });

  it("separa com ponto e vírgula, não com vírgula", () => {
    expect(csv).toContain("Data;Equipamento;Valor;Conforme");
  });

  it("as linhas acabam em CRLF", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3); // sep + cabeçalho + 1
  });

  it("os valores vêm formatados", () => {
    expect(csv).toContain("10/01/2026;Extintor 3;12,5;Sim");
  });

  it("um ficheiro sem linhas ainda leva o cabeçalho", () => {
    const vazio = paraCSV(["Data", "Valor"], []);
    expect(vazio).toContain("Data;Valor");
  });
});

describe("o nome do ficheiro", () => {
  it("tira acentos e espaços", () => {
    expect(nomeDeFicheiro("Medições", "Pressão do extintor")).toBe(
      "medicoes-pressao-do-extintor.csv"
    );
  });

  it("tira o que o Windows recusa", () => {
    // Dois pontos e barra fazem o Windows recusar o ficheiro, com um erro
    // que não diz porquê.
    expect(nomeDeFicheiro("Janeiro: 01/2026")).toBe("janeiro-01-2026.csv");
  });

  it("ignora partes vazias em vez de deixar hífens soltos", () => {
    expect(nomeDeFicheiro("medicoes", null, "  ", "2026")).toBe("medicoes-2026.csv");
  });

  it("nunca devolve um nome vazio", () => {
    expect(nomeDeFicheiro("///")).toBe("exportacao.csv");
    expect(nomeDeFicheiro()).toBe("exportacao.csv");
  });
});
