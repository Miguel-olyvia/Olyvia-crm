// O historico de ligacoes derivado das linhas de `pessoas_colocacao_organograma`.
import { describe, expect, it } from "vitest";
import { eventosDeColocacoes, type LinhaColocacao } from "@/components/rh-exemplo/organizacao/historicoDeColocacoes";

const EMP = "empresa:org-1";
const HOJE = "2026-10-26";
const linha = (id: string, no: string | null, de: string, ate: string | null, motivo: string | null = null): LinhaColocacao => ({
  id, organograma_node_id: no, valido_de: de, valido_ate: ate, motivo,
});
const resumo = (ls: LinhaColocacao[]) =>
  eventosDeColocacoes("p1", ls, EMP, HOJE).map((e) => [e.tipo, e.data, e.de?.filialId ?? null, e.para?.filialId ?? null, e.motivo]);

describe("eventosDeColocacoes", () => {
  it("sem linhas nao ha eventos", () => {
    expect(eventosDeColocacoes("p1", [], EMP, HOJE)).toEqual([]);
  });

  it("uma linha aberta e so um «ligar»", () => {
    expect(resumo([linha("a", "org-1", "2026-01-01", null, "Admissao")])).toEqual([["ligar", "2026-01-01", null, "org-1", "Admissao"]]);
  });

  it("uma sucessora colada e um «alterar» na data da sucessora, com o motivo dela", () => {
    const r = resumo([
      linha("b", "org-2", "2026-06-01", null, "Mudou para o Porto"),
      linha("a", "org-1", "2026-01-01", "2026-05-31"),
    ]);
    expect(r).toEqual([
      ["ligar", "2026-01-01", null, "org-1", ""],
      ["alterar", "2026-06-01", "org-1", "org-2", "Mudou para o Porto"],
    ]);
  });

  it("a ultima linha fechada e ja terminada e um «desligar» com o motivo da linha", () => {
    const r = resumo([linha("a", "org-1", "2026-01-01", "2026-09-30", "Fim de contrato")]);
    expect(r).toEqual([
      ["ligar", "2026-01-01", null, "org-1", "Fim de contrato"],
      ["desligar", "2026-09-30", "org-1", null, "Fim de contrato"],
    ]);
  });

  it("uma linha fechada ainda em vigor (valido_ate >= hoje) nao e um «desligar»", () => {
    expect(resumo([linha("a", "org-1", "2026-01-01", HOJE)]).map((e) => e[0])).toEqual(["ligar"]);
  });

  it("um intervalo entre linhas e «desligar» seguido de novo «ligar»", () => {
    const r = resumo([
      linha("a", "org-1", "2026-01-01", "2026-03-31", "Licenca"),
      linha("b", "org-2", "2026-07-01", null),
    ]);
    expect(r.map((e) => [e[0], e[1]])).toEqual([
      ["ligar", "2026-01-01"], ["desligar", "2026-03-31"], ["ligar", "2026-07-01"],
    ]);
  });

  it("sem classificacao (no nulo) fica com filial vazia", () => {
    expect(resumo([linha("a", null, "2026-01-01", null)])[0]![3]).toBe("");
  });

  it("ordena por inicio e dá ids unicos", () => {
    const eventos = eventosDeColocacoes("p1", [
      linha("c", "org-1", "2026-08-01", null),
      linha("a", "org-1", "2026-01-01", "2026-03-31"),
      linha("b", "org-2", "2026-04-01", "2026-07-31"),
    ], EMP, HOJE);
    expect(eventos.map((e) => e.data)).toEqual(["2026-01-01", "2026-04-01", "2026-08-01"]);
    expect(new Set(eventos.map((e) => e.id)).size).toBe(eventos.length);
    expect(eventos.every((e) => e.pessoaId === "p1")).toBe(true);
  });
});
