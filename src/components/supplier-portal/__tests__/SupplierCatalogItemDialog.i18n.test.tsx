// Diálogo de artigo do catálogo (ramo do RH: produto | serviço, unidades, cores, categorias, fotos): rótulos, dicas,
// erros e listas no idioma do portal. O que se GRAVA não muda com o idioma (a unidade fica «un», a cor «Branco»,
// os números com vírgula nos dois idiomas) e o que o servidor escreve fica como vem.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const spCatalogUpsertItem = vi.fn();
const spCatalogCategorias = vi.fn();
const spCatalogClassificarItem = vi.fn();
const uploadCatalogImage = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/supplierPortal/spRpc", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/spRpc")>()),
  spCatalogUpsertItem: (...a: unknown[]) => spCatalogUpsertItem(...a),
  spCatalogCategorias: () => spCatalogCategorias(),
  spCatalogClassificarItem: (...a: unknown[]) => spCatalogClassificarItem(...a),
}));
vi.mock("@/lib/supplierPortal/catalogImages", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/catalogImages")>()),
  catalogImageUrl: (p: string | null | undefined) => (p ? `https://cdn.test/${p}` : null),
  uploadCatalogImage: (...a: unknown[]) => uploadCatalogImage(...a),
}));
vi.mock("@/lib/supplierPortal/servicoCatalogo", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/servicoCatalogo")>()),
  useDistritos: () => ({
    distritos: [
      { code: "PT-11", name: "Lisboa" },
      { code: "PT-13", name: "Porto" },
    ],
    erro: null,
  }),
}));

import { SupplierCatalogItemDialog } from "../SupplierCatalogItemDialog";
import { CatalogImageError } from "@/lib/supplierPortal/catalogImages";
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
  image_paths: [] as string[],
};

function montar(item: typeof ITEM | null = null) {
  const onSaved = vi.fn();
  render(<SupplierCatalogItemDialog open item={item} onOpenChange={vi.fn()} onSaved={onSaved} onNoAccess={vi.fn()} />);
  return { onSaved };
}

const jpg = (name: string) => new File(["x"], name, { type: "image/jpeg" });

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  [spCatalogUpsertItem, spCatalogClassificarItem, uploadCatalogImage].forEach((f) => f.mockReset());
  spCatalogCategorias.mockReset();
  spCatalogCategorias.mockRejectedValue(new Error("sem lista")); // sem SKU: o formulário fica simples
});

describe("diálogo de artigo em português (como sempre)", () => {
  it("novo artigo", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Novo artigo" })).toBeInTheDocument();
    expect(screen.getByText("Preencha pelo menos a referência e o nome.")).toBeInTheDocument();
    expect(screen.getByText("Material que vende e entrega.")).toBeInTheDocument();
    expect(screen.getByLabelText("Referência *")).toBeInTheDocument();
    expect(screen.getByText("8 a 14 dígitos")).toBeInTheDocument();
    expect(screen.getByLabelText("Preço (sem IVA)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Produto" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Serviço" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "un (unidade)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "m² (metro quadrado)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar artigo" })).toBeInTheDocument();
    expect(screen.getByText("Fotos (até 4)")).toBeInTheDocument();
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

  it("serviço: título, dica, unidades e zona de atuação como sempre", () => {
    montar();
    fireEvent.click(screen.getByRole("radio", { name: "Serviço" }));
    expect(screen.getByRole("heading", { name: "Novo serviço" })).toBeInTheDocument();
    expect(screen.getByText("Preencha a referência, o nome, a unidade e a zona de atuação.")).toBeInTheDocument();
    expect(screen.getByText("Mão de obra ou subempreitada (ex.: eletricista, canalizador).")).toBeInTheDocument();
    expect(screen.getByLabelText("Unidade *")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "empreitada (valor global)" })).toBeInTheDocument();
    expect(screen.getByText("Zona de atuação *")).toBeInTheDocument();
    expect(screen.getByText("0 escolhido(s)")).toBeInTheDocument();
  });
});

describe("diálogo de artigo em inglês", () => {
  beforeEach(() => definirIdioma("en"));

  it("novo artigo, sem português", () => {
    montar();
    expect(screen.getByRole("heading", { name: "New item" })).toBeInTheDocument();
    expect(screen.getByText("Fill in at least the reference and the name.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Product" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Service" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reference *")).toBeInTheDocument();
    expect(screen.getByLabelText("Barcode")).toBeInTheDocument();
    expect(screen.getByText("8 to 14 digits")).toBeInTheDocument();
    expect(screen.getByLabelText("Name *")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toBeInTheDocument();
    expect(screen.getByLabelText("Units per pack")).toBeInTheDocument();
    expect(screen.getByLabelText("Price (excl. VAT)")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum quantity")).toBeInTheDocument();
    expect(screen.getByLabelText("Lead time (days)")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "un (unit)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "m² (square metre)" })).toBeInTheDocument();
    expect(screen.getByText("Photos (up to 4)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create item" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Referência|Nome|Descrição|Marca|Moeda|Cancelar|artigo|Fotos/);
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
    expect(spCatalogUpsertItem).toHaveBeenCalledWith(
      expect.objectContaining({ base_price: "12,5", units_per_pack: "2,5", id: "i1", item_kind: "produto" }),
    );
  });

  it("serviço: título, dica, unidades, zona e erros em inglês; a unidade grava-se pelo código", async () => {
    spCatalogUpsertItem.mockResolvedValue({ created: true, item: { ...ITEM, item_kind: "servico" } });
    const { onSaved } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Service" }));
    expect(screen.getByRole("heading", { name: "New service" })).toBeInTheDocument();
    expect(screen.getByText("Labour or subcontracting (e.g. electrician, plumber).")).toBeInTheDocument();
    expect(screen.getByText("Service area *")).toBeInTheDocument();
    expect(screen.getByText("The districts where you provide this service.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "lump sum (fixed price)" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reference *"), { target: { value: "EL-1" } });
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Electrician" } });
    fireEvent.submit(document.getElementById("sp-item-form") as HTMLFormElement);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the unit of the service.");
    fireEvent.change(screen.getByLabelText("Unit *"), { target: { value: "vg" } });
    fireEvent.submit(document.getElementById("sp-item-form") as HTMLFormElement);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one district in the service area.");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(spCatalogUpsertItem).toHaveBeenCalledWith(
      expect.objectContaining({ item_kind: "servico", unit_label: "vg", service_districts: ["PT-11", "PT-13"] }),
    );
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

describe("categorias, cor e SKU", () => {
  const CATEGORIAS = [
    { id: "c1", codigo: "ELE", nome: "Eletricidade", empresa: null, subcategorias: [{ id: "s1", codigo: "ILU", nome: "Iluminação" }] },
    { id: "c2", codigo: "SEM", nome: "Sem subs", empresa: null, subcategorias: [] },
  ];

  it("em inglês: rótulos, mensagens e nota do SKU; o nome da categoria vem da base e fica como vem", async () => {
    definirIdioma("en");
    spCatalogCategorias.mockResolvedValue(CATEGORIAS);
    montar();
    expect(await screen.findByLabelText("Category *")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Choose the category" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Eletricidade" })).toBeInTheDocument();
    expect(screen.getByLabelText("Subcategory")).toBeInTheDocument();
    expect(screen.getByLabelText("Size")).toBeInTheDocument();
    expect(screen.getByLabelText("Colour")).toBeInTheDocument();
    expect(screen.getByText("Pick one from the list or type a new colour")).toBeInTheDocument();
    expect(screen.getByText("Generated when you save. The 4-digit number is the next one in this subcategory.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Category *"), { target: { value: "c2" } });
    expect(screen.getByRole("option", { name: "This category has none" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reference *"), { target: { value: "R1" } });
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "N1" } });
    fireEvent.change(screen.getByLabelText("Category *"), { target: { value: "" } });
    fireEvent.submit(document.getElementById("sp-item-form") as HTMLFormElement);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the category. The SKU is built from it.");
    expect(document.body.textContent).not.toMatch(/Escolha|Subcategoria|Gera-se/);
  });

  it("a cor: o valor gravado é o nome em português, em qualquer idioma", async () => {
    definirIdioma("en");
    spCatalogCategorias.mockResolvedValue(CATEGORIAS);
    montar();
    const campo = (await screen.findByLabelText("Colour")) as HTMLInputElement;
    const opcao = document.querySelector('#sp-cores option[value="Branco"]');
    expect(opcao).not.toBeNull();
    expect(opcao?.getAttribute("label")).toBe("White");
    // o que a pessoa escreve em inglês passa ao nome português da lista: dele sai o código do SKU
    fireEvent.change(campo, { target: { value: "white" } });
    fireEvent.blur(campo);
    expect(campo.value).toBe("Branco");
    fireEvent.change(campo, { target: { value: "natural wood" } });
    fireEvent.blur(campo);
    expect(campo.value).toBe("Madeira natural");
    // uma cor que não está na lista fica como escrita (primeira letra maiúscula)
    fireEvent.change(campo, { target: { value: "turquesa" } });
    fireEvent.blur(campo);
    expect(campo.value).toBe("Turquesa");
  });

  it("em português a lista de cores não leva rótulos extra (DOM de sempre)", async () => {
    spCatalogCategorias.mockResolvedValue(CATEGORIAS);
    montar();
    await screen.findByLabelText("Cor");
    expect(document.querySelector('#sp-cores option[value="Branco"]')?.hasAttribute("label")).toBe(false);
  });
});

describe("fotos: erros fixos traduzem-se, o texto do servidor fica como vem", () => {
  const escolher = (...files: File[]) =>
    fireEvent.change(screen.getByLabelText(/Escolher fotos do artigo|Choose item photos/), { target: { files } });

  it("ficheiro que não é foto: o motivo segue o idioma ao mudar", async () => {
    montar(ITEM);
    escolher(new File(["x"], "doc.pdf", { type: "application/pdf" }));
    const pt = traduzir("pt", "sp.catalogo.foto.erro.file_type_not_allowed");
    expect(await screen.findByRole("alert")).toHaveTextContent(`doc.pdf: ${pt}`);
    act(() => definirIdioma("en"));
    expect(screen.getByRole("alert")).toHaveTextContent(`doc.pdf: ${traduzir("en", "sp.catalogo.foto.erro.file_type_not_allowed")}`);
  });

  it("falha ao carregar: o texto fixo da biblioteca traduz-se; o que a Edge escreve fica como vem", async () => {
    uploadCatalogImage
      .mockRejectedValueOnce(new CatalogImageError("upload_failed", traduzir("pt", "sp.catalogo.foto.erro.upload_failed"), 500))
      .mockRejectedValueOnce(new CatalogImageError("upload_failed", "A Edge diz: disco cheio", 500));
    montar(ITEM);
    escolher(jpg("a.jpg"));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getAllByText(traduzir("pt", "sp.catalogo.foto.erro.upload_failed")).length).toBeGreaterThan(0);
    act(() => definirIdioma("en"));
    expect(screen.getAllByText(traduzir("en", "sp.catalogo.foto.erro.upload_failed")).length).toBeGreaterThan(0);
    escolher(jpg("b.jpg"));
    await waitFor(() => expect(screen.getAllByText("A Edge diz: disco cheio").length).toBeGreaterThan(0));
  });

  it("legenda, nomes acessíveis e estados em inglês", () => {
    definirIdioma("en");
    montar({ ...ITEM, image_paths: ["acc/i1/a.jpg", "acc/i1/b.jpg"] });
    const lista = screen.getByRole("list", { name: "Photos of Parafuso" });
    expect(within(lista).getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual([
      "Parafuso (main photo)",
      "Parafuso (photo 2)",
    ]);
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make photo 2 the main photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove photo 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add photo/ })).toBeInTheDocument();
  });
});

describe("R3: o erro visível acompanha o idioma quando este muda", () => {
  it("referência e nome em falta: pt -> en -> pt", () => {
    montar();
    fireEvent.submit(document.getElementById("sp-item-form") as HTMLFormElement);
    const pt = traduzir("pt", "sp.catalogo.artigo.erro.obrigatorios");
    const en = traduzir("en", "sp.catalogo.artigo.erro.obrigatorios");
    expect(screen.getByRole("alert")).toHaveTextContent(pt);
    act(() => definirIdioma("en"));
    expect(screen.getByRole("alert")).toHaveTextContent(en);
    act(() => definirIdioma("pt"));
    expect(screen.getByRole("alert")).toHaveTextContent(pt);
  });

  it("a mensagem própria do servidor fica como veio, também ao mudar de idioma", async () => {
    const { SupplierPortalRpcError } = await import("@/lib/supplierPortal/spRpc");
    montar(ITEM);
    spCatalogUpsertItem.mockRejectedValueOnce(new SupplierPortalRpcError({ message: "Referência repetida (servidor)", hint: "conflict" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar alterações" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Referência repetida (servidor)"));
    act(() => definirIdioma("en"));
    expect(screen.getByRole("alert")).toHaveTextContent("Referência repetida (servidor)");
  });

  it("categoria que não gravou: a mensagem composta segue o idioma e traz o erro tal como veio", async () => {
    spCatalogCategorias.mockResolvedValue([
      { id: "c2", codigo: "SEM", nome: "Sem subs", empresa: null, subcategorias: [] },
    ]);
    spCatalogUpsertItem.mockResolvedValue({ created: false, item: ITEM });
    const { SupplierPortalRpcError } = await import("@/lib/supplierPortal/spRpc");
    spCatalogClassificarItem.mockRejectedValue(new SupplierPortalRpcError({ message: "Categoria inválida (servidor)", hint: "validation" }));
    montar(ITEM);
    fireEvent.change(await screen.findByLabelText("Categoria *"), { target: { value: "c2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar alterações" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("O artigo foi gravado, mas a categoria não: Categoria inválida (servidor)"),
    );
    act(() => definirIdioma("en"));
    expect(screen.getByRole("alert")).toHaveTextContent("The item was saved, but the category was not: Categoria inválida (servidor)");
  });
});
