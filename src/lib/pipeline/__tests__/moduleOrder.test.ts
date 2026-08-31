import { describe, it, expect } from "vitest";
import { isTerminal, normalizeModuleOrder, reorderPipelineModules } from "../moduleOrder";

const M = (id: string, enabled = true, terminal?: boolean) => ({ id, enabled, terminal });

// A ordem que nike e Mudelar têm guardada hoje (lida na base a 2026-08-31).
const REAL = [M("pedido"), M("orcamento"), M("proposta"), M("contrato"), M("cliente")];

describe("isTerminal", () => {
  it("reconhece o cliente sem a propriedade, para as configurações já guardadas", () => {
    expect(isTerminal(M("cliente"))).toBe(true);
    expect(isTerminal(M("pedido"))).toBe(false);
  });

  it("a propriedade explícita manda, para o terminal poder um dia ter outro nome", () => {
    expect(isTerminal(M("entrega", true, true))).toBe(true);
    expect(isTerminal(M("cliente", true, false))).toBe(false);
  });
});

describe("normalizeModuleOrder", () => {
  it("não mexe na ordem real de nike e Mudelar", () => {
    expect(normalizeModuleOrder(REAL).map((m) => m.id)).toEqual(
      ["pedido", "orcamento", "proposta", "contrato", "cliente"],
    );
  });

  it("corrige uma configuração já torta, sem migração", () => {
    const torta = [M("cliente"), M("pedido"), M("orcamento")];
    expect(normalizeModuleOrder(torta).map((m) => m.id)).toEqual(["pedido", "orcamento", "cliente"]);
  });

  it("preserva a ordem relativa dos não-terminais", () => {
    const baralhada = [M("contrato"), M("cliente"), M("pedido")];
    expect(normalizeModuleOrder(baralhada).map((m) => m.id)).toEqual(["contrato", "pedido", "cliente"]);
  });
});

describe("reorderPipelineModules", () => {
  it("reordena normalmente entre não-terminais", () => {
    const r = reorderPipelineModules(REAL, "proposta", "orcamento");
    expect(r.map((m) => m.id)).toEqual(["pedido", "proposta", "orcamento", "contrato", "cliente"]);
  });

  it("recusa arrastar o próprio cliente, e devolve o array inalterado", () => {
    const r = reorderPipelineModules(REAL, "cliente", "pedido");
    expect(r).toBe(REAL); // identidade: o chamador não escreve nada
  });

  it("recusa largar um módulo DEPOIS do cliente -- limita à última posição livre", () => {
    const r = reorderPipelineModules(REAL, "pedido", "cliente");
    expect(r.map((m) => m.id)).toEqual(["orcamento", "proposta", "contrato", "pedido", "cliente"]);
    expect(isTerminal(r[r.length - 1])).toBe(true);
  });

  it("o cliente fica em último em qualquer reordenação possível", () => {
    const ids = ["pedido", "orcamento", "proposta", "contrato", "cliente"];
    for (const a of ids) {
      for (const b of ids) {
        const r = reorderPipelineModules(REAL, a, b);
        expect(r[r.length - 1].id).toBe("cliente");
      }
    }
  });

  it("gesto nulo e ids desconhecidos devolvem o array inalterado", () => {
    expect(reorderPipelineModules(REAL, "pedido", "pedido")).toBe(REAL);
    expect(reorderPipelineModules(REAL, "nao-existe", "pedido")).toBe(REAL);
  });
});
