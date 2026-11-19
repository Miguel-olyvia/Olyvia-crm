// @vitest-environment jsdom
// Portal do fornecedor (encomendas, envios, erros): as palavras seguem o idioma, o português fica como estava e
// o dinheiro, as quantidades e as datas numéricas não mudam com o idioma.
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupplierPortalRpcError, deliveryNoteFileProblem, spErrorMessage } from "@/lib/supplierPortal/spRpc";
import type { SpOrderDetail, SpOrderLine, SpOrderShipments } from "@/lib/supplierPortal/spRpc";
import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";
import { traduzir } from "@/portal-i18n/traduzir";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { SpOrderBadges } from "../SpOrderBadges";
import { SpShipOrderDialog } from "../SpShipOrderDialog";
import { SpShipmentsCard } from "../SpShipmentsCard";
import { formatSpMoney, formatSpQty, spSlaSourceText } from "../spOrderFormat";
import { spShipmentStatusLabel } from "../spShipping";

function line(id: string): SpOrderLine {
  return {
    id,
    item_type: "product",
    description: `Artigo ${id}`,
    sku: `SKU-${id}`,
    supplier_sku: `F-${id}`,
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
  };
}

const ORDER = {
  purchase_order_id: "po-1",
  order_number: "PO-1",
  order_date: "2026-10-01",
  expected_delivery: null,
  order_status: "ordered",
  supplier_notes: null,
  currency: "EUR",
  publication: { status: "confirmed", revision: 1, sent_at: null, viewed_at: null, confirmed_at: null },
  can_confirm: false,
  company: { organization_id: "org-1", name: "Empresa X", nif: null, address: null, phone: null, logo_url: null },
  supplier: { name: null, tax_id: null, email: null, phone: null },
  sent_by: null,
  lines: [line("a")],
  totals: { subtotal: 0, vat_total: 0, total: 0 },
} as unknown as SpOrderDetail;

const SHIPMENTS: SpOrderShipments = {
  lines: [{ id: "a", shipped: 4, to_ship: 6 }],
  shipments: [
    {
      id: "s1",
      note_number: "GR-1",
      date: "2026-10-05",
      carrier: null,
      status: "shipped",
      notes: null,
      has_file: false,
      file: null,
      lines: [{ purchase_order_item_id: "a", quantity: 4 }],
    },
  ] as unknown as SpOrderShipments["shipments"],
};

const SLA_ATRASADA = { status: "overdue", due_date: "2026-10-05", days_late: 3, days_left: null, source: "promised", contract_days: null };

beforeEach(() => {
  window.localStorage.clear();
  reporIdiomaEmMemoria();
});
afterEach(() => {
  act(() => definirIdioma("pt"));
  window.localStorage.clear();
  reporIdiomaEmMemoria();
});

describe("etiquetas de estado", () => {
  it("em português ficam como sempre", () => {
    render(<SpOrderBadges orderStatus="ordered" publicationStatus="viewed" shippingState="partially_shipped" sla={SLA_ATRASADA as never} />);
    expect(screen.getByText("Vista")).toBeInTheDocument();
    expect(screen.getByText("Parcialmente expedida")).toBeInTheDocument();
    expect(screen.getByText("Atrasada · 3 d")).toBeInTheDocument();
    expect(screen.getByText(/^: Prazo de entrega \(SLA\) ultrapassado: era 05\/10\/2026, 3 dias de atraso$/)).toBeInTheDocument();
  });

  it("em inglês traduzem-se, e a data continua dd/mm/aaaa", () => {
    definirIdioma("en");
    const { rerender } = render(
      <SpOrderBadges orderStatus="ordered" publicationStatus="viewed" shippingState="partially_shipped" sla={SLA_ATRASADA as never} />,
    );
    expect(screen.getByText("Viewed")).toBeInTheDocument();
    expect(screen.getByText("Partially shipped")).toBeInTheDocument();
    expect(screen.getByText("Late · 3 d")).toBeInTheDocument();
    expect(screen.getByText(/^: Delivery deadline \(SLA\) exceeded: it was 05\/10\/2026, 3 days late$/)).toBeInTheDocument();
    rerender(<SpOrderBadges orderStatus="cancelled" publicationStatus="confirmed" />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("a origem do prazo (SLA) e o estado das guias seguem o idioma", () => {
    const t = (chave: string, params?: Record<string, string | number>) => traduzir("en", chave, params);
    expect(spSlaSourceText({ source: "contract", contract_days: 1 } as never, t)).toBe(
      "contract deadline: 1 day counted from when the order was sent",
    );
    expect(spShipmentStatusLabel("shipped", t)).toBe("On its way");
    expect(spShipmentStatusLabel("void", t)).toBe("Voided");
    expect(spShipmentStatusLabel("codigo_novo", t)).toBe("codigo_novo");
    expect(spShipmentStatusLabel("received", (c) => traduzir("pt", c))).toBe("Recebida");
  });
});

describe("dinheiro e quantidades não mudam com o idioma", () => {
  it("pt-PT nos dois idiomas", () => {
    const antes = [formatSpMoney(1234.5), formatSpQty(1234.5)];
    definirIdioma("en");
    expect([formatSpMoney(1234.5), formatSpQty(1234.5)]).toEqual(antes);
    expect(antes[1]).toBe("1234,5");
  });
});

describe("mensagens de erro", () => {
  it("por hint, no idioma pedido (e no ativo quando não se pede)", () => {
    const err = new SupplierPortalRpcError({ message: "x", hint: "stale_revision" });
    expect(spErrorMessage(err)).toBe(
      "A empresa atualizou esta encomenda entretanto. Reveja os dados atualizados e confirme de novo.",
    );
    expect(spErrorMessage(err, "en")).toBe(
      "The company has updated this order in the meantime. Review the updated details and confirm again.",
    );
    definirIdioma("en");
    expect(spErrorMessage(new SupplierPortalRpcError({ message: "x", hint: "not_confirmed" }))).toBe(
      "Confirm the order before shipping it.",
    );
  });

  it("as mensagens próprias da chamada (hintMessages) são chaves e traduzem-se", () => {
    const err = new SupplierPortalRpcError({ message: "Guia não encontrada", hint: "not_found" }, { not_found: "sp.erro.guiaNaoDisponivel" });
    expect(spErrorMessage(err, "pt")).toBe("A guia não existe ou já não está disponível no portal.");
    expect(spErrorMessage(err, "en")).toBe("The delivery note does not exist or is no longer available in the portal.");
  });

  it("o texto cru do servidor fica como vem, nos dois idiomas", () => {
    const err = new SupplierPortalRpcError({ message: "«Linha 1»: só faltam 6 para expedir (indicou 7)", hint: "validation" });
    expect(spErrorMessage(err, "en")).toBe("«Linha 1»: só faltam 6 para expedir (indicou 7)");
  });

  it("problemas do ficheiro da guia seguem o idioma ativo", () => {
    expect(deliveryNoteFileProblem({ type: "image/gif", size: 1 })).toMatch(/Tipo de ficheiro/);
    definirIdioma("en");
    expect(deliveryNoteFileProblem({ type: "image/gif", size: 1 })).toBe("File type not allowed (PDF, JPEG, PNG or WEBP only).");
    expect(deliveryNoteFileProblem({ type: "image/png", size: 0 })).toBe("The file is empty.");
    expect(deliveryNoteFileProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toBe("The file must be 10 MB or smaller.");
  });
});

describe("cartão das expedições", () => {
  it("em inglês", () => {
    definirIdioma("en");
    render(<SpShipmentsCard order={ORDER} data={SHIPMENTS} />);
    expect(screen.getByText("Shipments (1)")).toBeInTheDocument();
    expect(screen.getByText("Delivery note GR-1")).toBeInTheDocument();
    expect(screen.getByText("On its way")).toBeInTheDocument();
    expect(screen.getByText("Carrier")).toBeInTheDocument();
    // Quantidades e data: o mesmo formato nos dois idiomas.
    expect(screen.getByText("05/10/2026")).toBeInTheDocument();
  });
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        abrir
      </button>
      <SpShipOrderDialog
        open={open}
        onOpenChange={setOpen}
        order={ORDER}
        shipments={SHIPMENTS}
        revision={1}
        onShipped={vi.fn()}
        onError={vi.fn()}
      />
    </>
  );
}

describe("diálogo de expedir", () => {
  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => "00000000-0000-4000-8000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("em inglês, e a mensagem de erro muda de idioma com o diálogo aberto", async () => {
    definirIdioma("en");
    render(<Harness />);
    fireEvent.click(screen.getByText("abrir"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ship order PO-1")).toBeInTheDocument();
    expect(screen.getByLabelText("Delivery note no.")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity to ship: Artigo a")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Ship ·/ }));
    expect(await screen.findByText("Enter the delivery note number.")).toBeInTheDocument();

    act(() => definirIdioma("pt"));
    expect(await screen.findByText("Indique o número da guia de remessa.")).toBeInTheDocument();
    expect(screen.queryByText("Enter the delivery note number.")).not.toBeInTheDocument();
  });
});
