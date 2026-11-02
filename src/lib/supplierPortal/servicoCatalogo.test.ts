// Fase 5: rótulos e listas do catálogo do fornecedor com serviços, e as colunas novas do modelo de importação.
import { describe, expect, it } from "vitest";
import { kindOf, nomesDistritos, unidadeServicoLabel } from "./servicoCatalogo";
import { SUPPLIER_CATALOG_COLUMNS, buildSupplierCatalogImportRows } from "@/utils/supplierPortalCatalogTemplate";

describe("servicoCatalogo", () => {
  it("sem item_kind (resposta antiga) é produto", () => {
    expect(kindOf({})).toBe("produto");
    expect(kindOf({ item_kind: "servico" })).toBe("servico");
  });

  it("rótulo da unidade de serviço, com o código quando não se conhece", () => {
    expect(unidadeServicoLabel("vg")).toBe("empreitada (valor global)");
    expect(unidadeServicoLabel("h")).toBe("hora");
    expect(unidadeServicoLabel("xpto")).toBe("xpto");
    expect(unidadeServicoLabel(null)).toBe("—");
  });

  it("nomes dos distritos, com o código enquanto a lista não chega e resumo quando são muitos", () => {
    const d = [{ code: "PT-11", name: "Lisboa" }, { code: "PT-13", name: "Porto" }, { code: "PT-15", name: "Setúbal" }, { code: "PT-03", name: "Braga" }];
    expect(nomesDistritos(["PT-11", "PT-15"], d)).toBe("Lisboa, Setúbal");
    expect(nomesDistritos(["PT-11"], null)).toBe("PT-11");
    expect(nomesDistritos(["PT-11", "PT-13", "PT-15", "PT-03"], d)).toBe("Lisboa, Porto, Setúbal +1");
    expect(nomesDistritos([], d)).toBe("—");
  });
});

describe("modelo de importação com serviços", () => {
  it("reconhece as colunas Tipo, Zona de atuação e Prazo de mobilização", () => {
    const fields = SUPPLIER_CATALOG_COLUMNS.map((c) => c.field);
    expect(fields).toEqual(expect.arrayContaining(["item_kind", "service_districts", "mobilization_days"]));
  });

  it("Tipo vazio não é enviado (não passa um serviço a produto)", () => {
    const parsed = {
      fileName: "x.csv",
      headers: ["Ref.", "Tipo", "Zona de atuação"],
      rows: [
        { rowNumber: 2, cells: ["EL-1", "", "Lisboa; Porto"], codeCells: ["EL-1", "", "Lisboa; Porto"] },
        { rowNumber: 3, cells: ["EL-2", "serviço", "Setúbal"], codeCells: ["EL-2", "serviço", "Setúbal"] },
      ],
      autoMapping: ["supplier_ref", "item_kind", "service_districts"] as const,
    };
    const rows = buildSupplierCatalogImportRows(parsed as never, ["supplier_ref", "item_kind", "service_districts"]);
    expect(rows[0]).toEqual({ _row: 2, supplier_ref: "EL-1", service_districts: "Lisboa; Porto" });
    expect(rows[1]).toEqual({ _row: 3, supplier_ref: "EL-2", item_kind: "serviço", service_districts: "Setúbal" });
  });
});
