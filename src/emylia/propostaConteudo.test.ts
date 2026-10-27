// A proposta arrumada para o cliente (15/10/2026): grupos por fase, sem prefixos técnicos, plural certo, escolhas à parte.
import { describe, expect, it } from "vitest";
import { escolhasVisiveis, linhaDeMaterial, porFase, quantidade } from "./propostaConteudo";
import { LINHA_DEMOLICAO } from "./entulho";

describe("quantidade por extenso", () => {
  it("plural certo nas unidades contáveis, símbolo nas de medida", () => {
    expect(quantidade(1, "sacos")).toBe("1 saco");
    expect(quantidade(2, "sacos")).toBe("2 sacos");
    expect(quantidade(2, "pt")).toBe("2 pontos");
    expect(quantidade(1, "mód")).toBe("1 módulo");
    expect(quantidade(1, "un")).toBe("1 unidade");
    expect(quantidade(6, "m²")).toBe("6 m²");
    expect(quantidade(1.5, "m²")).toBe("1,5 m²");
    expect(quantidade(1, "vg")).toBe("");
  });
});

describe("as linhas de materiais, para o cliente", () => {
  it("tira os prefixos técnicos e as notas de preço", () => {
    expect(linhaDeMaterial("Levantamento · Proteção do caminho: cartão canelado (5 m)")).toEqual({ grupo: "preparacao", item: { nome: "Proteção do caminho: cartão canelado (5 m)" } });
    expect(linhaDeMaterial("Levantamento · Casa habitada: limpeza diária e arrumação (+4%)").item.nome).toBe("Casa habitada: limpeza diária e arrumação");
    expect(linhaDeMaterial("Fornecido pelo cliente · Sacos de entulho (Demolição e entulho)")).toEqual({ grupo: "cliente", item: { nome: "Sacos de entulho", det: "para demolição e entulho" } });
    expect(linhaDeMaterial("Produto · Lava-louças AMBAR 1 CUBA 40")).toEqual({ grupo: "materiais", item: { nome: "Lava-louças AMBAR 1 CUBA 40" } });
    expect(linhaDeMaterial("móveis, bancada, torneira")).toEqual({ grupo: "materiais", item: { nome: "Móveis, bancada, torneira", det: "incluídos no modelo" } });
    expect(linhaDeMaterial(LINHA_DEMOLICAO).grupo).toBe("trabalhos");
  });
});

describe("O que vamos fazer, por fase", () => {
  const P = porFase([
    { fase: 1, t: "mat", d: "Fornecido pelo cliente · Sacos de entulho (Demolição e entulho)" },
    { fase: 1, t: "mat", d: "Levantamento · Proteção do caminho: cartão canelado (5 m)" },
    { fase: 1, t: "mat", d: LINHA_DEMOLICAO },
    { fase: 2, t: "svc", nome: "Canalização", q: 2, un: "pt" },
    { fase: 3, t: "svc", nome: "Revestimento de parede", q: 1, un: "m²" },
    { fase: 3, t: "mat", d: "Fornecido pelo cliente · Sacos de entulho (Demolição e entulho)" },
    { fase: 4, t: "mat", d: "Produto · Lava-louças AMBAR 1 CUBA 40" },
    { fase: 4, t: "mat", d: "Produto · Lava-louças AMBAR 1 CUBA 40" },
  ]);
  it("agrupa cada fase em trabalhos, preparação, materiais e o que o cliente fornece, pela ordem", () => {
    expect(P.map((f) => f.fase)).toEqual([1, 2, 3, 4]);
    expect(P[0].grupos.map((g) => g.t)).toEqual(["Trabalhos", "Preparação e proteção", "Fornecido por si"]);
    expect(P[1].grupos[0].itens).toEqual([{ nome: "Canalização", det: "2 pontos" }]);
  });
  it("o que o cliente fornece aparece uma vez só, e nada se repete", () => {
    expect(P[2].grupos.map((g) => g.k)).toEqual(["trabalhos"]);
    expect(P[3].grupos[0].itens).toHaveLength(1);
  });
  it("nenhum texto leva os prefixos técnicos", () => {
    const tudo = JSON.stringify(P);
    expect(tudo).not.toMatch(/Materiais do modelo|Levantamento · |Produto · |Fornecido pelo cliente/);
  });
});

describe("as escolhas do cliente", () => {
  it("um Não não se mostra; um Sim mostra-se só com o nome", () => {
    expect(escolhasVisiveis([["Mobilidade reduzida", "Não"], ["Cores e estilo", "Preto"], ["Sanita suspensa", "Sim"]]))
      .toEqual([{ l: "Cores e estilo", v: "Preto" }, { l: "Sanita suspensa" }]);
  });
});
