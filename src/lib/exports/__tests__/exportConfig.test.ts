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
      // O comercial atribuído é o nome de um utilizador interno, não dado
      // pessoal do cliente — por isso fica de fora de clients.export_sensitive
      // e aparece nesta lista.
      "assignedTo",
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

  it("proposals: só as colunas visíveis na tabela, nenhuma sensível", () => {
    const definition = getExportDefinition("proposals");
    expect(definition.columns.map((column) => column.key)).toEqual([
      "title",
      "client",
      "assignedTo",
      "deal",
      "value",
      "status",
      "validUntil",
      "pipeline",
      "portal",
      "createdAt",
    ]);
    // Nenhuma coluna de propostas é dado pessoal — includeSensitive nunca
    // altera o conjunto de colunas devolvido.
    expect(definition.columns.every((column) => !column.sensitive)).toBe(true);
    expect(getEffectiveColumns(definition, false)).toEqual(getEffectiveColumns(definition, true));
    expect(getEffectiveColumns(definition, false)).toHaveLength(10);
  });

  it("client_contracts: só as colunas visíveis na tabela, email incluído sem porta de sensíveis", () => {
    const definition = getExportDefinition("client_contracts");
    expect(definition.columns.map((column) => column.key)).toEqual([
      "number",
      "client",
      "proposal",
      "value",
      "period",
      "progress",
      "renewal",
      "status",
      "signature",
      "email",
      "pipeline",
      "portal",
      "assignedTo",
    ]);
    // Decisão explícita: o email vai para toda a gente com
    // client_contracts.export, sem porta de sensíveis — já está visível na
    // tabela a quem tem client_contracts.view.
    expect(definition.columns.every((column) => !column.sensitive)).toBe(true);
    expect(getEffectiveColumns(definition, false).map((column) => column.key)).toContain("email");
    expect(getEffectiveColumns(definition, false)).toEqual(getEffectiveColumns(definition, true));
  });
});
