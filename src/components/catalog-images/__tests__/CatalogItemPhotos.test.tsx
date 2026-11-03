// Miniatura e visualizador das fotos do artigo do catálogo no CRM (e no portal).
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
  },
}));

import { CatalogPhotoStrip, CatalogPhotosViewer, CatalogThumb } from "../CatalogItemPhotos";
import CatalogLinkDialog from "@/components/supplier-portal-crm/CatalogLinkDialog";
import type { CrmCatalogItem } from "@/components/supplier-portal-crm/types";

const ITEM = { name: "Cadeira vermelha", image_paths: ["acc/i1/a.jpg", "acc/i1/b.jpg"] };

function Harness({ item }: { item: typeof ITEM }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CatalogThumb item={item} name={item.name} onOpen={() => setOpen(true)} />
      <CatalogPhotosViewer item={open ? item : null} onClose={() => setOpen(false)} />
    </>
  );
}

describe("miniatura do artigo do catálogo", () => {
  it("sem fotos mostra o marcador e não é botão", () => {
    render(<CatalogThumb item={{ image_paths: [] }} name="Sem foto" onOpen={() => {}} />);
    expect(screen.getByTestId("catalog-photo-placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("mostra a principal com lazy loading e abre o visualizador das fotos", () => {
    render(<Harness item={ITEM} />);
    const btn = screen.getByRole("button", { name: "Ver as 2 fotos de Cadeira vermelha" });
    const img = within(btn).getByRole("img", { name: "Cadeira vermelha" });
    expect(img).toHaveAttribute("src", "https://cdn.test/acc/i1/a.jpg");
    expect(img).toHaveAttribute("loading", "lazy");
    fireEvent.click(btn);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("2 fotos · a 1.ª é a principal")).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: "Cadeira vermelha (foto principal)" })).toHaveAttribute("src", "https://cdn.test/acc/i1/a.jpg");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mostrar a foto 2" }));
    expect(within(dialog).getByRole("img", { name: "Cadeira vermelha (foto 2)" })).toHaveAttribute("src", "https://cdn.test/acc/i1/b.jpg");
  });

  it("foto que não carrega volta ao marcador", () => {
    render(<CatalogThumb item={ITEM} name={ITEM.name} />);
    fireEvent.error(screen.getByRole("img", { name: "Cadeira vermelha" }));
    expect(screen.getByTestId("catalog-photo-placeholder")).toBeInTheDocument();
  });

  it("faixa de fotos: todas, a 1.ª marcada como principal; sem fotos não aparece", () => {
    const { rerender } = render(<CatalogPhotoStrip item={ITEM} name={ITEM.name} />);
    const list = screen.getByRole("list", { name: "Fotos de Cadeira vermelha" });
    expect(within(list).getAllByRole("img")).toHaveLength(2);
    expect(within(list).getByText("Principal")).toBeInTheDocument();
    rerender(<CatalogPhotoStrip item={{ image_paths: [] }} name="x" />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("o diálogo de ligar do CRM mostra as fotos do artigo", () => {
    const item: CrmCatalogItem = {
      id: "cat-1", supplier_ref: "CAD-VERM", barcode: null, name: "Cadeira vermelha", description: null, brand: null,
      unit_label: "un", units_per_pack: null, base_price: null, currency: "EUR", moq: null, lead_time_days: null,
      is_active: true, updated_at: "2026-11-03T00:00:00Z", is_linked: false, is_dismissed: false, links: [],
      image_paths: ITEM.image_paths,
    };
    render(
      <CatalogLinkDialog item={item} suggestions={[]} supplierId="sup-1" organizationId="org-1" canViewPricing={false}
        linking={false} onClose={() => {}} onConfirm={() => {}} />,
    );
    const list = screen.getByRole("list", { name: "Fotos de Cadeira vermelha" });
    expect(within(list).getByRole("img", { name: "Cadeira vermelha (foto principal)" })).toBeInTheDocument();
  });
});
