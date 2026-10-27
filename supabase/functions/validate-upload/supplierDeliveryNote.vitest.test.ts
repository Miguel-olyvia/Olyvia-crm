import { describe, it, expect } from "vitest";
import {
  httpStatusForSpHint,
  isSupplierDeliveryNotePath,
  parseSupplierDeliveryNotePath,
  supplierDeliveryNoteFileName,
  supplierDeliveryNoteMime,
} from "./supplierDeliveryNote";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const NOTE = "5e5e0000-0000-4000-8000-000000000301";

describe("anexo da guia do Portal do Fornecedor — caminho", () => {
  it("reconhece o ramo pelo 2.º segmento", () => {
    expect(isSupplierDeliveryNotePath(`${ORG}/supplier-delivery-notes/${NOTE}/a.pdf`)).toBe(true);
    expect(isSupplierDeliveryNotePath(`${ORG}/contract/${NOTE}/a.pdf`)).toBe(false);
    expect(isSupplierDeliveryNotePath(`supplier-delivery-notes/${ORG}/a.pdf`)).toBe(false);
  });

  it("aceita {org}/supplier-delivery-notes/{guia}/{ficheiro}", () => {
    expect(parseSupplierDeliveryNotePath(`${ORG}/supplier-delivery-notes/${NOTE}/9f0c.pdf`)).toEqual({
      orgId: ORG,
      noteId: NOTE,
      leaf: "9f0c.pdf",
    });
  });

  it.each([
    [`${ORG}/supplier-delivery-notes/${NOTE}/../x.pdf`, "traversal"],
    [`${ORG}/supplier-delivery-notes/${NOTE}/.pdf`, "começa por ponto"],
    [`${ORG}/supplier-delivery-notes/${NOTE}/sub/x.pdf`, "subpasta"],
    [`${ORG}/supplier-delivery-notes/${NOTE}/`, "sem ficheiro"],
    [`${ORG}/supplier-delivery-notes/nao-uuid/x.pdf`, "guia não uuid"],
    [`org/supplier-delivery-notes/${NOTE}/x.pdf`, "org não uuid"],
    [`${ORG}/supplier-delivery-notes/${NOTE}/a b.pdf`, "espaço"],
  ])("recusa %s (%s)", (path) => {
    expect(parseSupplierDeliveryNotePath(path)).toBeNull();
  });
});

describe("anexo da guia — tipo, nome e estado HTTP", () => {
  it("só PDF/JPEG/PNG/WEBP", () => {
    expect(supplierDeliveryNoteMime("pdf")).toBe("application/pdf");
    expect(supplierDeliveryNoteMime("jpeg")).toBe("image/jpeg");
    expect(supplierDeliveryNoteMime("png")).toBe("image/png");
    expect(supplierDeliveryNoteMime("webp")).toBe("image/webp");
    expect(supplierDeliveryNoteMime("gif")).toBeNull();
    expect(supplierDeliveryNoteMime("zip-office")).toBeNull();
    expect(supplierDeliveryNoteMime(null)).toBeNull();
  });

  it("limpa o nome e cai no último segmento", () => {
    expect(supplierDeliveryNoteFileName("  Guia 12/2026.pdf ", "x.pdf")).toBe("Guia 122026.pdf");
    expect(supplierDeliveryNoteFileName("\u0001\u0002", "x.pdf")).toBe("x.pdf");
    expect(supplierDeliveryNoteFileName(undefined, "x.pdf")).toBe("x.pdf");
    expect(supplierDeliveryNoteFileName("a".repeat(300), "x.pdf")).toHaveLength(255);
  });

  it("mapeia o hint da RPC", () => {
    expect(httpStatusForSpHint("no_supplier_access")).toBe(403);
    expect(httpStatusForSpHint("not_found")).toBe(404);
    expect(httpStatusForSpHint("order_closed")).toBe(409);
    expect(httpStatusForSpHint("validation")).toBe(422);
    expect(httpStatusForSpHint(undefined)).toBe(500);
  });
});
