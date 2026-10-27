// Guias expedidas pelo fornecedor no portal: leitura do history, pré-preenchimento por linha, "Expedida" na lista
// "Por receber" e filtro de origem das Guias. Só funções puras.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { fmtFileSize, isPortalNote, notePending, portalMeta, prefillFromNote, type PoLineLite } from "../deliveryNotes";
import { matchesOrigin } from "../DeliveryNotesPanel";
import { FILTROS_REC, contagensRec, grupoRececao, porReceber, type ReceivablePo } from "../porReceber";
import { mapPoRow, shipmentsByPo } from "../useReceivablePos";

const HOJE = "2026-10-26";

const shipped = (o: Record<string, unknown> = {}) => ({
  action: "shipped",
  origin: "supplier_portal",
  at: "2026-10-20T09:00:00Z",
  by_portal_user: "pu-1",
  by_name: "Ana Fornecedora",
  carrier: "CTT Expresso",
  purchase_order_id: "po-1",
  revision: 1,
  ...o,
});
const attachment = (o: Record<string, unknown> = {}) => ({
  action: "attachment",
  path: "org-1/guias/gr-1.pdf",
  name: "gr-1.pdf",
  mime: "application/pdf",
  size: 2048,
  at: "2026-10-20T09:01:00Z",
  ...o,
});

describe("isPortalNote / portalMeta", () => {
  it("só conta 'shipped' com origin 'supplier_portal'", () => {
    expect(isPortalNote([shipped()])).toBe(true);
    expect(isPortalNote([shipped({ origin: "team" })])).toBe(false);
    expect(isPortalNote([{ action: "close", at: "x" }])).toBe(false);
    expect(isPortalNote([])).toBe(false);
    expect(isPortalNote(null)).toBe(false);
    expect(isPortalNote("lixo")).toBe(false);
    expect(isPortalNote([null, 3, shipped()])).toBe(true);
  });

  it("devolve a expedição, quem enviou, o transportador e o último ficheiro", () => {
    const m = portalMeta([shipped(), attachment({ name: "velha.pdf", path: "a/velha.pdf" }), attachment(), { action: "close", at: "y" }]);
    expect(m).toEqual({
      shippedAt: "2026-10-20T09:00:00Z",
      byName: "Ana Fornecedora",
      carrier: "CTT Expresso",
      purchaseOrderId: "po-1",
      file: { path: "org-1/guias/gr-1.pdf", name: "gr-1.pdf", mime: "application/pdf", size: 2048, at: "2026-10-20T09:01:00Z" },
    });
  });

  it("sem ficheiro → file null; anexo sem path não conta; sem nome usa o fim do path", () => {
    expect(portalMeta([shipped()])?.file).toBeNull();
    expect(portalMeta([shipped(), attachment({ path: "" })])?.file).toBeNull();
    expect(portalMeta([shipped(), attachment({ name: null, size: "x" })])?.file).toMatchObject({ name: "gr-1.pdf", size: null });
  });

  it("uma revisão da expedição substitui a anterior; campos vazios ficam null", () => {
    const m = portalMeta([shipped(), shipped({ revision: 2, carrier: "", by_name: "Rui", at: "2026-10-21T08:00:00Z" })]);
    expect(m).toMatchObject({ shippedAt: "2026-10-21T08:00:00Z", byName: "Rui", carrier: null });
  });

  it("não é do portal → null", () => {
    expect(portalMeta([{ action: "reopen", at: "x" }])).toBeNull();
  });

  it("fmtFileSize", () => {
    expect(fmtFileSize(500)).toBe("500 B");
    expect(fmtFileSize(2048)).toBe("2 KB");
    expect(fmtFileSize(1.5 * 1024 * 1024)).toBe("1,5 MB");
    expect(fmtFileSize(null)).toBe("");
  });
});

describe("prefillFromNote: anunciado na guia − já recebido com ela, nunca acima do que falta", () => {
  const L: PoLineLite[] = [
    { id: "poi-1", productId: "p1", open: 10, unitsPerUom: 1 },
    { id: "poi-2", productId: "p2", open: 2, unitsPerUom: 5 },
    { id: "poi-3", productId: "p3", open: 4, unitsPerUom: 1 },
  ];

  it("por linha da PO, em unidades da linha, descontando as receções desta guia", () => {
    const r = prefillFromNote(
      "g1",
      L,
      [
        { delivery_note_id: "g1", product_id: "p1", purchase_order_item_id: "poi-1", quantity: 6, units_per_uom: 1 },
        { delivery_note_id: "g1", product_id: "p2", purchase_order_item_id: "poi-2", quantity: 10, units_per_uom: 1 },
        { delivery_note_id: "g2", product_id: "p3", purchase_order_item_id: "poi-3", quantity: 4, units_per_uom: 1 },
      ],
      [
        { delivery_note_id: "g1", purchase_order_item_id: "poi-1", quantity: 2, units_per_uom: 1 },
        { delivery_note_id: "g2", purchase_order_item_id: "poi-1", quantity: 3, units_per_uom: 1 },
      ],
    );
    // poi-1: 6 − 2 (a receção da g2 não conta); poi-2: 10 un = 2 cx; poi-3: só na g2 → 0.
    expect(r).toEqual({ "poi-1": 4, "poi-2": 2, "poi-3": 0 });
  });

  it("nunca acima do que falta e nunca negativo", () => {
    const r = prefillFromNote(
      "g1",
      L,
      [
        { delivery_note_id: "g1", product_id: "p1", purchase_order_item_id: "poi-1", quantity: 50, units_per_uom: 1 },
        { delivery_note_id: "g1", product_id: "p3", purchase_order_item_id: "poi-3", quantity: 1, units_per_uom: 1 },
      ],
      [{ delivery_note_id: "g1", purchase_order_item_id: "poi-3", quantity: 3, units_per_uom: 1 }],
    );
    expect(r).toMatchObject({ "poi-1": 10, "poi-3": 0 });
  });

  it("linha da guia sem purchase_order_item_id liga pelo produto só se for único na PO", () => {
    const dup: PoLineLite[] = [...L, { id: "poi-4", productId: "p3", open: 1, unitsPerUom: 1 }];
    const lines = [
      { delivery_note_id: "g1", product_id: "p1", purchase_order_item_id: null, quantity: 3, units_per_uom: 1 },
      { delivery_note_id: "g1", product_id: "p3", purchase_order_item_id: null, quantity: 3, units_per_uom: 1 },
    ];
    expect(prefillFromNote("g1", dup, lines, [])).toEqual({ "poi-1": 3, "poi-2": 0, "poi-3": 0, "poi-4": 0 });
  });

  it("linha de outra PO é ignorada; guia sem linhas desta PO → null (vale o que falta)", () => {
    expect(
      prefillFromNote("g1", L, [{ delivery_note_id: "g1", product_id: "p1", purchase_order_item_id: "poi-outra", quantity: 3, units_per_uom: 1 }], []),
    ).toBeNull();
    expect(prefillFromNote("g1", L, [], [])).toBeNull();
  });

  it("notePending: há alguma linha com quantidade", () => {
    expect(notePending({ a: 0, b: 1 })).toBe(true);
    expect(notePending({ a: 0 })).toBe(false);
    expect(notePending(null)).toBe(false);
  });
});

describe("shipmentsByPo: POs com guia do portal aberta", () => {
  const nota = (id: string, at: string, o: Record<string, unknown> = {}) => ({
    id,
    note_number: id.toUpperCase(),
    created_at: at,
    status: "open",
    history: [shipped({ at, purchase_order_id: null }), ...(o.file ? [attachment()] : [])],
    ...o,
  });

  it("liga pela tabela das POs e pelo purchase_order_id do history; a mais antiga primeiro", () => {
    const m = shipmentsByPo(
      [
        nota("g2", "2026-10-22T10:00:00Z"),
        nota("g1", "2026-10-20T10:00:00Z", { file: true }),
        { ...nota("g3", "2026-10-19T10:00:00Z"), history: [shipped({ at: "2026-10-19T10:00:00Z", purchase_order_id: "po-2" })] },
        { ...nota("g4", "2026-10-01T10:00:00Z"), status: "closed" },
        { id: "eq", note_number: "EQ", created_at: "2026-10-01T10:00:00Z", status: "open", history: [] },
      ],
      [
        { delivery_note_id: "g2", purchase_order_id: "po-1" },
        { delivery_note_id: "g1", purchase_order_id: "po-1" },
        { delivery_note_id: "g4", purchase_order_id: "po-1" },
        { delivery_note_id: "eq", purchase_order_id: "po-1" },
      ],
    );
    expect(m.get("po-1")).toEqual({ noteId: "g1", noteNumber: "G1", shippedAt: "2026-10-20T10:00:00Z", hasFile: true, count: 2 });
    expect(m.get("po-2")).toMatchObject({ noteId: "g3", count: 1 });
    expect(m.size).toBe(2);
  });
});

describe("Por receber: as expedidas pelo fornecedor ficam no topo", () => {
  const base = (id: string, o: Partial<ReceivablePo> = {}): ReceivablePo => ({
    ...mapPoRow({
      id,
      order_number: id.toUpperCase(),
      status: "ordered",
      supplier_id: "s1",
      expected_delivery: null,
      order_date: null,
      source_type: null,
      source_id: null,
      suppliers: { name: "Zeta" },
      purchase_order_items: [
        { id: `${id}-l`, item_type: "product", product_id: "p", description: null, sku: null, quantity: 2, received_quantity: 0, uom_id: null, units_per_uom: 1, products: { name: "Base", sku: null }, uom: null },
      ],
    }),
    ...o,
  });
  const ship = (noteNumber: string, shippedAt: string) => ({ noteId: noteNumber, noteNumber, shippedAt, hasFile: false, count: 1 });

  it("grupo −1 acima de hoje/atrasadas; entre elas, a expedida há mais tempo primeiro", () => {
    const L = [
      base("hoje", { expectedDelivery: HOJE }),
      base("atr", { expectedDelivery: "2026-10-01" }),
      base("exp2", { shipped: ship("GR 2", "2026-10-25T10:00:00Z") }),
      base("exp1", { expectedDelivery: "2026-10-01", shipped: ship("GR 1", "2026-10-24T10:00:00Z") }),
    ];
    expect(grupoRececao(L[3], HOJE)).toBe(-1);
    expect(porReceber(L, FILTROS_REC, HOJE).map((p) => p.id)).toEqual(["exp1", "exp2", "hoje", "atr"]);
    // O chip "Hoje/amanhã" inclui as expedidas.
    expect(contagensRec(L, FILTROS_REC, HOJE).hoje).toBe(3);
  });

  it("mapPoRow sem guia do portal → shipped null", () => {
    expect(base("x").shipped).toBeNull();
  });
});

describe("Guias: filtro de origem", () => {
  it("Fornecedor = do portal; Equipa = as outras", () => {
    expect(matchesOrigin({ fromPortal: true }, "supplier")).toBe(true);
    expect(matchesOrigin({ fromPortal: false }, "supplier")).toBe(false);
    expect(matchesOrigin({ fromPortal: false }, "team")).toBe(true);
    expect(matchesOrigin({ fromPortal: true }, "team")).toBe(false);
    expect(matchesOrigin({ fromPortal: true }, "all")).toBe(true);
  });
});
