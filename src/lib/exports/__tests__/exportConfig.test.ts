import { describe, expect, it } from "vitest";

import {
  getEffectiveColumns,
  getExportDefinition,
  isSupportedExportModule,
} from "../../../../supabase/functions/export-data/exportConfig";

describe("controlled export definitions", () => {
  it("exclui colunas sensíveis por omissão", () => {
    const definition = getExportDefinition("clients");
    expect(getEffectiveColumns(definition, false).map((column) => column.key)).toEqual([
      "name",
      "status",
      "clientType",
      "createdAt",
    ]);
  });

  it("inclui colunas sensíveis apenas quando autorizado", () => {
    const definition = getExportDefinition("contacts");
    expect(getEffectiveColumns(definition, true).map((column) => column.key)).toContain("vat");
    expect(getEffectiveColumns(definition, true).map((column) => column.key)).toContain("email");
    expect(getEffectiveColumns(definition, true).map((column) => column.key)).toContain("phone");
  });

  it("rejeita módulos que não estejam na allowlist", () => {
    expect(isSupportedExportModule("auth.users")).toBe(false);
    expect(() => getExportDefinition("auth.users")).toThrow("Unsupported export module");
  });
});
