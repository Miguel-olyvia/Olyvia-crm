// Diálogo de artigo do catálogo: rótulos, dicas, erros e números no idioma do portal.
// O servidor aceita ponto e vírgula: em inglês mostra-se o ponto, em português a vírgula; o que se envia não muda.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const spCatalogUpsertItem = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/supplierPortal/spRpc", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/spRpc")>()),
  spCatalogUpsertItem: (...a: unknown[]) => spCatalogUpsertItem(...a),
}));

import { SupplierCatalogItemDialog } from "../SupplierCatalogItemDialog";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";
import { traduzir } from "@/portal-i18n/traduzir";

const ITEM = {
  id: "i1",
  supplier_ref: "A-001",
  barcode: null,
  name: "Parafuso",
  description: null,
  brand: null,
  unit_label: null,
  units_per_pack: 2.5,
  base_price: 12.5,
  currency: "EUR",
  moq: null,
  lead_time_days: 4,
  is_active: true,
  updated_at: "x",
};

function montar(item: typeof ITEM | null = null) {
  const onSaved = vi.fn();
  render(<SupplierCatalogItemDialog open item={item} onOpenChange={vi.fn()} onSaved={onSaved} onNoAccess={vi.fn()} />);
  return { onSaved };
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  spCatalogUpsertItem.mockReset();
});

describe("diálogo de artigo em português (como sempre)", () => {
  it("novo artigo", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Novo artigo" })).toBeInTheDocument();
    expect(screen.getByText("Preencha pelo menos a referência e o nome.")).toBeInTheDocument();
    expect(screen.getByLabelText("Referência *")).toBeInTheDocument();
    expect(screen.getByText("8 a 14 dígitos")).toBeInTheDocument();
    expect(screen.getByText("ex.: un, cx, m, kg")).toBeInTheDocument();
    expect(screen.getByLabelText("Preço (sem IVA)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar artigo" })).toBeInTheDocument();
  });

  it("editar: números com vírgula e botão de sempre", () => {
    montar(ITEM);
    expect(screen.getByRole("heading", { name: "Editar artigo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Preço (sem IVA)")).toHaveValue("12,5");
    expect(screen.getByLabelText("Unidades por embalagem")).toHaveValue("2,5");
    expect(screen.getByLabelText("Prazo de entrega (dias)")).toHaveValue("4");
    expect(screen.getByRole("button", { name: "Guardar alterações" })).toBeInTheDocument();
    expect(screen.getByText("Artigo ativo")).toBeInTheDocument();
  });

  it("referência e nome em falta: mensagem de sempre", () => {
    montar();
    fireEvent.submit(document.getElementById("sp-item-form") as HTMLFormElement);
    expect(screen.getByRole("alert")).toHaveTextContent("A referência e o nome são obrigatórios.");
  });
});

describe("diálogo de artigo em inglês", () => {
  beforeEach(() => definirIdioma("en"));

  it("novo artigo, sem português", () => {
    montar();
    expect(screen.getByRole("heading", { name: "New item" })).toBeInTheDocument();
    expect(screen.getByText("Fill in at least the reference and the name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Reference *")).toBeInTheDocument();
    expect(screen.getByLabelText("Barcode")).toBeInTheDocument();
    expect(screen.getByText("8 to 14 digits")).toBeInTheDocument();
    expect(screen.getByLabelText("Name *")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toBeInTheDocument();
    expect(screen.getByText("e.g. pc, box, m, kg")).toBeInTheDocument();
    expect(screen.getByLabelText("Units per pack")).toBeInTheDocument();
    expect(screen.getByLabelText("Price (excl. VAT)")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum quantity")).toBeInTheDocument();
    expect(screen.getByLabelText("Lead time (days)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create item" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Referência|Nome|Descrição|Marca|Moeda|Cancelar|artigo/);
  });

  it("editar: números com vírgula como sempre (também em inglês), e o que se envia é o que está no campo", async () => {
    spCatalogUpsertItem.mockResolvedValue({ created: false, item: ITEM });
    const { onSaved } = montar(ITEM);
    expect(screen.getByRole("heading", { name: "Edit item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Price (excl. VAT)")).toHaveValue("12,5");
    expect(screen.getByLabelText("Units per pack")).toHaveValue("2,5");
    expect(screen.getByText("Item active")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(spCatalogUpsertItem).toHaveBeenCalledWith(expect.objectContaining({ base_price: "12,5", units_per_pack: "2,5", id: "i1" }));
  });

  it("referência e nome em falta", () => {
    montar();
    fireEvent.submit(document.getElementById("sp-item-form") as HTMLFormElement);
    expect(screen.getByRole("alert")).toHaveTextContent("Reference and name are required.");
  });

  it("A guardar: «Saving...» enquanto grava", async () => {
    spCatalogUpsertItem.mockReturnValue(new Promise(() => {}));
    montar();
    fireEvent.change(screen.getByLabelText("Reference *"), { target: { value: "R1" } });
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "N1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
  });
});

describe("A4: o botão X do diálogo chama-se «Fechar» / «Close» conforme o idioma", () => {
  it("pt -> en", () => {
    montar();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
  });
});

describe("R3: o erro visível acompanha o idioma quando este muda", () => {
  it("referência e nome em falta: pt -> en -> pt", () => {
    montar();
    fireEvent.submit(document.getElementById("sp-item-form") as HTMLFormElement);
    const pt = traduzir("pt", "sp.catalogo.artigo.obrigatorios");
    const en = traduzir("en", "sp.catalogo.artigo.obrigatorios");
    expect(screen.getByRole("alert")).toHaveTextContent(pt);
    act(() => definirIdioma("en"));
    expect(screen.getByRole("alert")).toHaveTextContent(en);
    act(() => definirIdioma("pt"));
    expect(screen.getByRole("alert")).toHaveTextContent(pt);
  });

  it("erro genérico do servidor segue o idioma; a mensagem própria do servidor fica como veio", async () => {
    const { SupplierPortalRpcError } = await import("@/lib/supplierPortal/spRpc");
    montar(ITEM);
    spCatalogUpsertItem.mockRejectedValueOnce(new SupplierPortalRpcError({ message: "x", hint: "not_owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar alterações" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(traduzir("pt", "sp.erro.soPrincipalCatalogo"));
    act(() => definirIdioma("en"));
    expect(screen.getByRole("alert")).toHaveTextContent(traduzir("en", "sp.erro.soPrincipalCatalogo"));
    act(() => definirIdioma("pt"));

    spCatalogUpsertItem.mockRejectedValueOnce(new SupplierPortalRpcError({ message: "Referência repetida (servidor)", hint: "conflict" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar alterações" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Referência repetida (servidor)"));
    act(() => definirIdioma("en"));
    expect(screen.getByRole("alert")).toHaveTextContent("Referência repetida (servidor)");
  });
});
