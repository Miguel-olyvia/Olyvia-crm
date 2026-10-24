// Os passos «registar a resposta do cliente» e «registar a assinatura»: reaproveitam `aplicarEvento` (o Workflow decide o que acontece) e
// recusar a proposta perde SEMPRE o negócio, com motivo. Funções puras: devolvem o que passa a valer, e quem as chama grava.
import { describe, expect, it } from "vitest";
import { faseDoNegocio, isNegocioGanho, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { copiarConfig, PREDEFINICAO } from "@/components/negocio-metas/workflowNegocio";
import { negocioBase, pessoaBase, resumoBase } from "../fabricaTestes";
import { itensDaPessoa } from "./itensProcesso";
import type { ItemProcesso } from "./tiposProcesso";
import { registarAssinatura, registarResposta } from "./transicoesContrato";

const HOJE = "2026-10-13";
const orcamentos = [{ id: "o1", valor: 1000, escolhido: true }];
const emProposta = (extra: Partial<NegocioMes> = {}): NegocioMes => negocioBase("n1", { orcamentos, proposta: { estado: "enviada" }, ...extra });
const emContrato = (): NegocioMes => negocioBase("n1", { orcamentos, proposta: { estado: "aceite" }, contrato: { estado: "pendente" } });
const itemDe = (negocio: NegocioMes): ItemProcesso => itensDaPessoa(resumoBase(pessoaBase("a"), [negocio], HOJE), HOJE)[0];
const config = (parcial: Partial<typeof PREDEFINICAO> = {}) => ({ ...copiarConfig(PREDEFINICAO), ...parcial });

describe("registarResposta: o cliente aceitou", () => {
  it("com a predefinição (pergunta se cria o contrato) sem escolha, falta a escolha", () => {
    const n = emProposta();
    expect(registarResposta(n, itemDe(n), { resposta: "aceite" }, config(), HOJE)).toEqual({ ok: false, emFalta: ["escolhaEmFalta"] });
  });

  it("escolhendo criar o contrato, o negócio passa a Contrato (pendente)", () => {
    const n = emProposta();
    const r = registarResposta(n, itemDe(n), { resposta: "aceite", escolha: "criarContrato" }, config(), HOJE);
    expect(r).toMatchObject({ ok: true, aplicacao: { tipo: "curso" } });
    if (r.ok) {
      expect(faseDoNegocio(r.aplicacao.negocio)).toBe("contrato");
      expect(r.aplicacao.negocio.contrato).toEqual({ estado: "pendente" });
    }
  });

  it("escolhendo fechar sem contrato, o negócio fica ganho", () => {
    const n = emProposta();
    const r = registarResposta(n, itemDe(n), { resposta: "aceite", escolha: "fecharSemContrato" }, config(), HOJE);
    expect(r).toMatchObject({ ok: true, aplicacao: { tipo: "ganho" } });
  });

  it("quando o Workflow já decide (cria sempre o contrato), não pergunta nada", () => {
    const n = emProposta();
    const r = registarResposta(n, itemDe(n), { resposta: "aceite" }, config({ propostaGanho: "criarContrato" }), HOJE);
    expect(r).toMatchObject({ ok: true, aplicacao: { tipo: "curso" } });
  });

  it("não altera o negócio que recebe", () => {
    const n = Object.freeze(emProposta());
    expect(() => registarResposta(n, itemDe(n), { resposta: "aceite", escolha: "criarContrato" }, config(), HOJE)).not.toThrow();
    expect(n.contrato).toBeNull();
  });
});

describe("registarResposta: o cliente recusou", () => {
  it("sem motivo falta o motivo; com motivo o negócio perde-se, e o motivo vai aparado", () => {
    const n = emProposta();
    expect(registarResposta(n, itemDe(n), { resposta: "recusada", motivo: "  " }, config(), HOJE)).toEqual({ ok: false, emFalta: ["motivoEmFalta"] });
    expect(registarResposta(n, itemDe(n), { resposta: "recusada" }, config(), HOJE)).toEqual({ ok: false, emFalta: ["motivoEmFalta"] });
    const r = registarResposta(n, itemDe(n), { resposta: "recusada", motivo: " Preço " }, config(), HOJE);
    expect(r).toEqual({ ok: true, aplicacao: { tipo: "perdido", negocio: n, motivo: "Preço" } });
  });

  it("perde SEMPRE o negócio: mesmo que o Workflow diga «voltar ao orçamento» ou «perguntar»", () => {
    const n = emProposta();
    for (const propostaPerdido of ["voltarOrcamento", "perguntar"] as const) {
      const r = registarResposta(n, itemDe(n), { resposta: "recusada", motivo: "Adiou" }, config({ propostaPerdido }), HOJE);
      expect(r, propostaPerdido).toMatchObject({ ok: true, aplicacao: { tipo: "perdido", motivo: "Adiou" } });
    }
  });
});

describe("registarResposta: fora do passo", () => {
  it("num negócio que não está à espera de resposta (Orçamento, rascunho, Contrato) não se aplica, sem nada a explicar", () => {
    for (const n of [negocioBase("n1", { orcamentos }), emProposta({ proposta: { estado: "rascunho" } }), emContrato()]) {
      expect(registarResposta(n, itemDe(n), { resposta: "aceite", escolha: "criarContrato" }, config(), HOJE)).toEqual({ ok: false, emFalta: [] });
    }
  });
});

describe("registarAssinatura", () => {
  it("o contrato assinado fecha o negócio como ganho", () => {
    const n = emContrato();
    const r = registarAssinatura(n, itemDe(n), config(), HOJE);
    expect(r).toMatchObject({ ok: true, aplicacao: { tipo: "ganho" } });
    if (r.ok) expect(isNegocioGanho(r.aplicacao.negocio)).toBe(true);
  });

  it("fora do passo (proposta enviada, Orçamento) não se aplica", () => {
    for (const n of [emProposta(), negocioBase("n1", { orcamentos })]) {
      expect(registarAssinatura(n, itemDe(n), config(), HOJE)).toEqual({ ok: false, emFalta: [] });
    }
  });
});
