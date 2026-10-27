// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SpOrderDetail, SpOrderLine, SpOrderShipments } from "@/lib/supplierPortal/spRpc";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

const shipMock = vi.fn();
vi.mock("@/lib/supplierPortal/spRpc", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, spShipOrder: (...args: unknown[]) => shipMock(...args) };
});

import { SpShipOrderDialog } from "../SpShipOrderDialog";
import { SpOrderBadges } from "../SpOrderBadges";
import { spCanShip, spLineRequiresIntegerQty, spShippingState } from "../spShipping";

function line(over: Partial<SpOrderLine> & { id: string }): SpOrderLine {
  return {
    item_type: "product",
    description: `Artigo ${over.id}`,
    sku: `SKU-${over.id}`,
    supplier_sku: `F-${over.id}`,
    uom_code: "un",
    base_uom_code: "un",
    units_per_uom: 1,
    quantity: 10,
    unit_price: 1,
    vat_rate: 23,
    vat_amount: 0,
    subtotal: 0,
    total: 0,
    received_quantity: 0,
    selected_attributes: {},
    ...over,
  };
}

function order(over: Partial<SpOrderDetail> = {}): SpOrderDetail {
  return {
    purchase_order_id: "po-1",
    order_number: "PO-2026-0001",
    order_date: "2026-10-01",
    expected_delivery: null,
    order_status: "ordered",
    supplier_notes: null,
    currency: "EUR",
    publication: {
      status: "confirmed",
      revision: 3,
      sent_at: "2026-10-01T10:00:00Z",
      viewed_at: null,
      confirmed_at: "2026-10-02T10:00:00Z",
      confirmed_by_name: null,
      promised_date: null,
      supplier_comment: null,
      promised_date_accepted: false,
    },
    can_confirm: false,
    company: { organization_id: "org-1", name: "Empresa X", nif: null, address: null, phone: null, logo_url: null },
    supplier: { name: null, tax_id: null, email: null, phone: null },
    sent_by: null,
    lines: [
      line({ id: "a", quantity: 10 }),
      line({ id: "b", quantity: 4.5, uom_code: "m", base_uom_code: "m" }),
      line({ id: "s", item_type: "service", quantity: 1, uom_code: null, base_uom_code: null }),
    ],
    totals: { subtotal: 0, vat_total: 0, total: 0 },
    ...over,
  };
}

const SHIPMENTS: SpOrderShipments = {
  lines: [
    { id: "a", shipped: 4, to_ship: 6 },
    { id: "b", shipped: 0, to_ship: 4.5 },
    { id: "s", shipped: 0, to_ship: 0 },
  ],
  shipments: [],
};

describe("derivação do estado de expedição", () => {
  it("nada expedido → null; parte → parcialmente; tudo → expedida", () => {
    const o = order();
    expect(spShippingState(o.lines, null)).toBeNull();
    expect(spShippingState(o.lines, { lines: [], shipments: [] })).toBeNull();
    expect(spShippingState(o.lines, SHIPMENTS)).toBe("partially_shipped");
    expect(
      spShippingState(o.lines, {
        lines: [
          { id: "a", shipped: 10, to_ship: 0 },
          { id: "b", shipped: 4.5, to_ship: 0 },
        ],
        shipments: [],
      }),
    ).toBe("shipped");
  });

  it("serviços não contam para o total", () => {
    const o = order();
    // A linha de serviço com "expedido" não faz passar a expedida.
    expect(
      spShippingState(o.lines, {
        lines: [
          { id: "a", shipped: 10, to_ship: 0 },
          { id: "s", shipped: 1, to_ship: 0 },
        ],
        shipments: [],
      }),
    ).toBe("partially_shipped");
  });

  it("pode expedir só confirmada, ordered/partially_received e com algo por expedir", () => {
    expect(spCanShip(order(), SHIPMENTS)).toBe(true);
    expect(spCanShip(order({ order_status: "partially_received" }), SHIPMENTS)).toBe(true);
    expect(spCanShip(order({ order_status: "received" }), SHIPMENTS)).toBe(false);
    expect(spCanShip(order({ order_status: "cancelled" }), SHIPMENTS)).toBe(false);
    const viewed = order();
    viewed.publication = { ...viewed.publication, status: "viewed" };
    expect(spCanShip(viewed, SHIPMENTS)).toBe(false);
    expect(spCanShip(order(), { lines: [{ id: "a", shipped: 10, to_ship: 0 }], shipments: [] })).toBe(false);
    expect(spCanShip(order(), null)).toBe(false);
  });

  it("inteiros só em unidades contáveis ou embalagens", () => {
    expect(spLineRequiresIntegerQty(line({ id: "x" }))).toBe(true);
    expect(spLineRequiresIntegerQty(line({ id: "x", uom_code: "m", base_uom_code: "m" }))).toBe(false);
    expect(spLineRequiresIntegerQty(line({ id: "x", uom_code: "CX10", base_uom_code: "m", units_per_uom: 10 }))).toBe(true);
    expect(spLineRequiresIntegerQty(line({ id: "x", item_type: "service" }))).toBe(false);
  });

  it("etiquetas: expedição não se sobrepõe a recebida/parcialmente recebida", () => {
    const { rerender } = render(
      <SpOrderBadges orderStatus="ordered" publicationStatus="confirmed" shippingState="partially_shipped" />,
    );
    expect(screen.getByText("Parcialmente expedida")).toBeInTheDocument();
    rerender(<SpOrderBadges orderStatus="ordered" publicationStatus="confirmed" shippingState="shipped" />);
    expect(screen.getByText("Expedida")).toBeInTheDocument();
    rerender(<SpOrderBadges orderStatus="partially_received" publicationStatus="confirmed" shippingState="shipped" />);
    expect(screen.getByText("Parcialmente recebida")).toBeInTheDocument();
    expect(screen.queryByText("Expedida")).not.toBeInTheDocument();
    rerender(<SpOrderBadges orderStatus="received" publicationStatus="confirmed" shippingState="shipped" />);
    expect(screen.queryByText("Expedida")).not.toBeInTheDocument();
  });
});

function Harness({
  onShipped = vi.fn(),
  onError = vi.fn(),
}: {
  onShipped?: (...a: unknown[]) => void;
  onError?: (e: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        abrir
      </button>
      <SpShipOrderDialog
        open={open}
        onOpenChange={setOpen}
        order={order()}
        shipments={SHIPMENTS}
        revision={3}
        onShipped={onShipped}
        onError={onError}
      />
    </>
  );
}

function qtyInput(name: string): HTMLInputElement {
  return screen.getByLabelText(`Quantidade a expedir: ${name}`) as HTMLInputElement;
}

describe("SpShipOrderDialog", () => {
  let uuidCount = 0;
  beforeEach(() => {
    uuidCount = 0;
    shipMock.mockReset();
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => `00000000-0000-4000-8000-00000000000${++uuidCount}` as `${string}-${string}-${string}-${string}-${string}`,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("por omissão: só linhas de produto com algo por expedir, quantidade = por expedir, data = hoje", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("abrir"));
    expect(qtyInput("Artigo a").value).toBe("6");
    expect(qtyInput("Artigo b").value).toBe("4.5");
    expect(screen.queryByLabelText("Quantidade a expedir: Artigo s")).not.toBeInTheDocument();
    const date = screen.getByLabelText("Data de expedição") as HTMLInputElement;
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Campo do ficheiro escondido sem a flag.
    expect(screen.queryByLabelText(/Ficheiro da guia/)).not.toBeInTheDocument();
  });

  it("valida: guia obrigatória, máximos, inteiros e pelo menos uma quantidade", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("abrir"));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: /^Expedir ·/ }));
    expect(await screen.findByText("Indique o número da guia de remessa.")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Nº da guia de remessa"));
    expect(shipMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nº da guia de remessa"), { target: { value: "GR 2026/1" } });
    fireEvent.change(qtyInput("Artigo a"), { target: { value: "7" } });
    expect(screen.getByText("Máximo 6.")).toBeInTheDocument();
    fireEvent.change(qtyInput("Artigo a"), { target: { value: "2.5" } });
    expect(screen.getByText("Só números inteiros.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Expedir ·/ }));
    expect(await screen.findByText("Corrija as quantidades assinaladas.")).toBeInTheDocument();
    expect(shipMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(qtyInput("Artigo a").value).toBe("0");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Expedir ·/ }));
    expect(await screen.findByText("Indique a quantidade a expedir em pelo menos uma linha.")).toBeInTheDocument();
    expect(shipMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Expedir tudo" }));
    expect(qtyInput("Artigo a").value).toBe("6");
    expect(qtyInput("Artigo b").value).toBe("4.5");
  });

  it("envia o payload certo, sem linhas a 0, com a revisão; repetir mantém o requestId", async () => {
    const onError = vi.fn();
    const onShipped = vi.fn();
    shipMock
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({ delivery_note_id: "dn-1", note_number: "GR 2026/1", lines: 1, already_shipped: false });
    render(<Harness onError={onError} onShipped={onShipped} />);
    fireEvent.click(screen.getByText("abrir"));
    const dialog = screen.getByRole("dialog");

    fireEvent.change(screen.getByLabelText("Nº da guia de remessa"), { target: { value: "  GR 2026/1 " } });
    fireEvent.change(screen.getByLabelText("Data de expedição"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Transportador (opcional)"), { target: { value: " Própria " } });
    fireEvent.change(qtyInput("Artigo a"), { target: { value: "3" } });
    fireEvent.change(qtyInput("Artigo b"), { target: { value: "0" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /^Expedir ·/ }));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    // Falhou: o diálogo continua aberto; repetir usa o mesmo requestId.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Expedir ·/ }));
    await waitFor(() => expect(onShipped).toHaveBeenCalledTimes(1));

    expect(shipMock).toHaveBeenCalledTimes(2);
    const first = shipMock.mock.calls[0][0];
    const second = shipMock.mock.calls[1][0];
    expect(first).toEqual({
      requestId: "00000000-0000-4000-8000-000000000001",
      poId: "po-1",
      revision: 3,
      noteNumber: "GR 2026/1",
      shipDate: "2026-10-20",
      lines: [{ purchase_order_item_id: "a", quantity: 3 }],
      carrier: "Própria",
    });
    expect(second.requestId).toBe(first.requestId);
    expect(onShipped.mock.calls[0][0]).toMatchObject({ note_number: "GR 2026/1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reabrir o diálogo gera um requestId novo", async () => {
    shipMock.mockResolvedValue({ delivery_note_id: "dn", note_number: "G1", lines: 2, already_shipped: false });
    render(<Harness />);
    fireEvent.click(screen.getByText("abrir"));
    fireEvent.change(screen.getByLabelText("Nº da guia de remessa"), { target: { value: "G1" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Expedir ·/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByText("abrir"));
    fireEvent.change(screen.getByLabelText("Nº da guia de remessa"), { target: { value: "G2" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Expedir ·/ }));
    await waitFor(() => expect(shipMock).toHaveBeenCalledTimes(2));
    expect(shipMock.mock.calls[0][0].requestId).not.toBe(shipMock.mock.calls[1][0].requestId);
  });
});
