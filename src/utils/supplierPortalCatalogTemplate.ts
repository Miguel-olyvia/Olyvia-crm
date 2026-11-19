// Portal do Fornecedor (F3.1) — modelo XLSX, exportação e leitura de ficheiros
// do catálogo (XLSX/XLS/CSV) para sp_catalog_import.
//
// Idioma: o modelo e a exportação saem no idioma do portal (cabeçalhos, instruções, nomes das folhas, sim/não ou
// yes/no, produto/serviço ou product/service). A LEITURA reconhece cabeçalhos em português E em inglês, seja qual
// for o idioma do portal: exportar numa língua e importar de volta mapeia todas as colunas. O servidor aceita
// sim/não e yes/no, produto/serviço e product/service (sp_catalog_import, migration 20270103600000).
// Os números (preços, quantidades) não mudam com o idioma: ficam como o servidor os grava.
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
import { ehPortalIdioma, IDIOMA_OMISSAO, type ParamsDeTraducao, type PortalIdioma } from "@/portal-i18n/tipos";
import { traduzir } from "@/portal-i18n/traduzir";

export const SUPPLIER_CATALOG_MAX_ROWS = 5000;
export const SUPPLIER_CATALOG_MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface SupplierCatalogColumnDef {
  field: SpCatalogField;
  type: "text" | "number";
  width: number;
  /** Cabeçalhos aceites, em português e em inglês (normalizados: sem acentos, minúsculas, só [a-z0-9]). */
  aliases: string[];
}

/** Os cabeçalhos e as descrições de cada coluna vivem no dicionário (`sp.importar.coluna.<campo>.*`). */
export const SUPPLIER_CATALOG_COLUMNS: SupplierCatalogColumnDef[] = [
  {
    field: "supplier_ref", type: "text", width: 16,
    aliases: ["ref", "referencia", "reffornecedor", "referenciafornecedor", "referenciadofornecedor", "codigo", "codigoartigo", "codigodoartigo", "codigofornecedor", "suppliersku", "supplierref", "sku", "itemref", "reference"],
  },
  {
    field: "item_kind", type: "text", width: 10,
    aliases: ["tipo", "tipodeartigo", "produtoouservico", "kind", "itemkind", "type", "itemtype", "producttype", "productorservice"],
  },
  {
    field: "barcode", type: "text", width: 18,
    aliases: ["codigodebarras", "codigobarras", "codbarras", "barcode", "ean", "ean13", "gtin"],
  },
  {
    field: "name", type: "text", width: 36,
    aliases: ["nome", "designacao", "artigo", "produto", "name", "nomedoartigo", "itemname", "productname"],
  },
  {
    field: "description", type: "text", width: 40,
    aliases: ["descricao", "descricaolonga", "description", "detalhe"],
  },
  {
    field: "brand", type: "text", width: 16,
    aliases: ["marca", "brand", "fabricante", "manufacturer"],
  },
  {
    field: "unit_label", type: "text", width: 10,
    aliases: ["unidade", "un", "unid", "unit", "uom", "unidadedevenda", "unidademedida", "unitofmeasure", "sellingunit"],
  },
  {
    field: "units_per_pack", type: "number", width: 14,
    aliases: ["unidadesporembalagem", "unidembalagem", "qtdembalagem", "qtdporembalagem", "quantidadeporembalagem", "embalagem", "unitsperpack", "unitsperpackage", "packsize", "qtyperpack"],
  },
  {
    field: "base_price", type: "number", width: 12,
    aliases: ["preco", "precobase", "precounitario", "precosemiva", "precoliquido", "price", "baseprice", "unitprice", "netprice"],
  },
  {
    field: "currency", type: "text", width: 8,
    aliases: ["moeda", "currency", "divisa"],
  },
  {
    field: "moq", type: "number", width: 10,
    aliases: ["minimo", "quantidademinima", "qtdminima", "encomendaminima", "moq", "minorderqty", "minimumorderqty", "minimumorderquantity", "minimumquantity", "minimumqty", "minqty"],
  },
  {
    field: "lead_time_days", type: "number", width: 12,
    aliases: ["prazodias", "prazo", "prazoentrega", "prazodeentrega", "prazodeentregadias", "diasdeentrega", "leadtime", "leadtimedays", "deliverytime", "deliverydays"],
  },
  {
    field: "service_districts", type: "text", width: 28,
    aliases: ["zonadeatuacao", "zonaatuacao", "zona", "distritos", "distrito", "areadeatuacao", "servicedistricts", "servicearea", "serviceareas", "districts", "district", "coveragearea", "operatingarea"],
  },
  {
    field: "mobilization_days", type: "number", width: 14,
    aliases: ["prazodemobilizacao", "prazodemobilizacaodias", "prazomobilizacao", "mobilizacao", "mobilizacaodias", "mobilizationdays", "mobilisationdays", "mobilizationleadtime", "mobilisationleadtime", "mobilizationleadtimedays", "mobilisationleadtimedays"],
  },
  {
    field: "is_active", type: "text", width: 8,
    aliases: ["ativo", "activo", "active", "estado", "status"],
  },
];

function normalizarIdioma(idioma: unknown): PortalIdioma {
  return ehPortalIdioma(idioma) ? idioma : IDIOMA_OMISSAO;
}

/** O cabeçalho de um campo no idioma pedido («Ref.», «Código de barras»... / «Supplier ref.», «Barcode»...). */
export function supplierCatalogHeader(field: SpCatalogField, idioma: PortalIdioma): string {
  return traduzir(idioma, `sp.importar.coluna.${field}.cabecalho`);
}

/** Como se preenche a coluna deste campo, no idioma pedido. */
export function supplierCatalogDescription(field: SpCatalogField, idioma: PortalIdioma): string {
  return traduzir(idioma, `sp.importar.coluna.${field}.descricao`);
}

/** Etiqueta de cada campo (a que se mostra nas alterações da importação), no idioma pedido. */
export function supplierCatalogFieldLabels(idioma: PortalIdioma): Record<SpCatalogField, string> {
  return Object.fromEntries(
    SUPPLIER_CATALOG_COLUMNS.map((c) => [c.field, supplierCatalogHeader(c.field, idioma)]),
  ) as Record<SpCatalogField, string>;
}

/** Nomes de ficheiro por idioma: o modelo, o prefixo da exportação e o nome por omissão do fornecedor. */
export function supplierCatalogFileNames(idioma: PortalIdioma): { template: string; catalogoPrefixo: string; fornecedor: string } {
  return {
    template: traduzir(idioma, "sp.importar.modelo.ficheiroModelo"),
    catalogoPrefixo: traduzir(idioma, "sp.importar.modelo.prefixoCatalogo"),
    fornecedor: traduzir(idioma, "sp.importar.modelo.fornecedor"),
  };
}

/**
 * Campos em que uma célula vazia NÃO é enviada (mantém o valor gravado).
 * Nos restantes, a coluna presente com célula vazia limpa o valor (contrato 2.5).
 *  • name: vazio daria "Nome obrigatório" num artigo existente;
 *  • is_active: o servidor lê "" como ativo — reativaria artigos sem querer.
 */
//  • item_kind: o servidor lê "" como produto — passaria serviços a produtos sem querer.
const OMIT_WHEN_EMPTY: ReadonlySet<SpCatalogField> = new Set<SpCatalogField>(["name", "is_active", "item_kind"]);

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

const exportColumns = (idioma: PortalIdioma): StandardExportColumn[] =>
  SUPPLIER_CATALOG_COLUMNS.map((c) => ({
    key: c.field,
    header: supplierCatalogHeader(c.field, idioma),
    type: c.type,
    width: c.width,
  }));

/** O modelo: folha do catálogo só com cabeçalhos + folha de instruções, no idioma pedido. */
export function buildSupplierCatalogTemplateWorkbook(idioma: PortalIdioma = IDIOMA_OMISSAO): XLSX.WorkBook {
  const lang = normalizarIdioma(idioma);
  const t = (chave: string, params?: ParamsDeTraducao) => traduzir(lang, chave, params);
  const wb = buildStandardWorkbook({
    sheetName: t("sp.importar.modelo.folhaCatalogo"),
    columns: exportColumns(lang),
    rows: [],
  });
  const instructions = XLSX.utils.aoa_to_sheet([
    [t("sp.importar.modelo.cabecalhoColuna"), t("sp.importar.modelo.cabecalhoComoPreencher")],
    ...SUPPLIER_CATALOG_COLUMNS.map((c) => [supplierCatalogHeader(c.field, lang), supplierCatalogDescription(c.field, lang)]),
    [],
    [t("sp.importar.modelo.notas"), t("sp.importar.modelo.nota1")],
    ["", t("sp.importar.modelo.nota2")],
    ["", t("sp.importar.modelo.nota3", { max: SUPPLIER_CATALOG_MAX_ROWS })],
  ]);
  instructions["!cols"] = [{ wch: 24 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, instructions, t("sp.importar.modelo.folhaInstrucoes"));
  return wb;
}

/** "Descarregar modelo": o ficheiro do modelo no idioma do portal (português se não se disser). */
export function downloadSupplierCatalogTemplate(idioma: PortalIdioma = IDIOMA_OMISSAO): void {
  const lang = normalizarIdioma(idioma);
  writeWorkbook(buildSupplierCatalogTemplateWorkbook(lang), supplierCatalogFileNames(lang).template);
}

/** A exportação do catálogo atual no formato do modelo (reimportável), no idioma pedido. */
export function buildSupplierCatalogExportWorkbook(
  items: SpCatalogItem[],
  idioma: PortalIdioma = IDIOMA_OMISSAO,
  /** Fase 5: nomes dos distritos por código (sem ele exporta os códigos, que também se reimportam). */
  districtNames?: Record<string, string>,
): XLSX.WorkBook {
  const lang = normalizarIdioma(idioma);
  const yes = traduzir(lang, "sp.importar.valor.sim");
  const no = traduzir(lang, "sp.importar.valor.nao");
  const product = traduzir(lang, "sp.importar.valor.produto");
  const service = traduzir(lang, "sp.importar.valor.servico");
  return buildStandardWorkbook({
    sheetName: traduzir(lang, "sp.importar.modelo.folhaCatalogo"),
    columns: exportColumns(lang),
    rows: items.map((i) => ({
      supplier_ref: i.supplier_ref,
      item_kind: i.item_kind === "servico" ? service : product,
      service_districts: (i.service_districts ?? []).map((c) => districtNames?.[c] ?? c).join("; ") || null,
      mobilization_days: i.mobilization_days ?? null,
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
      is_active: i.is_active ? yes : no,
    })),
  });
}

/** Exporta o catálogo atual no formato do modelo (reimportável). */
export function exportSupplierPortalCatalogXlsx(
  items: SpCatalogItem[],
  accountName: string,
  /** Fase 5: nomes dos distritos por código (sem ele exporta os códigos, que também se reimportam). */
  districtNames?: Record<string, string>,
  idioma: PortalIdioma = IDIOMA_OMISSAO,
): void {
  const lang = normalizarIdioma(idioma);
  const nomes = supplierCatalogFileNames(lang);
  const slug = slugify(accountName) || nomes.fornecedor;
  writeWorkbook(
    buildSupplierCatalogExportWorkbook(items, lang, districtNames),
    `${nomes.catalogoPrefixo}_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

// ─── Leitura ────────────────────────────────────────────────────────────────

export interface ParsedSupplierCatalogFile {
  fileName: string;
  headers: string[];
  /** Linhas de dados não vazias; rowNumber = nº da linha na folha (1-based). */
  rows: {
    rowNumber: number;
    cells: string[];
    /**
     * Texto para colunas de código (barcode, supplier_ref): numa célula
     * numérica com formato só de dígitos (p.ex. "0000000000000") usa o texto
     * formatado, para não perder os zeros à esquerda. CSV = igual a `cells`.
     */
    codeCells: string[];
  }[];
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

/**
 * Erro ao ler o ficheiro. `message` já vem no idioma pedido (para quem só mostra o texto), e `chave`/`params`
 * deixam quem o guarda em estado traduzi-lo ao mostrar, no idioma de então.
 */
export class SupplierCatalogFileError extends Error {
  readonly chave: string;
  readonly params?: ParamsDeTraducao;
  constructor(chave: string, params: ParamsDeTraducao | undefined, message: string) {
    super(message);
    this.name = "SupplierCatalogFileError";
    this.chave = chave;
    this.params = params;
  }
}

/** Lê o ficheiro escolhido; as mensagens de erro saem no idioma do portal (português se não se disser). */
export async function readSupplierCatalogFile(file: File, idioma: PortalIdioma = IDIOMA_OMISSAO): Promise<ParsedSupplierCatalogFile> {
  const lang = normalizarIdioma(idioma);
  const t = (chave: string, params?: ParamsDeTraducao) => traduzir(lang, chave, params);
  const erro = (chave: string, params?: ParamsDeTraducao) => new SupplierCatalogFileError(chave, params, t(chave, params));
  const lower = file.name.toLowerCase();
  const isCsv = lower.endsWith(".csv");
  if (!isCsv && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw erro("sp.importar.erro.formato");
  }
  if (file.size === 0) throw erro("sp.importar.erro.vazio");
  if (file.size > SUPPLIER_CATALOG_MAX_FILE_BYTES) {
    throw erro("sp.importar.erro.grande");
  }

  const buffer = await file.arrayBuffer();
  let matrix: unknown[][];
  // Texto formatado das células (cell.w), só para Excel.
  let formattedMatrix: unknown[][] | null = null;
  let firstRowNumber = 1;

  if (isCsv) {
    matrix = parseCsv(decodeText(buffer));
  } else {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "array", cellFormula: false, cellHTML: false, cellDates: false });
    } catch {
      throw erro("sp.importar.erro.invalido");
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet || !sheet["!ref"]) throw erro("sp.importar.erro.semDados");
    firstRowNumber = XLSX.utils.decode_range(sheet["!ref"]).s.r + 1;
    matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: true }) as unknown[][];
    formattedMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: true }) as unknown[][];
  }

  // Só se aceita o texto formatado quando é só dígitos: o formato "Geral" do
  // Excel mostra EAN longos em notação científica (5,60123E+12), e aí o valor
  // bruto é o correto.
  const codeCellText = (rawValue: unknown, formatted: unknown): string => {
    if (typeof rawValue === "number" && typeof formatted === "string") {
      const w = formatted.trim();
      if (/^\d+$/.test(w)) return w;
    }
    return cellToText(rawValue);
  };

  const isEmptyRow = (r: unknown[] | undefined) => !Array.isArray(r) || r.every((c) => cellToText(c) === "");
  const headerIdx = matrix.findIndex((r) => !isEmptyRow(r));
  if (headerIdx === -1) throw erro("sp.importar.erro.vazio");

  const headers = (matrix[headerIdx] as unknown[]).map((c) => cellToText(c));
  const width = headers.length;

  const rows: ParsedSupplierCatalogFile["rows"] = [];
  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const raw = matrix[i];
    if (isEmptyRow(raw)) continue;
    const cells = Array.from({ length: width }, (_, c) => cellToText((raw as unknown[])[c]));
    const fmt = formattedMatrix?.[i];
    const codeCells = fmt
      ? Array.from({ length: width }, (_, c) => codeCellText((raw as unknown[])[c], (fmt as unknown[])[c]))
      : cells;
    rows.push({ rowNumber: firstRowNumber + i, cells, codeCells });
    if (rows.length > SUPPLIER_CATALOG_MAX_ROWS) {
      throw erro("sp.importar.erro.demasiadasLinhas", { max: SUPPLIER_CATALOG_MAX_ROWS });
    }
  }
  if (rows.length === 0) throw erro("sp.importar.erro.soCabecalhos");

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
// Códigos: zeros à esquerda contam (ver codeCells).
const CODE_FIELDS = new Set<SpCatalogField>(["barcode", "supplier_ref"]);

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
      const value = (CODE_FIELDS.has(m.field) ? r.codeCells[m.index] : r.cells[m.index]) ?? "";
      if (value === "" && OMIT_WHEN_EMPTY.has(m.field)) continue;
      row[m.field] = value;
    }
    out.push(row);
  }
  return out;
}
