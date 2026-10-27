import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import {
  fmtDay,
  isPoReceivableStatus,
  lastActiveReceiptAt,
  poFlowSteps,
  poPromiseAcceptance,
  poReceivedProgress,
  poReceptionHint,
  poSheetLock,
} from "../poSheetFlow";
import { poPortalReceiveText } from "../PoPortalReceiveCard";

const states = (steps: ReturnType<typeof poFlowSteps>) => steps.map((s) => `${s.key}:${s.state}`);

describe("poFlowSteps (percursoPo do 2.0 sobre os dados reais)", () => {
  it("rascunho: primeiro passo atual com a data da encomenda", () => {
    const s = poFlowSteps({ status: "pending", orderDate: "2026-10-27" });
    expect(s.map((x) => x.label)).toEqual(["Rascunho", "Encomendada", "Vista pelo fornecedor", "Confirmada", "Parcialmente recebida", "Recebida"]);
    expect(s[0]).toMatchObject({ detail: "27/10/2026", state: "current" });
    expect(states(s).slice(1).every((x) => x.endsWith(":todo"))).toBe(true);
  });

  it("gerada por uma EC: o primeiro passo diz de onde veio", () => {
    const s = poFlowSteps({ status: "pending", orderDate: "2026-10-27", autoFromNumber: "EC-2026-0007" });
    expect(s[0].label).toBe("Criada a partir de EC-2026-0007");
  });

  it("encomendada e publicada, por ver: Encomendada atual com a data do envio", () => {
    const s = poFlowSteps({ status: "ordered", publication: { status: "sent", sent_at: "2026-10-27T15:05:29Z" } });
    expect(states(s).slice(0, 3)).toEqual(["draft:done", "ordered:current", "viewed:todo"]);
    expect(s[1].detail).not.toBe("");
  });

  it("vista: Vista é o passo atual e mostra a data", () => {
    const s = poFlowSteps({ status: "ordered", publication: { status: "viewed", sent_at: "2026-10-27T10:00:00Z", viewed_at: "2026-10-27T11:00:00Z" } });
    expect(s[2]).toMatchObject({ key: "viewed", state: "current" });
    expect(s[2].detail).not.toBe("");
  });

  it("confirmada com data prometida", () => {
    const s = poFlowSteps({ status: "ordered", publication: { status: "confirmed", confirmed_at: "2026-10-27T17:01:21Z", promised_date: "2026-10-29" } });
    expect(s[3]).toMatchObject({ key: "confirmed", state: "current", detail: "entrega prometida 29/10/2026" });
  });

  it("expedida pelo fornecedor: o passo Expedida entra entre Confirmada e Parcialmente recebida", () => {
    const s = poFlowSteps({
      status: "ordered",
      publication: { status: "confirmed", promised_date: "2026-10-29" },
      shipment: { noteNumber: "GR 12345", shipDate: "2026-10-27" },
    });
    expect(s.map((x) => x.key)).toEqual(["draft", "ordered", "viewed", "confirmed", "shipped", "partial", "received"]);
    expect(s[4]).toMatchObject({ detail: "guia GR 12345 · 27/10/2026", state: "current" });
  });

  it("parcialmente recebida: X de Y e passo atual", () => {
    const s = poFlowSteps({ status: "partially_received", receivedQty: 3, expectedQty: 10 });
    const partial = s.find((x) => x.key === "partial");
    expect(partial).toMatchObject({ detail: "3 de 10", state: "current" });
  });

  it("recebida: tudo feito, com a data da última receção", () => {
    const s = poFlowSteps({
      status: "received",
      publication: { status: "confirmed" },
      shipment: { noteNumber: "GR 1" },
      receivedAt: "2026-10-27",
    });
    expect(s.every((x) => x.state === "done")).toBe(true);
    expect(s[s.length - 1].detail).toBe("27/10/2026");
  });

  it("sem portal: Vista diz 'sem portal' e é o passo atual", () => {
    const s = poFlowSteps({ status: "ordered", publication: null, portalLinked: false, orderedAt: "2026-10-27T10:00:00Z" });
    expect(s[2]).toMatchObject({ detail: "sem portal", state: "current" });
    expect(s[1].state).toBe("done");
  });

  it("publicação retirada conta como sem publicação", () => {
    const s = poFlowSteps({ status: "pending", publication: { status: "withdrawn", sent_at: "2026-10-27T10:00:00Z" } });
    expect(s[0].state).toBe("current");
    expect(s[1].detail).toBe("");
  });

  it("cancelada: sem percurso", () => {
    expect(poFlowSteps({ status: "cancelled" })).toEqual([]);
  });
});

describe("poPromiseAcceptance", () => {
  it("só com confirmada e data prometida", () => {
    expect(poPromiseAcceptance(null)).toBeNull();
    expect(poPromiseAcceptance({ status: "sent" })).toBeNull();
    expect(poPromiseAcceptance({ status: "confirmed" })).toBeNull();
    expect(poPromiseAcceptance({ status: "confirmed", promised_date: "2026-10-29" })).toBe("accept");
    expect(poPromiseAcceptance({ status: "confirmed", promised_date: "2026-10-29", promised_date_accepted_at: "x" })).toBe("accepted");
  });
});

describe("poReceptionHint (ProximoRececao do 2.0)", () => {
  it("recebíveis → próximo passo; pendente avisa que pode receber-se", () => {
    expect(poReceptionHint("pending")).toEqual({ kind: "next", pendingNote: true });
    expect(poReceptionHint("ordered")).toEqual({ kind: "next", pendingNote: false });
    expect(poReceptionHint("partially_received")).toEqual({ kind: "next", pendingNote: false });
  });
  it("recebida → feita; cancelada ou eliminada → nada", () => {
    expect(poReceptionHint("received")).toEqual({ kind: "done" });
    expect(poReceptionHint("cancelled")).toBeNull();
    expect(poReceptionHint("ordered", true)).toBeNull();
  });
  it("isPoReceivableStatus", () => {
    expect(isPoReceivableStatus("pending")).toBe(true);
    expect(isPoReceivableStatus("received")).toBe(false);
    expect(isPoReceivableStatus("ordered", true)).toBe(false);
  });
});

describe("poSheetLock (motivo + botão que levanta)", () => {
  it("recebida com linhas recebidas → reverter receção", () => {
    expect(poSheetLock({ status: "received", hasReceivedLines: true })).toMatchObject({ kind: "received", unlock: "revert" });
    expect(poSheetLock({ status: "received", hasReceivedLines: false })?.unlock).toBeNull();
  });
  it("parcialmente recebida → reverter receção", () => {
    expect(poSheetLock({ status: "partially_received", hasReceivedLines: true })).toMatchObject({ kind: "partial", unlock: "revert" });
  });
  it("publicada e o servidor deixa retirar → retirar do portal", () => {
    expect(poSheetLock({ status: "ordered", publicationStatus: "sent", canWithdraw: true })).toMatchObject({ kind: "portal", unlock: "withdraw" });
  });
  it("confirmada pelo fornecedor (não se retira) → sem botão, com a dica do anular resto", () => {
    const l = poSheetLock({ status: "ordered", publicationStatus: "confirmed", canWithdraw: false });
    expect(l).toMatchObject({ kind: "portal", unlock: null });
    expect(l?.hint).toMatch(/Não vou receber o resto/);
  });
  it("retirada não bloqueia; sem permissão fica só de leitura", () => {
    expect(poSheetLock({ status: "pending", publicationStatus: "withdrawn" })).toBeNull();
    expect(poSheetLock({ status: "pending", lacksEditPermission: true })).toMatchObject({ kind: "permission", unlock: null });
  });
  it("cancelada (editável na app) não tem bloqueio", () => {
    expect(poSheetLock({ status: "cancelled" })).toBeNull();
  });
});

describe("poReceivedProgress / lastActiveReceiptAt / fmtDay", () => {
  it("recebido e esperado (encomendado − anulado ativo) só nas linhas de produto", () => {
    const items = [
      { id: "a", item_type: "product", quantity: 10, received_quantity: 3 },
      { id: "b", item_type: "product", quantity: 5, received_quantity: 0 },
      { id: "s", item_type: "service", quantity: 1, received_quantity: 0 },
    ];
    const cancels = [
      { purchase_order_item_id: "b", quantity_cancelled: 2 },
      { purchase_order_item_id: "b", quantity_cancelled: 1, undone_at: "x" },
      { purchase_order_item_id: null, quantity_cancelled: 9 },
    ];
    expect(poReceivedProgress(items, cancels)).toEqual({ received: 3, expected: 13 });
  });
  it("última receção ativa ignora revertidas e passagens para stock", () => {
    expect(
      lastActiveReceiptAt([
        { received_at: "2026-10-20T10:00:00Z", kind: "receipt" },
        { received_at: "2026-10-25T10:00:00Z", kind: "receipt", reverted_at: "2026-10-26T00:00:00Z" },
        { received_at: "2026-10-26T10:00:00Z", kind: "release_to_stock" },
      ]),
    ).toBe("2026-10-20T10:00:00Z");
    expect(lastActiveReceiptAt([])).toBeNull();
  });
  it("fmtDay de uma coluna date não passa por fuso", () => {
    expect(fmtDay("2026-01-01")).toBe("01/01/2026");
    expect(fmtDay(null)).toBe("");
  });
});

describe("poPortalReceiveText (cartão do separador Portal)", () => {
  it("guia do portal aberta → expedida, leia o número na Receção", () => {
    expect(poPortalReceiveText({ status: "ordered", publicationStatus: "confirmed", shipmentNote: "12345" })).toBe(
      "Expedida pelo fornecedor com a guia GR 12345: leia o número da guia na Receção.",
    );
  });
  it("confirmada sem guia → já aparece na Receção", () => {
    expect(poPortalReceiveText({ status: "ordered", publicationStatus: "confirmed", promisedDate: "2026-10-29" })).toBe(
      "Confirmada pelo fornecedor · entrega a 29/10/2026. Já aparece na Receção.",
    );
  });
  it("por confirmar, recebida ou eliminada → nada", () => {
    expect(poPortalReceiveText({ status: "ordered", publicationStatus: "sent" })).toBeNull();
    expect(poPortalReceiveText({ status: "received", publicationStatus: "confirmed", shipmentNote: "1" })).toBeNull();
    expect(poPortalReceiveText({ status: "ordered", deleted: true, shipmentNote: "1" })).toBeNull();
  });
});
