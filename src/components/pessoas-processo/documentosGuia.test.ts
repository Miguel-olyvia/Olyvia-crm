// O que cada passo de documento do guia abre (enviar a proposta, a resposta do cliente, criar o contrato, a assinatura) e quando não pode abrir nada.
import { describe, expect, it } from "vitest";
import type { ContratoDb, NegocioFichaDb, PropostaDb } from "@/hooks/pessoas/fichaTipos";
import { PASSOS_DOCUMENTO, planoDoDocumento, ehPassoDeDocumento } from "./documentosGuia";

const proposta = (extra: Partial<PropostaDb> = {}): PropostaDb => ({
  id: "p1", numero: "P-1", titulo: "WC social", status: "draft", valor: 100, valid_until: null, terms: null, enviada_em: null, aceite_em: null,
  criado_em: "2026-10-01T10:00:00Z", ...extra,
});
const contrato = (extra: Partial<ContratoDb> = {}): ContratoDb => ({
  id: "c1", numero: "C-1", status: "pending_signature", valor: 100, assinado_em: null, criado_em: "2026-10-02T10:00:00Z", tem_base: true, ...extra,
});
const negocio = (extra: Partial<NegocioFichaDb> = {}): NegocioFichaDb => ({
  id: "n1", titulo: "WC", notas: null, estado: "aberto", criado_em: null, ganho_em: null, perdido_em: null, fase_perda: null, motivo_perda: null,
  responsavel_id: null, responsavel_nome: null, valor: 100, pronto_a_ganhar: false, parado_desde: null, levantamento_id: null,
  orcamentos: [], propostas: [], contratos: [], eventos: [], ...extra,
});
const TODAS = ["proposals.edit", "client_contracts.create", "client_contracts.edit"];
const opcoes = { podeEditar: true, fechoV4: false, permissoes: TODAS as readonly string[] | undefined };

describe("os passos de documento", () => {
  it("são enviar a proposta, a resposta do cliente, criar o contrato e a assinatura", () => {
    expect([...PASSOS_DOCUMENTO]).toEqual(["enviarProposta", "registarRespostaCliente", "criarContrato", "registarAssinatura"]);
    expect(ehPassoDeDocumento("criarContrato")).toBe(true);
    expect(ehPassoDeDocumento("criarOrcamento")).toBe(false);
  });
});

describe("planoDoDocumento", () => {
  it("enviar a proposta abre o envio da proposta em curso", () => {
    expect(planoDoDocumento("enviarProposta", negocio({ propostas: [proposta()] }), opcoes)).toEqual({ passo: "enviarProposta", propostaId: "p1", titulo: "WC social", numero: "P-1" });
  });

  it("registar a resposta do cliente abre a resposta da proposta enviada", () => {
    const n = negocio({ propostas: [proposta({ status: "sent", enviada_em: "2026-10-03T10:00:00Z" })] });
    expect(planoDoDocumento("registarRespostaCliente", n, opcoes)).toEqual({ passo: "registarRespostaCliente", propostaId: "p1", titulo: "WC social", numero: "P-1" });
  });

  it("uma proposta recusada pelo cliente não se envia nem se responde de novo", () => {
    const n = negocio({ propostas: [proposta({ status: "rejected" })] });
    expect(planoDoDocumento("enviarProposta", n, opcoes)).toBeNull();
    expect(planoDoDocumento("registarRespostaCliente", n, opcoes)).toBeNull();
  });

  it("criar o contrato parte da proposta aceite, com o negócio quando o fecho v4 está ligado", () => {
    const n = negocio({ propostas: [proposta({ status: "accepted", aceite_em: "2026-10-04T10:00:00Z" })] });
    expect(planoDoDocumento("criarContrato", n, opcoes)).toEqual({ passo: "criarContrato", propostaId: "p1", negocioId: null });
    expect(planoDoDocumento("criarContrato", n, { ...opcoes, fechoV4: true })).toEqual({ passo: "criarContrato", propostaId: "p1", negocioId: "n1" });
  });

  it("criar o contrato exige a permissão do contrato, e sem lista conhecida não abre nada (falha fechada)", () => {
    const n = negocio({ propostas: [proposta({ status: "accepted" })] });
    expect(planoDoDocumento("criarContrato", n, { ...opcoes, permissoes: ["quotes.create"] })).toBeNull();
    expect(planoDoDocumento("criarContrato", n, { ...opcoes, permissoes: ["client_contracts.create"] })).not.toBeNull();
    expect(planoDoDocumento("criarContrato", n, { ...opcoes, permissoes: undefined })).toBeNull();
  });

  it("enviar e responder à proposta exigem proposals.edit; assinar exige client_contracts.edit; sem lista conhecida não abre nada", () => {
    const enviada = negocio({ propostas: [proposta({ status: "sent" })] });
    for (const passo of ["enviarProposta", "registarRespostaCliente"] as const) {
      expect(planoDoDocumento(passo, enviada, { ...opcoes, permissoes: ["pessoas.edit", "client_contracts.edit"] })).toBeNull();
      expect(planoDoDocumento(passo, enviada, { ...opcoes, permissoes: ["proposals.edit"] })).not.toBeNull();
      expect(planoDoDocumento(passo, enviada, { ...opcoes, permissoes: undefined })).toBeNull();
    }
    const assinar = negocio({ contratos: [contrato()] });
    expect(planoDoDocumento("registarAssinatura", assinar, { ...opcoes, permissoes: ["proposals.edit", "client_contracts.create"] })).toBeNull();
    expect(planoDoDocumento("registarAssinatura", assinar, { ...opcoes, permissoes: ["client_contracts.edit"] })).not.toBeNull();
    expect(planoDoDocumento("registarAssinatura", assinar, { ...opcoes, permissoes: undefined })).toBeNull();
  });

  it("um negócio que fecha na proposta não oferece contratos (fecho v4)", () => {
    const n = negocio({ fecho: "proposta", propostas: [proposta({ status: "accepted" })] });
    expect(planoDoDocumento("criarContrato", n, { ...opcoes, fechoV4: true })).toBeNull();
    expect(planoDoDocumento("criarContrato", n, opcoes)).not.toBeNull();
  });

  it("registar a assinatura abre o contrato que conta, e um contrato cancelado não conta", () => {
    expect(planoDoDocumento("registarAssinatura", negocio({ contratos: [contrato()] }), opcoes)).toEqual({ passo: "registarAssinatura", contratoId: "c1", numero: "C-1" });
    expect(planoDoDocumento("registarAssinatura", negocio({ contratos: [contrato({ status: "cancelled" })] }), opcoes)).toBeNull();
  });

  it("sem documento, sem negócio ou sem poder editar não há nada a abrir", () => {
    expect(planoDoDocumento("enviarProposta", negocio(), opcoes)).toBeNull();
    expect(planoDoDocumento("registarAssinatura", negocio(), opcoes)).toBeNull();
    expect(planoDoDocumento("enviarProposta", undefined, opcoes)).toBeNull();
    expect(planoDoDocumento("enviarProposta", negocio({ propostas: [proposta()] }), { ...opcoes, podeEditar: false })).toBeNull();
  });
});
