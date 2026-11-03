import { describe, it, expect, vi, beforeEach } from "vitest";

const { invoke, from } = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn((bucket: string) => ({
    getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${p}` } }),
  })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from }, functions: { invoke } },
}));

import {
  CatalogImageError,
  catalogImageUrls,
  catalogMainImageUrl,
  spCatalogRemoveImage,
  spCatalogSetMainImage,
  spCatalogUploadImage,
  validateCatalogImageFile,
} from "../spRpc";

const ITEM = "7bcb6096-9b9f-4533-92c6-617ee1021545";
const P = (n: number) => `acc/${ITEM}/00000000-0000-4000-8000-00000000000${n}.jpg`;

beforeEach(() => {
  invoke.mockReset();
  from.mockClear();
});

describe("URLs públicos", () => {
  it("monta pela ordem, a 1.ª é a principal; sem fotos → []", () => {
    const urls = catalogImageUrls({ image_paths: [P(1), P(2)] });
    expect(urls).toEqual([
      `https://x.supabase.co/storage/v1/object/public/supplier-catalog-images/${P(1)}`,
      `https://x.supabase.co/storage/v1/object/public/supplier-catalog-images/${P(2)}`,
    ]);
    expect(catalogMainImageUrl({ image_paths: [P(2)] })).toContain(P(2));
    expect(catalogImageUrls({})).toEqual([]);
    expect(catalogMainImageUrl(null)).toBeNull();
  });
});

describe("validateCatalogImageFile", () => {
  it("aceita JPEG/PNG/WEBP até 5 MB e recusa o resto", () => {
    expect(validateCatalogImageFile(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(validateCatalogImageFile(new File(["x"], "a.heic", { type: "image/heic" }))).toMatch(/JPEG, PNG ou WEBP/);
    expect(validateCatalogImageFile(new File(["x"], "a.png", { type: "image/png" }), 4)).toMatch(/no máximo 4/);
  });
});

describe("Edge supplier-catalog-image", () => {
  it("upload em multipart com action e catalog_item_id", async () => {
    invoke.mockResolvedValue({ data: { success: true, path: P(1), item: { id: ITEM, image_paths: [P(1)] } }, error: null });
    const r = await spCatalogUploadImage(ITEM, new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(r.path).toBe(P(1));
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe("supplier-catalog-image");
    const body = opts.body as FormData;
    expect(body.get("action")).toBe("upload");
    expect(body.get("catalog_item_id")).toBe(ITEM);
    expect(body.get("file")).toBeInstanceOf(File);
  });

  it("principal = reordenar com essa foto à frente", async () => {
    invoke.mockResolvedValue({ data: { success: true, item: { id: ITEM, image_paths: [P(3), P(1), P(2)] } }, error: null });
    await spCatalogSetMainImage(ITEM, [P(1), P(2), P(3)], P(3));
    expect(invoke).toHaveBeenCalledWith("supplier-catalog-image", {
      body: { action: "reorder", catalog_item_id: ITEM, paths: [P(3), P(1), P(2)] },
    });
  });

  it("erro HTTP → CatalogImageError com o código e a mensagem da Edge", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 409, json: async () => ({ error: "limit", message: "Cada artigo pode ter no máximo 4 fotos" }) } },
    });
    await expect(spCatalogRemoveImage(ITEM, P(1))).rejects.toMatchObject({ code: "limit", status: 409 });
    invoke.mockResolvedValue({ data: null, error: { context: { status: 404, json: async () => ({}) } } });
    await expect(spCatalogRemoveImage(ITEM, P(1))).rejects.toBeInstanceOf(CatalogImageError);
    await expect(spCatalogRemoveImage(ITEM, P(1))).rejects.toMatchObject({ code: "not_deployed" });
  });
});
