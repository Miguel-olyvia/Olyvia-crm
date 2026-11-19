// 19/11 (auditoria, lote 2, ponto 1): no detalhe da encomenda de cliente, a falta que não se pode pedir diz a causa concreta.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientOrderLineSource, type ClientOrderLineSourceData } from "../ClientOrderLineSource";

const linha = (o: Partial<ClientOrderLineSourceData>): ClientOrderLineSourceData => ({
  item_type: "product", line_status: "sem_fornecedor", quantity: 3, purchase_order_id: null, purchase_order_number: null,
  available_warehouses: null, qty_needed: 3, qty_missing: 3, has_preferred_supplier: true, ...o,
});

describe("ClientOrderLineSource: a causa da falta", () => {
  it("sem fornecedor preferido", () => {
    render(<ClientOrderLineSource line={linha({ has_preferred_supplier: false, request_block_reason: "no_preferred_supplier" })} />);
    expect(screen.getByText("sem fornecedor preferido: escolha um no Catálogo")).toBeTruthy();
  });
  it("unidade do fornecedor incompatível (com fornecedor preferido)", () => {
    render(<ClientOrderLineSource line={linha({ request_block_reason: "incompatible_supplier_uom" })} />);
    expect(screen.getByText("unidade do fornecedor incompatível")).toBeTruthy();
  });
  it("pode pedir-se: «em falta, por pedir ao fornecedor»; a base sem o campo, como antes", () => {
    const { unmount } = render(<ClientOrderLineSource line={linha({ request_block_reason: null })} />);
    expect(screen.getByText("em falta, por pedir ao fornecedor")).toBeTruthy();
    unmount();
    render(<ClientOrderLineSource line={linha({ has_preferred_supplier: false })} />);
    expect(screen.getByText("sem fornecedor preferido: escolha um no Catálogo")).toBeTruthy();
  });
});
