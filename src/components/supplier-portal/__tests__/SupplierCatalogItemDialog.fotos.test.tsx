// Fotos do artigo do catálogo do fornecedor (até 4; a 1.ª é a principal). Edge supplier-catalog-image
// (migration 20270104300000). Artigo existente: cada ação vai logo à Edge. Artigo novo: as fotos ficam
// em fila e só se carregam depois de o artigo estar gravado (precisa do id).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// O Switch "Artigo ativo" (modo editar) usa ResizeObserver, que o jsdom não tem.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const upsert = vi.fn(), classificar = vi.fn(), categorias = vi.fn();
vi.mock("@/lib/supplierPortal/spRpc", () => ({
  spCatalogUpsertItem: (...a: unknown[]) => upsert(...a),
  spCatalogClassificarItem: (...a: unknown[]) => classificar(...a),
  spCatalogCategorias: () => categorias(),
  spErrorMessage: (e: Error) => e.message,
  isNoSupplierAccess: () => false,
}));

const upload = vi.fn(), remove = vi.fn(), setMain = vi.fn();
vi.mock("@/lib/supplierPortal/catalogImages", async (orig) => ({
  ...(await orig<typeof import("@/lib/supplierPortal/catalogImages")>()),
  catalogImageUrl: (p: string | null | undefined) => (p ? `https://cdn.test/${p}` : null),
  uploadCatalogImage: (...a: unknown[]) => upload(...a),
  removeCatalogImage: (...a: unknown[]) => remove(...a),
  setMainCatalogImage: (...a: unknown[]) => setMain(...a),
}));

import { SupplierCatalogItemDialog } from "../SupplierCatalogItemDialog";
import { CatalogImageError } from "@/lib/supplierPortal/catalogImages";

const P = (n: number) => `acc/i1/foto${n}.jpg`;
const ITEM = {
  id: "i1", supplier_ref: "CAD-VERM", name: "Cadeira vermelha", barcode: null, description: null, brand: null, unit_label: "un",
  units_per_pack: null, base_price: null, currency: "EUR", moq: null, lead_time_days: null, is_active: true,
  updated_at: "2026-11-03T10:00:00Z", image_paths: [] as string[],
};
const jpg = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const fotos = () => screen.getByRole("list", { name: /^Fotos de / });
const imgs = () => within(fotos()).queryAllByRole("img").map((i) => i.getAttribute("alt"));
const escolher = (...files: File[]) =>
  fireEvent.change(screen.getByLabelText("Escolher fotos do artigo"), { target: { files } });

/** A Edge acrescenta a foto ao fim e devolve o artigo. */
function edgeUpload(start: string[]) {
  const current = [...start];
  upload.mockImplementation(async (_id: string, file: File) => {
    const path = `acc/i1/${file.name}`;
    current.push(path);
    return { success: true, path, item: { ...ITEM, image_paths: [...current] } };
  });
}

function abrir(item: typeof ITEM | null, extra: Partial<React.ComponentProps<typeof SupplierCatalogItemDialog>> = {}) {
  const onSaved = vi.fn(), onImagesChanged = vi.fn();
  render(
    <SupplierCatalogItemDialog open item={item} onOpenChange={() => {}} onSaved={onSaved} onNoAccess={() => {}}
      onImagesChanged={onImagesChanged} {...extra} />,
  );
  return { onSaved, onImagesChanged };
}

describe("fotos do artigo no portal do fornecedor", () => {
  beforeEach(() => {
    [upsert, classificar, categorias, upload, remove, setMain].forEach((f) => f.mockReset());
    categorias.mockRejectedValue(new Error("sem lista")); // sem SKU: o formulário fica simples
  });

  it("artigo existente: adicionar carrega já, pela ordem, e avisa a página", async () => {
    edgeUpload([P(1)]);
    const { onImagesChanged } = abrir({ ...ITEM, image_paths: [P(1)] });
    expect(imgs()).toEqual(["Cadeira vermelha (foto principal)"]);
    escolher(jpg("b.jpg"), jpg("c.jpg"));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload.mock.calls.map((c) => [c[0], (c[1] as File).name])).toEqual([["i1", "b.jpg"], ["i1", "c.jpg"]]);
    await waitFor(() => expect(imgs()).toHaveLength(3));
    expect(within(fotos()).getAllByRole("img")[2]).toHaveAttribute("src", "https://cdn.test/acc/i1/c.jpg");
    expect(onImagesChanged).toHaveBeenLastCalledWith(expect.objectContaining({ id: "i1", image_paths: [P(1), "acc/i1/b.jpg", "acc/i1/c.jpg"] }));
  });

  it("remover pede confirmação e só depois chama a Edge", async () => {
    remove.mockResolvedValue({ success: true, removed: true, storage_deleted: true, item: { ...ITEM, image_paths: [P(2)] } });
    const { onImagesChanged } = abrir({ ...ITEM, image_paths: [P(1), P(2)] });
    fireEvent.click(screen.getByRole("button", { name: "Remover a foto 1" }));
    expect(await screen.findByText(/É a foto principal: a seguinte passa a ser a principal/)).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remover foto" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("i1", P(1)));
    await waitFor(() => expect(imgs()).toEqual(["Cadeira vermelha (foto principal)"]));
    expect(within(fotos()).getByRole("img")).toHaveAttribute("src", `https://cdn.test/${P(2)}`);
    expect(onImagesChanged).toHaveBeenCalledWith(expect.objectContaining({ image_paths: [P(2)] }));
  });

  it("marcar como principal põe a foto em 1.º", async () => {
    setMain.mockResolvedValue({ success: true, item: { ...ITEM, image_paths: [P(3), P(1), P(2)] } });
    abrir({ ...ITEM, image_paths: [P(1), P(2), P(3)] });
    expect(screen.queryByRole("button", { name: "Marcar a foto 1 como principal" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar a foto 3 como principal" }));
    await waitFor(() => expect(setMain).toHaveBeenCalledWith("i1", [P(1), P(2), P(3)], P(3)));
    await waitFor(() => expect(within(fotos()).getAllByRole("img")[0]).toHaveAttribute("src", `https://cdn.test/${P(3)}`));
    expect(within(fotos()).getByText("Principal")).toBeInTheDocument();
  });

  it("limite de 4: com 3 só entra mais uma, e o botão de adicionar desaparece", async () => {
    edgeUpload([P(1), P(2), P(3)]);
    abrir({ ...ITEM, image_paths: [P(1), P(2), P(3)] });
    expect(screen.getByRole("button", { name: /Adicionar foto/ })).toHaveTextContent("3/4");
    escolher(jpg("d.jpg"), jpg("e.jpg"));
    expect(await screen.findByText("Cada artigo pode ter no máximo 4 fotos.")).toBeInTheDocument();
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(imgs()).toHaveLength(4));
    expect(screen.queryByRole("button", { name: /Adicionar foto/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Chegou ao máximo de 4 fotos/)).toBeInTheDocument();
  });

  it("recusa HEIC e ficheiros acima de 5 MB sem chamar a Edge", async () => {
    abrir({ ...ITEM, image_paths: [] });
    escolher(new File(["x"], "iphone.heic", { type: "image/heic" }));
    expect(await screen.findByText(/iphone\.heic: Só se aceitam fotos em JPEG, PNG ou WEBP/)).toBeInTheDocument();
    const grande = jpg("grande.jpg");
    Object.defineProperty(grande, "size", { value: 6 * 1024 * 1024 });
    escolher(grande);
    expect(await screen.findByText(/grande\.jpg: A foto tem de ter até 5 MB/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("artigo novo: as fotos ficam em fila, o artigo grava-se primeiro e só depois se carregam", async () => {
    const order: string[] = [];
    upsert.mockImplementation(async () => { order.push("upsert"); return { created: true, item: { ...ITEM } }; });
    edgeUpload([]);
    const base = upload.getMockImplementation()!;
    upload.mockImplementation(async (...a: unknown[]) => { order.push(`upload:${(a[1] as File).name}`); return base(...(a as [string, File])); });
    const { onSaved } = abrir(null);
    fireEvent.change(screen.getByLabelText("Referência *"), { target: { value: "CAD-VERM" } });
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Cadeira vermelha" } });
    escolher(jpg("a.jpg"), jpg("b.jpg"));
    expect(await screen.findAllByTestId("sp-photo-pending")).toHaveLength(2);
    expect(screen.getAllByText("Por carregar")).toHaveLength(2);
    expect(upload).not.toHaveBeenCalled();
    // a 2.ª passa a principal antes de gravar
    fireEvent.click(screen.getByRole("button", { name: "Marcar b.jpg como principal" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(order).toEqual(["upsert", "upload:b.jpg", "upload:a.jpg"]);
    expect(upload.mock.calls[0][0]).toBe("i1");
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "i1", image_paths: ["acc/i1/b.jpg", "acc/i1/a.jpg"] }), true);
  });

  it("artigo novo com uma foto que falha: o artigo fica gravado, mostra o erro e deixa tentar de novo", async () => {
    upsert.mockResolvedValue({ created: true, item: { ...ITEM } });
    upload.mockRejectedValueOnce(new CatalogImageError("file_type_not_allowed", "Só se aceitam fotos em JPEG, PNG ou WEBP (HEIC não: exporte como JPEG).", 415));
    const { onSaved, onImagesChanged } = abrir(null);
    fireEvent.change(screen.getByLabelText("Referência *"), { target: { value: "CAD-VERM" } });
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Cadeira vermelha" } });
    escolher(jpg("a.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Criar artigo" }));
    expect(await screen.findByText(/O artigo foi gravado, mas 1 foto não foi carregada/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onImagesChanged).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }));
    // passou a editar o artigo gravado
    expect(screen.getByRole("button", { name: "Guardar alterações" })).toBeInTheDocument();
    edgeUpload([]);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo carregar a.jpg" }));
    await waitFor(() => expect(imgs()).toEqual(["Cadeira vermelha (foto principal)"]));
    expect(upload).toHaveBeenLastCalledWith("i1", expect.any(File));
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("sem ser o titular: vê as fotos, sem botões para alterar", () => {
    abrir({ ...ITEM, image_paths: [P(1), P(2)] }, { canEditPhotos: false });
    expect(imgs()).toEqual(["Cadeira vermelha (foto principal)", "Cadeira vermelha (foto 2)"]);
    expect(screen.queryByRole("button", { name: /Adicionar foto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remover a foto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /como principal/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Escolher fotos do artigo")).not.toBeInTheDocument();
  });
});
