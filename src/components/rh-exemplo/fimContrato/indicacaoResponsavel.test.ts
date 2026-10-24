import { describe, expect, it } from "vitest";
import { criarEstadoInicial } from "@/components/rh-exemplo/dados/exemplo";
import { aplicarIndicacao, daEquipa, responsaveisDosContratos } from "./indicacaoResponsavel";

const estado = criarEstadoInicial();
const tiago = estado.fichas["p-tiago"];
const vinculoDoTiago = tiago.vinculos.find((v) => v.data_fim !== null)?.id ?? "";

describe("indicação do responsável", () => {
  it("guarda a indicação do ciclo e a resposta por contrato, sem mexer no contrato", () => {
    const depois = aplicarIndicacao(tiago, vinculoDoTiago, "pretendo_continuar", "2026-11-05T10:00:00Z");
    expect(depois.respostasFim[vinculoDoTiago]).toEqual({ resposta: "pretendo_continuar", em: "2026-11-05T10:00:00Z" });
    expect(depois.indicacoes.at(-1)?.resposta).toBe("pretendo_continuar");
    expect(depois.vinculos).toEqual(tiago.vinculos);
    expect(depois.renovacoes).toEqual(tiago.renovacoes);
  });

  it("a última indicação do mesmo ciclo substitui a anterior (não acumula)", () => {
    const a = aplicarIndicacao(tiago, vinculoDoTiago, "pretendo_continuar", "2026-11-05T10:00:00Z");
    const b = aplicarIndicacao(a, vinculoDoTiago, "nao_pretendo_continuar", "2026-11-06T10:00:00Z");
    const doCiclo = b.indicacoes.filter((i) => i.vinculo_id === vinculoDoTiago);
    expect(doCiclo).toHaveLength(1);
    expect(doCiclo[0].resposta).toBe("nao_pretendo_continuar");
    expect(b.respostasFim[vinculoDoTiago].resposta).toBe("nao_pretendo_continuar");
  });

  it("não inventa indicação para um contrato que não existe na ficha, nem para um sem fim", () => {
    expect(aplicarIndicacao(tiago, "nao-existe", "ainda_por_decidir", "x")).toBe(tiago);
    const semTermo = estado.fichas["p-marta"];
    const id = semTermo.vinculos[0].id;
    expect(aplicarIndicacao(semTermo, id, "ainda_por_decidir", "x")).toBe(semTermo);
  });

  it("separa a equipa por responsável", () => {
    const contratos = ["p-tiago", "p-carolina", "p-beatriz", "p-daniel"].map((pessoa_id) => ({ pessoa_id }));
    expect(responsaveisDosContratos(contratos, estado.fichas).sort()).toEqual(["p-ines", "p-rui", "p-sofia"]);
    expect(daEquipa(contratos, estado.fichas, "p-rui").map((c) => c.pessoa_id)).toEqual(["p-tiago", "p-carolina"]);
    expect(daEquipa(contratos, estado.fichas, "p-marta")).toEqual([]);
  });
});
