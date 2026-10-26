import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  FILTROS_REC,
  blocosRec,
  contagensRec,
  dataEntregaEf,
  faltaPo,
  grupoRececao,
  lineUnitLabel,
  novaConfirmacao,
  porReceber,
  seloRececao,
  textoFalta,
  type ReceivableLine,
  type ReceivablePo,
} from "../porReceber";
import { cancelArgs } from "../cancelRemainder";
import { mapPoRow } from "../useReceivablePos";

const HOJE = "2026-10-26";

const linha = (o: Partial<ReceivableLine> = {}): ReceivableLine => ({
  id: "l1",
  productId: "p1",
  name: "Base duche",
  sku: "BD-1",
  quantity: 10,
  received: 0,
  open: 10,
  uomId: null,
  uomCode: null,
  unitsPerUom: 1,
  ...o,
});

const po = (o: Partial<ReceivablePo> = {}): ReceivablePo => ({
  id: "po1",
  orderNumber: "PO-0001",
  status: "ordered",
  supplierId: "s1",
  supplierName: "Zeta",
  expectedDelivery: null,
  orderDate: "2026-10-01",
  contractId: null,
  origin: null,
  publication: null,
  emailSent: false,
  lines: [linha()],
  ...o,
});

describe("porReceber: a data que conta e o grupo", () => {
  it("hoje e amanhã são o grupo 0; ontem é atrasada; depois de amanhã fica à espera", () => {
    expect(grupoRececao(po({ expectedDelivery: HOJE }), HOJE)).toBe(0);
    expect(grupoRececao(po({ expectedDelivery: "2026-10-27" }), HOJE)).toBe(0);
    expect(grupoRececao(po({ expectedDelivery: "2026-10-25" }), HOJE)).toBe(1);
    expect(grupoRececao(po({ expectedDelivery: "2026-10-28" }), HOJE)).toBe(3);
  });

  it("sem data prevista nunca é hoje nem atrasada (pendente → por enviar)", () => {
    expect(dataEntregaEf(po())).toBeNull();
    expect(grupoRececao(po(), HOJE)).toBe(3);
    expect(grupoRececao(po({ status: "pending" }), HOJE)).toBe(4);
  });

  it("confirmada com data prometida usa a prometida; sem prometida usa a prevista", () => {
    const pub = { status: "confirmed" as const, viewedAt: null, confirmedAt: "2026-10-01T10:00:00Z", promisedDate: "2026-10-20" };
    const a = po({ expectedDelivery: "2026-11-30", publication: pub });
    expect(dataEntregaEf(a)).toBe("2026-10-20");
    expect(grupoRececao(a, HOJE)).toBe(1);
    expect(seloRececao(a)).toEqual(["Confirmada p/ 20/10", "ok"]);
    const b = po({ expectedDelivery: "2026-11-30", publication: { ...pub, promisedDate: null } });
    expect(dataEntregaEf(b)).toBe("2026-11-30");
    expect(grupoRececao(b, HOJE)).toBe(2);
  });

  it("confirmada desde ontem é NOVA e sobe ao grupo 0", () => {
    const p = po({
      expectedDelivery: "2026-12-01",
      publication: { status: "confirmed", viewedAt: null, confirmedAt: "2026-10-25T09:00:00", promisedDate: null },
    });
    expect(novaConfirmacao(p, HOJE)).toBe(true);
    expect(grupoRececao(p, HOJE)).toBe(0);
  });
});

describe("porReceber: selos, falta e filtros", () => {
  it("selos do portal e do envio", () => {
    expect(seloRececao(po({ status: "pending" }))[0]).toBe("Por enviar ao fornecedor");
    expect(seloRececao(po())[0]).toBe("Sem envio registado");
    expect(seloRececao(po({ emailSent: true }))[0]).toBe("Enviada por email");
    expect(seloRececao(po({ publication: { status: "sent", viewedAt: null, confirmedAt: null, promisedDate: null } }))[0]).toBe(
      "No portal · por ver",
    );
    expect(
      seloRececao(po({ publication: { status: "viewed", viewedAt: "2026-10-24", confirmedAt: null, promisedDate: null } }))[0],
    ).toBe("No portal · vista 24/10");
  });

  it("falta em unidades de stock (× embalagem) e só as linhas com falta", () => {
    const p = po({
      lines: [linha({ open: 2, unitsPerUom: 12, uomCode: "cx" }), linha({ id: "l2", open: 0, received: 10 }), linha({ id: "l3", open: 3 })],
    });
    expect(faltaPo(p)).toEqual({ un: 27, linhas: 2 });
    expect(textoFalta(p)).toBe("27 un · 2 linhas");
    expect(lineUnitLabel({ uomCode: "cx", unitsPerUom: 12 })).toBe("cx (= 12 un)");
  });

  it("anular o resto baixa quantity: a falta passa a zero e a PO sai da lista", () => {
    const anulada = mapPoRow({
      id: "po9",
      order_number: "PO-0009",
      status: "partially_received",
      supplier_id: "s1",
      expected_delivery: null,
      order_date: null,
      source_type: null,
      source_id: null,
      suppliers: { name: "Zeta" },
      purchase_order_items: [
        { id: "a", item_type: "product", product_id: "p1", description: "X", sku: null, quantity: 4, received_quantity: 4, uom_id: null, units_per_uom: 1, products: null, uom: null },
        { id: "b", item_type: "service", product_id: null, description: "Montagem", sku: null, quantity: 1, received_quantity: 0, uom_id: null, units_per_uom: 1, products: null, uom: null },
      ],
    });
    expect(anulada.lines).toHaveLength(1); // a linha de serviço não conta
    expect(faltaPo(anulada).un).toBe(0);
    expect(porReceber([anulada], {}, HOJE)).toEqual([]);
  });

  it("chips contam com os outros filtros e carregar no ativo é o filtro do chip", () => {
    const L = [
      po({ id: "a", orderNumber: "PO-1", expectedDelivery: HOJE }),
      po({ id: "b", orderNumber: "PO-2", expectedDelivery: "2026-10-01", contractId: "c1", origin: { originType: "contract", number: "CT-1", clientName: "Ana" } }),
      po({ id: "c", orderNumber: "PO-3", supplierId: "s2", supplierName: "Alfa" }),
    ];
    expect(contagensRec(L, FILTROS_REC, HOJE)).toEqual({ todas: 3, hoje: 1, atrasadas: 1, clientes: 1, stock: 2 });
    expect(contagensRec(L, { sup: "s1" }, HOJE)).toEqual({ todas: 2, hoje: 1, atrasadas: 1, clientes: 1, stock: 1 });
    expect(porReceber(L, { chip: "clientes" }, HOJE).map((p) => p.id)).toEqual(["b"]);
    expect(porReceber(L, { q: "ana" }, HOJE).map((p) => p.id)).toEqual(["b"]);
    expect(porReceber(L, { ids: ["a", "c"] }, HOJE).map((p) => p.id)).toEqual(["a", "c"]);
    // ordem de chegada: hoje, atrasada, à espera
    expect(porReceber(L, {}, HOJE).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("blocos por fornecedor, pela ordem de chegada", () => {
    const L = [
      po({ id: "a", supplierId: "s2", supplierName: "Alfa" }),
      po({ id: "b", supplierId: "s1", supplierName: "Zeta", expectedDelivery: "2026-10-01" }),
      po({ id: "c", supplierId: "s1", supplierName: "Zeta" }),
    ];
    const B = blocosRec(L, HOJE);
    expect(B.map((b) => b.titulo)).toEqual(["Zeta", "Alfa"]);
    expect(B[0].pos.map((p) => p.id)).toEqual(["b", "c"]);
    expect(B[0].falta).toBe(20);
    expect(B[0].atrasada).toBe(true);
  });
});

describe("Não vou receber o resto: motivos para a BD", () => {
  it("Danificado vai como other com nota; Outro exige nota", () => {
    expect(cancelArgs("damaged", "")).toEqual({ reason: "other", notes: "Danificado" });
    expect(cancelArgs("damaged", "caixa partida")).toEqual({ reason: "other", notes: "Danificado: caixa partida" });
    expect(cancelArgs("other", "  ")).toBeNull();
    expect(cancelArgs("found_stock", "")).toEqual({ reason: "found_stock", notes: null });
  });
});
