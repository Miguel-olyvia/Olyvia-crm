// Textos do Contrato do portal do fornecedor. Em português têm de sair IGUAIS aos helpers de sempre
// (lib/supplierContracts/tipos.ts e portal.ts, partilhados com o CRM): este teste compara-os um a um, para os dois
// lados não se afastarem. Em inglês não pode sobrar português, e o que o servidor escreve fica como vem.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import {
  EVENT_LABEL,
  KIND_LABEL,
  conditionsRows,
  eventText,
  type SupplierContractConditions,
  type SupplierContractStatus,
} from "@/lib/supplierContracts/tipos";
import { SP_STATUS_LABEL, describeSpContractError, describeSpWithdrawError, spStatusLabel } from "@/lib/supplierContracts/portal";
import { SupplierPortalRpcError } from "@/lib/supplierPortal/spRpc";
import { resolverMensagem } from "@/portal-i18n/mensagem";
import { traduzir } from "@/portal-i18n/traduzir";
import {
  CHAVE_ERRO_FICHEIRO_CONTRATO,
  descreverErroContrato,
  descreverErroRetirar,
  linhasDeCondicoes,
  mensagemErroFicheiroContrato,
  rotuloEstadoContrato,
  rotuloTipoContrato,
  textoDoEvento,
  validarFicheiroContrato,
} from "../textosContrato";
import { dicionarios } from "@/portal-i18n/dicionarios";

const tPt = (chave: string, params?: Record<string, string | number>) => traduzir("pt", chave, params);
const tEn = (chave: string, params?: Record<string, string | number>) => traduzir("en", chave, params);

const ESTADOS = Object.keys(SP_STATUS_LABEL) as SupplierContractStatus[];

describe("estado do contrato", () => {
  it("português: igual ao de sempre (spStatusLabel) em todos os estados e nas propostas", () => {
    for (const status of ESTADOS) {
      const c = { status, proposal_state: null, refused_by: null };
      expect(rotuloEstadoContrato(c, tPt)).toBe(spStatusLabel(c));
    }
    const retirada = { status: "cancelled" as const, proposal_state: "withdrawn" as const, refused_by: null };
    expect(rotuloEstadoContrato(retirada, tPt)).toBe(spStatusLabel(retirada));
    const recusada = { status: "refused" as const, proposal_state: "refused" as const, refused_by: "empresa" as const };
    expect(rotuloEstadoContrato(recusada, tPt)).toBe(spStatusLabel(recusada));
  });

  it("inglês: todos os estados traduzidos, diferentes do português e sem acentos portugueses", () => {
    for (const status of ESTADOS) {
      const en = rotuloEstadoContrato({ status, proposal_state: null, refused_by: null }, tEn);
      expect(en).not.toBe(SP_STATUS_LABEL[status]);
      expect(en).not.toMatch(/[áàãâçéêíóõôú]/i);
    }
    expect(rotuloEstadoContrato({ status: "cancelled", proposal_state: "withdrawn", refused_by: null }, tEn)).toBe("Proposal withdrawn");
    expect(rotuloEstadoContrato({ status: "refused", proposal_state: "refused", refused_by: "empresa" }, tEn)).toBe(
      "Proposal refused by the company",
    );
  });
});

describe("tipo do contrato", () => {
  it("português igual ao de sempre; inglês traduzido", () => {
    expect(rotuloTipoContrato("material", tPt)).toBe(KIND_LABEL.material);
    expect(rotuloTipoContrato("servico", tPt)).toBe(KIND_LABEL.servico);
    expect(rotuloTipoContrato("material", tEn)).toBe("Supply of materials");
    expect(rotuloTipoContrato("servico", tEn)).toBe("Subcontracting / services");
  });
});

describe("condições comerciais", () => {
  const condicoes = (over: Partial<SupplierContractConditions> = {}): SupplierContractConditions => ({
    payment_terms_days: 30,
    payment_method: "transferencia",
    delivery_sla_days: 5,
    shipping_terms: "gratis_acima_minimo",
    shipping_free_from: 250,
    discount_percent: 7.5,
    min_order_value: 100,
    returns_accepted: true,
    returns_days: 1,
    returns_notes: "Sem uso",
    conditions_notes: "Notas do fornecedor",
    ...over,
  });

  it.each([
    ["completas", condicoes()],
    ["vazias", condicoes({
      payment_terms_days: null, payment_method: null, delivery_sla_days: null, shipping_terms: null, shipping_free_from: null,
      discount_percent: null, min_order_value: null, returns_accepted: null, returns_days: null, returns_notes: null, conditions_notes: null,
    })],
    ["sem devoluções", condicoes({ returns_accepted: false, returns_days: null, returns_notes: null, shipping_terms: "incluidos" })],
    ["cada forma de pagamento", condicoes({ payment_method: "debito_direto", shipping_terms: "a_cargo_comprador" })],
    ["outras", condicoes({ payment_method: "outro", shipping_terms: "a_combinar", payment_terms_days: 60 })],
  ])("português: %s, igual a conditionsRows de sempre", (_nome, c) => {
    expect(linhasDeCondicoes(c, tPt)).toEqual(conditionsRows(c));
  });

  it("inglês: rótulos e valores em inglês; o dinheiro e os números continuam em pt-PT; os textos do fornecedor ficam", () => {
    const linhas = Object.fromEntries(linhasDeCondicoes(condicoes(), tEn).map((l) => [l.label, l.value]));
    expect(linhas["Payment terms"]).toBe("30 days");
    expect(linhas["Payment method"]).toBe("Bank transfer");
    expect(linhas["Delivery lead time"]).toBe("5 days");
    expect(linhas["Shipping"]).toMatch(/^Free from /);
    expect(linhas["Shipping"]).toContain("250,00");
    expect(linhas["Discount"]).toBe("7,5 %");
    expect(linhas["Minimum order"]).toContain("100,00");
    expect(linhas["Returns"]).toBe("Yes (1 day) — Sem uso");
    expect(linhas["Notes"]).toBe("Notas do fornecedor");
  });
});

describe("histórico", () => {
  it("português: igual a eventText de sempre, com e sem descrição do servidor", () => {
    for (const type of Object.keys(EVENT_LABEL)) {
      const e = { event_type: type, description: null };
      expect(textoDoEvento(e, tPt)).toBe(eventText(e));
    }
    expect(textoDoEvento({ event_type: "sent", description: "Descrição do servidor" }, tEn)).toBe("Descrição do servidor");
    expect(textoDoEvento({ event_type: "tipo_novo", description: null }, tEn)).toBe("tipo_novo");
  });

  it("inglês: rótulo de reserva traduzido para todos os tipos", () => {
    for (const type of Object.keys(EVENT_LABEL)) {
      const en = textoDoEvento({ event_type: type, description: null }, tEn);
      expect(en).not.toBe(EVENT_LABEL[type as keyof typeof EVENT_LABEL]);
    }
    expect(textoDoEvento({ event_type: "proposal_withdrawn", description: null }, tEn)).toBe("Proposal withdrawn by the supplier");
  });
});

describe("erros", () => {
  const erro = (hint: string, message = "") => new SupplierPortalRpcError({ message, hint });

  it("português: igual a describeSpContractError e describeSpWithdrawError de sempre", () => {
    for (const hint of ["not_owner", "not_found", "document_changed", "otp_required", "invalid_state", "validation", "xpto"]) {
      expect(descreverErroContrato(erro(hint), tPt)).toBe(describeSpContractError(erro(hint)));
      expect(descreverErroContrato(erro(hint, "Do servidor"), tPt)).toBe(describeSpContractError(erro(hint, "Do servidor")));
    }
    for (const hint of ["invalid_state", "not_owner", "not_found"]) {
      expect(descreverErroRetirar(erro(hint), tPt)).toBe(describeSpWithdrawError(erro(hint)));
    }
  });

  it("inglês: as frases fixas traduzem-se; a mensagem que o servidor manda fica como vem", () => {
    expect(descreverErroContrato(erro("not_found"), tEn)).toBe("Contract not found or no longer available.");
    expect(descreverErroContrato(erro("document_changed"), tEn)).toMatch(/The document has changed/);
    expect(descreverErroContrato(erro("not_owner", "Só o titular (servidor)"), tEn)).toBe("Só o titular (servidor)");
    expect(descreverErroContrato(erro("validation", "Prazo demasiado longo"), tEn)).toBe("Prazo demasiado longo");
    expect(descreverErroRetirar(erro("invalid_state"), tEn)).toMatch(/can no longer be withdrawn/);
    expect(descreverErroRetirar(erro("not_owner"), tEn)).toBe("Only the account's main user can withdraw the proposal.");
  });
});

describe("ficheiros do contrato", () => {
  const ficheiro = (type: string, size: number) => ({ name: "c.pdf", type, size }) as unknown as File;

  it("validação: as mesmas regras e frases de sempre em português, inglês no outro idioma", () => {
    expect(resolverMensagem(validarFicheiroContrato(ficheiro("image/png", 10), "contrato_fornecedor")!, "pt")).toBe(
      "O contrato do fornecedor tem de ser um PDF.",
    );
    expect(resolverMensagem(validarFicheiroContrato(ficheiro("text/plain", 10), "anexo")!, "pt")).toBe(
      "Só são aceites anexos PDF, JPEG ou PNG.",
    );
    expect(resolverMensagem(validarFicheiroContrato(ficheiro("application/pdf", 0), "anexo")!, "en")).toBe("The file is empty.");
    expect(resolverMensagem(validarFicheiroContrato(ficheiro("application/pdf", 16 * 1024 * 1024), "anexo")!, "pt")).toBe(
      "O ficheiro tem de ter até 15 MB.",
    );
    expect(resolverMensagem(validarFicheiroContrato(ficheiro("application/pdf", 16 * 1024 * 1024), "anexo")!, "en")).toBe(
      "The file must be up to 15 MB.",
    );
    expect(validarFicheiroContrato(ficheiro("image/jpeg", 100), "anexo")).toBeNull();
    expect(validarFicheiroContrato(ficheiro("application/pdf", 100), "contrato_fornecedor")).toBeNull();
  });

  it("erro das ações: o texto fixo traduz-se; o da Edge fica como vem", () => {
    const fixo = { error: "rate_limited", message: tPt("sp.contrato.ficheiro.erro.rate_limited") };
    expect(resolverMensagem(mensagemErroFicheiroContrato(fixo), "en")).toBe(tEn("sp.contrato.ficheiro.erro.rate_limited"));
    expect(resolverMensagem(mensagemErroFicheiroContrato({ error: "rate_limited", message: "" }), "en")).toBe(
      tEn("sp.contrato.ficheiro.erro.rate_limited"),
    );
    expect(resolverMensagem(mensagemErroFicheiroContrato({ error: "rate_limited", message: "Mensagem da Edge" }), "en")).toBe(
      "Mensagem da Edge",
    );
    expect(resolverMensagem(mensagemErroFicheiroContrato({ error: "xpto", message: "" }), "en")).toBe("The action could not be completed.");
  });

  it("todos os códigos de erro têm texto nos dois idiomas", () => {
    for (const chave of Object.values(CHAVE_ERRO_FICHEIRO_CONTRATO)) {
      expect(dicionarios.pt[chave]).toBeTruthy();
      expect(dicionarios.en[chave]).toBeTruthy();
    }
  });
});
