import { describe, expect, it } from "vitest";
import { contagens, FILTROS, filtrar, procurar } from "./filtros";

type Acesso = "ativo" | "convidado" | "semConta";

const pessoa = (nome: string, estadoAcesso: Acesso, extra: Partial<{ cargo: string | null; email: string | null; id: string | null }> = {}) => ({
  nome_completo: nome,
  cargo: extra.cargo ?? null,
  numero_interno: extra.id ?? null,
  email_trabalho: extra.email ?? null,
  estadoAcesso,
});

const GENTE = [
  pessoa("Marta Figueiredo", "ativo", { cargo: "Diretora de RH", id: "RH-0001" }),
  pessoa("João Álvaro", "semConta", { email: "joao.alvaro@x.pt" }),
  pessoa("Rui Amaral", "semConta", { cargo: "Operador" }),
  pessoa("Beatriz Lopes", "semConta"),
];

describe("os chips da lista", () => {
  it("são três: todas, com acesso e sem conta (o «Convidado» saiu, a base real nunca o produz)", () => {
    expect([...FILTROS]).toEqual(["todas", "ativo", "semConta"]);
  });
});

describe("procurar", () => {
  it("sem termo, ou só com espaços, devolve todas (e uma cópia)", () => {
    expect(procurar(GENTE, "")).toEqual(GENTE);
    expect(procurar(GENTE, "   ")).toHaveLength(4);
    expect(procurar(GENTE, "")).not.toBe(GENTE);
  });
  it("não distingue maiúsculas nem acentos", () => {
    expect(procurar(GENTE, "joao").map((p) => p.nome_completo)).toEqual(["João Álvaro"]);
    expect(procurar(GENTE, "ALVARO")).toHaveLength(1);
  });
  it("procura no cargo, no número interno e no e-mail, e ignora campos vazios", () => {
    expect(procurar(GENTE, "diretora")).toHaveLength(1);
    expect(procurar(GENTE, "rh-0001")).toHaveLength(1);
    expect(procurar(GENTE, "alvaro@x")).toHaveLength(1);
    expect(procurar(GENTE, "zzz")).toEqual([]);
  });
});

describe("filtrar e contagens", () => {
  it("o chip junta-se à pesquisa", () => {
    expect(filtrar(GENTE, "", "semConta")).toHaveLength(3);
    expect(filtrar(GENTE, "rui", "semConta")).toHaveLength(1);
    expect(filtrar(GENTE, "rui", "ativo")).toHaveLength(0);
    expect(filtrar(GENTE, "", "todas")).toHaveLength(4);
  });
  it("os números dos chips respeitam a pesquisa e não há chip «convidado»", () => {
    expect(contagens(GENTE, "")).toEqual({ todas: 4, ativo: 1, semConta: 3 });
    expect(contagens(GENTE, "rui")).toEqual({ todas: 1, ativo: 0, semConta: 1 });
    expect(Object.keys(contagens(GENTE, ""))).not.toContain("convidado");
  });
  it("uma linha com estado «convidado» (a base não a produz) só conta em «todas», nunca desaparece da lista", () => {
    const comConvidado = [...GENTE, pessoa("Ana Convidada", "convidado")];
    expect(contagens(comConvidado, "")).toEqual({ todas: 5, ativo: 1, semConta: 3 });
    expect(filtrar(comConvidado, "", "todas")).toHaveLength(5);
  });
});
