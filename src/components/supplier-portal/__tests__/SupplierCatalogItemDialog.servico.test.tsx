// Fase 5 do contrato de fornecedor: um artigo do catálogo pode ser um serviço (subempreitada). Serviço exige unidade e pelo
// menos um distrito; não leva código de barras nem categoria de produto (migration 20270103600000).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const upsert = vi.fn(), classificar = vi.fn(), categorias = vi.fn();
// O diálogo importa as fotos de catalogImages, que carrega o cliente Supabase (sem env nos testes).
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/supplierPortal/spRpc", () => ({
  spCatalogUpsertItem: (...a: unknown[]) => upsert(...a),
  spCatalogClassificarItem: (...a: unknown[]) => classificar(...a),
  spCatalogCategorias: () => categorias(),
  spErrorMessage: (e: Error) => e.message,
  isNoSupplierAccess: () => false,
}));
vi.mock("@/lib/supplierPortal/servicoCatalogo", async (orig) => ({
  ...(await orig<typeof import("@/lib/supplierPortal/servicoCatalogo")>()),
  useDistritos: () => ({ distritos: [{ code: "PT-11", name: "Lisboa" }, { code: "PT-15", name: "Setúbal" }], erro: null }),
}));

import { SupplierCatalogItemDialog } from "../SupplierCatalogItemDialog";

// O Checkbox (Radix) mede-se com ResizeObserver, que o jsdom não tem.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const LISTA = [{ id: "c-iso", codigo: "ISO", nome: "Isolamento", subcategorias: [] }];
const SERVICO = { id: "s1", supplier_ref: "EL-1", name: "Eletricista", barcode: null, description: null, brand: null, unit_label: "h",
  units_per_pack: null, base_price: 25, currency: "EUR", moq: null, lead_time_days: null, is_active: true, updated_at: "2026-11-02T10:00:00Z",
  item_kind: "servico" as const, service_districts: ["PT-11"], mobilization_days: 3 };

function abrirServico() {
  const onSaved = vi.fn();
  render(<SupplierCatalogItemDialog open item={null} onOpenChange={() => {}} onSaved={onSaved} onNoAccess={() => {}} />);
  fireEvent.click(screen.getByRole("radio", { name: "Serviço" }));
  fireEvent.change(screen.getByLabelText("Referência *"), { target: { value: "EL-1" } });
  fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Eletricista" } });
  return onSaved;
}

describe("artigo do fornecedor do tipo serviço", () => {
  beforeEach(() => { upsert.mockReset(); classificar.mockReset(); categorias.mockReset(); categorias.mockResolvedValue(LISTA); });

  it("sem unidade ou sem distrito não grava", async () => {
    abrirServico();
    expect(screen.queryByLabelText("Código de barras")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Categoria *")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    expect(await screen.findByText("Escolha a unidade do serviço.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Unidade *"), { target: { value: "h" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    expect(await screen.findByText("Escolha pelo menos um distrito na zona de atuação.")).toBeInTheDocument();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("serviço completo grava o tipo, a unidade, os distritos e o prazo de mobilização, sem categoria", async () => {
    upsert.mockResolvedValue({ created: true, item: SERVICO });
    const onSaved = abrirServico();
    fireEvent.change(screen.getByLabelText("Unidade *"), { target: { value: "h" } });
    fireEvent.click(screen.getByLabelText("Lisboa"));
    fireEvent.change(screen.getByLabelText("Prazo de mobilização (dias)"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Preço (sem IVA)"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SERVICO, true));
    const payload = upsert.mock.calls[0][0];
    expect(payload).toMatchObject({ item_kind: "servico", supplier_ref: "EL-1", unit_label: "h", service_districts: ["PT-11"], mobilization_days: "3", base_price: "25" });
    expect(payload).not.toHaveProperty("barcode");
    expect(payload).not.toHaveProperty("units_per_pack");
    expect(classificar).not.toHaveBeenCalled();
  });

  it("editar um serviço abre no tipo serviço com os distritos marcados", () => {
    render(<SupplierCatalogItemDialog open item={SERVICO} onOpenChange={() => {}} onSaved={() => {}} onNoAccess={() => {}} />);
    expect(screen.getByRole("radio", { name: "Serviço" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Lisboa")).toHaveAttribute("data-state", "checked");
    expect(screen.getByLabelText("Setúbal")).toHaveAttribute("data-state", "unchecked");
  });
});
