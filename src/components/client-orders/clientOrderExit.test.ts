// Fixa o comportamento das regras de saída de stock da Encomenda Cliente, tal como estavam dentro de ClientOrders.tsx
// (asQty, roundQty, isStockExitConfirmable, isStockExitRevertible, confirmableQty, lineKey e getProductExitGroup). Os mesmos
// testes correram contra a cópia literal de antes da extração e contra o módulo extraído: têm de dar o mesmo.
import { describe, expect, it, vi } from "vitest";
import {
  asQty,
  confirmableQty,
  getProductExitGroup,
  isStockExitConfirmable,
  isStockExitRevertible,
  lineKey,
  roundQty,
  type ClientOrderDocumentLine,
} from "./clientOrderExit";

/** Uma linha de produto como as que rpc_get_client_order_document devolve (os campos que não interessam ficam a null). */
const linha = (x: Partial<ClientOrderDocumentLine> = {}): ClientOrderDocumentLine => ({
  quote_line_id: "ql-1",
  item_type: "product",
  product_id: "p-1",
  product_name: "Torneira",
  product_sku: "TOR-1",
  service_id: null,
  service_name: null,
  service_sku: null,
  quantity: 4,
  line_status: "stock_disponivel_confirmar",
  stock_movement_id: null,
  purchase_order_id: null,
  purchase_order_number: null,
  available_warehouses: null,
  ...x,
});

const wh = (id: string, quantity: number, physical?: number | null, extra: Record<string, unknown> = {}) => ({
  warehouse_id: id,
  warehouse_name: `Armazém ${id}`,
  quantity,
  ...(physical === undefined ? {} : { physical_quantity: physical }),
  ...extra,
});

const naoInteiro = () => false;
const inteiro = () => true;

describe("asQty e roundQty", () => {
  it("asQty: número finito ou 0", () => {
    expect(asQty(3)).toBe(3);
    expect(asQty("3.5")).toBe(3.5);
    expect(asQty("abc")).toBe(0);
    expect(asQty(null)).toBe(0);
    expect(asQty(undefined)).toBe(0);
    expect(asQty(Infinity)).toBe(0);
    expect(asQty(-2)).toBe(-2);
  });
  it("roundQty: tira o ruído da vírgula flutuante (6 casas)", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(2.4999999999)).toBe(2.5);
    expect(roundQty(1.0000004)).toBe(1);
    expect(roundQty(7)).toBe(7);
  });
});

describe("lineKey", () => {
  it("quote_line_id:component_index, com 0 sem componente", () => {
    expect(lineKey({ quote_line_id: "q", component_index: null })).toBe("q:0");
    expect(lineKey({ quote_line_id: "q" })).toBe("q:0");
    expect(lineKey({ quote_line_id: "q", component_index: 2 })).toBe("q:2");
  });
});

describe("isStockExitConfirmable", () => {
  it("só linhas de produto", () => {
    expect(isStockExitConfirmable(linha({ product_id: null }))).toBe(false);
  });
  it("stock disponível: sem qty_reserved (encomendas antigas) ou com reserva > 0", () => {
    expect(isStockExitConfirmable(linha({ qty_reserved: null }))).toBe(true);
    expect(isStockExitConfirmable(linha({ qty_reserved: undefined }))).toBe(true);
    expect(isStockExitConfirmable(linha({ qty_reserved: 3 }))).toBe(true);
    expect(isStockExitConfirmable(linha({ qty_reserved: 0 }))).toBe(false);
  });
  it("parcial: só com parte reservada", () => {
    expect(isStockExitConfirmable(linha({ line_status: "parcial", qty_reserved: 2 }))).toBe(true);
    expect(isStockExitConfirmable(linha({ line_status: "parcial", qty_reserved: 0 }))).toBe(false);
    expect(isStockExitConfirmable(linha({ line_status: "parcial", qty_reserved: null }))).toBe(false);
  });
  it("outros estados: não", () => {
    for (const s of ["servido_por_stock", "recebido", "a_aguardar_encomenda", "sem_fornecedor", "servico", "nao_recebido_anulado"] as const) {
      expect(isStockExitConfirmable(linha({ line_status: s, qty_reserved: 5 })), s).toBe(false);
    }
  });
});

describe("isStockExitRevertible", () => {
  it("sem movimento de saída próprio (baixa automática na assinatura): não", () => {
    expect(isStockExitRevertible(linha({ line_status: "servido_por_stock", stock_exit_movement_id: null }))).toBe(false);
    expect(isStockExitRevertible(linha({ line_status: "servido_por_stock" }))).toBe(false);
  });
  it("servida por stock com movimento: sim", () => {
    expect(isStockExitRevertible(linha({ line_status: "servido_por_stock", stock_exit_movement_id: "m-1" }))).toBe(true);
  });
  it("parcial ou recebido: só com parte já servida por stock", () => {
    expect(isStockExitRevertible(linha({ line_status: "parcial", stock_exit_movement_id: "m-1", qty_served: 1 }))).toBe(true);
    expect(isStockExitRevertible(linha({ line_status: "parcial", stock_exit_movement_id: "m-1", qty_served: 0 }))).toBe(false);
    expect(isStockExitRevertible(linha({ line_status: "recebido", stock_exit_movement_id: "m-1", qty_served: 2 }))).toBe(true);
    expect(isStockExitRevertible(linha({ line_status: "recebido", stock_exit_movement_id: "m-1", qty_served: null }))).toBe(false);
  });
  it("outros estados: não", () => {
    expect(isStockExitRevertible(linha({ line_status: "a_aguardar_encomenda", stock_exit_movement_id: "m-1", qty_served: 3 }))).toBe(false);
    expect(isStockExitRevertible(linha({ line_status: "stock_disponivel_confirmar", stock_exit_movement_id: "m-1", qty_served: 3 }))).toBe(false);
  });
});

describe("confirmableQty", () => {
  it("sem qty_reserved, a quantidade da linha; com ela, a reserva", () => {
    expect(confirmableQty(linha({ quantity: 4, qty_reserved: null }))).toBe(4);
    expect(confirmableQty(linha({ quantity: 4 }))).toBe(4);
    expect(confirmableQty(linha({ quantity: 4, qty_reserved: 2.5 }))).toBe(2.5);
    expect(confirmableQty(linha({ quantity: 4, qty_reserved: 0 }))).toBe(0);
    expect(confirmableQty(linha({ quantity: "6" as unknown as number, qty_reserved: null }))).toBe(6);
  });
});

describe("getProductExitGroup", () => {
  it("sem linhas confirmáveis do produto: quantidade 0, sem armazéns nem sugestão", () => {
    const g = getProductExitGroup("p-1", [linha({ line_status: "servido_por_stock" }), linha({ product_id: "p-2" })], naoInteiro);
    expect(g).toEqual({ product_id: "p-1", quantity: 0, integer: false, warehouses: [], options: [], totalCapacity: 0, suggested: null, lineKeys: [] });
  });

  it("um armazém que cobre tudo: o sugerido pela EC (suggested_warehouse_id) se cobrir", () => {
    const L = [linha({
      qty_reserved: 3,
      suggested_warehouse_id: "B",
      available_warehouses: [wh("A", 3, 10), wh("B", 3, 5), wh("C", 2, 2)],
    })];
    const pedeInteiro = vi.fn(inteiro);
    const g = getProductExitGroup("p-1", L, pedeInteiro);
    expect(pedeInteiro).toHaveBeenCalledWith("p-1");
    expect(g.quantity).toBe(3);
    expect(g.integer).toBe(true);
    // capacidade = stock físico; ordem: reserva (nenhuma) e depois capacidade
    expect(g.options.map((o) => [o.warehouse_id, o.quantity])).toEqual([["A", 10], ["B", 5], ["C", 2]]);
    expect(g.warehouses.map((o) => o.warehouse_id)).toEqual(["A", "B"]);
    expect(g.totalCapacity).toBe(17);
    expect(g.suggested).toEqual([{ warehouse_id: "B", quantity: 3 }]);
    expect(g.lineKeys).toEqual(["ql-1:0"]);
  });

  it("o sugerido que não cobre: cai no primeiro que cobre", () => {
    const L = [linha({ qty_reserved: 4, suggested_warehouse_id: "C", available_warehouses: [wh("A", 4, 6), wh("C", 2, 2)] })];
    const g = getProductExitGroup("p-1", L, naoInteiro);
    expect(g.suggested).toEqual([{ warehouse_id: "A", quantity: 4 }]);
  });

  it("reserva repartida (warehouse_alloc) que bate certo e cabe: a sugestão é a repartição, maior primeiro", () => {
    const L = [
      linha({ quote_line_id: "q1", qty_reserved: 3, available_warehouses: [wh("A", 3, 3), wh("B", 3, 4)], warehouse_alloc: [{ warehouse_id: "A", warehouse_name: "A", qty: 1 }, { warehouse_id: "B", warehouse_name: "B", qty: 2 }] }),
      linha({ quote_line_id: "q1", component_index: 1, qty_reserved: 2, available_warehouses: [wh("A", 2, 3)], warehouse_alloc: [{ warehouse_id: "A", warehouse_name: "A", qty: 2 }] }),
    ];
    const g = getProductExitGroup("p-1", L, naoInteiro);
    expect(g.quantity).toBe(5);
    // A tem 3 de reserva, B 2 → A primeiro
    expect(g.options.map((o) => o.warehouse_id)).toEqual(["A", "B"]);
    expect(g.warehouses).toEqual([]); // nenhum cobre 5 sozinho
    expect(g.suggested).toEqual([{ warehouse_id: "A", quantity: 3 }, { warehouse_id: "B", quantity: 2 }]);
    expect(g.lineKeys).toEqual(["q1:0", "q1:1"]);
  });

  it("repartição com decimais num produto que se conta: não serve; sem armazém que cubra, sem sugestão", () => {
    const L = [linha({ qty_reserved: 3, available_warehouses: [wh("A", 3, 2), wh("B", 3, 2)], warehouse_alloc: [{ warehouse_id: "A", warehouse_name: "A", qty: 1.5 }, { warehouse_id: "B", warehouse_name: "B", qty: 1.5 }] })];
    expect(getProductExitGroup("p-1", L, inteiro).suggested).toBeNull();
    // o mesmo num produto que se mede: serve
    expect(getProductExitGroup("p-1", L, naoInteiro).suggested).toEqual([{ warehouse_id: "A", quantity: 1.5 }, { warehouse_id: "B", quantity: 1.5 }]);
  });

  it("repartição acima da capacidade ou num armazém sem stock: não serve", () => {
    const L = [linha({ qty_reserved: 3, available_warehouses: [wh("A", 3, 5)], warehouse_alloc: [{ warehouse_id: "A", warehouse_name: "A", qty: 1 }, { warehouse_id: "Z", warehouse_name: "Z", qty: 2 }] })];
    expect(getProductExitGroup("p-1", L, naoInteiro).suggested).toEqual([{ warehouse_id: "A", quantity: 3 }]);
  });

  it("sem stock físico (physical_quantity ausente): a capacidade é o maior `quantity` das linhas", () => {
    const L = [
      linha({ quote_line_id: "q1", qty_reserved: 1, available_warehouses: [wh("A", 1)] }),
      linha({ quote_line_id: "q2", qty_reserved: 2, available_warehouses: [wh("A", 2)] }),
    ];
    const g = getProductExitGroup("p-1", L, naoInteiro);
    expect(g.quantity).toBe(3);
    expect(g.options.map((o) => [o.warehouse_id, o.quantity])).toEqual([["A", 2]]);
    expect(g.warehouses).toEqual([]);
    expect(g.suggested).toBeNull();
  });

  it("armazém com stock físico 0 fica fora das opções; a quantidade soma as reservas com roundQty", () => {
    const L = [
      linha({ quote_line_id: "q1", qty_reserved: 0.1, available_warehouses: [wh("A", 0.1, 0), wh("B", 0.1, 1)] }),
      linha({ quote_line_id: "q2", qty_reserved: 0.2, available_warehouses: [] }),
    ];
    const g = getProductExitGroup("p-1", L, naoInteiro);
    expect(g.quantity).toBe(0.3);
    expect(g.options.map((o) => o.warehouse_id)).toEqual(["B"]);
    expect(g.suggested).toEqual([{ warehouse_id: "B", quantity: 0.3 }]);
  });

  it("encomenda antiga (sem qty_reserved): usa a quantidade da linha; linha parcial sem reserva fica de fora", () => {
    const L = [
      linha({ quote_line_id: "q1", quantity: 2, available_warehouses: [wh("A", 2, 9)] }),
      linha({ quote_line_id: "q2", line_status: "parcial", qty_reserved: 0, quantity: 5, available_warehouses: [wh("A", 5, 9)] }),
    ];
    const g = getProductExitGroup("p-1", L, naoInteiro);
    expect(g.quantity).toBe(2);
    expect(g.lineKeys).toEqual(["q1:0"]);
    expect(g.suggested).toEqual([{ warehouse_id: "A", quantity: 2 }]);
  });
});
