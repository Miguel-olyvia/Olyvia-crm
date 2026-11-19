// O modelo e a exportação do catálogo seguem o idioma do portal, mas a importação reconhece cabeçalhos
// em português E em inglês (ida e volta: exportar numa língua e importar de volta mapeia todas as colunas).
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { SpCatalogItem } from "@/lib/supplierPortal/spRpc";
import {
  SUPPLIER_CATALOG_COLUMNS,
  buildSupplierCatalogExportWorkbook,
  buildSupplierCatalogImportRows,
  buildSupplierCatalogTemplateWorkbook,
  readSupplierCatalogFile,
  supplierCatalogDescription,
  supplierCatalogFieldLabels,
  supplierCatalogHeader,
  supplierCatalogFileNames,
} from "../supplierPortalCatalogTemplate";

const TODOS_OS_CAMPOS = SUPPLIER_CATALOG_COLUMNS.map((c) => c.field);

const HEADERS_PT = [
  "Ref.", "Tipo", "Código de barras", "Nome", "Descrição", "Marca", "Unidade", "Unidades por embalagem", "Preço", "Moeda",
  "Mínimo", "Prazo (dias)", "Zona de atuação", "Prazo de mobilização (dias)", "Ativo",
];
const COLUNAS = HEADERS_PT.length;
const ATIVO = COLUNAS - 1;

const item = (over: Partial<SpCatalogItem> = {}): SpCatalogItem => ({
  id: "1",
  supplier_ref: "A-001",
  barcode: "5601234567890",
  name: "Parafuso",
  description: "Parafuso inox",
  brand: "Acme",
  unit_label: "cx",
  units_per_pack: 12,
  base_price: 12.5,
  currency: "EUR",
  moq: 10,
  lead_time_days: 5,
  is_active: true,
  item_kind: "produto",
  service_districts: null,
  mobilization_days: null,
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

/** Um File mínimo: o jsdom nem sempre traz File.arrayBuffer(). */
function ficheiro(conteudo: ArrayBuffer | string, nome: string): File {
  const bytes = typeof conteudo === "string" ? new TextEncoder().encode(conteudo) : new Uint8Array(conteudo);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { name: nome, size: bytes.byteLength, arrayBuffer: async () => buffer } as unknown as File;
}

const paraXlsx = (wb: XLSX.WorkBook): ArrayBuffer => XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
const linhas = (ws: XLSX.WorkSheet): unknown[][] => XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

describe("cabeçalhos por idioma", () => {
  it("português: os cabeçalhos de sempre, pela mesma ordem", () => {
    expect(TODOS_OS_CAMPOS.map((f) => supplierCatalogHeader(f, "pt"))).toEqual(HEADERS_PT);
  });

  it("inglês: todos os cabeçalhos, todos diferentes e sem português", () => {
    const en = TODOS_OS_CAMPOS.map((f) => supplierCatalogHeader(f, "en"));
    expect(new Set(en).size).toBe(COLUNAS);
    expect(en).toContain("Barcode");
    expect(en).toContain("Active");
    for (const h of en) expect(h).not.toMatch(/[áàãâçéêíóõôú]/i);
  });

  it("as etiquetas por campo vêm do mesmo sítio", () => {
    expect(supplierCatalogFieldLabels("en").base_price).toBe(supplierCatalogHeader("base_price", "en"));
    expect(supplierCatalogFieldLabels("pt").lead_time_days).toBe("Prazo (dias)");
  });

  it("descrição em português inalterada e em inglês traduzida", () => {
    expect(supplierCatalogDescription("is_active", "pt")).toBe("sim/não. Vazio = mantém o estado gravado.");
    expect(supplierCatalogDescription("is_active", "en")).toBe("yes/no. Empty = keeps the saved status.");
    expect(supplierCatalogDescription("base_price", "pt")).toBe("Preço base sem IVA. Aceita 12,5 ou 12.5 ou 1.234,56.");
  });
});

describe("modelo (template)", () => {
  it("português: folhas Catálogo e Instruções com os textos de sempre", () => {
    const wb = buildSupplierCatalogTemplateWorkbook("pt");
    expect(wb.SheetNames).toEqual(["Catálogo", "Instruções"]);
    expect(linhas(wb.Sheets["Catálogo"])[0]).toEqual(HEADERS_PT);
    const ins = linhas(wb.Sheets["Instruções"]);
    expect(ins[0]).toEqual(["Coluna", "Como preencher"]);
    expect(ins[ins.length - 3]).toEqual(["Notas", "Uma linha por artigo. Uma coluna que não exista no ficheiro não altera nada."]);
    expect(ins[ins.length - 1]).toEqual(["", "Máximo 5000 linhas por ficheiro. Artigos que faltem no ficheiro não são desativados."]);
  });

  it("inglês: folhas, cabeçalhos, descrições e notas em inglês", () => {
    const wb = buildSupplierCatalogTemplateWorkbook("en");
    expect(wb.SheetNames).toEqual(["Catalogue", "Instructions"]);
    expect(linhas(wb.Sheets["Catalogue"])[0]).toEqual(TODOS_OS_CAMPOS.map((f) => supplierCatalogHeader(f, "en")));
    const ins = linhas(wb.Sheets["Instructions"]);
    expect(ins[0]).toEqual(["Column", "How to fill in"]);
    expect(ins[1][0]).toBe(supplierCatalogHeader("supplier_ref", "en"));
    const notas = ins.slice(-3).map((r) => String(r[1]));
    expect(notas[0]).toMatch(/One row per item/);
    expect(notas[2]).toMatch(/Maximum 5000 rows per file/);
    const tudo = ins.flat().join(" ");
    expect(tudo).not.toMatch(/Coluna|artigo|Máximo|Obrigat/);
  });

  it("os nomes dos ficheiros acompanham o idioma", () => {
    expect(supplierCatalogFileNames("pt").template).toBe("modelo_catalogo_fornecedor.xlsx");
    expect(supplierCatalogFileNames("en").template).toBe("supplier_catalogue_template.xlsx");
    expect(supplierCatalogFileNames("pt").catalogoPrefixo).toBe("catalogo");
    expect(supplierCatalogFileNames("en").catalogoPrefixo).toBe("catalogue");
    expect(supplierCatalogFileNames("pt").fornecedor).toBe("fornecedor");
    expect(supplierCatalogFileNames("en").fornecedor).toBe("supplier");
  });
});

describe("exportação", () => {
  it("português: sim/não e cabeçalhos portugueses", () => {
    const wb = buildSupplierCatalogExportWorkbook([item(), item({ id: "2", is_active: false })], "pt");
    expect(wb.SheetNames).toEqual(["Catálogo"]);
    const l = linhas(wb.Sheets["Catálogo"]);
    expect(l[0]).toEqual(HEADERS_PT);
    expect(l[1][ATIVO]).toBe("sim");
    expect(l[2][ATIVO]).toBe("não");
  });

  it("inglês: yes/no e cabeçalhos ingleses", () => {
    const wb = buildSupplierCatalogExportWorkbook([item(), item({ id: "2", is_active: false })], "en");
    expect(wb.SheetNames).toEqual(["Catalogue"]);
    const l = linhas(wb.Sheets["Catalogue"]);
    expect(l[0]).toEqual(TODOS_OS_CAMPOS.map((f) => supplierCatalogHeader(f, "en")));
    expect(l[1][ATIVO]).toBe("yes");
    expect(l[2][ATIVO]).toBe("no");
  });
});

describe("ida e volta: o que se exporta numa língua importa-se de volta", () => {
  it.each(["pt", "en"] as const)("%s: exportar e importar mapeia todas as colunas", async (idioma) => {
    const wb = buildSupplierCatalogExportWorkbook([item(), item({ id: "2", supplier_ref: "B-2", is_active: false })], idioma);
    const parsed = await readSupplierCatalogFile(ficheiro(paraXlsx(wb), "catalogo.xlsx"), idioma);
    expect(parsed.autoMapping).toEqual(TODOS_OS_CAMPOS);
    const rows = buildSupplierCatalogImportRows(parsed, parsed.autoMapping);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ supplier_ref: "A-001", name: "Parafuso", barcode: "5601234567890", currency: "EUR" });
    expect(rows[0].is_active).toBe(idioma === "en" ? "yes" : "sim");
    expect(rows[1].is_active).toBe(idioma === "en" ? "no" : "não");
  });

  it.each(["pt", "en"] as const)("%s: o modelo (só cabeçalhos) também se reconhece em qualquer língua", async (idioma) => {
    const wb = buildSupplierCatalogTemplateWorkbook(idioma);
    const header = TODOS_OS_CAMPOS.map((f) => supplierCatalogHeader(f, idioma));
    const csv = `${header.join(";")}\nX-1${";".repeat(COLUNAS - 1)}\n`;
    expect(wb.SheetNames[0]).toBeTruthy();
    for (const lingua of ["pt", "en"] as const) {
      const parsed = await readSupplierCatalogFile(ficheiro(csv, "m.csv"), lingua);
      expect(parsed.autoMapping).toEqual(TODOS_OS_CAMPOS);
    }
  });

  it("um ficheiro com cabeçalhos ingleses escritos à mão (sinónimos comuns) também mapeia", async () => {
    const csv = "SKU,Type,EAN,Name,Description,Brand,UoM,Units per pack,Price,Currency,MOQ,Lead time (days),Service area,Mobilization lead time (days),Active\nX1,product,5601234567890,Nome,,,un,1,1.5,EUR,1,3,,,yes\n";
    const parsed = await readSupplierCatalogFile(ficheiro(csv, "en.csv"), "en");
    expect(parsed.autoMapping).toEqual(TODOS_OS_CAMPOS);
  });

  it("um ficheiro com cabeçalhos em inglês e em português misturados mapeia na mesma", async () => {
    const csv = "Ref.;Name;Preço;Currency;Minimum order qty;Lead time (days);Ativo\nX1;N;1,5;EUR;2;3;sim\n";
    const parsed = await readSupplierCatalogFile(ficheiro(csv, "mix.csv"), "pt");
    expect(parsed.autoMapping).toEqual(["supplier_ref", "name", "base_price", "currency", "moq", "lead_time_days", "is_active"]);
  });

  it("yes/no e sim/não passam tal como vêm (o servidor aceita as duas)", async () => {
    const csv = "Ref.;Active\nA;yes\nB;no\nC;sim\nD;não\n";
    const parsed = await readSupplierCatalogFile(ficheiro(csv, "a.csv"), "en");
    const rows = buildSupplierCatalogImportRows(parsed, parsed.autoMapping);
    expect(rows.map((r) => r.is_active)).toEqual(["yes", "no", "sim", "não"]);
  });
});

describe("erros de leitura no idioma do portal", () => {
  const pedir = (f: File, idioma: "pt" | "en") => readSupplierCatalogFile(f, idioma).catch((e: Error) => e.message);

  it("português por omissão, texto de sempre", async () => {
    expect(await readSupplierCatalogFile(ficheiro("x", "a.pdf")).catch((e: Error) => e.message)).toBe(
      "Formato não suportado. Use um ficheiro Excel (.xlsx, .xls) ou CSV (.csv).",
    );
    expect(await pedir(ficheiro("", "a.csv"), "pt")).toBe("O ficheiro está vazio.");
    expect(await pedir(ficheiro("Ref.;Nome\n", "a.csv"), "pt")).toBe("O ficheiro só tem cabeçalhos: não há linhas de artigos.");
  });

  it("inglês", async () => {
    expect(await pedir(ficheiro("x", "a.pdf"), "en")).toBe("Unsupported format. Use an Excel (.xlsx, .xls) or CSV (.csv) file.");
    expect(await pedir(ficheiro("", "a.csv"), "en")).toBe("The file is empty.");
    expect(await pedir(ficheiro("Ref.;Name\n", "a.csv"), "en")).toBe("The file only has headers: there are no item rows.");
  });

  it("demasiado grande e demasiadas linhas", async () => {
    const grande = { name: "a.csv", size: 11 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File;
    expect(await pedir(grande, "en")).toBe("The file is too large (maximum 10 MB).");
    expect(await pedir(grande, "pt")).toBe("O ficheiro é demasiado grande (máximo 10 MB).");
    const muitas = `Ref.;Name\n${Array.from({ length: 5001 }, (_, i) => `R${i};N`).join("\n")}\n`;
    expect(await pedir(ficheiro(muitas, "m.csv"), "en")).toBe(
      "The file has more than 5000 item rows. Split it into smaller files.",
    );
    expect(await pedir(ficheiro(muitas, "m.csv"), "pt")).toBe(
      "O ficheiro tem mais de 5000 linhas de artigos. Divida-o em ficheiros mais pequenos.",
    );
  });
});

describe("serviços: produto/serviço, zona de atuação e mobilização", () => {
  const servico = item({
    id: "3",
    supplier_ref: "EL-1",
    item_kind: "servico",
    service_districts: ["PT-11", "PT-15"],
    mobilization_days: 7,
  } as Partial<SpCatalogItem>);

  it("a exportação escreve produto/serviço no idioma (o servidor aceita as duas formas) e os distritos pelo nome", () => {
    const nomes = { "PT-11": "Lisboa", "PT-15": "Setúbal" };
    const pt = linhas(buildSupplierCatalogExportWorkbook([item(), servico], "pt", nomes).Sheets["Catálogo"]);
    const en = linhas(buildSupplierCatalogExportWorkbook([item(), servico], "en", nomes).Sheets["Catalogue"]);
    expect([pt[1][1], pt[2][1]]).toEqual(["produto", "serviço"]);
    expect([en[1][1], en[2][1]]).toEqual(["product", "service"]);
    // zona e mobilização: iguais nos dois idiomas (dados e números não mudam)
    expect(pt[2][12]).toBe("Lisboa; Setúbal");
    expect(en[2][12]).toBe("Lisboa; Setúbal");
    expect(pt[2][13]).toBe(7);
    expect(en[2][13]).toBe(7);
  });

  it.each(["pt", "en"] as const)("%s: ida e volta com um serviço mantém tipo, zona e mobilização", async (idioma) => {
    const wb = buildSupplierCatalogExportWorkbook([servico], idioma, { "PT-11": "Lisboa", "PT-15": "Setúbal" });
    const parsed = await readSupplierCatalogFile(ficheiro(paraXlsx(wb), "s.xlsx"), idioma);
    const rows = buildSupplierCatalogImportRows(parsed, parsed.autoMapping);
    expect(rows[0]).toMatchObject({
      supplier_ref: "EL-1",
      item_kind: idioma === "en" ? "service" : "serviço",
      service_districts: "Lisboa; Setúbal",
      mobilization_days: "7",
    });
  });

  it("o ficheiro-modelo diz, nas duas línguas, que a unidade de serviço é obrigatória", () => {
    expect(supplierCatalogDescription("unit_label", "pt")).toMatch(/Serviço: hora, dia/);
    expect(supplierCatalogDescription("unit_label", "en")).toMatch(/Service: hour, day/);
  });
});
