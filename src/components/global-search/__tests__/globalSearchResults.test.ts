import { describe, it, expect } from "vitest";
import {
  GLOBAL_SEARCH_MAX_CHARS,
  buildGlobalSearchGroups,
  canUseGlobalSearch,
  isSearchable,
  normalizeSearchQuery,
  type GlobalSearchPayload,
} from "../globalSearchResults";
import {
  parseClientOrdersParams,
  parsePurchaseOrdersParams,
  parseReceivingParams,
  parseStocksParams,
  parseSuppliersParams,
  stocksLink,
} from "@/components/inventory/ui/inventoryLinks";

const payload: GlobalSearchPayload = {
  query: "zz",
  purchase_orders: [
    { id: "po-1", order_number: "PO-2026-0001", status: "partially_received", order_date: "2026-10-01", expected_delivery: null, supplier_name: "Alfa" },
  ],
  client_orders: [
    { contract_id: "cc-1", order_number: "EC-2026-0003", contract_number: "CT-1", client_name: "Ana", signature_date: null, origin_type: "contract", origin_number: "CT-1" },
    { contract_id: "cc-2", order_number: "EC-2026-0004", contract_number: "VD-SINT", client_name: "Rui", signature_date: null, origin_type: "direct_sale", origin_number: "VD-2026-0009" },
    { contract_id: "cc-3", order_number: null, contract_number: "MAN-1", client_name: "Eva", signature_date: null, origin_type: "manual", origin_number: null },
  ],
  products: [
    { id: "p-1", sku: "SKU-1", name: "Parafuso", barcode: "5601", matched_code: null, total_quantity: 5 },
    { id: "p-2", sku: "SKU-2", name: "Anilha", barcode: null, matched_code: "ALT-9", total_quantity: "1.5" },
  ],
  suppliers: [{ id: "s-1", name: "Alfa", code: "F1", city: "Évora", vat_number: null, is_active: false }],
  delivery_notes: [{ id: "g-1", note_number: "GR 77", status: "open", document_date: null, supplier_name: "Alfa" }],
};

const query = (href: string) => href.split("?")[1] ?? "";

describe("normalizeSearchQuery / isSearchable", () => {
  it("tira espaços nas pontas e exige 2 caracteres", () => {
    expect(normalizeSearchQuery("  po  ")).toBe("po");
    expect(isSearchable(" p ")).toBe(false);
    expect(isSearchable("po")).toBe(true);
    expect(isSearchable("   ")).toBe(false);
  });
  it("corta ao máximo de caracteres", () => {
    expect(normalizeSearchQuery("x".repeat(250))).toHaveLength(GLOBAL_SEARCH_MAX_CHARS);
  });
});

describe("buildGlobalSearchGroups", () => {
  it("agrupa pela ordem do 2.0 (PO, EC, produto, fornecedor, guia)", () => {
    const groups = buildGlobalSearchGroups(payload);
    expect(groups.map((g) => g.key)).toEqual(["purchase_orders", "client_orders", "products", "suppliers", "delivery_notes"]);
    expect(groups.map((g) => g.label)).toEqual([
      "Encomendas a fornecedor",
      "Encomendas Clientes",
      "Produtos",
      "Fornecedores",
      "Guias do fornecedor",
    ]);
  });

  it("cada resultado leva à ficha certa pelos parâmetros que as páginas leem", () => {
    const [po, ec, prod, sup, guia] = buildGlobalSearchGroups(payload);
    expect(po.items[0].href.startsWith("/purchase-orders?")).toBe(true);
    expect(parsePurchaseOrdersParams(query(po.items[0].href)).open).toBe("po-1");
    expect(ec.items[0].href.startsWith("/client-orders?")).toBe(true);
    expect(parseClientOrdersParams(query(ec.items[0].href)).open).toBe("cc-1");
    expect(prod.items[0].href.startsWith("/stocks?")).toBe(true);
    expect(parseStocksParams(query(prod.items[0].href)).q).toBe("SKU-1");
    expect(sup.items[0].href.startsWith("/suppliers?")).toBe(true);
    expect(parseSuppliersParams(query(sup.items[0].href)).open).toBe("s-1");
    expect(guia.items[0].href.startsWith("/receiving?")).toBe(true);
    const r = parseReceivingParams(query(guia.items[0].href));
    expect(r.guia).toBe("g-1");
    expect(r.tab).toBe("guias");
  });

  it("textos: estado da PO, origem da EC (VD com o seu nº), EAN/código/quantidade, fornecedor inativo", () => {
    const [po, ec, prod, sup, guia] = buildGlobalSearchGroups(payload);
    expect(po.items[0]).toMatchObject({ title: "PO-2026-0001", subtitle: "Alfa · Parcialmente recebida" });
    expect(ec.items[0]).toMatchObject({ title: "EC-2026-0003", subtitle: "Ana · Contrato · CT-1" });
    expect(ec.items[1]).toMatchObject({ title: "EC-2026-0004", subtitle: "Rui · Venda direta · VD-2026-0009" });
    expect(ec.items[2]).toMatchObject({ title: "MAN-1", subtitle: "Eva · Manual" });
    expect(prod.items[0].subtitle).toBe("SKU-1 · EAN 5601 · 5 un");
    expect(prod.items[1].subtitle).toBe("SKU-2 · código ALT-9 · 1,5 un");
    expect(sup.items[0].subtitle).toBe("F1 · Évora · Inativo");
    expect(guia.items[0].subtitle).toBe("Alfa · Aberta");
  });

  it("grupos a null (sem permissão) ou vazios não aparecem", () => {
    const groups = buildGlobalSearchGroups({ purchase_orders: null, client_orders: [], products: [payload.products![0]] });
    expect(groups.map((g) => g.key)).toEqual(["products"]);
  });

  it("volta a confirmar a permissão da página de destino", () => {
    const groups = buildGlobalSearchGroups(payload, (p) => p === "suppliers.view");
    expect(groups.map((g) => g.key)).toEqual(["suppliers"]);
  });

  it("chaves únicas entre grupos e linhas sem id ignoradas", () => {
    const groups = buildGlobalSearchGroups({
      ...payload,
      products: [...payload.products!, { id: "", sku: "X", name: "X", barcode: null, matched_code: null, total_quantity: null }],
    });
    const keys = groups.flatMap((g) => g.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k.startsWith("prod:"))).toHaveLength(2);
  });

  it("resposta inválida → sem grupos", () => {
    expect(buildGlobalSearchGroups(null)).toEqual([]);
    expect(buildGlobalSearchGroups({ products: "x" as unknown as [] })).toEqual([]);
  });
});

describe("canUseGlobalSearch", () => {
  it("só com permissão para pelo menos uma página de destino", () => {
    expect(canUseGlobalSearch(() => false)).toBe(false);
    expect(canUseGlobalSearch((p) => p === "receiving.view")).toBe(true);
  });
});

describe("stocksLink ?q=", () => {
  it("vai para o URL só com texto e volta a ler-se", () => {
    expect(stocksLink({ q: "  " })).toBe("/stocks");
    expect(stocksLink({ q: "SKU 1/A" })).toBe("/stocks?q=SKU+1%2FA");
    expect(parseStocksParams("q=SKU+1%2FA").q).toBe("SKU 1/A");
    expect(parseStocksParams("").q).toBeNull();
  });
});
