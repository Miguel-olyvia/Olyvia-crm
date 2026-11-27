// 27/11 (Rúben: «meter barra de pesquisa aqui», nas Operações)
import { describe, expect, it } from "vitest";
import { obraBate } from "./ObraOperacoes";
import type { Negocio } from "./motor";

const o = { id: 1050, nome: "Anabela Maria Machado Correia Schroeder", servico: "Remodelação geral", local: "", f: { morada: "Rua Rodrigo Albuquerque e Melo, 14" }, obra: {} } as unknown as Negocio;

describe("pesquisa das obras nas Operações", () => {
  it("encontra pelo cliente, sem acentos nem maiúsculas, e pela morada e o n.º", () => {
    expect(obraBate(o, "schroeder")).toBe(true);
    expect(obraBate(o, "remodelacao")).toBe(true);
    expect(obraBate(o, "albuquerque 14")).toBe(true);
    expect(obraBate(o, "1050")).toBe(true);
    expect(obraBate(o, "")).toBe(true);
  });
  it("todas as palavras têm de estar", () => {
    expect(obraBate(o, "schroeder damão")).toBe(false);
  });
});
