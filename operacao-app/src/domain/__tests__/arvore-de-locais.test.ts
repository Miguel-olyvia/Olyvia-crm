import { describe, expect, it } from "vitest";
import {
  arvoreDe,
  comTudoLaDentro,
  raizDe,
  ramoAte,
} from "../arvore-de-locais";

/**
 * O que aqui se prova: que uma página aberta em qualquer degrau sabe sempre
 * qual é a morada, que traz tudo o que pende dela numa ida só, e que dados
 * errados — um pai que não existe, um ciclo — não penduram o ecrã.
 */

interface L {
  id: string;
  parent_id: string | null;
  nome: string;
}

const l = (id: string, parent_id: string | null, nome = id): L => ({
  id,
  parent_id,
  nome,
});

// Torre A
//   Garagem
//     Box 12
//   Piso 3
// Armazém  (outra morada, não pode aparecer)
const TORRE: L[] = [
  l("torre", null, "Torre A"),
  l("garagem", "torre", "Garagem −1"),
  l("box", "garagem", "Box 12"),
  l("piso3", "torre", "Piso 3"),
  l("armazem", null, "Armazém"),
];

describe("qual é a morada", () => {
  it("de um espaço lá no fundo", () => {
    expect(raizDe(TORRE, "box")?.id).toBe("torre");
  });

  it("da própria morada é ela mesma", () => {
    expect(raizDe(TORRE, "torre")?.id).toBe("torre");
  });

  it("de um id que não existe é nada", () => {
    expect(raizDe(TORRE, "nao-existe")).toBeNull();
  });

  // Um espaço cujo pai foi apagado passa a ser a raiz. A alternativa era a
  // página não abrir de todo, e o sítio ficar inalcançável.
  it("com o pai em falta, é o próprio", () => {
    const orfao = [l("solto", "pai-que-sumiu")];
    expect(raizDe(orfao, "solto")?.id).toBe("solto");
  });

  it("com um ciclo, pára em vez de dar a volta para sempre", () => {
    const ciclo = [l("a", "b"), l("b", "a")];
    expect(raizDe(ciclo, "a")).not.toBeNull();
  });
});

describe("o que pende de uma morada", () => {
  it("traz tudo, a qualquer profundidade", () => {
    const ids = comTudoLaDentro(TORRE, "torre").map((x) => x.id);
    expect(ids).toContain("torre");
    expect(ids).toContain("garagem");
    expect(ids).toContain("box");
    expect(ids).toContain("piso3");
  });

  it("e não traz o que é de outra morada", () => {
    expect(comTudoLaDentro(TORRE, "torre").map((x) => x.id)).not.toContain("armazem");
  });

  it("a partir de um espaço, traz só a parte dele", () => {
    expect(comTudoLaDentro(TORRE, "garagem").map((x) => x.id)).toEqual([
      "garagem",
      "box",
    ]);
  });

  it("de um id que não existe, traz nada", () => {
    expect(comTudoLaDentro(TORRE, "nao-existe")).toEqual([]);
  });

  it("com um ciclo, não fica preso", () => {
    const ciclo = [l("a", "b"), l("b", "a")];
    expect(comTudoLaDentro(ciclo, "a")).toHaveLength(2);
  });
});

describe("a árvore", () => {
  const porNome = (a: L, b: L) => a.nome.localeCompare(b.nome, "pt");

  it("pendura os filhos onde eles pertencem", () => {
    const t = arvoreDe(TORRE, "torre", porNome)!;
    expect(t.filhos.map((f) => f.id)).toEqual(["garagem", "piso3"]);
    expect(t.filhos[0].filhos.map((f) => f.id)).toEqual(["box"]);
  });

  // Uma lista que salta de ordem entre visitas é uma lista que ninguém segue.
  it("por a ordem que se pedir, e sempre a mesma", () => {
    const t = arvoreDe(TORRE, "torre", porNome)!;
    const outra = arvoreDe([...TORRE].reverse(), "torre", porNome)!;
    expect(t.filhos.map((f) => f.nome)).toEqual(outra.filhos.map((f) => f.nome));
  });

  it("de um id que não existe é nada", () => {
    expect(arvoreDe(TORRE, "nao-existe")).toBeNull();
  });
});

describe("o ramo até um espaço", () => {
  // Quem chega por um link a um espaço lá no fundo tem de o ver aberto.
  it("são os pais, de cima para baixo, sem o próprio", () => {
    expect(ramoAte(TORRE, "box")).toEqual(["torre", "garagem"]);
  });

  it("da própria morada é vazio", () => {
    expect(ramoAte(TORRE, "torre")).toEqual([]);
  });

  it("com um ciclo, não fica preso", () => {
    const ciclo = [l("a", "b"), l("b", "a")];
    expect(ramoAte(ciclo, "a").length).toBeLessThanOrEqual(2);
  });
});
