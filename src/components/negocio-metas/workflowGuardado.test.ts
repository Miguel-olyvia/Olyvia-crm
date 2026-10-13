import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREDEFINICAO, type ConfigWorkflow } from "./workflowNegocio";
import { CHAVE_WORKFLOW, guardarWorkflow, lerWorkflow } from "./workflowGuardado";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("workflow guardado neste navegador", () => {
  it("sem nada guardado, devolve a predefinição", () => {
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
  });
  it("guarda e volta a ler", () => {
    const c: ConfigWorkflow = {
      aoAceitarOrcamento: "perguntar", aoAceitarProposta: "criarContrato",
      fases: { proposta: true, contrato: true }, motivosPerda: ["Preço", "Obra adiada"],
    };
    guardarWorkflow(c);
    expect(lerWorkflow()).toEqual(c);
    expect(JSON.parse(window.localStorage.getItem(CHAVE_WORKFLOW) as string).versao).toBe(1);
  });
  it("lixo ou versão desconhecida devolvem a predefinição", () => {
    window.localStorage.setItem(CHAVE_WORKFLOW, "{isto não é json");
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
    window.localStorage.setItem(CHAVE_WORKFLOW, "42");
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
    window.localStorage.setItem(CHAVE_WORKFLOW, JSON.stringify({ versao: 2, aoAceitarOrcamento: "nada" }));
    expect(lerWorkflow()).toEqual(PREDEFINICAO);
  });
  it("campos inválidos são repostos um a um", () => {
    window.localStorage.setItem(
      CHAVE_WORKFLOW,
      JSON.stringify({ versao: 1, aoAceitarOrcamento: "inventada", aoAceitarProposta: "criarContrato", fases: { proposta: "sim" }, motivosPerda: "x" }),
    );
    expect(lerWorkflow()).toEqual({ ...PREDEFINICAO, aoAceitarProposta: "criarContrato" });
  });
  it("nomes herdados de objetos não valem como opção", () => {
    window.localStorage.setItem(CHAVE_WORKFLOW, JSON.stringify({ versao: 1, aoAceitarOrcamento: "constructor" }));
    expect(lerWorkflow().aoAceitarOrcamento).toBe("criarProposta");
  });
  it("normaliza no fim: um estado impossível guardado sai coerente", () => {
    window.localStorage.setItem(
      CHAVE_WORKFLOW,
      JSON.stringify({ versao: 1, aoAceitarOrcamento: "criarProposta", aoAceitarProposta: "criarContrato", fases: { proposta: false, contrato: true } }),
    );
    const c = lerWorkflow();
    expect(c.fases).toEqual({ proposta: false, contrato: false });
    expect(c.aoAceitarOrcamento).toBe("fecharGanho");
    expect(c.aoAceitarProposta).toBe("fecharSemContrato");
  });
  it("motivos estragados voltam aos predefinidos", () => {
    window.localStorage.setItem(CHAVE_WORKFLOW, JSON.stringify({ versao: 1, motivosPerda: [1, null, ""] }));
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
