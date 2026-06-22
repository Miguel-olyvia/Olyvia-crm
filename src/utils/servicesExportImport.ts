import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

// CSV column headers (aligned with import template)
const CSV_HEADERS = [
  "SKU",
  "Nome",
  "Descrição",
  "Status",
  "Categoria",
  "Subcategoria",
  "Tipo Serviço",
  "Empresa",
  "Taxa IVA",
  "Preço Compra",
  "Preço Venda",
  "Moeda",
];

const fmtDecimal = (v: number | null | undefined): string =>
  (Number(v) || 0).toFixed(2).replace(".", ",");

const parseDecimal = (raw: any): number => {
  if (raw === null || raw === undefined || raw === "") return 0;
  const s = String(raw).replace(",", ".").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const escapeCsv = (val: any): string => {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const getServiceType = (raw: string): string => {
  const v = (raw || "").toLowerCase().trim();
  if (v === "ambos" || v === "both") return "both";
  if (v === "compra" || v === "purchase") return "purchase";
  return "sale";
};

const labelServiceType = (type: string | null | undefined): string => {
  switch ((type || "").toLowerCase()) {
    case "both":
      return "ambos";
    case "purchase":
      return "compra";
    default:
      return "venda";
  }
};

// ============================================================
// EXPORT
// ============================================================
export async function exportServicesToCSV(
  services: any[],
  organizationId?: string | null,
): Promise<void> {
  if (!services || services.length === 0) {
    throw new Error("Sem serviços para exportar");
  }

  const serviceIds = services.map((s) => s.id);

  // Fetch prices for all services
  const { data: prices } = await supabase
    .from("service_prices")
    .select("service_id, price_type, price, currency, vat_rate")
    .in("service_id", serviceIds);

  const priceMap = new Map<string, any>();
  (prices || []).forEach((p) => {
    if (!priceMap.has(p.service_id)) {
      priceMap.set(p.service_id, {
        purchase: 0,
        retail: 0,
        currency: p.currency || "EUR",
        vat_rate: p.vat_rate ?? 23,
      });
    }
    const entry = priceMap.get(p.service_id);
    if (p.price_type === "purchase") entry.purchase = p.price;
    if (p.price_type === "retail") entry.retail = p.price;
    if (p.currency) entry.currency = p.currency;
    if (p.vat_rate !== null && p.vat_rate !== undefined)
      entry.vat_rate = p.vat_rate;
  });

  const rows = services.map((svc) => {
    const pr = priceMap.get(svc.id) || {
      purchase: 0,
      retail: 0,
      currency: "EUR",
      vat_rate: 23,
    };
    return {
      sku: svc.sku,
      name: svc.name,
      description: svc.long_desc || svc.short_desc,
      status: svc.is_active === false ? "inativo" : "ativo",
      category: svc.service_categories?.name,
      subcategory: svc.subcategory?.name,
      serviceType: labelServiceType(svc.service_type),
      company: svc.anew_organizations?.name,
      vatRate: pr.vat_rate,
      purchasePrice: pr.purchase,
      retailPrice: pr.retail,
      currency: pr.currency || "EUR",
    };
  });

  downloadStandardXlsx({
    sheetName: "Serviços",
    columns: [
      { key: "sku", header: "SKU", width: 16 },
      { key: "name", header: "Nome", width: 30 },
      { key: "description", header: "Descrição", width: 40 },
      { key: "status", header: "Estado", width: 14 },
      { key: "category", header: "Categoria", width: 22 },
      { key: "subcategory", header: "Subcategoria", width: 22 },
      { key: "serviceType", header: "Tipo serviço", width: 16 },
      { key: "company", header: "Empresa", width: 26 },
      { key: "vatRate", header: "Taxa IVA", type: "number", width: 12 },
      { key: "purchasePrice", header: "Preço compra", type: "number", width: 16 },
      { key: "retailPrice", header: "Preço venda", type: "number", width: 16 },
      { key: "currency", header: "Moeda", width: 10 },
    ],
    rows,
  }, `servicos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ============================================================
// TEMPLATE
// ============================================================
export function downloadServicesTemplate(): void {
  const sample = [
    CSV_HEADERS,
    [
      "SVC001",
      "Exemplo Serviço",
      "Descrição opcional",
      "ativo",
      "Categoria Exemplo",
      "Subcategoria Exemplo",
      "venda",
      "Nome da Empresa",
      "23,00",
      "0,00",
      "100,00",
      "EUR",
    ],
  ];

  const csv =
    "\uFEFF" + sample.map((r) => r.map(escapeCsv).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "servicos_template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// PARSE
// ============================================================
function parseCsvLine(line: string, sep: string = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectSeparator(headerLine: string): string {
  // Count outside quotes
  let semi = 0, comma = 0, inQ = false;
  for (const ch of headerLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ) {
      if (ch === ";") semi++;
      else if (ch === ",") comma++;
    }
  }
  return semi >= comma ? ";" : ",";
}

export interface ServiceImportRow {
  sku: string;
  name: string;
  description: string;
  status: string;
  category: string;
  subcategory: string;
  service_type: string;
  company: string;
  vat_rate: number;
  purchase_price: number;
  retail_price: number;
  currency: string;
}

export interface ImportReport {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; sku: string; message: string }>;
}

export async function parseServicesCSV(
  file: File,
  organizationId: string,
  userId: string,
): Promise<ImportReport> {
  let rawText: string;
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  if (isExcel) {
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const ref = ws['!ref'] ?? 'A1';
    const range = XLSX.utils.decode_range(ref);
    const numCols = range.e.c + 1;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    rawText = rows
      .filter((row: any[]) => row.some((cell: any) => cell !== '' && cell != null))
      .map((row: any[]) => {
        const dense = Array.from({ length: numCols }, (_, i) => row[i] ?? '');
        return dense
          .map((cell: any) =>
            `"${String(cell ?? '').replace(/"/g, '""').replace(/\r?\n|\r/g, ' ')}"`)
          .join(';');
      })
      .join('\r\n');
  } else {
    rawText = await file.text();
  }
  // Strip BOM
  const cleanText = rawText.replace(/^\uFEFF/, "");
  const lines = cleanText
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .filter((l) => !/^sep=.$/i.test(l.trim()));

  if (lines.length < 2) {
    throw new Error("CSV vazio ou sem dados");
  }

  const sep = detectSeparator(lines[0]);
  const header = parseCsvLine(lines[0], sep);
  const idx = (col: string) =>
    header.findIndex((h) => h.toLowerCase() === col.toLowerCase());

  const iSku = idx("SKU");
  const iName = idx("Nome");
  const iDesc = idx("Descrição");
  const iStatus = idx("Status");
  const iCat = idx("Categoria");
  const iSub = idx("Subcategoria");
  const iType = idx("Tipo Serviço");
  const iVat = idx("Taxa IVA");
  const iPurchase = idx("Preço Compra");
  const iRetail = idx("Preço Venda");
  const iCurrency = idx("Moeda");

  if (iSku === -1 || iName === -1) {
    throw new Error("Colunas obrigatórias em falta: SKU, Nome");
  }

  // Resolve business user id (anew_users.id) — required by RLS on service_prices.created_by
  let businessUserId = userId;
  const { data: anewUser } = await supabase
    .from("anew_users")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (anewUser?.id) businessUserId = anewUser.id;

  // Pre-load categories & subcategories for this org
  const { data: categoriesData } = await supabase
    .from("service_categories")
    .select("id, name")
    .eq("organization_id", organizationId);
  const catMap = new Map<string, string>();
  (categoriesData || []).forEach((c: any) =>
    catMap.set(c.name.toLowerCase().trim(), c.id),
  );

  // Subcategories live in the same service_categories table — reuse the map
  const subMap = catMap;
  const createdCatCache = new Map<string, string>();

  // Pre-load existing services by SKU (paginated)
  const PAGE_SIZE = 1000;
  const existing = new Map<string, string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("services")
      .select("id, sku")
      .eq("organization_id", organizationId)
      .eq("is_deleted", false)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((s: any) => {
      if (s.sku) existing.set(s.sku.trim(), s.id);
    });
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const report: ImportReport = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    const sku = (cols[iSku] || "").trim();
    const name = (cols[iName] || "").trim();

    if (!sku || !name) {
      report.skipped++;
      continue;
    }

    report.total++;

    try {
      const description = iDesc !== -1 ? (cols[iDesc] || "").trim() : "";
      const status = (cols[iStatus] || "ativo").trim().toLowerCase();
      const isActive = status !== "inativo" && status !== "inactive";
      const catName = iCat !== -1 ? (cols[iCat] || "").trim() : "";
      const subName = iSub !== -1 ? (cols[iSub] || "").trim() : "";
      const serviceType = getServiceType(iType !== -1 ? cols[iType] : "");
      const vatRate = iVat !== -1 ? parseDecimal(cols[iVat]) : 23;
      const purchasePrice =
        iPurchase !== -1 ? parseDecimal(cols[iPurchase]) : 0;
      const retailPrice = iRetail !== -1 ? parseDecimal(cols[iRetail]) : 0;
      const currency =
        iCurrency !== -1 ? (cols[iCurrency] || "EUR").trim() : "EUR";

      let categoryId: string | null = null;
      if (catName) {
        const catKey = catName.toLowerCase();
        if (catMap.has(catKey)) {
          categoryId = catMap.get(catKey)!;
        } else if (createdCatCache.has(catKey)) {
          categoryId = createdCatCache.get(catKey)!;
        } else {
          const { data: newCat, error: catErr } = await (supabase as any)
            .from('service_categories')
            .insert({ name: catName, organization_id: organizationId, created_by: userId })
            .select('id')
            .single();
          if (!catErr && newCat) {
            categoryId = newCat.id;
            catMap.set(catKey, newCat.id);
            createdCatCache.set(catKey, newCat.id);
          }
        }
      }

      let subcategoryId: string | null = null;
      if (subName) {
        const subKey = subName.toLowerCase();
        if (subMap.has(subKey)) {
          subcategoryId = subMap.get(subKey)!;
        } else if (createdCatCache.has(subKey)) {
          subcategoryId = createdCatCache.get(subKey)!;
        } else {
          const { data: newSub, error: subErr } = await (supabase as any)
            .from('service_categories')
            .insert({ name: subName, organization_id: organizationId, created_by: userId })
            .select('id')
            .single();
          if (!subErr && newSub) {
            subcategoryId = newSub.id;
            subMap.set(subKey, newSub.id);
            createdCatCache.set(subKey, newSub.id);
          }
        }
      }

      const serviceData: any = {
        sku,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        long_desc: description || null,
        is_active: isActive,
        service_type: serviceType,
        organization_id: organizationId,
        service_category_id: categoryId,
        service_subcategory_id: subcategoryId,
      };

      let serviceId: string;
      const existingId = existing.get(sku);

      if (existingId) {
        const { error } = await supabase
          .from("services")
          .update(serviceData)
          .eq("id", existingId);
        if (error) throw error;
        serviceId = existingId;
        report.updated++;
      } else {
        serviceData.created_by = userId;
        const { data: inserted, error } = await supabase
          .from("services")
          .insert(serviceData)
          .select("id")
          .single();
        if (error) throw error;
        serviceId = inserted.id;
        report.inserted++;
      }

      // Sync prices: delete existing then insert (purchase + retail)
      await supabase.from("service_prices").delete().eq("service_id", serviceId);

      const priceRows = [
        {
          service_id: serviceId,
          price_type: "purchase",
          price: purchasePrice,
          currency,
          vat_rate: vatRate,
          created_by: businessUserId,
        },
        {
          service_id: serviceId,
          price_type: "retail",
          price: retailPrice,
          currency,
          vat_rate: vatRate,
          created_by: businessUserId,
        },
      ];
      const { error: priceErr } = await supabase
        .from("service_prices")
        .insert(priceRows);
      if (priceErr) throw priceErr;

      // Ensure service_organizations link
      const { data: link } = await supabase
        .from("service_organizations")
        .select("id")
        .eq("service_id", serviceId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!link) {
        await supabase.from("service_organizations").insert({
          service_id: serviceId,
          organization_id: organizationId,
          created_by: userId,
        });
      }
    } catch (err: any) {
      report.errors.push({
        row: i + 1,
        sku,
        message: err?.message || String(err),
      });
    }
  }

  return report;
}
