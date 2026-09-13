/**
 * O aviso de nome parecido ao criar um centro (`centrosSimilaridade.ts`).
 *
 * O requisito central e o que NAO pode acontecer: "Worten" e "Worten Colombo"
 * sao dois sitios legitimos e distintos, e por isso `nomesParecidos` tem de
 * avisar sobre eles (contencao de substring) sem nunca os tratar como
 * identicos nem impedir a criacao -- quem decide e sempre quem esta a criar.
 * A distancia de Levenshtein cobre o outro caso, o erro de escrita
 * ("Wortem"), que a contencao de substring nao apanha.
 */
import { describe, it, expect } from "vitest";
import { encontrarNomeParecido, nomesParecidos } from "@/lib/hr/centrosSimilaridade";

describe("nomesParecidos", () => {
  it("avisa quando um nome contem o outro por inteiro", () => {
    expect(nomesParecidos("Worten", "Worten Colombo")).toBe(true);
    expect(nomesParecidos("Worten Colombo", "Worten")).toBe(true);
  });

  it("avisa num erro de escrita perto do original", () => {
    expect(nomesParecidos("Wortem", "Worten")).toBe(true);
  });

  it("nao avisa entre nomes claramente diferentes", () => {
    expect(nomesParecidos("Escritorio Porto", "Escritorio Lisboa")).toBe(false);
    expect(nomesParecidos("Armazem Central", "Loja Cascais")).toBe(false);
  });

  it("ignora maiusculas, acentos e espacos nas pontas -- mas nao considera identico o que so difira nisso", () => {
    // "Porto" e "porto " sao, na pratica, o MESMO nome (o indice unico da
    // base ja os recusa como duplicados); a comparacao aqui devolve false
    // por serem iguais apos normalizar, nao porque sejam "parecidos mas
    // diferentes" -- esse caso nunca chega a este aviso.
    expect(nomesParecidos("Porto", "porto ")).toBe(false);
    expect(nomesParecidos("Sao Joao", "São João")).toBe(false);
  });

  it("dois nomes vazios ou iguais nao geram aviso", () => {
    expect(nomesParecidos("", "Worten")).toBe(false);
    expect(nomesParecidos("Worten", "")).toBe(false);
    expect(nomesParecidos("Worten", "Worten")).toBe(false);
  });
});

describe("encontrarNomeParecido", () => {
  const existentes = [
    { id: "1", nome: "Worten Colombo" },
    { id: "2", nome: "Escritorio Lisboa" },
  ];

  it("devolve o primeiro existente parecido", () => {
    expect(encontrarNomeParecido("Worten", existentes)).toEqual({ id: "1", nome: "Worten Colombo" });
  });

  it("devolve null quando nada e parecido", () => {
    expect(encontrarNomeParecido("Armazem Novo", existentes)).toBeNull();
  });

  it("ignora o proprio id ao editar (idAIgnorar)", () => {
    expect(encontrarNomeParecido("Worten Colombo", existentes, "1")).toBeNull();
  });
});
