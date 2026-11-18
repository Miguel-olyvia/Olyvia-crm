// @vitest-environment jsdom
// «Artigos do fornecedor»: páginas de 50 por cursor (ordem item_type, id), as 2 páginas seguintes
// pré-carregadas, nome/SKU só para os ids da página (sem embeds) e o fim da lista.
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
interface Call {
  table: string;
  select: string;
  eq: [string, unknown][];
  is: [string, unknown][];
  gt: [string, unknown][];
  inIds: unknown[] | null;
  order: string[];
  limit: number | null;
}

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as unknown[],
  failOn: null as null | ((c: unknown) => boolean),
}));

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const call: Call = { table, select: "", eq: [], is: [], gt: [], inIds: null, order: [], limit: null };
    const run = () => {
      db.calls.push(call);
      if (db.failOn?.(call)) return { data: null, error: { message: "falhou" } };
      let rows = [...(db.tables[table] ?? [])];
      for (const [c, v] of call.eq) rows = rows.filter((r) => r[c] === v);
      for (const [c, v] of call.is) rows = rows.filter((r) => (r[c] ?? null) === v);
      for (const [c, v] of call.gt) rows = rows.filter((r) => String(r[c]) > String(v));
      if (call.inIds) rows = rows.filter((r) => call.inIds!.includes(r.id));
      for (const c of [...call.order].reverse()) rows.sort((a, b) => String(a[c]).localeCompare(String(b[c])));
      if (call.limit !== null) rows = rows.slice(0, call.limit);
      const cols = call.select.split(",").map((c) => c.trim());
      return { data: rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))), error: null };
    };
    const b = {
      select: (s: string) => ((call.select = s), b),
      eq: (c: string, v: unknown) => (call.eq.push([c, v]), b),
      is: (c: string, v: unknown) => (call.is.push([c, v]), b),
      gt: (c: string, v: unknown) => (call.gt.push([c, v]), b),
      in: (c: string, v: unknown[]) => ((call.inIds = v), b),
      order: (c: string) => (call.order.push(c), b),
      limit: (n: number) => ((call.limit = n), b),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko),
    };
    return b;
  };
  return { supabase: { from } };
});

import {
  SUPPLIER_ITEMS_PAGE_SIZE,
  fetchSupplierItemsPage,
  supplierItemsKey,
  useSupplierItems,
} from "../useSupplierSheetData";

const SUP = "sup-1";
const pad = (n: number) => String(n).padStart(5, "0");

/** n produtos e m serviços deste fornecedor (+ ruído de outro fornecedor e apagados), ids fora de ordem. */
function seed(nProducts: number, nServices = 0) {
  const items: Row[] = [];
  const products: Row[] = [];
  const services: Row[] = [];
  for (let i = 0; i < nProducts; i++) {
    const k = (i * 7919) % 100000; // ids baralhados em relação à ordem de inserção
    items.push({ id: `p-${pad(k)}`, supplier_id: SUP, item_type: "product", product_id: `prod-${i}`, service_id: null,
      supplier_sku: `R${i}`, purchase_price: i, currency: "EUR", lead_time_days: 2, is_preferred: i === 0, is_active: true, deleted_at: null });
    products.push({ id: `prod-${i}`, name: `Produto ${i}`, sku: `SKU${i}` });
  }
  for (let i = 0; i < nServices; i++) {
    // id «menor» que os produtos: a ordem tem de ser pelo tipo primeiro, não só pelo id.
    items.push({ id: `a-${pad(i)}`, supplier_id: SUP, item_type: "service", product_id: null, service_id: `serv-${i}`,
      supplier_sku: null, purchase_price: 10, currency: "EUR", lead_time_days: null, is_preferred: false, is_active: true, deleted_at: null });
    services.push({ id: `serv-${i}`, name: `Serviço ${i}`, sku: `S${i}` });
  }
  items.push({ id: "p-zz-outro", supplier_id: "outro", item_type: "product", product_id: "prod-0", service_id: null, deleted_at: null });
  items.push({ id: "p-zz-apagado", supplier_id: SUP, item_type: "product", product_id: "prod-0", service_id: null, deleted_at: "2026-01-01" });
  db.tables = {
    item_suppliers: items,
    // A vista já não tem as apagadas nem preço/código.
    item_suppliers_public: items.filter((r) => r.deleted_at === null).map(({ supplier_sku: _a, purchase_price: _b, currency: _c, deleted_at: _d, ...r }) => r),
    products,
    services,
  };
}

const itemCalls = () => (db.calls as Call[]).filter((c) => c.table.startsWith("item_suppliers"));
const sortedIds = (type: string) =>
  (db.tables.item_suppliers ?? []).filter((r) => r.supplier_id === SUP && r.deleted_at === null && r.item_type === type).map((r) => String(r.id)).sort();

function setup(canViewPricing = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useSupplierItems(SUP, canViewPricing), { wrapper });
  return { qc, ...hook };
}

beforeEach(() => {
  db.calls = [];
  db.failOn = null;
});

describe("fetchSupplierItemsPage", () => {
  it("1.ª página: produtos por id, 50, sem OFFSET, filtrada por fornecedor e não apagadas; nomes só dos ids da página", async () => {
    seed(130);
    const page = await fetchSupplierItemsPage(SUP, true, { type: "product", after: null });
    expect(page.rows).toHaveLength(SUPPLIER_ITEMS_PAGE_SIZE);
    expect(page.rows.map((r) => r.id)).toEqual(sortedIds("product").slice(0, 50));
    expect(page.next).toEqual({ type: "product", after: page.rows[49].id });

    const [items, ...names] = db.calls as Call[];
    expect(items.table).toBe("item_suppliers");
    expect(items.select).not.toMatch(/products\(|services\(/); // sem embeds
    expect(items.eq).toEqual([["supplier_id", SUP], ["item_type", "product"]]);
    expect(items.is).toEqual([["deleted_at", null]]);
    expect(items.gt).toEqual([]);
    expect(items.order).toEqual(["id"]);
    expect(items.limit).toBe(50);
    expect(names.map((c) => c.table)).toEqual(["products"]); // sem serviços na página → nenhum pedido a services
    expect(names[0].inIds).toHaveLength(50);

    const first = page.rows[0];
    expect(first.products?.name).toMatch(/^Produto /);
    expect(first.purchase_price).not.toBeNull();
  });

  it("depois dos produtos vêm os serviços na mesma página, e uma página curta é o fim", async () => {
    seed(20, 10);
    const page = await fetchSupplierItemsPage(SUP, true, { type: "product", after: null });
    expect(page.rows.map((r) => r.item_type)).toEqual([...Array(20).fill("product"), ...Array(10).fill("service")]);
    expect(page.rows.slice(20).map((r) => r.id)).toEqual(sortedIds("service"));
    expect(page.rows[20].services?.name).toBe("Serviço 0");
    expect(page.next).toBeNull();
    const svc = itemCalls()[1];
    expect(svc.eq).toContainEqual(["item_type", "service"]);
    expect(svc.limit).toBe(30); // só o que falta para encher a página
  });

  it("sem suppliers.view_pricing lê item_suppliers_public e não mostra preço nem código", async () => {
    seed(5);
    const page = await fetchSupplierItemsPage(SUP, false, { type: "product", after: null });
    const [items] = itemCalls();
    expect(items.table).toBe("item_suppliers_public");
    expect(items.select).not.toMatch(/purchase_price|supplier_sku/);
    expect(items.is).toEqual([]);
    expect(page.rows).toHaveLength(5);
    expect(page.rows.every((r) => r.purchase_price === null && r.supplier_sku === null && r.currency === "")).toBe(true);
  });
});

describe("useSupplierItems", () => {
  it("mostra a 1.ª página e pré-carrega as 2 seguintes em cadeia (cursor = último id)", async () => {
    seed(400);
    const { result } = setup();
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    await waitFor(() => expect(itemCalls()).toHaveLength(3));
    const ids = sortedIds("product");
    expect(itemCalls().map((c) => c.gt[0]?.[1] ?? null)).toEqual([null, ids[49], ids[99]]);
    // O pré-carregamento não entra na lista sozinho.
    expect(result.current.rows).toHaveLength(50);
    expect(result.current.hasNextPage).toBe(true);
  });

  it("«Carregar mais» usa a página pré-carregada e pré-carrega só a que falta", async () => {
    seed(400);
    const { result } = setup();
    await waitFor(() => expect(itemCalls()).toHaveLength(3));
    const before = itemCalls().length;
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(100));
    expect(result.current.rows.map((r) => r.id)).toEqual(sortedIds("product").slice(0, 100));
    // A página 2 veio da cache; agora só se pede a 4 (a 3 já estava pré-carregada).
    await waitFor(() => expect(itemCalls()).toHaveLength(before + 1));
    expect(itemCalls()[before].gt[0]?.[1]).toBe(sortedIds("product")[149]);
  });

  it("fim da lista: sem mais páginas nem pré-carregamentos", async () => {
    seed(60, 5);
    const { result } = setup();
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(65));
    expect(result.current.rows.slice(60).every((r) => r.item_type === "service")).toBe(true);
    expect(result.current.hasNextPage).toBe(false);
    const n = itemCalls().length;
    await new Promise((r) => setTimeout(r, 20));
    expect(itemCalls()).toHaveLength(n);
  });

  it("exatamente 50: a página seguinte vem vazia e a lista acaba", async () => {
    seed(50);
    const { result } = setup();
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
    expect(result.current.rows).toHaveLength(50);
  });

  it("invalidar supplierItemsKey (remover associação) volta a ler as páginas mostradas", async () => {
    seed(120);
    const { result, qc } = setup();
    // Página 1 + pré-carregadas 2 (cheia) e 3 (20 produtos + pedido de serviços).
    await waitFor(() => expect(itemCalls()).toHaveLength(4));
    const removido = result.current.rows[0].id;
    db.tables.item_suppliers = db.tables.item_suppliers.map((r) => (r.id === removido ? { ...r, deleted_at: "2026-11-18" } : r));
    await act(async () => {
      await qc.invalidateQueries({ queryKey: supplierItemsKey(SUP) });
    });
    await waitFor(() => expect(result.current.rows.some((r) => r.id === removido)).toBe(false));
    expect(result.current.rows).toHaveLength(50);
  });

  it("erro na 1.ª página fica no estado de erro", async () => {
    seed(10);
    db.failOn = (c) => (c as Call).table === "item_suppliers";
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
  });
});
