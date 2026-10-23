import { describe, expect, it } from "vitest";
import { alternarOrdem, ariaSort, ordenarPor } from "./funcOrdenar";

describe("ordenarPor", () => {
  const itens = [
    { n: "Bruno", v: 10 }, { n: "ágata", v: null }, { n: "Ana", v: 10 }, { n: "Zé", v: 5 }, { n: "", v: 20 }, { n: "Álvaro", v: undefined },
  ];
  it("é estável: em empate fica a ordem de entrada (nas duas direções)", () => {
    expect(ordenarPor(itens, (x) => x.v, "asc").map((x) => x.n)).toEqual(["Zé", "Bruno", "Ana", "", "ágata", "Álvaro"]);
    expect(ordenarPor(itens, (x) => x.v, "desc").map((x) => x.n)).toEqual(["", "Bruno", "Ana", "Zé", "ágata", "Álvaro"]);
  });
  it("os vazios (null, undefined, texto vazio, NaN) vão sempre para o fim, pela ordem de entrada", () => {
    expect(ordenarPor(itens, (x) => x.n, "asc").map((x) => x.n)).toEqual(["ágata", "Álvaro", "Ana", "Bruno", "Zé", ""]);
    expect(ordenarPor(itens, (x) => x.n, "desc").map((x) => x.n)).toEqual(["Zé", "Bruno", "Ana", "Álvaro", "ágata", ""]);
    expect(ordenarPor([{ v: Number.NaN }, { v: 1 }], (x) => x.v, "asc").map((x) => x.v)).toEqual([1, Number.NaN]);
  });
  it("o texto segue a ordem portuguesa, sem ligar a maiúsculas e acentos, e os números dentro do texto", () => {
    expect(ordenarPor(["casa 10", "Casa 2", "çapato", "Cão"], (x) => x, "asc")).toEqual(["Cão", "çapato", "Casa 2", "casa 10"]);
  });
  it("não muda a lista recebida", () => {
    const l = [3, 1, 2], antes = [...l];
    ordenarPor(l, (x) => x, "asc");
    expect(l).toEqual(antes);
  });
});

describe("cabeçalhos que ordenam", () => {
  it("carregar na mesma coluna troca a direção; noutra começa pela direção dela", () => {
    const a = alternarOrdem(null, "pessoa");
    expect(a).toEqual({ coluna: "pessoa", dir: "asc" });
    expect(alternarOrdem(a, "pessoa")).toEqual({ coluna: "pessoa", dir: "desc" });
    expect(alternarOrdem(a, "valor")).toEqual({ coluna: "valor", dir: "desc" });
  });
  it("aria-sort só na coluna escolhida", () => {
    const o = { coluna: "contacto", dir: "desc" } as const;
    expect(ariaSort(o, "contacto")).toBe("descending");
    expect(ariaSort({ ...o, dir: "asc" }, "contacto")).toBe("ascending");
    expect(ariaSort(o, "pessoa")).toBe("none");
    expect(ariaSort(null, "pessoa")).toBe("none");
  });
});
