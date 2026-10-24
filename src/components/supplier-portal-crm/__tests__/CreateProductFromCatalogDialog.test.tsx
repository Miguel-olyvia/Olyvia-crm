// @vitest-environment jsdom
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CrmCatalogItem } from "../types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

vi.mock("../catalogProductCreate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../catalogProductCreate")>();
  return {
    ...actual,
    loadCreateMeta: vi.fn(async () => ({ meta: { uoms: [], brands: [], categories: [] }, error: null })),
    findTakenSkus: vi.fn(async () => ({ taken: new Set<string>(), error: null })),
    createProductFromCatalog: vi.fn(async () => ({
      status: "linked",
      productId: "prod-1",
      result: { warnings: [] },
    })),
  };
});

import CreateProductFromCatalogDialog from "../CreateProductFromCatalogDialog";
import BulkCreateProductsDialog from "../BulkCreateProductsDialog";

const ITEM: CrmCatalogItem = {
  id: "cat-1",
  supplier_ref: "REF-001",
  barcode: "5601234567890",
  name: "Torneira misturadora",
  description: null,
  brand: null,
  unit_label: "un",
  units_per_pack: null,
  base_price: 12.5,
  currency: "EUR",
  moq: null,
  lead_time_days: null,
  is_active: true,
  updated_at: "2026-10-01T00:00:00Z",
  is_linked: false,
  is_dismissed: false,
  links: [],
};

function SingleHarness({ onDone }: { onDone?: () => void }) {
  const [item, setItem] = useState<CrmCatalogItem | null>(null);
  return (
    <>
      <button type="button" onClick={() => setItem(ITEM)}>abrir</button>
      <CreateProductFromCatalogDialog
        item={item}
        supplierId="sup-1"
        organizationId="org-1"
        canViewPricing
        onClose={() => setItem(null)}
        onDone={() => { setItem(null); onDone?.(); }}
      />
    </>
  );
}

async function openSingle() {
  fireEvent.click(screen.getByRole("button", { name: "abrir" }));
  await screen.findByLabelText(/SKU \*/);
}

describe("CreateProductFromCatalogDialog — fechar não rebenta", () => {
  it("Cancelar com o formulário carregado (com preços)", async () => {
    render(<SingleHarness />);
    await openSingle();
    expect(screen.getByLabelText(/Preço de compra \(EUR\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Escape fecha sem erro", async () => {
    render(<SingleHarness />);
    await openSingle();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Criar e ligar fecha sem erro e reabre limpo", async () => {
    const onDone = vi.fn();
    render(<SingleHarness onDone={onDone} />);
    await openSingle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Criar e ligar/ }));
    });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await openSingle();
    expect((screen.getByLabelText(/Nome \*/) as HTMLInputElement).value).toBe(ITEM.name);
  });
});

function BulkHarness() {
  const [items, setItems] = useState<CrmCatalogItem[] | null>(null);
  return (
    <>
      <button type="button" onClick={() => setItems([ITEM])}>abrir</button>
      <BulkCreateProductsDialog
        items={items}
        supplierId="sup-1"
        organizationId="org-1"
        canViewPricing
        onClose={() => setItems(null)}
        onFinished={() => {}}
      />
    </>
  );
}

describe("BulkCreateProductsDialog — fechar não rebenta", () => {
  it("criar em lote e fechar", async () => {
    render(<BulkHarness />);
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    await screen.findByText(ITEM.name);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Criar 1 produto/ }));
    });
    await screen.findByText("Criado e ligado");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
