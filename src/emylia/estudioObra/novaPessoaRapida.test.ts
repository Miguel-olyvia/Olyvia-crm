import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cargoParaRapida, partirNome } from "./NovaPessoaNaObra";

describe("criação rápida de um subcontratado (28/11)", () => {
  it("o nome tem de ter o apelido (ou o resto do nome da empresa)", () => {
    expect(partirNome("  Rui   Costa Lopes ")).toEqual({ primeiro: "Rui", apelido: "Costa Lopes" });
    expect(partirNome("Gás Lisboa, Lda")).toEqual({ primeiro: "Gás", apelido: "Lisboa, Lda" });
    expect(partirNome("Rui")).toBeNull();
    expect(partirNome("   ")).toBeNull();
  });
  it("o cargo: o de subempreiteiro se houver; senão o técnico com menos ofícios herdados; sem técnico, nenhum", () => {
    const cargos = [
      { id: "a", nome: "Canalizador", activo: true, tecnico_obra: true },
      { id: "b", nome: "Técnico de obra", activo: true, tecnico_obra: true },
      { id: "c", nome: "Administrativo", activo: true, tecnico_obra: false },
    ];
    const oficios = [{ cargo_id: "a" }];
    expect(cargoParaRapida(cargos, oficios)?.id).toBe("b");
    expect(cargoParaRapida([...cargos, { id: "d", nome: "Subempreiteiro", activo: true, tecnico_obra: true }], oficios)?.id).toBe("d");
    expect(cargoParaRapida([{ id: "x", nome: "Subempreiteiro", activo: false, tecnico_obra: true }, cargos[2]], [])).toBeNull();
  });
});

import { nomeDoTecnico } from "./NovaPessoaNaObra";
describe("os técnicos da empresa subcontratada", () => {
  it("só com o primeiro nome, o apelido é o da empresa", () => {
    expect(nomeDoTecnico("Rui", "Gás Lisboa, Lda")).toEqual({ primeiro: "Rui", apelido: "Gás Lisboa, Lda" });
    expect(nomeDoTecnico("Rui Costa", "Gás Lisboa")).toEqual({ primeiro: "Rui", apelido: "Costa" });
    expect(nomeDoTecnico("Rui", "")).toBeNull();
    expect(nomeDoTecnico("  ", "Gás Lisboa")).toBeNull();
  });
});

import { funcaoExiste, funcoesQueBatem, nomeDaFuncao } from "./NovaPessoaNaObra";
describe("as funções do técnico: pesquisar e criar", () => {
  const L = [{ id: "g", n: "Técnico de gás (ITG)" }, { id: "c", n: "Canalizador" }, { id: "e", n: "tecnico de eletricidade" }];
  it("pesquisa sem acentos nem maiúsculas; todas as palavras têm de estar", () => {
    expect(funcoesQueBatem(L, "gas").map((o) => o.id)).toEqual(["g"]);
    expect(funcoesQueBatem(L, "TECNICO ele").map((o) => o.id)).toEqual(["e"]);
    expect(funcoesQueBatem(L, "").length).toBe(3);
  });
  it("não oferece criar uma função que já existe; mostra com maiúscula", () => {
    expect(funcaoExiste(L, "canalizador")).toBe(true);
    expect(funcaoExiste(L, "Serralheiro")).toBe(false);
    expect(nomeDaFuncao("tecnico de eletricidade")).toBe("Tecnico de eletricidade");
  });
});
