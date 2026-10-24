// @vitest-environment jsdom
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const fromImpl = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => fromImpl(...args),
  },
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, loading: false }),
}));

const toastFn = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastFn }) }));

import {
  costEffect,
  describeOutcome,
  summarizeDecision,
  type DecideResult,
  type PriceChangeItem,
} from "../priceChanges";
import { describeCatalogPriceEffect, GENERIC_PRICE_EFFECT, type LinkPriceContext } from "../linkPricePreview";
import { applyCatalogPriceOnLink, createProductFromCatalog, linkPriceKeepsWrittenCost } from "../catalogProductCreate";
import { describeLinkPriceOutcome, type CrmCatalogItem } from "../types";
import PriceChangeDecisionDialog, { type PriceDecisionRequest } from "../PriceChangeDecisionDialog";
import SupplierPriceChangesSection from "../SupplierPriceChangesSection";

const ITEM: PriceChangeItem = {
  id: "req-1",
  status: "pending",
  organization_id: "org-1",
  requested_at: "2026-10-07T10:00:00Z",
  batch_id: "b-1",
  supplier: { id: "sup-1", name: "Forn X" },
  catalog_item: { id: "ci-1", supplier_ref: "REF-1", name: "Torneira", is_active: true },
  item_supplier_id: "is-1",
  product: { id: "p-1", name: "Torneira cozinha", sku: "TC-1" },
  purchase_uom: { id: null, code: null },
  is_preferred: true,
  current_price: 10,
  current_currency: "EUR",
  old_price: 10,
  new_price: 12,
  currency: "EUR",
  catalog_old_price: 10,
  catalog_new_price: 12,
  diff: 2,
  diff_pct: 20,
  unit_changed: false,
  old_unit_label: "un",
  unit_label: "un",
  old_units_per_pack: null,
  units_per_pack: null,
  stale: false,
  already_applied: false,
  product_cost: {
    will_update: true,
    reason: null,
    message: null,
    is_preferred: true,
    preferred_supplier_name: null,
    units_per_purchase_uom: 1,
    new_unit_cost: 12,
    current_unit_cost: 10,
    current_cost_currency: "EUR",
    sale_price: 20,
    margin_current_pct: 50,
    margin_new_pct: 40,
  },
  decided_at: null,
  decided_by: null,
  decision_note: null,
  superseded_at: null,
  superseded_by: null,
  result: null,
};

const CATALOG_ITEM: CrmCatalogItem = {
  id: "cat-1",
  supplier_ref: "REF-001",
  barcode: null,
  name: "Torneira",
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

beforeEach(() => {
  rpc.mockReset();
  fromImpl.mockReset();
  toastFn.mockReset();
});

describe("priceChanges — textos", () => {
  it("custo do produto muda / não muda (preferencial)", () => {
    expect(costEffect(ITEM)).toEqual({ changes: true, text: expect.stringContaining("Muda: 10,00 EUR → 12,00 EUR") });
    const notPref = {
      ...ITEM,
      product_cost: { ...ITEM.product_cost!, will_update: false, reason: "not_preferred", preferred_supplier_name: "Forn Y" },
    };
    expect(costEffect(notPref).text).toBe("Não muda: o custo vem do fornecedor preferencial (Forn Y)");
  });

  it("resultado por pedido e resumo", () => {
    const r: DecideResult = {
      approved: 1,
      rejected: 0,
      skipped: 1,
      item_suppliers_updated: 1,
      product_costs_updated: 0,
      results: [
        {
          id: "req-1",
          outcome: "approved",
          item_supplier_updated: true,
          accepted_unit_change: false,
          product_cost_updated: false,
          product_cost_rows: 0,
          product_cost_reason: "not_preferred",
          product_cost_message: "O custo do produto vem do fornecedor preferencial (Y): só o preço deste fornecedor foi atualizado",
          new_unit_cost: null,
          units_per_purchase_uom: 1,
        },
        { id: "req-2", outcome: "skipped", reason: "unit_changed", message: "Confirme a unidade" },
      ],
    };
    expect(describeOutcome(r.results[0], ITEM).text).toContain("Preço do fornecedor atualizado para 12,00 EUR.");
    expect(describeOutcome(r.results[0], ITEM).text).toContain("preferencial (Y)");
    expect(describeOutcome(r.results[1], undefined)).toEqual({ text: "Confirme a unidade", tone: "warn" });
    expect(summarizeDecision(r)).toBe("1 aceite(s), 1 não decidido(s). Custo do produto atualizado em 0.");
  });

  it("toast da ligação: custo atualizado / só a ligação", () => {
    const base = { item_supplier_id: "x", created: true, already_linked: false, codes: [], warnings: [] };
    expect(describeLinkPriceOutcome({ ...base, item_supplier_price_updated: true, product_cost_updated: true, new_unit_cost: 13 }, "EUR"))
      .toBe("Preço do fornecedor e custo do produto atualizados (custo 13,00 EUR).");
    expect(describeLinkPriceOutcome({
      ...base,
      item_supplier_price_updated: true,
      product_cost_updated: false,
      product_cost_message: "A unidade de compra desta ligação não é compatível com a unidade do produto: o custo do produto não mudou",
    })).toBe("Preço do fornecedor atualizado. A unidade de compra desta ligação não é compatível com a unidade do produto: o custo do produto não mudou.");
    expect(describeLinkPriceOutcome({ ...base, item_supplier_price_updated: false, product_cost_updated: false })).toBeNull();
  });
});

describe("linkPricePreview — texto da opção", () => {
  const ctx: LinkPriceContext = {
    rows: [
      { id: "is-pref", uomId: null, isPreferred: true, supplierName: "Forn Y" },
      { id: "is-other", uomId: null, isPreferred: false, supplierName: "Forn X" },
    ],
    productUomId: "uom-un",
    cost: { price: 10, currency: "EUR" },
  };

  it("preferencial à unidade: prevê o custo", () => {
    expect(describeCatalogPriceEffect({ basePrice: 13, currency: "EUR", ctx, targetRowId: "is-pref" }))
      .toBe("Atualiza o preço deste fornecedor e o custo do produto (10,00 → 13,00 EUR).");
  });

  it("não preferencial: diz de onde vem o custo", () => {
    expect(describeCatalogPriceEffect({ basePrice: 13, currency: "EUR", ctx, targetRowId: "is-other" }))
      .toContain("fornecedor preferencial (Forn Y)");
    // Ligação nova num produto que já tem ligações: não é a preferencial.
    expect(describeCatalogPriceEffect({ basePrice: 13, currency: "EUR", ctx, targetRowId: null, targetUomId: null }))
      .toContain("Forn Y");
  });

  it("sem contexto ou linha por decidir: texto genérico", () => {
    expect(describeCatalogPriceEffect({ basePrice: 13, currency: "EUR", ctx: null, targetRowId: "is-pref" })).toBe(GENERIC_PRICE_EFFECT);
    expect(describeCatalogPriceEffect({ basePrice: 13, currency: "EUR", ctx, targetRowId: undefined })).toBe(GENERIC_PRICE_EFFECT);
  });

  it("primeira ligação do produto: fica preferencial", () => {
    expect(describeCatalogPriceEffect({
      basePrice: 4.5,
      currency: "EUR",
      ctx: { rows: [], productUomId: null, cost: null },
      targetRowId: null,
      targetUomId: null,
    })).toBe("Atualiza o preço deste fornecedor e o custo do produto (passa a 4,50 EUR).");
  });
});

describe("criar produto a partir do catálogo — preço na ligação", () => {
  it("sem can_manage_prices nunca usa o preço do catálogo", () => {
    expect(applyCatalogPriceOnLink(CATALOG_ITEM, true, false)).toBe(false);
    expect(applyCatalogPriceOnLink(CATALOG_ITEM, true, true)).toBe(true);
    expect(applyCatalogPriceOnLink({ ...CATALOG_ITEM, units_per_pack: 12 }, true, true)).toBe(false);
  });

  it("só leva o preço se o custo escrito for o do catálogo", () => {
    expect(linkPriceKeepsWrittenCost(CATALOG_ITEM, 12.5)).toBe(true);
    expect(linkPriceKeepsWrittenCost(CATALOG_ITEM, 11)).toBe(false);
    expect(linkPriceKeepsWrittenCost(CATALOG_ITEM, null)).toBe(false);
  });

  const chain = (result: unknown) => {
    const q: Record<string, unknown> = {};
    ["select", "eq", "in", "is", "order", "limit"].forEach((m) => { q[m] = () => q; });
    (q as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return q;
  };

  const input = {
    organizationId: "org-1",
    supplierId: "sup-1",
    item: CATALOG_ITEM,
    sku: "REF-001",
    name: "Torneira",
    description: "",
    barcode: "",
    brandId: null,
    categoryId: null,
    subcategoryId: null,
    uomId: null,
    status: "active" as const,
    productType: "both" as const,
    purchasePrice: 12.5,
    salePrice: null,
    currency: "EUR" as const,
    vatRate: 23,
    applyCatalogPrice: true,
  };

  it("no_price_permission: liga outra vez sem o preço (produto não fica sem ligação)", async () => {
    fromImpl.mockImplementation(() => chain({ data: [], error: null }));
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "rpc_create_product") return { data: "prod-1", error: null };
      if (fn === "rpc_catalog_link" && args.p_apply_catalog_price) {
        return {
          data: null,
          error: { code: "42501", hint: "no_price_permission", message: "Sem permissão para alterar preços: liga sem usar o preço do catálogo" },
        };
      }
      return { data: { item_supplier_id: "is-1", created: true, already_linked: false, codes: [], warnings: [] }, error: null };
    });
    const out = await createProductFromCatalog(input);
    expect(out.status).toBe("linked");
    const linkCalls = rpc.mock.calls.filter((c) => c[0] === "rpc_catalog_link");
    expect(linkCalls.map((c) => (c[1] as { p_apply_catalog_price: boolean }).p_apply_catalog_price)).toEqual([true, false]);
    expect(out.status === "linked" && out.priceNotApplied).toContain("Sem permissão para alterar preços");
  });

  it("custo escrito diferente do catálogo: liga sem preço (não substitui o custo)", async () => {
    fromImpl.mockImplementation(() => chain({ data: [], error: null }));
    rpc.mockImplementation(async (fn: string) =>
      fn === "rpc_create_product"
        ? { data: "prod-1", error: null }
        : { data: { item_supplier_id: "is-1", created: true, already_linked: false, codes: [], warnings: [] }, error: null },
    );
    const out = await createProductFromCatalog({ ...input, purchasePrice: 11 });
    const linkCalls = rpc.mock.calls.filter((c) => c[0] === "rpc_catalog_link");
    expect(linkCalls).toHaveLength(1);
    expect((linkCalls[0][1] as { p_apply_catalog_price: boolean }).p_apply_catalog_price).toBe(false);
    expect(out.status === "linked" && out.priceNotApplied).toBeTruthy();
  });
});

function DialogHarness({ req }: { req: PriceDecisionRequest }) {
  const [open, setOpen] = useState<PriceDecisionRequest | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(req)}>abrir</button>
      <PriceChangeDecisionDialog request={open} busy={false} onClose={() => setOpen(null)} onConfirm={() => setOpen(null)} />
    </>
  );
}

describe("PriceChangeDecisionDialog", () => {
  it("fechar não rebenta e a mudança de unidade exige confirmação", async () => {
    const unitItem = { ...ITEM, unit_changed: true, unit_label: "cx", units_per_pack: 12 };
    render(<DialogHarness req={{ mode: "approve", items: [unitItem] }} />);
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    const accept = await screen.findByRole("button", { name: "Aceitar" });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Confirmo/));
    expect((screen.getByRole("button", { name: "Aceitar" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("SupplierPriceChangesSection", () => {
  const listResponse = (items: PriceChangeItem[]) => ({
    data: {
      counts: { pending: items.length, approved: 0, rejected: 0, superseded: 0 },
      total: items.length,
      limit: 100,
      offset: 0,
      can_decide: true,
      items,
    },
    error: null,
  });

  it("aceitar uma linha chama a RPC e mostra o resultado", async () => {
    let pending = [ITEM];
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "rpc_price_changes_list") return listResponse(pending);
      if (fn === "rpc_price_changes_decide") {
        pending = [];
        return {
          data: {
            approved: 1, rejected: 0, skipped: 0, item_suppliers_updated: 1, product_costs_updated: 1,
            results: [{
              id: "req-1", outcome: "approved", item_supplier_updated: true, accepted_unit_change: false,
              product_cost_updated: true, product_cost_rows: 1, product_cost_reason: null, product_cost_message: null,
              new_unit_cost: 12, units_per_purchase_uom: 1,
            }],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const onDecided = vi.fn();
    render(<SupplierPriceChangesSection supplierId="sup-1" onDecided={onDecided} />);
    expect(await screen.findByText("Preços por aprovar (1)")).toBeTruthy();
    expect(screen.getByText(/Muda: 10,00 EUR → 12,00 EUR/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    });
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    const decide = rpc.mock.calls.find((c) => c[0] === "rpc_price_changes_decide");
    expect(decide?.[1]).toMatchObject({ p_ids: ["req-1"], p_approve: true, p_accept_unit_change: false });
    expect(await screen.findByText(/Custo do produto atualizado para 12,00 EUR/)).toBeTruthy();
  });

  it("sem pedidos e sem link do sino: não ocupa espaço", async () => {
    rpc.mockImplementation(async () => listResponse([]));
    const { container } = render(<SupplierPriceChangesSection supplierId="sup-1" />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
