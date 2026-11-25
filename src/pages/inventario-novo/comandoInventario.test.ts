// As contas do Comando e do cabeçalho do novo Inventário (funções puras sobre o que o Hoje já carrega).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import type { ReceivablePo } from "@/components/receiving/porReceber";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";
import { aSeguir, botaoPrincipal, hojeNoArmazem, poAtrasada, precisaDeTi, saudeDoInventario } from "./contasComando";

const HOJE = "2026-11-24";
const TODAS = new Set(["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view",
  "inventory.edit", "receiving.receive", "purchase_orders.receive", "purchase_orders.approve", "client_orders.confirm_stock_exit"]);
const com = (s: Set<string>) => (p: string) => s.has(p);
const todas = com(TODAS);

const payload = (over: Partial<InventoryTodayPayload> = {}): InventoryTodayPayload => ({
  purchases: { pending_approval: 3, late: 1, portal_unseen: 0, portal_confirmed: 0, open_delivery_notes: 2, delivery_notes_with_divergences: 0 },
  suppliers: { price_changes_pending: 0, awaiting_profile: 0, catalog_unlinked: 0 },
  client_orders: { open: 5, ready_to_ship: 2, without_preferred_supplier: 1, by_origin: null },
  stock: { below_reorder_point: 4, overstock: 0, reserved_units: 0, value: null },
  counts: { in_progress: 0, stalled: 0 },
  settings: null,
  ...over,
});
const po = (id: string, over: Partial<ReceivablePo> = {}): ReceivablePo => ({
  id, orderNumber: id, status: "ordered", supplierId: "s", supplierName: "Sanitop", expectedDelivery: "2099-01-01", orderDate: null,
  contractId: null, origin: null, publication: null, emailSent: false, shipped: null,
  lines: [{ id: `${id}-l`, productId: "p", name: "P", sku: null, quantity: 2, received: 0, open: 2, uomId: null, uomCode: null, unitsPerUom: 1 }],
  ...over,
});

describe("Hoje no armazém", () => {
  it("as POs que chegam hoje/amanhã ou expedidas, pela ordem da Receção, e as ECs prontas a sair", () => {
    const L = hojeNoArmazem([
      po("PO-LONGE"),
      po("PO-AMANHA", { expectedDelivery: "2026-11-25" }),
      po("PO-HOJE", { expectedDelivery: HOJE, origin: { originType: "contract", number: "CC-1", clientName: "Maria Silva" }, contractId: "c1" }),
      po("PO-EXP", { shipped: { noteId: "n", noteNumber: "GR", shippedAt: "2026-11-20T10:00:00Z", hasFile: false, count: 1 } }),
      po("PO-FEITA", { expectedDelivery: HOJE, lines: [] }),
    ], payload(), HOJE, todas);
    expect(L.map((x) => x.chave)).toEqual(["po-PO-EXP", "po-PO-HOJE", "po-PO-AMANHA", "ec-prontas"]);
    expect(L[1].detalhe).toBe("Chega hoje · para Maria Silva");
    expect(L[2].detalhe).toMatch(/^Chega amanhã/);
    expect(L[0].to).toBe("/inventory/novo/rececao?po=PO-EXP");
    expect(L[3]).toMatchObject({ titulo: "2 encomendas prontas a sair", to: "/inventory/novo/saidas?ready=1" });
  });
  it("sem client_orders.view, sem as prontas; sem POs (sem permissão), só as prontas", () => {
    expect(hojeNoArmazem(null, payload(), HOJE, com(new Set(["inventory.view"])))).toEqual([]);
    expect(hojeNoArmazem(null, payload(), HOJE, todas).map((x) => x.chave)).toEqual(["ec-prontas"]);
  });
});

describe("Precisa de ti", () => {
  it("a fila de trabalho do Hoje, só o que tem valor, do mais urgente, com o destino no separador", () => {
    const L = precisaDeTi(payload(), { awaiting: 3, shipped: 0, arrivingIds: [] }, todas);
    expect(L[0].tom).toBe("bad");
    expect(L.map((x) => x.chave)).toEqual(expect.arrayContaining(["po-late", "ec-no-supplier", "po-pending", "stock-low", "ec-ready", "po-awaiting-receipt"]));
    expect(L.every((x) => (x.valor ?? 0) > 0)).toBe(true);
    expect(L.find((x) => x.chave === "po-pending")?.to).toBe("/inventory/novo/encomendas?status=pending");
    expect(L.find((x) => x.chave === "po-awaiting-receipt")?.to).toBe("/inventory/novo/rececao");
    expect(L.find((x) => x.chave === "counts-stalled")).toBeUndefined(); // 0: nada a fazer
  });
  it("sem permissão nem dados: vazio", () => {
    expect(precisaDeTi(payload(), null, com(new Set()))).toEqual([]);
    expect(precisaDeTi(null, null, todas)).toEqual([]);
  });
});

describe("A seguir", () => {
  it("as 3 próximas POs por receber (nem hoje/amanhã nem atrasadas), pela data", () => {
    const L = aSeguir([
      po("PO-HOJE", { expectedDelivery: HOJE }),
      po("PO-ATRAS", { expectedDelivery: "2026-11-01" }),
      po("PO-SEM", { expectedDelivery: null }),
      po("PO-DEZ", { expectedDelivery: "2026-12-10" }),
      po("PO-27", { expectedDelivery: "2026-11-27" }),
      po("PO-PEND", { status: "pending", expectedDelivery: "2026-12-01" }),
    ], HOJE);
    expect(L.map((x) => x.chave)).toEqual(["seg-PO-27", "seg-PO-PEND", "seg-PO-DEZ"]);
    expect(L[0].detalhe).toMatch(/^Prevista 27\/11/);
    expect(L[1].detalhe).toMatch(/Por enviar ao fornecedor/);
  });
  it("sem POs: vazio", () => expect(aSeguir(null, HOJE)).toEqual([]));
});

describe("a saúde", () => {
  it("atrasadas a vermelho; a acabar ou sem fornecedor a âmbar; senão tudo em dia", () => {
    expect(saudeDoInventario(payload(), todas)).toEqual({ tom: "bad", texto: "1 entrega atrasada" });
    expect(saudeDoInventario(payload({ purchases: { ...payload().purchases!, late: 0 } }), todas)).toEqual({ tom: "warn", texto: "4 produtos a acabar" });
    const semLow = payload({ purchases: { ...payload().purchases!, late: 0 }, stock: { ...payload().stock!, below_reorder_point: 0 } });
    expect(saudeDoInventario(semLow, todas)?.tom).toBe("warn");
    const ok = payload({ purchases: { ...payload().purchases!, late: 0 }, stock: { ...payload().stock!, below_reorder_point: 0 },
      client_orders: { ...payload().client_orders!, without_preferred_supplier: 0 } });
    expect(saudeDoInventario(ok, todas)).toEqual({ tom: "ok", texto: "Tudo em dia" });
  });
  it("sem dados ou sem nenhum número visível: sem pílula (nunca \"Tudo em dia\" sem saber)", () => {
    expect(saudeDoInventario(null, todas)).toBeNull();
    expect(saudeDoInventario(payload(), com(new Set()))).toBeNull();
  });
  it("as atrasadas só contam com purchase_orders.view", () => {
    expect(saudeDoInventario(payload(), com(new Set(["inventory.view"])))).toEqual({ tom: "warn", texto: "4 produtos a acabar" });
  });
});

describe("o botão principal", () => {
  it("1) a PO atrasada (encomendada/parcial) → Receber PO-x no separador Receção", () => {
    const pos = [po("PO-PEND", { status: "pending", expectedDelivery: "2026-11-01" }), po("PO-7", { expectedDelivery: "2026-11-10" })];
    expect(poAtrasada(pos, HOJE)?.id).toBe("PO-7");
    expect(botaoPrincipal(payload(), pos, HOJE, todas)).toMatchObject({ tipo: "receber", rotulo: "Receber PO-7", to: "/inventory/novo/rececao?po=PO-7" });
  });
  it("2) ECs prontas → Dar saída; 3) POs por aprovar → Aprovar encomendas; 4) Registar movimento", () => {
    expect(botaoPrincipal(payload(), [], HOJE, todas)).toMatchObject({ tipo: "saida", to: "/inventory/novo/saidas?ready=1" });
    const semProntas = payload({ client_orders: { ...payload().client_orders!, ready_to_ship: 0 } });
    expect(botaoPrincipal(semProntas, [], HOJE, todas)).toMatchObject({ tipo: "aprovar", to: "/inventory/novo/encomendas?status=pending", permissoes: ["purchase_orders.approve"] });
    const nada = payload({ client_orders: { ...payload().client_orders!, ready_to_ship: null }, purchases: { ...payload().purchases!, pending_approval: null } });
    expect(botaoPrincipal(nada, null, HOJE, todas)).toMatchObject({ tipo: "movimento", permissoes: ["inventory.edit"] });
  });
  it("sem a permissão de ver, o número não escolhe o botão", () => {
    expect(botaoPrincipal(payload(), null, HOJE, com(new Set(["inventory.view"])))).toMatchObject({ tipo: "movimento" });
  });
});
