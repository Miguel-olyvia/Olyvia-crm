import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildStandardWorkbook,
  normalizeExportCell,
  type StandardExportColumn,
} from "../xlsxExport";

const columns: StandardExportColumn[] = [
  { key: "name", header: "Nome", width: 24 },
  { key: "amount", header: "Valor", type: "number", width: 14 },
  { key: "createdAt", header: "Data", type: "date", width: 14 },
];

describe("normalizeExportCell", () => {
  it.each(["=2+2", "+SUM(A1:A2)", "-1+2", "@IMPORTDATA(\"x\")", "  =cmd"])(
    "neutraliza fórmulas em células de texto: %s",
    (value) => {
      expect(normalizeExportCell(value, "text")).toBe(`'${value}`);
    },
  );

  it("mantém números como números", () => {
    expect(normalizeExportCell("123.45", "number")).toBe(123.45);
  });

  it("mantém valores vazios vazios", () => {
    expect(normalizeExportCell(null, "text")).toBe("");
  });
});

describe("buildStandardWorkbook", () => {
  it("cria um XLSX uniforme com cabeçalhos, autofiltro e tipos", () => {
    const workbook = buildStandardWorkbook({
      sheetName: "Clientes",
      columns,
      rows: [
        {
          name: "=Empresa perigosa",
          amount: "12.5",
          createdAt: "2026-06-22",
        },
      ],
    });

    expect(workbook.SheetNames).toEqual(["Clientes"]);

    const worksheet = workbook.Sheets.Clientes;
    expect(worksheet["!autofilter"]).toEqual({ ref: "A1:C2" });
    expect(worksheet["!cols"]).toEqual([
      { wch: 24 },
      { wch: 14 },
      { wch: 14 },
    ]);

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
      defval: "",
    }) as unknown[][];

    expect(rows[0]).toEqual(["Nome", "Valor", "Data"]);
    expect(rows[1][0]).toBe("'=Empresa perigosa");
    expect(rows[1][1]).toBe(12.5);
    expect(rows[1][2]).toBeInstanceOf(Date);
  });

  it("limita nomes de folhas aos 31 caracteres suportados pelo Excel", () => {
    const workbook = buildStandardWorkbook({
      sheetName: "Nome de folha excessivamente comprido para Excel",
      columns,
      rows: [],
    });

    expect(workbook.SheetNames[0]).toHaveLength(31);
  });
});
