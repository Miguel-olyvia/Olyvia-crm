import { describe, expect, it } from "vitest";
import {
  SUGESTOES,
  TODAS_AS_SUGESTOES,
  porUsar,
  quantasPorUsar,
} from "../categorias-sugeridas";

/**
 * O que aqui se prova: que o catálogo não tem códigos repetidos (a base
 * recusa-os, e o erro apareceria no meio de vinte inserções), e que uma
 * categoria que já existe não volta a ser oferecida — nem que tenha sido
 * escrita de outra maneira.
 */

describe("o catálogo", () => {
  it("não tem códigos repetidos", () => {
    const cs = TODAS_AS_SUGESTOES.map((c) => c.codigo);
    expect(new Set(cs).size).toBe(cs.length);
  });

  it("não tem nomes repetidos", () => {
    const ns = TODAS_AS_SUGESTOES.map((c) => c.nome);
    expect(new Set(ns).size).toBe(ns.length);
  });

  // O código entra no código do equipamento (EXT-0007) e lê-se ao telefone.
  it("tem códigos curtos e em maiúsculas", () => {
    for (const c of TODAS_AS_SUGESTOES) {
      expect(c.codigo).toMatch(/^[A-Z]{2,4}$/);
    }
  });

  it("cada família diz a quem serve", () => {
    for (const f of SUGESTOES) {
      expect(f.paraQuem.trim().length).toBeGreaterThan(10);
      expect(f.categorias.length).toBeGreaterThan(0);
    }
  });
});

describe("o que já existe não se volta a oferecer", () => {
  const incendio = SUGESTOES.find((f) => f.familia.includes("incêndio"))!;

  it("com a lista vazia, oferece tudo", () => {
    expect(porUsar(incendio, [])).toHaveLength(incendio.categorias.length);
  });

  it("tira o que tem o mesmo código", () => {
    const r = porUsar(incendio, [{ codigo: "EXT", nome: "Seja lá o que for" }]);
    expect(r.map((c) => c.codigo)).not.toContain("EXT");
  });

  // Quem escreveu "extintores" à mão não quer ver "Extintores" oferecido.
  it("tira o que tem o mesmo nome, sem ligar a maiúsculas nem a acentos", () => {
    const r = porUsar(incendio, [{ codigo: "ZZZ", nome: "  extintores " }]);
    expect(r.map((c) => c.codigo)).not.toContain("EXT");
  });

  it("e o acento não engana", () => {
    const clima = SUGESTOES.find((f) => f.familia.includes("Climatização"))!;
    const r = porUsar(clima, [{ codigo: "ZZZ", nome: "termoacumuladores" }]);
    expect(r.map((c) => c.codigo)).not.toContain("TERM");
  });
});

describe("a conta do que falta", () => {
  it("com nada, é o catálogo todo", () => {
    expect(quantasPorUsar([])).toBe(TODAS_AS_SUGESTOES.length);
  });

  it("com tudo, é zero", () => {
    expect(quantasPorUsar(TODAS_AS_SUGESTOES)).toBe(0);
  });

  // O caso real de quem se queixou: duas categorias à mão, o resto por meter.
  it("com duas à mão, sobra quase tudo", () => {
    const meus = [
      { codigo: "EXT", nome: "Extintor" },
      { codigo: "SCI", nome: "Sistemas de combate" },
    ];
    expect(quantasPorUsar(meus)).toBe(TODAS_AS_SUGESTOES.length - 1);
  });
});
