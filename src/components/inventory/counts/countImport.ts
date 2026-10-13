// Leitura do ficheiro de contagem (CSV/XLSX) para a folha de uma contagem
// (InventoryCountDetailDialog). Só leitura e validação — a escrita fica no
// diálogo, pela mesma via da edição manual (rpc_bulk_update_inventory_count_lines
// por SKU; rpc_update_inventory_count_line_quantity por linha).
//
// O ficheiro exportado é o mesmo que o utilizador devolve preenchido, por isso
// o cabeçalho é validado por NOME (nunca por posição): quem abre o ficheiro no
// Excel reordena colunas, apaga as que não interessam e volta a gravar.
import * as XLSX from "xlsx";

// Sem acentos, sem maiúsculas e sem pontuação — "Qtd. Contada", "qtd contada"
// e "QTD CONTADA" colapsam todos para "qtd contada".
export const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Aliases fixos (nas 5 línguas) para além do cabeçalho traduzido do idioma
// ativo — o ficheiro pode ter sido exportado por um colega noutro idioma.
export const SKU_HEADER_ALIASES = [
  "sku", "codigo", "codigo do produto", "code", "product code",
  "referencia", "reference", "artikelnummer", "ref",
];
export const BARCODE_HEADER_ALIASES = [
  "ean", "ean13", "ean 13", "gtin", "barcode", "bar code",
  "codigo de barras", "cod barras", "code barres", "codigo barras", "strichcode",
];
export const COUNTED_HEADER_ALIASES = [
  "qtd contada", "qtd contada unid", "quantidade contada", "contada",
  "counted qty", "counted quantity", "counted",
  "cantidad contada", "cant contada",
  "qte comptee", "quantite comptee", "comptee",
  "gezahlte menge", "menge gezahlt", "gezahlt",
];

// O separador NÃO pode ser assumido: o export do projeto produz ';', mas quem
// abre o XLSX no Excel e faz "Guardar como CSV" obtém ';' ou ',' conforme o
// locale do Windows, e há ainda quem exporte separado por tabulações.
const CSV_DELIMITER_CANDIDATES = [";", ",", "\t"] as const;

const detectCsvDelimiter = (text: string): string => {
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { i += 1; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === "\n") {
      if (counts[";"] > 0 || counts[","] > 0 || counts["\t"] > 0) break;
      continue;
    }
    if (char in counts) counts[char] += 1;
  }
  let best: string = ";";
  for (const candidate of CSV_DELIMITER_CANDIDATES) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return counts[best] > 0 ? best : ";";
};

// Parser de CSV tolerante a campos entre aspas com o separador lá dentro e a
// quebras de linha dentro das aspas. Tira o BOM (U+FEFF ou "ï»¿" mal descodificado).
const parseCsvToMatrix = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const source = (text.codePointAt(0) === 0xFEFF ? text.slice(1) : text).replace(/^ï»¿/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === delimiter) { row.push(field); field = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += char;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
};

const buildCsvMatrix = (text: string): string[][] => parseCsvToMatrix(text, detectCsvDelimiter(text));

// O export do projeto prefixa um apóstrofo a texto começado por = + - @
// (anti-injeção de fórmulas). Ao ler, desfazemos esse escape.
export const stripSpreadsheetEscape = (value: unknown): string =>
  String(value ?? "").trim().replace(/^'/, "");

// Chave de comparação alinhada com a RPC (upper + btrim) — é assim que
// rpc_bulk_update_inventory_count_lines resolve o SKU dentro da contagem.
export const normalizeCodeKey = (code: string): string => code.trim().toUpperCase();

interface ImportColumnLookup {
  status: "ok" | "empty" | "missingCode" | "missingCounted" | "missingBoth";
  headerRowIndex: number;
  skuIndex: number;
  barcodeIndex: number;
  countedIndex: number;
}

const locateImportColumns = (
  matrix: unknown[][],
  skuAliases: Set<string>,
  barcodeAliases: Set<string>,
  countedAliases: Set<string>,
): ImportColumnLookup => {
  const headerRowIndex = matrix.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""),
  );
  if (headerRowIndex === -1) {
    return { status: "empty", headerRowIndex: -1, skuIndex: -1, barcodeIndex: -1, countedIndex: -1 };
  }
  const headerCells = (matrix[headerRowIndex] || []).map(normalizeHeader);
  const skuIndex = headerCells.findIndex((cell) => skuAliases.has(cell));
  const barcodeIndex = headerCells.findIndex((cell) => barcodeAliases.has(cell));
  const countedIndex = headerCells.findIndex((cell) => countedAliases.has(cell));
  const noCode = skuIndex === -1 && barcodeIndex === -1;

  let status: ImportColumnLookup["status"] = "ok";
  if (noCode && countedIndex === -1) status = "missingBoth";
  else if (noCode) status = "missingCode";
  else if (countedIndex === -1) status = "missingCounted";
  return { status, headerRowIndex, skuIndex, barcodeIndex, countedIndex };
};

// null quando não é uma quantidade válida (inteiro >= 0). A célula vazia é
// tratada antes — vazia é "por contar", não é inválida.
export const parseCountedQuantity = (raw: unknown): number | null => {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 0 ? raw : null;
  }
  const text = stripSpreadsheetEscape(raw).replace(/\s/g, "").replace(",", ".");
  if (text === "") return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) return null;
  return parsed;
};

export interface CountImportLineRef {
  id: string;
  counted_quantity: number | null;
  discrepancy_resolution?: string | null;
  products?: { name: string; sku: string | null; barcode: string | null } | null;
}

/** Resoluções que se perdem quando a contada muda (a RPC limpa-as). */
const FINAL_RESOLUTIONS = new Set(["ajustado", "aceite_sem_ajuste"]);

export interface CountImportErrorRow {
  line: number;
  code: string;
  reason: string;
}

export interface CountImportEntry {
  lineId: string;
  /** SKU da linha da contagem (não o do ficheiro) — null quando o produto não tem SKU. */
  sku: string | null;
  productName: string;
  code: string;
  previous: number | null;
  counted_quantity: number;
  input_index: number;
  /** Resolução gravada na linha antes do import (null quando não há). */
  previousResolution?: string | null;
  /**
   * true quando a linha já está resolvida (Ajustado / Aceite sem ajuste) e o
   * valor muda — gravar limpa essa resolução.
   */
  losesResolution?: boolean;
}

export interface CountImportPreview {
  fileName: string;
  entries: CountImportEntry[];
  /** Linhas do ficheiro sem quantidade (por contar) — ignoradas. */
  skipped: number;
  /** Entradas cuja quantidade é igual à já gravada — não são reenviadas. */
  unchanged: number;
  /** Entradas (dentro de `entries`) com `losesResolution`. */
  losingResolution: number;
  errors: CountImportErrorRow[];
}

export interface CountImportLabels {
  skuHeader: string;
  barcodeHeader: string;
  countedHeader: string;
}

/**
 * Lê o ficheiro e casa cada linha com uma linha da contagem por SKU ou
 * EAN/código de barras. Lança Error com mensagem legível quando o ficheiro
 * não serve de todo (vazio, colunas em falta); erros por linha vão em `errors`.
 */
export async function parseCountImportFile(
  file: File,
  lines: CountImportLineRef[],
  labels: CountImportLabels,
): Promise<CountImportPreview> {
  const skuAliases = new Set([...SKU_HEADER_ALIASES, normalizeHeader(labels.skuHeader)]);
  const barcodeAliases = new Set([...BARCODE_HEADER_ALIASES, normalizeHeader(labels.barcodeHeader)]);
  const countedAliases = new Set([...COUNTED_HEADER_ALIASES, normalizeHeader(labels.countedHeader)]);

  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  const buffer = await file.arrayBuffer();
  let matrix: unknown[][];
  let located: ImportColumnLookup;
  if (isExcel) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    located = locateImportColumns(matrix, skuAliases, barcodeAliases, countedAliases);
  } else {
    matrix = buildCsvMatrix(new TextDecoder("utf-8").decode(buffer));
    located = locateImportColumns(matrix, skuAliases, barcodeAliases, countedAliases);
    if (located.status !== "ok" && located.status !== "empty") {
      // CSV gravado pelo Excel em Windows-1252: segunda tentativa.
      const ansiMatrix = buildCsvMatrix(new TextDecoder("windows-1252").decode(buffer));
      const ansiLocated = locateImportColumns(ansiMatrix, skuAliases, barcodeAliases, countedAliases);
      if (ansiLocated.status === "ok") {
        matrix = ansiMatrix;
        located = ansiLocated;
      }
    }
  }

  if (located.status === "empty") throw new Error("O ficheiro está vazio.");
  if (located.status !== "ok") {
    const missing: string[] = [];
    if (located.status === "missingCode" || located.status === "missingBoth") {
      missing.push(`${labels.skuHeader} ou ${labels.barcodeHeader}`);
    }
    if (located.status === "missingCounted" || located.status === "missingBoth") {
      missing.push(labels.countedHeader);
    }
    throw new Error(`Colunas em falta: ${missing.join(", ")}.`);
  }

  const { headerRowIndex, skuIndex, barcodeIndex, countedIndex } = located;

  // Todas as linhas por código (não só a última): um SKU/EAN que aparece em
  // mais de um produto da contagem não pode ser atribuído a um qualquer.
  const bySku = new Map<string, CountImportLineRef[]>();
  const byBarcode = new Map<string, CountImportLineRef[]>();
  const addTo = (map: Map<string, CountImportLineRef[]>, key: string, line: CountImportLineRef) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(line);
    else map.set(key, [line]);
  };
  for (const line of lines) {
    addTo(bySku, normalizeCodeKey(line.products?.sku ?? ""), line);
    addTo(byBarcode, normalizeCodeKey(line.products?.barcode ?? ""), line);
  }
  // Mesma ordem de prioridade de antes; o primeiro passo que encontra alguma
  // coisa decide — com mais de uma linha, é ambíguo.
  const resolveCode = (rawSku: string, rawBarcode: string): CountImportLineRef | "ambiguous" | undefined => {
    const steps: Array<[Map<string, CountImportLineRef[]>, string]> = [
      [bySku, rawSku],
      [byBarcode, rawBarcode],
      // Leitores escrevem muitas vezes o EAN na coluna do SKU e vice-versa.
      [byBarcode, rawSku],
      [bySku, rawBarcode],
    ];
    for (const [map, raw] of steps) {
      if (!raw) continue;
      const found = map.get(normalizeCodeKey(raw));
      if (!found || found.length === 0) continue;
      return found.length === 1 ? found[0] : "ambiguous";
    }
    return undefined;
  };

  let entries: CountImportEntry[] = [];
  const errors: CountImportErrorRow[] = [];
  let skipped = 0;

  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const row = (matrix[i] || []) as unknown[];
    const inputIndex = i + 1; // número da linha no Excel
    const rawSku = skuIndex >= 0 ? stripSpreadsheetEscape(row[skuIndex]) : "";
    const rawBarcode = barcodeIndex >= 0 ? stripSpreadsheetEscape(row[barcodeIndex]) : "";
    const rawQuantity = stripSpreadsheetEscape(row[countedIndex]);
    const code = rawSku || rawBarcode;

    if (code === "" && rawQuantity === "") continue;
    if (rawQuantity === "") { skipped += 1; continue; }
    if (code === "") {
      errors.push({ line: inputIndex, code: "—", reason: "Linha sem SKU nem EAN." });
      continue;
    }
    const quantity = parseCountedQuantity(row[countedIndex]);
    if (quantity === null) {
      errors.push({ line: inputIndex, code, reason: `Quantidade inválida: "${rawQuantity}" (tem de ser um inteiro ≥ 0).` });
      continue;
    }
    const match = resolveCode(rawSku, rawBarcode);
    if (match === "ambiguous") {
      errors.push({
        line: inputIndex,
        code,
        reason: "Código ambíguo nesta contagem: o mesmo SKU/EAN pertence a mais de um produto — conte esses produtos à mão.",
      });
      continue;
    }
    if (!match) {
      errors.push({ line: inputIndex, code, reason: "Produto desconhecido nesta contagem." });
      continue;
    }
    const previousResolution = match.discrepancy_resolution ?? null;
    entries.push({
      lineId: match.id,
      sku: match.products?.sku?.trim() || null,
      productName: match.products?.name || code,
      code,
      previous: match.counted_quantity,
      counted_quantity: quantity,
      input_index: inputIndex,
      previousResolution,
      losesResolution: !!previousResolution
        && FINAL_RESOLUTIONS.has(previousResolution)
        && match.counted_quantity !== quantity,
    });
  }

  // O mesmo produto em várias linhas do ficheiro: quem decide qual vale é o
  // utilizador — as linhas em conflito NÃO são enviadas, as outras seguem.
  const occurrences = new Map<string, number[]>();
  for (const entry of entries) {
    const list = occurrences.get(entry.lineId);
    if (list) list.push(entry.input_index);
    else occurrences.set(entry.lineId, [entry.input_index]);
  }
  const duplicated = new Set<string>();
  for (const [lineId, list] of occurrences) {
    if (list.length < 2) continue;
    duplicated.add(lineId);
    for (const entry of entries.filter((e) => e.lineId === lineId)) {
      errors.push({
        line: entry.input_index,
        code: entry.code,
        reason: `${entry.productName} aparece repetido nas linhas ${list.join(", ")} — corrija e volte a importar.`,
      });
    }
  }
  if (duplicated.size > 0) entries = entries.filter((e) => !duplicated.has(e.lineId));

  const unchanged = entries.filter((e) => e.previous === e.counted_quantity).length;
  entries = entries.filter((e) => e.previous !== e.counted_quantity);
  errors.sort((a, b) => a.line - b.line);
  const losingResolution = entries.filter((e) => e.losesResolution).length;

  return { fileName: file.name, entries, skipped, unchanged, losingResolution, errors };
}
