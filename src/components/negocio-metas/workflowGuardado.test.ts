import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREDEFINICAO, type ConfigWorkflow } from "./workflowNegocio";
import { CHAVE_WORKFLOW, guardarWorkflow, lerWorkflow } from "./workflowGuardado";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const guardado = (valor: unknown) => window.localStorage.setItem(CHAVE_WORKFLOW, JSON.stringify(valor));

describe("workflow guardado neste navegador", () => {
  it("sem nada guardado, devolve a predefinição", () => {
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
  });
  it("guarda a versão 2 e volta a ler", () => {
    const c: ConfigWorkflow = {
      fases: { proposta: true, contrato: true }, orcamentoGanho: "perguntar", orcamentoPerdido: "manterAberto",
      propostaGanho: "criarContrato", propostaPerdido: "voltarOrcamento", contratoPerdido: "voltarProposta",
      motivosPerda: ["Preço", "Obra adiada"],
    };
    guardarWorkflow(c);
    expect(lerWorkflow()).toEqual(c);
    expect(JSON.parse(window.localStorage.getItem(CHAVE_WORKFLOW) as string).versao).toBe(2);
  });
  it("lixo, versão desconhecida ou sem versão devolvem a predefinição, sem lançar", () => {
    window.localStorage.setItem(CHAVE_WORKFLOW, "{isto não é json");
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
    window.localStorage.setItem(CHAVE_WORKFLOW, "42");
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
    guardado({ versao: 3, orcamentoGanho: "nada" });
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
    guardado({ orcamentoGanho: "nada" });
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
    guardado(null);
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
  });
  it("campos inválidos da versão 2 são repostos um a um", () => {
    guardado({ versao: 2, orcamentoGanho: "inventada", propostaGanho: "criarContrato", orcamentoPerdido: 7, fases: { proposta: "sim" }, motivosPerda: "x" });
    expect(lerWorkflow()).toEqual({ ...PREDEFINICAO, propostaGanho: "criarContrato" });
  });
  it("nomes herdados de objetos não valem como opção", () => {
    guardado({ versao: 2, orcamentoGanho: "constructor", contratoPerdido: "toString" });
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
  });
  it("uma opção de outra célula não vale (voltarProposta no perdido da Proposta)", () => {
    guardado({ versao: 2, propostaPerdido: "voltarProposta" });
    expect(lerWorkflow().propostaPerdido).toBe("perderNegocio");
  });
  it("normaliza no fim: um estado impossível guardado sai coerente", () => {
    guardado({ versao: 2, orcamentoGanho: "criarProposta", propostaGanho: "criarContrato", propostaPerdido: "perguntar", fases: { proposta: false, contrato: true } });
    const c = lerWorkflow();
    expect(c.fases).toEqual({ proposta: false, contrato: false });
    expect(c.orcamentoGanho).toBe("fecharGanho");
    expect(c.propostaGanho).toBe(PREDEFINICAO.propostaGanho);
    expect(c.propostaPerdido).toBe(PREDEFINICAO.propostaPerdido);
  });
  it("motivos estragados voltam aos predefinidos", () => {
    guardado({ versao: 2, motivosPerda: [1, null, ""] });
    expect(lerWorkflow().motivosPerda).toEqual(PREDEFINICAO.motivosPerda);
  });
  it("devolve sempre uma cópia: alterá-la não mexe na predefinição", () => {
    const c = lerWorkflow();
    c.motivosPerda.push("Extra");
    c.fases.proposta = false;
    expect(PREDEFINICAO.motivosPerda).not.toContain("Extra");
    expect(PREDEFINICAO.fases.proposta).toBe(true);
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
  });
  it("funciona quando o armazenamento falha", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
    expect(() => guardarWorkflow(PREDEFINICAO)).not.toThrow();
  });
});

describe("migração da versão 1", () => {
  it("'ao aceitar' passa a 'ganho'; fases e motivos mantêm-se; o perdido fica no defeito", () => {
    guardado({
      versao: 1, aoAceitarOrcamento: "perguntar", aoAceitarProposta: "criarContrato",
      fases: { proposta: true, contrato: true }, motivosPerda: ["Preço", "Obra adiada"],
    });
    expect(lerWorkflow()).toEqual({
      ...PREDEFINICAO, orcamentoGanho: "perguntar", propostaGanho: "criarContrato", motivosPerda: ["Preço", "Obra adiada"],
    });
  });
  it("mantém as fases desligadas (e normaliza as células)", () => {
    guardado({ versao: 1, aoAceitarOrcamento: "fecharGanho", aoAceitarProposta: "fecharSemContrato", fases: { proposta: true, contrato: false } });
    expect(lerWorkflow()).toMatchObject({ fases: { proposta: true, contrato: false }, orcamentoGanho: "fecharGanho", propostaGanho: "fecharSemContrato" });
  });
  it("campos estragados da versão 1 voltam ao defeito", () => {
    guardado({ versao: 1, aoAceitarOrcamento: "constructor", aoAceitarProposta: 3, motivosPerda: "x" });
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
  });
  it("depois de migrar, ao guardar fica a versão 2", () => {
    guardado({ versao: 1, aoAceitarOrcamento: "nada" });
    guardarWorkflow(lerWorkflow());
    const lido = JSON.parse(window.localStorage.getItem(CHAVE_WORKFLOW) as string);
    expect(lido).toMatchObject({ versao: 2, orcamentoGanho: "nada", orcamentoPerdido: "perderSeUltimo" });
    expect(lido).not.toHaveProperty("aoAceitarOrcamento");
  });
});
