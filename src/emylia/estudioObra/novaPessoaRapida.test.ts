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
