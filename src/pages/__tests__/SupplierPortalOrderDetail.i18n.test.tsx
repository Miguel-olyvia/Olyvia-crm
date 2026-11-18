// Detalhe da encomenda do portal do fornecedor e diálogo de confirmação: português igual ao de sempre;
// inglês traduz o ecrã, os toasts e os erros por hint. Os dados escritos por pessoas ficam como vêm.
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const mocks = vi.hoisted(() => ({
  obter: vi.fn(),
  vista: vi.fn(),
  confirmar: vi.fn(),
  pdf: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/contexts/SupplierPortalContext", () => ({
  useSupplierPortal: () => ({ account: { id: "a1" }, refresh: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/supplier-portal/downloadSpOrderPdf", () => ({ downloadSpOrderPdf: mocks.pdf }));
vi.mock("@/lib/supplierPortal/spRpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supplierPortal/spRpc")>()),
  spGetOrder: mocks.obter,
  spMarkOrderViewed: mocks.vista,
  spConfirmOrder: mocks.confirmar,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { SupplierPortalRpcError } from "@/lib/supplierPortal/spRpc";
import SupplierPortalOrderDetail from "../SupplierPortalOrderDetail";

const ordem = (extra: Record<string, unknown> = {}) => ({
  purchase_order_id: "p1",
  order_number: "PO-001",
  order_date: "2026-03-05",
  expected_delivery: "2099-01-20",
  order_status: "ordered",
  supplier_notes: "Entregar na doca 3",
  currency: "EUR",
  publication: {
    status: "viewed",
    revision: 1,
    sent_at: new Date(2026, 2, 5, 10, 30).toISOString(),
    viewed_at: new Date(2026, 2, 6, 9, 0).toISOString(),
    confirmed_at: null,
    confirmed_by_name: null,
    promised_date: null,
    supplier_comment: null,
    promised_date_accepted: false,
  },
  can_confirm: true,
  company: { organization_id: "o1", name: "Empresa A", nif: "500100200", address: "Rua X, Porto", phone: "220000000", logo_url: null },
  supplier: { name: "Forn", tax_id: null, email: null, phone: null },
  sent_by: { name: "Rui", email: "rui@a.pt", phone: "910000000" },
  lines: [
    {
      id: "l1",
      sku: "INT-1",
      supplier_sku: "FORN-1",
      description: "Parafuso inox",
      selected_attributes: { a: { label: "Cor", value: "Preto" } },
      quantity: 1500.5,
      uom_code: "CX",
      units_per_uom: 12,
      base_uom_code: null,
      unit_price: 2.5,
      vat_rate: 23,
      total: 3751.25,
      received_quantity: 10,
    },
  ],
  totals: { subtotal: 3751.25, vat_total: 862.79, total: 4614.04 },
  ...extra,
});

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Envolver = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={["/supplier-portal/orders/p1"]}>
        <Routes>
          <Route path="/supplier-portal/orders/:id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(<SupplierPortalOrderDetail />, { wrapper: Envolver });
}

beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.obter.mockResolvedValue(ordem());
  mocks.vista.mockResolvedValue({ first_view: false });
});

describe("SupplierPortalOrderDetail em português", () => {
  it("cabeçalhos, campos, linhas e totais", async () => {
    montar();
    expect(await screen.findByRole("heading", { level: 1, name: "Encomenda PO-001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarregar PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar encomenda" })).toBeInTheDocument();
    for (const rotulo of ["Número", "Data da encomenda", "Entrega pedida", "Enviada em", "Vista em", "Responsável", "Nome", "NIF", "Morada", "Telefone"]) {
      expect(screen.getByText(rotulo)).toBeInTheDocument();
    }
    expect(screen.getByText("Notas da empresa")).toBeInTheDocument();
    expect(screen.getByText("Linhas (1)")).toBeInTheDocument();
    expect(screen.getByText("Nossa ref.: INT-1")).toBeInTheDocument();
    expect(screen.getByText("Subtotal (sem IVA)")).toBeInTheDocument();
    expect(screen.getByText("05/03/2026, 10:30")).toBeInTheDocument();
    expect(screen.getByText("1500,5 CX")).toBeInTheDocument();
    expect(screen.getByText("= 18 006 un")).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Referência",
      "Descrição",
      "Qtd.",
      "Preço unit.",
      "IVA",
      "Total",
      "Recebido",
    ]);
  });
});

describe("SupplierPortalOrderDetail em inglês", () => {
  beforeEach(() => definirIdioma("en"));

  it("cabeçalhos, campos, linhas e totais em inglês; números, moeda e datas no formato de sempre", async () => {
    montar();
    expect(await screen.findByRole("heading", { level: 1, name: "Order PO-001" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm order" })).toBeInTheDocument();
    for (const rotulo of ["Number", "Order date", "Requested delivery", "Sent on", "Viewed on", "Contact person", "Name", "Address", "Phone"]) {
      expect(screen.getByText(rotulo)).toBeInTheDocument();
    }
    expect(screen.getByText("Company notes")).toBeInTheDocument();
    expect(screen.getByText("Lines (1)")).toBeInTheDocument();
    expect(screen.getByText("Our ref.: INT-1")).toBeInTheDocument();
    expect(screen.getByText("Subtotal (excl. VAT)")).toBeInTheDocument();
    expect(screen.getByText("05/03/2026, 10:30")).toBeInTheDocument();
    expect(screen.getByText("1500,5 CX")).toBeInTheDocument();
    expect(screen.getByText("= 18 006 pcs")).toBeInTheDocument();
    expect(screen.getByText("4614,04 €")).toBeInTheDocument();
    // Dados escritos por pessoas ficam como vêm.
    expect(screen.getByText("Entregar na doca 3")).toBeInTheDocument();
    expect(screen.getByText("Parafuso inox")).toBeInTheDocument();
    expect(screen.getByText("Cor: Preto")).toBeInTheDocument();
    expect(screen.getByText("Rua X, Porto")).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Reference",
      "Description",
      "Qty",
      "Unit price",
      "VAT",
      "Total",
      "Received",
    ]);
  });

  it("avisos: versão atualizada, confirmada, recebida e cancelada", async () => {
    const o = ordem();
    mocks.obter.mockResolvedValue({ ...o, publication: { ...o.publication, revision: 2 } });
    const a = montar();
    expect(await screen.findByText(/The company has updated this order \(version 2, sent on 05\/03\/2026, 10:30\)/)).toBeInTheDocument();
    a.unmount();

    mocks.obter.mockResolvedValue(
      ordem({
        can_confirm: false,
        publication: {
          ...o.publication,
          status: "confirmed",
          confirmed_at: new Date(2026, 2, 7, 11, 0).toISOString(),
          confirmed_by_name: "Ana",
          promised_date: "2026-03-18",
          promised_date_accepted: true,
          supplier_comment: "Tudo ok",
        },
      }),
    );
    const b = montar();
    expect(await screen.findByText("Confirmed on 07/03/2026, 11:00 by Ana · promised delivery 18/03/2026")).toBeInTheDocument();
    expect(screen.getByText("Comment: Tudo ok")).toBeInTheDocument();
    expect(screen.getByText("The company accepted the promised delivery date.")).toBeInTheDocument();
    b.unmount();

    mocks.obter.mockResolvedValue(ordem({ can_confirm: false, order_status: "received" }));
    const c = montar();
    expect(await screen.findByText("This order has already been received by the company.")).toBeInTheDocument();
    c.unmount();
    mocks.obter.mockResolvedValue(ordem({ can_confirm: false, order_status: "cancelled" }));
    montar();
    expect(await screen.findByText("This order was cancelled by the company.")).toBeInTheDocument();
  });

  it("não encontrada e erro ao abrir", async () => {
    mocks.obter.mockRejectedValue(new SupplierPortalRpcError({ message: "x", hint: "not_found" }));
    const a = montar();
    expect(await screen.findByRole("heading", { name: "Order not available" })).toBeInTheDocument();
    expect(screen.getByText(/does not exist, was withdrawn from the portal by the company or you no longer have access/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to orders" })).toBeInTheDocument();
    a.unmount();

    mocks.obter.mockRejectedValue(new SupplierPortalRpcError({ message: "x", code: "42501" }));
    montar();
    expect(await screen.findByRole("heading", { name: "Could not open the order" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("You do not have permission to perform this action.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("falha do PDF: toast em inglês", async () => {
    mocks.pdf.mockRejectedValue(new Error("boom"));
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "Could not generate the PDF",
        description: "boom",
        variant: "destructive",
      }),
    );
  });

  it("diálogo de confirmação: textos, validação da data e toast de sucesso", async () => {
    mocks.confirmar.mockResolvedValue({ already_confirmed: false, promised_date: "2026-03-18" });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm order" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Confirm order PO-001")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Empresa A will be notified of the confirmation\./)).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Promised delivery date (optional)")).toBeInTheDocument();
    expect(within(dialogo).getByText("The company asked for delivery by 20/01/2099.")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Comment (optional)")).toHaveAttribute(
      "placeholder",
      "E.g. delivery in two shipments, item X with a longer lead time…",
    );
    expect(within(dialogo).getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    // fireEvent.submit: o `min` do input travaria o clique no botão (validação nativa) antes de o ecrã validar.
    const formulario = dialogo.querySelector("form") as HTMLFormElement;
    fireEvent.change(within(dialogo).getByLabelText("Promised delivery date (optional)"), { target: { value: "2000-01-01" } });
    fireEvent.submit(formulario);
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/^The date cannot be earlier than 05\/03\/2026\.$/);
    expect(mocks.confirmar).not.toHaveBeenCalled();

    const daqueATresDias = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(within(dialogo).getByLabelText("Promised delivery date (optional)"), { target: { value: daqueATresDias } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirm order" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ title: "Order confirmed", description: "Promised delivery: 18/03/2026." }),
    );
  });

  it("A4: o X do diálogo de confirmar encomenda chama-se «Fechar» em pt e «Close» em en", async () => {
    definirIdioma("pt");
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar encomenda" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(within(dialogo).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("diálogo em português: validação da data como sempre", async () => {
    definirIdioma("pt");
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar encomenda" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Confirmar encomenda PO-001")).toBeInTheDocument();
    expect(within(dialogo).getByText("A empresa pediu entrega até 20/01/2099.")).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Data de entrega prevista (opcional)"), { target: { value: "2000-01-01" } });
    fireEvent.submit(dialogo.querySelector("form") as HTMLFormElement);
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("A data não pode ser anterior a 05/03/2026.");
  });

  it.each([
    ["stale_revision", "Order updated by the company", "default"],
    ["order_closed", "It is no longer possible to confirm", "destructive"],
    ["validation", "Could not confirm the order", "destructive"],
  ])("erro %s: título em inglês", async (hint, titulo, variante) => {
    mocks.confirmar.mockRejectedValue(new SupplierPortalRpcError({ message: "", hint }));
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm order" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirm order" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast.mock.calls[0][0]).toMatchObject({ title: titulo, variant: variante });
  });
});
