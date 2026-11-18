// Etiquetas do estado do contrato no portal do cliente: os códigos (que vêm da base) não mudam, só a etiqueta
// que se mostra; o português fica igual ao de antes e `pending_signature` (o estado que a edge function
// create-client-portal-access escreve ao publicar um contrato) deixa de aparecer como código cru.
import { describe, expect, it } from "vitest";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_LABEL_KEYS,
  CONTRACT_STATUS_VARIANTS,
  contractStatusLabel,
} from "./contractStatus";
import { traduzir } from "@/portal-i18n/traduzir";
import { dicionarios } from "@/portal-i18n/dicionarios";

const tPt = (k: string) => traduzir("pt", k);
const tEn = (k: string) => traduzir("en", k);

// O que o portal mostrava antes desta mudança (contractStatus.ts original).
const PT_ANTES: Record<string, string> = {
  draft: "Rascunho",
  pending: "A aguardar decisão",
  sent: "A aguardar decisão",
  active: "Ativo",
  signed: "Contrato assinado",
  rejected: "Contrato rejeitado",
  expired: "Expirado",
  cancelled: "Anulado",
};

describe("contractStatusLabel", () => {
  it.each(Object.entries(PT_ANTES))("português: %s continua «%s»", (codigo, texto) => {
    expect(contractStatusLabel(codigo, tPt)).toBe(texto);
    expect(CONTRACT_STATUS_LABELS[codigo]).toBe(texto);
  });

  it("pending_signature mostra uma etiqueta em vez do código cru, igual a «a aguardar decisão»", () => {
    expect(contractStatusLabel("pending_signature", tPt)).toBe("A aguardar decisão");
    expect(contractStatusLabel("pending_signature", tEn)).toBe(contractStatusLabel("pending", tEn));
    expect(CONTRACT_STATUS_LABELS.pending_signature).toBe("A aguardar decisão");
  });

  it("inglês: etiquetas de negócio para todos os estados", () => {
    expect(contractStatusLabel("draft", tEn)).toBe("Draft");
    expect(contractStatusLabel("sent", tEn)).toBe("Awaiting your decision");
    expect(contractStatusLabel("active", tEn)).toBe("Active");
    expect(contractStatusLabel("signed", tEn)).toBe("Contract signed");
    expect(contractStatusLabel("rejected", tEn)).toBe("Contract rejected");
    expect(contractStatusLabel("expired", tEn)).toBe("Expired");
    expect(contractStatusLabel("cancelled", tEn)).toBe("Cancelled");
  });

  it("um estado desconhecido volta como veio (não se inventa etiqueta)", () => {
    expect(contractStatusLabel("qualquer_coisa", tEn)).toBe("qualquer_coisa");
  });

  it("vazio, nulo ou nomes herdados do Object não dão etiqueta nem rebentam", () => {
    expect(contractStatusLabel(null, tPt)).toBe("");
    expect(contractStatusLabel(undefined, tPt)).toBe("");
    expect(contractStatusLabel("", tPt)).toBe("");
    expect(contractStatusLabel("constructor", tPt)).toBe("constructor");
    expect(contractStatusLabel("toString", tEn)).toBe("toString");
  });
});

describe("chaves e variantes", () => {
  it("todas as chaves existem em pt e em en, com texto não vazio", () => {
    for (const chave of new Set(Object.values(CONTRACT_STATUS_LABEL_KEYS))) {
      expect(dicionarios.pt[chave]?.trim(), `pt ${chave}`).toBeTruthy();
      expect(dicionarios.en[chave]?.trim(), `en ${chave}`).toBeTruthy();
    }
  });

  it("todas as chaves são do tema pc.estado", () => {
    for (const chave of Object.values(CONTRACT_STATUS_LABEL_KEYS)) expect(chave.startsWith("pc.estado.")).toBe(true);
  });

  it("cada estado com etiqueta tem variante de badge, e pending_signature é secundária como pending", () => {
    for (const codigo of Object.keys(CONTRACT_STATUS_LABEL_KEYS)) {
      expect(CONTRACT_STATUS_VARIANTS[codigo], codigo).toBeDefined();
    }
    expect(CONTRACT_STATUS_VARIANTS.pending_signature).toBe("secondary");
  });
});
