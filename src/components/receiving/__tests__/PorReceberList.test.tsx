import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { PorReceberList } from "../PorReceberList";
import { FILTROS_REC, type FiltrosRec, type ReceivablePo } from "../porReceber";

const HOJE = "2026-10-26";

const po = (o: Partial<ReceivablePo>): ReceivablePo => ({
  id: "x",
  orderNumber: "PO-X",
  status: "ordered",
  supplierId: "s1",
  supplierName: "Zeta",
  expectedDelivery: null,
  orderDate: null,
  contractId: null,
  origin: null,
  publication: null,
  emailSent: false,
  lines: [{ id: "l", productId: "p", name: "Base", sku: null, quantity: 42, received: 0, open: 42, uomId: null, uomCode: null, unitsPerUom: 1 }],
  ...o,
});

const POS: ReceivablePo[] = [
  po({ id: "a", orderNumber: "PO-0001", expectedDelivery: HOJE }),
  po({
    id: "b",
    orderNumber: "PO-0002",
    expectedDelivery: "2026-10-20",
    contractId: "c1",
    origin: { originType: "contract", number: "CT-0007", clientName: "Tiago Almeida" },
    emailSent: true,
  }),
  po({ id: "c", orderNumber: "PO-0003", status: "pending", supplierId: "s2", supplierName: "Alfa" }),
];

function Harness(props: { canReceive?: boolean; noPermission?: boolean; onOpenPo?: (id: string) => void }) {
  const [f, setF] = useState<FiltrosRec>(FILTROS_REC);
  return (
    <MemoryRouter>
      <PorReceberList
        pos={POS}
        loading={false}
        error={null}
        noPermission={!!props.noPermission}
        today={HOJE}
        f={f}
        setF={setF}
        canReceive={props.canReceive ?? true}
        receiveReason="Sem permissão: requer receiving.receive, purchase_orders.receive e inventory.edit"
        onOpenPo={props.onOpenPo ?? (() => {})}
      />
    </MemoryRouter>
  );
}

describe("PorReceberList", () => {
  it("mostra as colunas, os grupos por ordem de chegada e os selos", () => {
    render(<Harness />);
    const tabela = screen.getByRole("table", { name: "Encomendas por receber, por ordem de chegada" });
    for (const c of ["Nº", "Fornecedor", "Para", "Portal · entrega", "Falta"]) {
      expect(within(tabela).getByRole("columnheader", { name: c })).toBeInTheDocument();
    }
    const grupos = within(tabela)
      .getAllByRole("columnheader")
      .filter((h) => h.getAttribute("scope") === "colgroup")
      .map((h) => h.textContent);
    expect(grupos).toEqual(["Chega hoje / amanhã · 1", "Atrasadas · 1", "Por enviar ao fornecedor · 1"]);
    expect(within(tabela).getByText("CT-0007 · Tiago Almeida")).toBeInTheDocument();
    expect(within(tabela).getByText("Atrasada · 20/10")).toBeInTheDocument();
    expect(within(tabela).getByText("Enviada por email")).toBeInTheDocument();
    expect(within(tabela).getAllByText("42 un · 1 linha")).toHaveLength(3);
  });

  it("os chips filtram e voltar a carregar mostra todas", () => {
    render(<Harness />);
    const chip = screen.getByRole("button", { name: /Para clientes/ });
    fireEvent.click(chip);
    const tabela = screen.getByRole("table", { name: "Encomendas por receber, por ordem de chegada" });
    expect(within(tabela).queryByText("PO-0001")).toBeNull();
    expect(within(tabela).getByText("PO-0002")).toBeInTheDocument();
    fireEvent.click(chip);
    expect(within(tabela).getByText("PO-0001")).toBeInTheDocument();
  });

  it("Dar entrada abre a PO", () => {
    const onOpenPo = vi.fn();
    render(<Harness onOpenPo={onOpenPo} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Dar entrada PO-0002" })[0]);
    expect(onOpenPo).toHaveBeenCalledWith("b");
  });

  it("modo consulta: Dar entrada fica desativado com o motivo e não abre", () => {
    const onOpenPo = vi.fn();
    render(<Harness canReceive={false} onOpenPo={onOpenPo} />);
    const b = screen.getAllByRole("button", { name: "Dar entrada PO-0001" })[0];
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAttribute("title", expect.stringContaining("receiving.receive"));
    fireEvent.click(b);
    expect(onOpenPo).not.toHaveBeenCalled();
    expect(screen.getAllByText("Modo consulta").length).toBeGreaterThan(0);
  });

  it("sem purchase_orders.view diz que não tem permissão (não 'nada por receber')", () => {
    render(<Harness noPermission />);
    expect(screen.getByText("Sem permissão para ver encomendas")).toBeInTheDocument();
    expect(screen.queryByText("Nada por receber")).toBeNull();
  });
});
