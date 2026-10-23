// As consequências dos seis acontecimentos, em forma pura: ler o estado da cadeia como o motor o lê, a recusa do orçamento, os parâmetros das duas
// funções da base (parâmetros pela assinatura real de neg_guardar_cadeia) e o que elas devolvem.
import { describe, expect, it } from "vitest";
import {
  criaContratoEfetivo, criaPropostaEfetivo, lerRecusaOrcamento, lerResultadoCadeia, lerResultadoRecusaOrcamento, paraEnvioCadeia,
  paraEnvioRecusaOrcamento, RECUSAS_ORCAMENTO,
} from "./consequencias";

const F = "fase-1";
const linha = (extra: Record<string, unknown> = {}) => ({ stage_id: F, action_type: "create_proposal", is_active: true, ...extra });

describe("RECUSAS_ORCAMENTO", () => {
  it("são as duas escolhas do CHECK da base, a omissão primeiro", () => {
    expect(RECUSAS_ORCAMENTO).toEqual(["perder_se_ultimo", "manter_aberto"]);
  });
});

describe("lerRecusaOrcamento", () => {
  it("lê as duas escolhas", () => {
    expect(lerRecusaOrcamento({ recusa_orcamento: "manter_aberto" })).toBe("manter_aberto");
    expect(lerRecusaOrcamento({ recusa_orcamento: "perder_se_ultimo" })).toBe("perder_se_ultimo");
  });
  it("sem linha (organização sem configuração) devolve null", () => {
    expect(lerRecusaOrcamento(null)).toBeNull();
    expect(lerRecusaOrcamento(undefined)).toBeNull();
  });
  it("um valor que a base não aceita não se mostra como bom: lança", () => {
    expect(() => lerRecusaOrcamento({ recusa_orcamento: "perder" })).toThrow();
    expect(() => lerRecusaOrcamento({ recusa_orcamento: null })).toThrow();
    expect(() => lerRecusaOrcamento({})).toThrow();
    expect(() => lerRecusaOrcamento("manter_aberto")).toThrow();
  });
});

describe("criaPropostaEfetivo (orçamento aceite)", () => {
  it("é verdadeiro com uma linha ativa create_proposal na fase", () => {
    expect(criaPropostaEfetivo([linha()], F)).toBe(true);
  });
  it("é falso sem linhas, com a linha inativa, de outra fase ou de outra ação", () => {
    expect(criaPropostaEfetivo([], F)).toBe(false);
    expect(criaPropostaEfetivo([linha({ is_active: false })], F)).toBe(false);
    expect(criaPropostaEfetivo([linha({ stage_id: "outra" })], F)).toBe(false);
    expect(criaPropostaEfetivo([linha({ action_type: "create_contract" })], F)).toBe(false);
  });
  it("linhas repetidas: basta uma ativa", () => {
    expect(criaPropostaEfetivo([linha({ is_active: false }), linha()], F)).toBe(true);
  });
  it("sem fase conhecida, ou com um formato que não é lista, é desconhecido (null)", () => {
    expect(criaPropostaEfetivo([linha()], null)).toBeNull();
    expect(criaPropostaEfetivo(null, F)).toBeNull();
    expect(criaPropostaEfetivo({}, F)).toBeNull();
  });
});

describe("criaContratoEfetivo (proposta aceite)", () => {
  const c = (extra: Record<string, unknown> = {}) => linha({ action_type: "create_contract", ...extra });
  it("verdadeiro com create_contract ativo na fase", () => {
    expect(criaContratoEfetivo([c()], F)).toBe(true);
  });
  it("a nike tem outras linhas inativas na fase: só a create_contract ativa conta", () => {
    expect(criaContratoEfetivo([linha({ action_type: "convert_to_client", is_active: false }), c()], F)).toBe(true);
    expect(criaContratoEfetivo([linha({ action_type: "convert_to_client", is_active: true })], F)).toBe(false);
    expect(criaContratoEfetivo([c({ is_active: false })], F)).toBe(false);
  });
  it("sem linhas é falso; sem fase ou sem lista é desconhecido", () => {
    expect(criaContratoEfetivo([], F)).toBe(false);
    expect(criaContratoEfetivo([c()], null)).toBeNull();
    expect(criaContratoEfetivo(undefined, F)).toBeNull();
  });
});

describe("parâmetros das funções", () => {
  it("neg_guardar_cadeia leva os três parâmetros com os nomes da assinatura real", () => {
    expect(paraEnvioCadeia("org-1", true, false)).toEqual({
      p_organization_id: "org-1", p_orcamento_cria_proposta: true, p_proposta_cria_contrato: false,
    });
  });
  it("neg_guardar_recusa_orcamento leva a organização e o valor", () => {
    expect(paraEnvioRecusaOrcamento("org-1", "manter_aberto")).toEqual({ p_organization_id: "org-1", p_valor: "manter_aberto" });
  });
});

describe("lerResultadoCadeia", () => {
  it("lê mudou e o depois efetivo", () => {
    expect(lerResultadoCadeia({ mudou: true, depois: { orcamento_cria_proposta: true, proposta_cria_contrato: false, contrato_assinado_cria_nada: true } }))
      .toEqual({ mudou: true, depois: { orcamentoCriaProposta: true, propostaCriaContrato: false } });
  });
  it("uma resposta que não se reconhece dá depois null e só true conta como mudou", () => {
    expect(lerResultadoCadeia(null)).toEqual({ mudou: false, depois: null });
    expect(lerResultadoCadeia({ mudou: "true", depois: { orcamento_cria_proposta: "sim", proposta_cria_contrato: false } })).toEqual({ mudou: false, depois: null });
    expect(lerResultadoCadeia({ mudou: true, depois: [] })).toEqual({ mudou: true, depois: null });
  });
});

describe("lerResultadoRecusaOrcamento", () => {
  it("lê mudou e o depois", () => {
    expect(lerResultadoRecusaOrcamento({ mudou: true, depois: { recusa_orcamento: "manter_aberto" } })).toEqual({ mudou: true, depois: "manter_aberto" });
  });
  it("sem resposta reconhecível, depois null e mudou false", () => {
    expect(lerResultadoRecusaOrcamento(undefined)).toEqual({ mudou: false, depois: null });
    expect(lerResultadoRecusaOrcamento({ mudou: true, depois: { recusa_orcamento: "x" } })).toEqual({ mudou: true, depois: null });
  });
});
