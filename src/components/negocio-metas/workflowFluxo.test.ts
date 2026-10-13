import { describe, expect, it } from "vitest";
import { descreverFluxo } from "./workflowFluxo";
import { PREDEFINICAO, type ConfigWorkflow } from "./workflowNegocio";

const cfg = (parcial: Omit<Partial<ConfigWorkflow>, "fases"> & { fases?: Partial<ConfigWorkflow["fases"]> } = {}): ConfigWorkflow => ({
  ...PREDEFINICAO, ...parcial, fases: { ...PREDEFINICAO.fases, ...parcial.fases },
});
const ids = (c: ConfigWorkflow) => descreverFluxo(c).setas.map((s) => `${s.de}.${s.tipo}>${s.para}`);
const acao = (c: ConfigWorkflow, id: string) =>
  (descreverFluxo(c).setas.find((s) => s.id === id)?.rotulo.params?.acao as { chave: string }).chave.replace("businessGoals.workflow.passo.", "");

describe("descreverFluxo", () => {
  it("predefinição: quatro nós e uma seta de ganho e uma de perdido por passo", () => {
    const d = descreverFluxo(PREDEFINICAO);
    expect(d.nos.map((n) => [n.id, n.ligado])).toEqual([
      ["orcamento", true], ["proposta", true], ["contrato", true], ["ganho", true],
    ]);
    expect(ids(PREDEFINICAO)).toEqual([
      "orcamento.ganho>proposta", "orcamento.perdido>perdido",
      "proposta.ganho>contrato", "proposta.perdido>perdido",
      "contrato.ganho>ganho", "contrato.perdido>perdido",
    ]);
  });
  it("as setas de perdido dizem o destino de cada resposta; perguntar aponta ao nó a que pode levar", () => {
    const c = cfg({ orcamentoPerdido: "manterAberto", propostaPerdido: "voltarOrcamento", contratoPerdido: "voltarProposta" });
    expect(ids(c).filter((i) => i.includes(".perdido"))).toEqual([
      "orcamento.perdido>orcamento", "proposta.perdido>orcamento", "contrato.perdido>proposta",
    ]);
    const p = cfg({ orcamentoPerdido: "perguntar", propostaPerdido: "perguntar", contratoPerdido: "perguntar" });
    expect(ids(p).filter((i) => i.includes(".perdido"))).toEqual([
      "orcamento.perdido>perdido", "proposta.perdido>perdido", "contrato.perdido>perdido",
    ]);
  });
  it("só 'não faz nada' fica sem destino", () => {
    expect(ids(cfg({ orcamentoGanho: "nada" }))[0]).toBe("orcamento.ganho>null");
    expect(ids(cfg({ orcamentoGanho: "perguntar" }))[0]).toBe("orcamento.ganho>proposta");
    expect(ids(cfg({ propostaGanho: "perguntarContrato" }))[2]).toBe("proposta.ganho>contrato");
  });
  it("o rótulo leva a ação da célula", () => {
    expect(acao(PREDEFINICAO, "orcamento.perdido")).toBe("orcamentoPerdido.perderSeUltimo");
    expect(acao(cfg({ propostaPerdido: "voltarOrcamento" }), "proposta.perdido")).toBe("propostaPerdido.voltarOrcamento");
    expect(acao(PREDEFINICAO, "contrato.ganho")).toBe("contratoGanho.assinado");
    expect(descreverFluxo(PREDEFINICAO).setas[1].rotulo.chave).toContain("seta.perdido");
  });
  it("Proposta desligada: o Orçamento vai direto a Ganho e só ficam as setas do Orçamento", () => {
    const c = cfg({ fases: { proposta: false } });
    expect(ids(c)).toEqual(["orcamento.ganho>ganho", "orcamento.perdido>perdido"]);
    expect(descreverFluxo(c).nos.filter((n) => !n.ligado).map((n) => n.id)).toEqual(["proposta", "contrato"]);
  });
  it("Contrato desligado: a Proposta vai a Ganho sem contrato", () => {
    const c = cfg({ fases: { contrato: false } });
    expect(ids(c)).toEqual([
      "orcamento.ganho>proposta", "orcamento.perdido>perdido", "proposta.ganho>ganho", "proposta.perdido>perdido",
    ]);
  });
  it("as frases descrevem cada seta, as fases desligadas e o motivo de perda", () => {
    const f = descreverFluxo(cfg({ fases: { proposta: false } })).frases.map((x) => x.chave);
    expect(f.filter((k) => k.includes("frase.ganho")).length).toBe(1);
    expect(f.filter((k) => k.includes("frase.perdido")).length).toBe(1);
    expect(f.some((k) => k.includes("frase.propostaOff"))).toBe(true);
    expect(f.some((k) => k.includes("frase.contratoOff"))).toBe(true);
    expect(f.at(-1)).toContain("frase.motivo");
    expect(descreverFluxo(PREDEFINICAO).frases).toHaveLength(7);
  });
});
