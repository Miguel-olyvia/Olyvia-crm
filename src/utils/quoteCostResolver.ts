import { supabase } from "@/integrations/supabase/client";

export interface QuoteLineForCost {
  id: string;
  qt?: number | string | null;
  product_id?: string | null;
  service_id?: string | null;
  bundle_id?: string | null;
  descricao_snapshot?: string | null;
  cost_price?: number | string | null;
  custo_material_unit?: number | string | null;
  custo_mao_obra_unit?: number | string | null;
  iva_percent?: number | string | null;
  /**
   * Snapshot of the components actually selected for this bundle line
   * (lives in quote_lines.selected_attributes.bundle_components).
   * When present, ONLY these are used to compute the bundle cost — we do NOT
   * sum the entire bundle definition (which would include unselected options).
   */
  selected_attributes?: any;
  bundle_components?: any;
}

interface SelectedBundleComponent {
  source_id?: string | null;
  type?: "product" | "service" | string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  vat_rate?: number | string | null;
}

function getSelectedBundleComponents(line: QuoteLineForCost): SelectedBundleComponent[] | null {
  const direct = (line as any).bundle_components;
  if (Array.isArray(direct) && direct.length > 0) return direct;
  const sa = line.selected_attributes;
  if (sa && typeof sa === "object") {
    if (Array.isArray(sa.bundle_components) && sa.bundle_components.length > 0) {
      return sa.bundle_components;
    }
    if (Array.isArray(sa.bundle_components_data) && sa.bundle_components_data.length > 0) {
      return sa.bundle_components_data;
    }
  }
  return null;
}

export interface LineResolution {
  /** Unit cost (matches previous behaviour) */
  unitCost: number;
  /**
   * Per-line VAT base distribution by rate.
   * Sum of values equals 1 (representing 100% of the line's net total).
   * For mixed bundles, multiple rates each get their share.
   */
  vatRateShares: Record<number, number>;
}

/**
 * Resolve unit cost AND VAT rate distribution per quote line in REAL-TIME using
 * catalog data (product_prices / service_prices). Bundles with mixed VAT rates
 * are split across rates by each component's gross share — mirroring
 * QuoteBuilder.calculateTotals.
 */
export async function resolveLineDetails(
  lines: QuoteLineForCost[]
): Promise<Record<string, LineResolution>> {
  if (lines.length === 0) return {};

  // Direct product/service IDs
  const productIds = new Set<string>(
    lines.map((l) => l.product_id).filter((x): x is string => !!x)
  );
  const serviceIds = new Set<string>(
    lines.map((l) => l.service_id).filter((x): x is string => !!x)
  );

  // Per-line selected bundle components
  const lineSelectedComponents: Record<string, SelectedBundleComponent[]> = {};
  for (const line of lines) {
    const sel = getSelectedBundleComponents(line);
    if (sel) {
      lineSelectedComponents[line.id] = sel;
      for (const c of sel) {
        if (!c.source_id) continue;
        if (c.type === "product") productIds.add(c.source_id);
        else if (c.type === "service") serviceIds.add(c.source_id);
      }
    }
  }

  // Bundle fallback (no snapshot)
  const bundleIdsForFallback = new Set<string>();
  for (const line of lines) {
    if (lineSelectedComponents[line.id]) continue;
    if (line.bundle_id) bundleIdsForFallback.add(line.bundle_id);
  }

  // Legacy: orphan lines matched by name
  const orphanLines = lines.filter(
    (l) =>
      !l.product_id &&
      !l.service_id &&
      !l.bundle_id &&
      !lineSelectedComponents[l.id] &&
      l.descricao_snapshot
  );
  const nameToBundleId: Record<string, string> = {};
  if (orphanLines.length > 0) {
    const names = Array.from(
      new Set(orphanLines.map((l) => l.descricao_snapshot!.trim()))
    );
    if (names.length > 0) {
      const { data: bundleMatches } = await supabase
        .from("bundles")
        .select("id, name")
        .in("name", names);
      (bundleMatches || []).forEach((b: any) => {
        if (!nameToBundleId[b.name]) nameToBundleId[b.name] = b.id;
      });
    }
    Object.values(nameToBundleId).forEach((id) => bundleIdsForFallback.add(id));
  }

  // Fetch product purchase prices + retail vat_rate
  const productCostMap: Record<string, number> = {};
  const productVatMap: Record<string, number> = {};
  if (productIds.size > 0) {
    const idsArr = Array.from(productIds);
    const [{ data: purchase }, { data: retail }] = await Promise.all([
      supabase
        .from("product_prices")
        .select("product_id, price")
        .in("product_id", idsArr)
        .eq("price_type", "purchase"),
      supabase
        .from("product_prices")
        .select("product_id, vat_rate")
        .in("product_id", idsArr)
        .eq("price_type", "retail"),
    ]);
    (purchase || []).forEach((row: any) => {
      productCostMap[row.product_id] = parseFloat(String(row.price || 0));
    });
    (retail || []).forEach((row: any) => {
      if (row.vat_rate != null) productVatMap[row.product_id] = parseFloat(String(row.vat_rate));
    });
  }

  // Fetch service purchase prices + retail vat_rate
  const serviceCostMap: Record<string, number> = {};
  const serviceVatMap: Record<string, number> = {};
  if (serviceIds.size > 0) {
    const idsArr = Array.from(serviceIds);
    const [{ data: purchase }, { data: retail }] = await Promise.all([
      supabase
        .from("service_prices")
        .select("service_id, price")
        .in("service_id", idsArr)
        .eq("price_type", "purchase"),
      supabase
        .from("service_prices")
        .select("service_id, vat_rate")
        .in("service_id", idsArr)
        .eq("price_type", "retail"),
    ]);
    (purchase || []).forEach((row: any) => {
      serviceCostMap[row.service_id] = parseFloat(String(row.price || 0));
    });
    (retail || []).forEach((row: any) => {
      if (row.vat_rate != null) serviceVatMap[row.service_id] = parseFloat(String(row.vat_rate));
    });
  }

  // Bundle fallback components
  const bundleCostMap: Record<string, number> = {};
  // For VAT distribution on bundle fallback, store components keyed by bundle
  const bundleComponentsMap: Record<string, Array<{ unitCost: number; qty: number; vat: number }>> = {};
  if (bundleIdsForFallback.size > 0) {
    const { data: components } = await supabase
      .from("bundle_components")
      .select("bundle_id, product_id, service_id, quantity, is_optional")
      .in("bundle_id", Array.from(bundleIdsForFallback));

    const missingProductIds = Array.from(
      new Set(
        (components || [])
          .map((c: any) => c.product_id)
          .filter((x: any): x is string => !!x && (productCostMap[x] == null || productVatMap[x] == null))
      )
    );
    const missingServiceIds = Array.from(
      new Set(
        (components || [])
          .map((c: any) => c.service_id)
          .filter((x: any): x is string => !!x && (serviceCostMap[x] == null || serviceVatMap[x] == null))
      )
    );

    if (missingProductIds.length > 0) {
      const [{ data: p1 }, { data: p2 }] = await Promise.all([
        supabase
          .from("product_prices")
          .select("product_id, price")
          .in("product_id", missingProductIds)
          .eq("price_type", "purchase"),
        supabase
          .from("product_prices")
          .select("product_id, vat_rate")
          .in("product_id", missingProductIds)
          .eq("price_type", "retail"),
      ]);
      (p1 || []).forEach((row: any) => {
        productCostMap[row.product_id] = parseFloat(String(row.price || 0));
      });
      (p2 || []).forEach((row: any) => {
        if (row.vat_rate != null) productVatMap[row.product_id] = parseFloat(String(row.vat_rate));
      });
    }
    if (missingServiceIds.length > 0) {
      const [{ data: s1 }, { data: s2 }] = await Promise.all([
        supabase
          .from("service_prices")
          .select("service_id, price")
          .in("service_id", missingServiceIds)
          .eq("price_type", "purchase"),
        supabase
          .from("service_prices")
          .select("service_id, vat_rate")
          .in("service_id", missingServiceIds)
          .eq("price_type", "retail"),
      ]);
      (s1 || []).forEach((row: any) => {
        serviceCostMap[row.service_id] = parseFloat(String(row.price || 0));
      });
      (s2 || []).forEach((row: any) => {
        if (row.vat_rate != null) serviceVatMap[row.service_id] = parseFloat(String(row.vat_rate));
      });
    }

    (components || []).forEach((c: any) => {
      if (c.is_optional) return;
      const qty = parseFloat(String(c.quantity || 1));
      let unit = 0;
      let vat = 23;
      if (c.product_id) {
        unit = productCostMap[c.product_id] ?? 0;
        vat = productVatMap[c.product_id] ?? 23;
      } else if (c.service_id) {
        unit = serviceCostMap[c.service_id] ?? 0;
        vat = serviceVatMap[c.service_id] ?? 23;
      }
      bundleCostMap[c.bundle_id] = (bundleCostMap[c.bundle_id] || 0) + unit * qty;
      if (!bundleComponentsMap[c.bundle_id]) bundleComponentsMap[c.bundle_id] = [];
      bundleComponentsMap[c.bundle_id].push({ unitCost: unit, qty, vat });
    });
  }

  const out: Record<string, LineResolution> = {};
  for (const line of lines) {
    let unitCost = 0;
    let vatRateShares: Record<number, number> = {};

    // Helper: build shares from a list of components (uses unit_price if available, else cost)
    const buildSharesFromComponents = (
      comps: Array<{ value: number; vat: number }>
    ): Record<number, number> => {
      const totalVal = comps.reduce((s, c) => s + c.value, 0);
      const shares: Record<number, number> = {};
      if (totalVal <= 0) return shares;
      for (const c of comps) {
        const share = c.value / totalVal;
        shares[c.vat] = (shares[c.vat] || 0) + share;
      }
      return shares;
    };

    // 1) Direct product line
    if (line.product_id && productCostMap[line.product_id] != null) {
      unitCost = productCostMap[line.product_id];
      const rate = productVatMap[line.product_id] ?? parseFloat(String(line.iva_percent ?? 23));
      vatRateShares = { [rate]: 1 };
    }
    // 2) Direct service line
    else if (line.service_id && serviceCostMap[line.service_id] != null) {
      unitCost = serviceCostMap[line.service_id];
      const rate = serviceVatMap[line.service_id] ?? parseFloat(String(line.iva_percent ?? 23));
      vatRateShares = { [rate]: 1 };
    }
    // 3) Bundle WITH selection snapshot
    else if (lineSelectedComponents[line.id]) {
      let sum = 0;
      const compsForShare: Array<{ value: number; vat: number }> = [];
      for (const c of lineSelectedComponents[line.id]) {
        const qty = parseFloat(String(c.quantity || 0));
        if (!c.source_id || qty <= 0) continue;
        let cUnit = 0;
        let cVat: number;
        if (c.type === "product") {
          cUnit = productCostMap[c.source_id] ?? 0;
          cVat = productVatMap[c.source_id] ?? parseFloat(String(c.vat_rate ?? 23));
        } else if (c.type === "service") {
          cUnit = serviceCostMap[c.source_id] ?? 0;
          cVat = serviceVatMap[c.source_id] ?? parseFloat(String(c.vat_rate ?? 23));
        } else {
          cVat = parseFloat(String(c.vat_rate ?? 23));
        }
        sum += cUnit * qty;
        // For VAT share, prefer the component's snapshot unit_price (gross/retail) if present
        const grossUnit = c.unit_price != null ? parseFloat(String(c.unit_price)) : cUnit;
        const value = grossUnit * qty;
        if (value > 0) compsForShare.push({ value, vat: cVat });
      }
      unitCost = sum;
      vatRateShares = buildSharesFromComponents(compsForShare);
      if (Object.keys(vatRateShares).length === 0) {
        const fallbackRate = parseFloat(String(line.iva_percent ?? 23));
        vatRateShares = { [fallbackRate]: 1 };
      }
    }
    // 4) Bundle WITHOUT snapshot — full definition fallback
    else if (line.bundle_id && bundleCostMap[line.bundle_id] != null) {
      unitCost = bundleCostMap[line.bundle_id];
      const comps = (bundleComponentsMap[line.bundle_id] || []).map((c) => ({
        value: c.unitCost * c.qty,
        vat: c.vat,
      }));
      vatRateShares = buildSharesFromComponents(comps);
      if (Object.keys(vatRateShares).length === 0) {
        const fallbackRate = parseFloat(String(line.iva_percent ?? 23));
        vatRateShares = { [fallbackRate]: 1 };
      }
    }
    // 5) Legacy orphan resolved by name
    else if (
      line.descricao_snapshot &&
      nameToBundleId[line.descricao_snapshot.trim()] &&
      bundleCostMap[nameToBundleId[line.descricao_snapshot.trim()]] != null
    ) {
      const bId = nameToBundleId[line.descricao_snapshot.trim()];
      unitCost = bundleCostMap[bId];
      const comps = (bundleComponentsMap[bId] || []).map((c) => ({
        value: c.unitCost * c.qty,
        vat: c.vat,
      }));
      vatRateShares = buildSharesFromComponents(comps);
      if (Object.keys(vatRateShares).length === 0) {
        const fallbackRate = parseFloat(String(line.iva_percent ?? 23));
        vatRateShares = { [fallbackRate]: 1 };
      }
    }
    // 6) Last resort
    else {
      const explicit = parseFloat(String(line.cost_price || 0));
      const mat = parseFloat(String(line.custo_material_unit || 0));
      const lab = parseFloat(String(line.custo_mao_obra_unit || 0));
      unitCost = explicit > 0 ? explicit : mat + lab;
      const fallbackRate = parseFloat(String(line.iva_percent ?? 23));
      vatRateShares = { [fallbackRate]: 1 };
    }

    out[line.id] = { unitCost, vatRateShares };
  }
  return out;
}

/**
 * Backwards-compatible wrapper — only returns unit costs.
 */
export async function resolveLineUnitCosts(
  lines: QuoteLineForCost[]
): Promise<Record<string, number>> {
  const details = await resolveLineDetails(lines);
  const out: Record<string, number> = {};
  for (const id in details) out[id] = details[id].unitCost;
  return out;
}
