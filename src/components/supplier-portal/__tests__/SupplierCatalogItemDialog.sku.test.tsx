// O artigo do fornecedor com a categoria, a subcategoria, a medida e a cor: o SKU aparece antes de gravar e a base gera-o ao gravar
// (migration 20270101310000). Sem a lista de categorias na base, o formulário fica como antes.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const upsert = vi.fn(), classificar = vi.fn(), categorias = vi.fn();
vi.mock("@/lib/supplierPortal/spRpc", () => ({
  spCatalogUpsertItem: (...a: unknown[]) => upsert(...a),
  spCatalogClassificarItem: (...a: unknown[]) => classificar(...a),
  spCatalogCategorias: () => categorias(),
  spErrorMessage: (e: Error) => e.message,
  isNoSupplierAccess: () => false,
}));

import { SupplierCatalogItemDialog } from "../SupplierCatalogItemDialog";

const LISTA = [
  { id: "c-rev", codigo: "REV", nome: "Revestimentos", subcategorias: [{ id: "s-par", codigo: "PAR", nome: "Parede" }, { id: "s-pav", codigo: "PAV", nome: "Pavimento" }] },
  { id: "c-iso", codigo: "ISO", nome: "Isolamento e impermeabilização", subcategorias: [] },
];
const ITEM = { id: "i1", supplier_ref: "AZ-1", name: "Azulejo branco", barcode: null, description: null, brand: null, unit_label: "m2", units_per_pack: null,
  base_price: null, currency: "EUR", moq: null, lead_time_days: null, is_active: true, updated_at: "2026-10-29T10:00:00Z" };

function abrir() {
  const onSaved = vi.fn();
  render(<SupplierCatalogItemDialog open item={null} onOpenChange={() => {}} onSaved={onSaved} onNoAccess={() => {}} />);
  fireEvent.change(screen.getByLabelText("Referência *"), { target: { value: "AZ-1" } });
  fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Azulejo branco" } });
  return onSaved;
}

describe("SKU do artigo do fornecedor", () => {
  beforeEach(() => { upsert.mockReset(); classificar.mockReset(); categorias.mockReset(); });

  it("mostra o SKU pela categoria, a subcategoria, a medida e a cor, e grava a classificação a seguir ao artigo", async () => {
    categorias.mockResolvedValue(LISTA);
    upsert.mockResolvedValue({ created: true, item: ITEM });
    classificar.mockResolvedValue({ item: { ...ITEM, sku: "REV-PAR-30X60-BRA-2" } });
    const onSaved = abrir();
    fireEvent.change(await screen.findByLabelText("Categoria *"), { target: { value: "c-rev" } });
    fireEvent.change(screen.getByLabelText("Subcategoria *"), { target: { value: "s-par" } });
    fireEvent.change(screen.getByLabelText("Medida"), { target: { value: "30 x 60 cm" } });
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Branco mate" } });
    expect(screen.getByText("REV-PAR-30X60-BRA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(classificar).toHaveBeenCalledWith("i1", { categoria_id: "c-rev", subcategoria_id: "s-par", medida: "30 x 60 cm", cor: "Branco mate" });
    expect(onSaved.mock.calls[0][0].sku).toBe("REV-PAR-30X60-BRA-2");
  });

  it("sem categoria (ou sem a subcategoria que a categoria tem) não grava", async () => {
    categorias.mockResolvedValue(LISTA);
    abrir();
    await screen.findByLabelText("Categoria *");
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    expect(await screen.findByText("Escolha a categoria. O SKU faz-se com ela.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Categoria *"), { target: { value: "c-rev" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    expect(await screen.findByText("Escolha a subcategoria. O SKU faz-se com ela.")).toBeInTheDocument();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("uma categoria sem subcategorias dá o SKU sem ela", async () => {
    categorias.mockResolvedValue(LISTA);
    abrir();
    fireEvent.change(await screen.findByLabelText("Categoria *"), { target: { value: "c-iso" } });
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Cinza" } });
    expect(screen.getByText("ISO-CIN")).toBeInTheDocument();
  });

  it("sem a lista na base (migration por aplicar), grava como antes, sem classificação", async () => {
    categorias.mockRejectedValue(new Error("função desconhecida"));
    upsert.mockResolvedValue({ created: true, item: ITEM });
    const onSaved = abrir();
    expect(screen.queryByLabelText("Categoria *")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(ITEM, true));
    expect(classificar).not.toHaveBeenCalled();
  });
});
