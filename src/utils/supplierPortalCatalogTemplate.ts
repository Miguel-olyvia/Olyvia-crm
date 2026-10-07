// Portal do Fornecedor (F3.1) — modelo XLSX, exportação e leitura de ficheiros
// do catálogo (XLSX/XLS/CSV) para sp_catalog_import.
//
// Segurança:
//  • Exportação/modelo: buildStandardWorkbook já prefixa com ' as células de
//    texto começadas por = + - @ (neutraliza fórmulas ao abrir no Excel).
//  • Leitura: tudo é lido como TEXTO (sem fórmulas: cellFormula=false; CSV com
//    parser próprio, sem conversões). O servidor guarda texto tal e qual.
//  • Só .xlsx, .xls e .csv; máx. 10 MB e 5000 linhas de dados.

import * as XLSX from "xlsx";
import { buildStandardWorkbook, type StandardExportColumn } from "@/lib/exports/xlsxExport";
import type { SpCatalogField, SpCatalogItem, SpCatalogRowInput } from "@/lib/supplierPortal/spRpc";

export const SUPPLIER_CATALOG_MAX_ROWS = 5000;
export const SUPPLIER_CATALOG_MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface SupplierCatalogColumnDef {
  field: SpCatalogField;
  header: string;
  description: string;
  type: "text" | "number";
  width: number;
  /** Cabeçalhos aceites (normalizados: sem acentos, minúsculas, só [a-z0-9]). */
  aliases: string[];
}

export const SUPPLIER_CATALOG_COLUMNS: SupplierCatalogColumnDef[] = [
  {
    field: "supplier_ref", header: "Ref.", type: "text", width: 16,
    description: "Obrigatória. A sua referência do artigo (máx. 100 caracteres). Identifica o artigo: a mesma referência atualiza o artigo existente.",
    aliases: ["ref", "referencia", "reffornecedor", "referenciafornecedor", "referenciadofornecedor", "codigo", "codigoartigo", "codigodoartigo", "codigofornecedor", "suppliersku", "supplierref", "sku"],
  },
  {
    field: "barcode", header: "Código de barras", type: "text", width: 18,
    description: "EAN/GTIN com 8 a 14 dígitos.",
    aliases: ["codigodebarras", "codigobarras", "codbarras", "barcode", "ean", "ean13", "gtin"],
  },
  {
    field: "name", header: "Nome", type: "text", width: 36,
    description: "Obrigatório para artigos novos (máx. 300 caracteres). Vazio = mantém o nome gravado.",
    aliases: ["nome", "designacao", "artigo", "produto", "name", "nomedoartigo"],
  },
  {
    field: "description", header: "Descrição", type: "text", width: 40,
    description: "Texto livre (máx. 2000 caracteres).",
    aliases: ["descricao", "descricaolonga", "description", "detalhe"],
  },
  {
    field: "brand", header: "Marca", type: "text", width: 16,
    description: "Máx. 100 caracteres.",
    aliases: ["marca", "brand", "fabricante"],
  },
  {
    field: "unit_label", header: "Unidade", type: "text", width: 10,
    description: "Unidade de venda (ex.: un, cx, m, kg). Máx. 30 caracteres.",
    aliases: ["unidade", "un", "unid", "unit", "uom", "unidadedevenda", "unidademedida"],
  },
  {
    field: "units_per_pack", header: "Unidades por embalagem", type: "number", width: 14,
    description: "Número maior que zero.",
    aliases: ["unidadesporembalagem", "unidembalagem", "qtdembalagem", "qtdporembalagem", "quantidadeporembalagem", "embalagem", "unitsperpack"],
  },
  {
    field: "base_price", header: "Preço", type: "number", width: 12,
    description: "Preço base sem IVA. Aceita 12,5 ou 12.5 ou 1.234,56.",
    aliases: ["preco", "precobase", "precounitario", "precosemiva", "precoliquido", "price", "baseprice"],
  },
  {
    field: "currency", header: "Moeda", type: "text", width: 8,
    description: "Código de 3 letras (ex.: EUR). Vazio = EUR.",
    aliases: ["moeda", "currency", "divisa"],
  },
  {
    field: "moq", header: "Mínimo", type: "number", width: 10,
    description: "Quantidade mínima de encomenda (maior que zero).",
    aliases: ["minimo", "quantidademinima", "qtdminima", "encomendaminima", "moq"],
  },
  {
    field: "lead_time_days", header: "Prazo (dias)", type: "number", width: 12,
    description: "Prazo de entrega em dias inteiros (0 a 3650).",
    aliases: ["prazodias", "prazo", "prazoentrega", "prazodeentrega", "prazodeentregadias", "diasdeentrega", "leadtime", "leadtimedays"],
  },
  {
    field: "is_active", header: "Ativo", type: "text", width: 8,
    description: "sim/não. Vazio = mantém o estado gravado.",
    aliases: ["ativo", "activo", "active", "estado"],
  },
];

export const SUPPLIER_CATALOG_FIELD_LABELS: Record<SpCatalogField, string> = Object.fromEntries(
  SUPPLIER_CATALOG_COLUMNS.map((c) => [c.field, c.header]),
) as Record<SpCatalogField, string>;

/**
 * Campos em que uma célula vazia NÃO é enviada (mantém o valor gravado).
 * Nos restantes, a coluna presente com célula vazia limpa o valor (contrato 2.5).
 *  • name: vazio daria "Nome obrigatório" num artigo existente;
 *  • is_active: o servidor lê "" como ativo — reativaria artigos sem querer.
 */
const OMIT_WHEN_EMPTY: ReadonlySet<SpCatalogField> = new Set<SpCatalogField>(["name", "is_active"]);

const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const slugify = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

function writeWorkbook(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, filename, { bookType: "xlsx", compression: true });
}

const exportColumns = (): StandardExportColumn[] =>
  SUPPLIER_CATALOG_COLUMNS.map((c) => ({ key: c.field, header: c.header, type: c.type, width: c.width }));

/** "Descarregar modelo": folha Catálogo só com cabeçalhos + folha Instruções. */
export function downloadSupplierCatalogTemplate(): void {
  const wb = buildStandardWorkbook({ sheetName: "Catálogo", columns: exportColumns(), rows: [] });
  const instructions = XLSX.utils.aoa_to_sheet([
    ["Coluna", "Como preencher"],
    ...SUPPLIER_CATALOG_COLUMNS.map((c) => [c.header, c.description]),
    [],
    ["Notas", "Uma linha por artigo. Uma coluna que não exista no ficheiro não altera nada."],
    ["", "Uma coluna presente com a célula vazia apaga esse valor (exceto Nome e Ativo)."],
    ["", `Máximo ${SUPPLIER_CATALOG_MAX_ROWS} linhas por ficheiro. Artigos que faltem no ficheiro não são desativados.`],
  ]);
  instructions["!cols"] = [{ wch: 24 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instruções");
  writeWorkbook(wb, "modelo_catalogo_fornecedor.xlsx");
}

/** Exporta o catálogo atual no formato do modelo (reimportável). */
export function exportSupplierPortalCatalogXlsx(items: SpCatalogItem[], accountName: string): void {
  const wb = buildStandardWorkbook({
    sheetName: "Catálogo",
    columns: exportColumns(),
    rows: items.map((i) => ({
      supplier_ref: i.supplier_ref,
      barcode: i.barcode,
      name: i.name,
      description: i.description,
      brand: i.brand,
      unit_label: i.unit_label,
      units_per_pack: i.units_per_pack,
      base_price: i.base_price,
      currency: i.currency,
      moq: i.moq,
      lead_time_days: i.lead_time_days,
      is_active: i.is_active ? "sim" : "não",
    })),
  });
  const slug = slugify(accountName) || "fornecedor";
  writeWorkbook(wb, `catalogo_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Leitura ────────────────────────────────────────────────────────────────

export interface ParsedSupplierCatalogFile {
  fileName: string;
  headers: string[];
  /** Linhas de dados não vazias; rowNumber = nº da linha na folha (1-based). */
  rows: { rowNumber: number; cells: string[] }[];
  /** Coluna do ficheiro → campo sugerido (null = ignorar). */
  autoMapping: (SpCatalogField | null)[];
}

// Desfaz o escape de fórmulas que a nossa exportação acrescenta ('=…, '+…).
const FORMULA_ESCAPE = /^'(?=[=+\-@])/;

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value); // inteiros até 1e21 sem notação científica
  }
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).trim().replace(FORMULA_ESCAPE, "");
}

function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // CSV gravado pelo Excel em português costuma vir em Windows-1252.
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  const [best, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return bestCount > 0 ? best : ";";
}

/** CSV (RFC 4180) → matriz de texto. Sem conversões de tipo. */
function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sep = detectDelimiter(src);
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out;
}

export async function readSupplierCatalogFile(file: File): Promise<ParsedSupplierCatalogFile> {
  const lower = file.name.toLowerCase();
  const isCsv = lower.endsWith(".csv");
  if (!isCsv && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new Error("Formato não suportado. Use um ficheiro Excel (.xlsx, .xls) ou CSV (.csv).");
  }
  if (file.size === 0) throw new Error("O ficheiro está vazio.");
  if (file.size > SUPPLIER_CATALOG_MAX_FILE_BYTES) {
    throw new Error("O ficheiro é demasiado grande (máximo 10 MB).");
  }

  const buffer = await file.arrayBuffer();
  let matrix: unknown[][];
  let firstRowNumber = 1;

  if (isCsv) {
    matrix = parseCsv(decodeText(buffer));
  } else {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "array", cellFormula: false, cellHTML: false, cellDates: false });
    } catch {
      throw new Error("Não foi possível ler o ficheiro. Confirme que é um Excel válido.");
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet || !sheet["!ref"]) throw new Error("O ficheiro não tem dados na primeira folha.");
    firstRowNumber = XLSX.utils.decode_range(sheet["!ref"]).s.r + 1;
    matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: true }) as unknown[][];
  }

  const isEmptyRow = (r: unknown[] | undefined) => !Array.isArray(r) || r.every((c) => cellToText(c) === "");
  const headerIdx = matrix.findIndex((r) => !isEmptyRow(r));
  if (headerIdx === -1) throw new Error("O ficheiro está vazio.");

  const headers = (matrix[headerIdx] as unknown[]).map((c) => cellToText(c));
  const width = headers.length;

  const rows: ParsedSupplierCatalogFile["rows"] = [];
  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const raw = matrix[i];
    if (isEmptyRow(raw)) continue;
    const cells = Array.from({ length: width }, (_, c) => cellToText((raw as unknown[])[c]));
    rows.push({ rowNumber: firstRowNumber + i, cells });
    if (rows.length > SUPPLIER_CATALOG_MAX_ROWS) {
      throw new Error(
        `O ficheiro tem mais de ${SUPPLIER_CATALOG_MAX_ROWS} linhas de artigos. Divida-o em ficheiros mais pequenos.`,
      );
    }
  }
  if (rows.length === 0) throw new Error("O ficheiro só tem cabeçalhos: não há linhas de artigos.");

  // Mapeamento automático pelos cabeçalhos; cada campo só uma vez.
  const used = new Set<SpCatalogField>();
  const autoMapping = headers.map((h) => {
    const norm = normalizeHeader(h);
    if (!norm) return null;
    const col = SUPPLIER_CATALOG_COLUMNS.find((c) => !used.has(c.field) && c.aliases.includes(norm));
    if (!col) return null;
    used.add(col.field);
    return col.field;
  });

  return { fileName: file.name, headers, rows, autoMapping };
}

/**
 * Linhas para sp_catalog_import: só as chaves das colunas mapeadas (contrato
 * 2.5) e `_row` com o nº da linha na folha. Linhas sem nenhum valor nas
 * colunas mapeadas são saltadas.
 */
export function buildSupplierCatalogImportRows(
  parsed: ParsedSupplierCatalogFile,
  mapping: (SpCatalogField | null)[],
): SpCatalogRowInput[] {
  const mapped = mapping
    .map((field, index) => (field ? { field, index } : null))
    .filter((m): m is { field: SpCatalogField; index: number } => m !== null);

  const out: SpCatalogRowInput[] = [];
  for (const r of parsed.rows) {
    if (mapped.every((m) => (r.cells[m.index] ?? "") === "")) continue;
    const row: SpCatalogRowInput = { _row: r.rowNumber };
    for (const m of mapped) {
      const value = r.cells[m.index] ?? "";
      if (value === "" && OMIT_WHEN_EMPTY.has(m.field)) continue;
      row[m.field] = value;
    }
    out.push(row);
  }
  return out;
}
