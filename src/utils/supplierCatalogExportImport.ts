import * as XLSX from "xlsx";
import type { Database } from "@/integrations/supabase/types";
import { downloadStandardXlsx, type StandardExportColumn } from "@/lib/exports/xlsxExport";

// Catálogo de um fornecedor (rpc_supplier_catalog): uma linha por ligação
// item_suppliers de produto, por unidade de compra (ex. à unidade e em PK100).
export type SupplierCatalogRow =
  Database["public"]["Functions"]["rpc_supplier_catalog"]["Returns"][number];

export interface CatalogProductRef {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  uom_id: string | null;
}

export interface CatalogUomRef {
  id: string;
  code: string;
  base_uom_id: string | null;
  conversion_factor: number | null;
}

// Campos que o import pode escrever em item_suppliers. Ausente = não mexe.
export interface CatalogImportPatch {
  supplier_sku?: string;
  purchase_price?: number;
  currency?: string;
  moq?: number;
  lead_time_days?: number;
  is_active?: boolean;
}

export type CatalogImportAction = "insert" | "update" | "unchanged" | "error";

export interface CatalogImportLine {
  line: number; // número da linha no Excel (1-based, como na margem)
  reference: string; // SKU ou código de barras lido
  productName: string | null;
  uomLabel: string;
  action: CatalogImportAction;
  errors: string[];
  productId?: string;
  uomId?: string | null; // null = unidade do produto
  itemSupplierId?: string;
  patch: CatalogImportPatch;
}

export const CATALOG_EXPORT_COLUMNS: StandardExportColumn[] = [
  { key: "supplier_sku", header: "Ref. fornecedor", width: 18 },
  { key: "sku", header: "SKU", width: 16 },
  { key: "barcode", header: "Código de barras", width: 18 },
  { key: "product_name", header: "Produto", width: 36 },
  { key: "uom_code", header: "Unidade", width: 10 },
  { key: "units_per_uom", header: "Qtd. por unidade", type: "number", width: 14 },
  { key: "purchase_price", header: "Preço de compra", type: "number", width: 14 },
  { key: "currency", header: "Moeda", width: 8 },
  { key: "moq", header: "MOQ", type: "number", width: 10 },
  { key: "lead_time_days", header: "Prazo (dias)", type: "number", width: 12 },
  { key: "is_preferred", header: "Preferido", type: "boolean", width: 10 },
  { key: "is_active", header: "Ativo", type: "boolean", width: 8 },
];

// Rótulo da unidade de compra: "PK100 · 100 un" para packs, senão o código.
export function formatCatalogUnit(row: Pick<SupplierCatalogRow, "uom_id" | "uom_code" | "units_per_uom" | "product_uom_id" | "product_uom_code">): string {
  if (!row.uom_id || row.uom_id === row.product_uom_id) return row.product_uom_code || "-";
  if (row.units_per_uom && row.units_per_uom > 1) {
    return `${row.uom_code} · ${row.units_per_uom} ${row.product_uom_code ?? "un"}`;
  }
  return row.uom_code || "-";
}

export function exportSupplierCatalogXlsx(rows: SupplierCatalogRow[], supplierName: string): void {
  const slug = supplierName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "fornecedor";
  downloadStandardXlsx(
    {
      sheetName: "Catálogo",
      columns: CATALOG_EXPORT_COLUMNS,
      rows: rows.map((r) => ({
        supplier_sku: r.supplier_sku,
        sku: r.sku,
        barcode: r.barcode,
        product_name: r.product_name,
        // Sem uom na ligação = unidade do produto: exporta-se o código do
        // produto, que ao reimportar volta a casar com a mesma ligação.
        uom_code: r.uom_code ?? r.product_uom_code ?? "",
        units_per_uom: r.units_per_uom,
        purchase_price: r.purchase_price,
        currency: r.currency,
        moq: r.moq,
        lead_time_days: r.lead_time_days,
        is_preferred: r.is_preferred,
        is_active: r.is_active,
      })),
    },
    `catalogo_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

// ─── Leitura do ficheiro ────────────────────────────────────────────────────

const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// O export do projeto prefixa "'" a textos começados por = + - @ (proteção
// contra fórmulas) — ao ler, desfaz-se esse escape.
const cellText = (value: unknown): string => String(value ?? "").trim().replace(/^'/, "");

const HEADER_ALIASES: Record<keyof ColumnIndex, string[]> = {
  supplierSku: ["reffornecedor", "referenciafornecedor", "referenciadofornecedor", "suppliersku", "codigofornecedor", "codigodofornecedor"],
  sku: ["sku", "skuproduto", "codigoproduto", "codigodoproduto"],
  barcode: ["codigodebarras", "codigobarras", "barcode", "ean"],
  uom: ["unidade", "unidadedecompra", "uom", "unidademedida"],
  price: ["precodecompra", "precocompra", "preco", "purchaseprice", "custo"],
  currency: ["moeda", "currency"],
  moq: ["moq", "quantidademinima", "encomendaminima"],
  leadTime: ["prazodias", "prazo", "prazoentrega", "leadtimedays", "leadtime"],
  active: ["ativo", "active"],
};

interface ColumnIndex {
  supplierSku: number;
  sku: number;
  barcode: number;
  uom: number;
  price: number;
  currency: number;
  moq: number;
  leadTime: number;
  active: number;
}

export interface ParsedCatalogFile {
  headerRowIndex: number;
  columns: ColumnIndex;
  matrix: unknown[][];
}

export async function readCatalogFile(file: File): Promise<ParsedCatalogFile> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new Error("O ficheiro tem de ser Excel (.xlsx ou .xls).");
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("O ficheiro não tem folhas.");
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

  const headerRowIndex = matrix.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""),
  );
  if (headerRowIndex === -1) throw new Error("O ficheiro está vazio.");

  const header = (matrix[headerRowIndex] || []).map(normalizeHeader);
  const find = (aliases: string[]) => header.findIndex((h) => aliases.includes(h));
  const columns = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as (keyof ColumnIndex)[]).map((k) => [k, find(HEADER_ALIASES[k])]),
  ) as unknown as ColumnIndex;

  if (columns.sku === -1 && columns.barcode === -1) {
    throw new Error('Falta a coluna "SKU" ou "Código de barras" para identificar o produto.');
  }
  return { headerRowIndex, columns, matrix };
}

// Aceita 12.5, "12,5", "1.234,56", "1 234,56".
function parseDecimal(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let text = cellText(raw).replace(/\s/g, "").replace(/€/g, "");
  if (text === "") return null;
  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(",", ".");
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  const text = cellText(raw).toLowerCase();
  if (text === "") return null;
  if (["sim", "s", "true", "verdadeiro", "1", "yes", "y", "x"].includes(text)) return true;
  if (["nao", "não", "n", "false", "falso", "0", "no"].includes(text)) return false;
  return null;
}

const key = (value: string | null | undefined) => (value ?? "").trim().toUpperCase();

// ─── Validação e plano (sem escrever nada) ─────────────────────────────────

export function buildCatalogImportPlan(
  parsed: ParsedCatalogFile,
  ctx: { products: CatalogProductRef[]; uoms: CatalogUomRef[]; existing: SupplierCatalogRow[] },
): CatalogImportLine[] {
  const { matrix, headerRowIndex, columns } = parsed;
  const cell = (row: unknown[], idx: number): unknown => (idx >= 0 ? row[idx] : "");

  const bySku = new Map<string, CatalogProductRef[]>();
  const byBarcode = new Map<string, CatalogProductRef[]>();
  for (const p of ctx.products) {
    if (p.sku) bySku.set(key(p.sku), [...(bySku.get(key(p.sku)) ?? []), p]);
    if (p.barcode) byBarcode.set(key(p.barcode), [...(byBarcode.get(key(p.barcode)) ?? []), p]);
  }
  const uomById = new Map(ctx.uoms.map((u) => [u.id, u]));
  const uomsByCode = new Map<string, CatalogUomRef[]>();
  for (const u of ctx.uoms) uomsByCode.set(key(u.code), [...(uomsByCode.get(key(u.code)) ?? []), u]);

  // Ligação existente por produto + unidade (uom do produto ≡ NULL).
  const existingKey = (productId: string, uomId: string | null) => `${productId}|${uomId ?? ""}`;
  const existing = new Map<string, SupplierCatalogRow>();
  for (const r of ctx.existing) {
    const u = r.uom_id && r.uom_id !== r.product_uom_id ? r.uom_id : null;
    existing.set(existingKey(r.product_id, u), r);
  }

  const lines: CatalogImportLine[] = [];
  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const row = matrix[i] || [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue; // linha vazia

    const errors: string[] = [];
    const sku = cellText(cell(row, columns.sku));
    const barcode = cellText(cell(row, columns.barcode));
    const reference = sku || barcode;
    const uomCode = cellText(cell(row, columns.uom));

    // Produto: SKU primeiro, código de barras como alternativa.
    let product: CatalogProductRef | undefined;
    if (!sku && !barcode) {
      errors.push("Sem SKU nem código de barras.");
    } else {
      const candidates = (sku ? bySku.get(key(sku)) : undefined) ?? (barcode ? byBarcode.get(key(barcode)) : undefined) ?? [];
      if (candidates.length === 0) errors.push(`Produto "${reference}" não encontrado nesta empresa.`);
      else if (candidates.length > 1) errors.push(`"${reference}" corresponde a ${candidates.length} produtos — use um identificador único.`);
      else product = candidates[0];
    }

    // Unidade: vazia ou igual à do produto = unidade do produto (uom_id NULL).
    let uomId: string | null = null;
    let uomLabel = uomCode || "(unidade do produto)";
    if (product) {
      const productUom = product.uom_id ? uomById.get(product.uom_id) : undefined;
      if (!uomCode) {
        uomLabel = productUom?.code ?? "(unidade do produto)";
      } else {
        const matches = uomsByCode.get(key(uomCode)) ?? [];
        // Código de empresa e global podem coincidir em casos antigos — a do
        // produto/embalagem compatível ganha.
        const compatible = matches.find(
          (u) => u.id === product!.uom_id || (u.base_uom_id && u.base_uom_id === product!.uom_id),
        );
        const chosen = compatible ?? matches[0];
        if (!chosen) {
          errors.push(`Unidade "${uomCode}" não existe.`);
        } else if (chosen.id === product.uom_id) {
          uomId = null;
          uomLabel = chosen.code;
        } else if (chosen.base_uom_id) {
          if (!product.uom_id) {
            errors.push(`O produto não tem unidade definida — defina a unidade do produto para usar o pack "${chosen.code}".`);
          } else if (chosen.base_uom_id !== product.uom_id) {
            const base = uomById.get(chosen.base_uom_id);
            errors.push(`O pack "${chosen.code}" é de "${base?.code ?? "?"}", mas o produto conta-se em "${productUom?.code ?? "?"}".`);
          } else {
            uomId = chosen.id;
            uomLabel = `${chosen.code} · ${Number(chosen.conversion_factor)} ${productUom?.code ?? ""}`.trim();
          }
        } else if (!product.uom_id) {
          // Produto sem unidade + unidade simples: a BD aceita (sem conversão).
          uomId = chosen.id;
          uomLabel = chosen.code;
        } else {
          errors.push(`Unidade "${chosen.code}" incompatível: o produto conta-se em "${productUom?.code ?? "?"}" e "${chosen.code}" não é um pack dessa unidade.`);
        }
      }
    }

    // Valores. Célula vazia = não altera (ou fica vazio numa ligação nova).
    const patch: CatalogImportPatch = {};
    const supplierSku = cellText(cell(row, columns.supplierSku));
    if (supplierSku) patch.supplier_sku = supplierSku;

    const rawPrice = cellText(cell(row, columns.price));
    if (rawPrice !== "") {
      const n = parseDecimal(cell(row, columns.price));
      if (n === null || n < 0) errors.push(`Preço inválido: "${rawPrice}".`);
      else patch.purchase_price = Math.round(n * 10000) / 10000;
    }
    const currency = cellText(cell(row, columns.currency)).toUpperCase();
    if (currency) {
      if (!/^[A-Z]{3}$/.test(currency)) errors.push(`Moeda inválida: "${currency}" (use p.ex. EUR).`);
      else patch.currency = currency;
    }
    const rawMoq = cellText(cell(row, columns.moq));
    if (rawMoq !== "") {
      const n = parseDecimal(cell(row, columns.moq));
      if (n === null || n <= 0) errors.push(`MOQ inválido: "${rawMoq}".`);
      else patch.moq = n;
    }
    const rawLead = cellText(cell(row, columns.leadTime));
    if (rawLead !== "") {
      const n = parseDecimal(cell(row, columns.leadTime));
      if (n === null || n < 0 || !Number.isInteger(n)) errors.push(`Prazo inválido: "${rawLead}" (dias inteiros).`);
      else patch.lead_time_days = n;
    }
    const rawActive = cellText(cell(row, columns.active));
    if (rawActive !== "") {
      const b = parseBoolean(cell(row, columns.active));
      if (b === null) errors.push(`Valor de "Ativo" inválido: "${rawActive}" (use Sim/Não).`);
      else patch.is_active = b;
    }

    const line: CatalogImportLine = {
      line: i + 1,
      reference,
      productName: product?.name ?? null,
      uomLabel,
      action: "error",
      errors,
      productId: product?.id,
      uomId,
      patch,
    };

    if (errors.length === 0 && product) {
      const current = existing.get(existingKey(product.id, uomId));
      if (current) {
        line.itemSupplierId = current.item_supplier_id;
        const changed =
          (patch.supplier_sku !== undefined && patch.supplier_sku !== (current.supplier_sku ?? "")) ||
          (patch.purchase_price !== undefined && patch.purchase_price !== (current.purchase_price == null ? null : Number(current.purchase_price))) ||
          (patch.currency !== undefined && patch.currency !== current.currency) ||
          (patch.moq !== undefined && patch.moq !== (current.moq == null ? null : Number(current.moq))) ||
          (patch.lead_time_days !== undefined && patch.lead_time_days !== current.lead_time_days) ||
          (patch.is_active !== undefined && patch.is_active !== current.is_active);
        line.action = changed ? "update" : "unchanged";
      } else {
        line.action = "insert";
      }
    }
    lines.push(line);
  }

  // O mesmo produto + unidade duas vezes no ficheiro: venceria a última em
  // silêncio. Nenhuma das repetidas é gravada — quem decide é o utilizador.
  const seen = new Map<string, CatalogImportLine[]>();
  for (const l of lines) {
    if (!l.productId || l.action === "error") continue;
    const k = existingKey(l.productId, l.uomId ?? null);
    seen.set(k, [...(seen.get(k) ?? []), l]);
  }
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    const at = group.map((l) => l.line).join(", ");
    for (const l of group) {
      l.action = "error";
      l.errors.push(`Produto e unidade repetidos no ficheiro (linhas ${at}).`);
    }
  }

  return lines;
}
