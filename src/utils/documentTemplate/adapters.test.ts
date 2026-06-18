import { describe, it, expect } from "vitest";
import {
  readProposalTemplateSettings,
  toProposalTemplateWriteShape,
} from "./proposalTemplateAdapter";
import {
  readContractTemplateSettings,
  toContractTemplateWriteShape,
} from "./contractTemplateAdapter";

describe("proposalTemplateAdapter", () => {
  it("read() devolve defaults seguros para linha vazia (sem regressão visual)", () => {
    const s = readProposalTemplateSettings(null);
    expect(s.header.show_company_info).toBe(true);
    expect(s.header.show_client_info).toBe(true);
    expect(s.footer.show_page_numbers).toBe(true);
    expect(s.page.page_size).toBe("A4");
    expect(s.items_table.mode).toBe("single");
  });

  it("read() preserva valores escalares existentes", () => {
    const s = readProposalTemplateSettings({
      primary_color: "#123456",
      header_text: "Olá",
      show_company_info: false,
      design_settings: { items_table: { zebra_rows: false } },
    });
    expect(s.style.primary_color).toBe("#123456");
    expect(s.header.header_text).toBe("Olá");
    expect(s.header.show_company_info).toBe(false);
    expect(s.items_table.zebra_rows).toBe(false);
  });

  it("toWriteShape() faz merge em design_settings sem apagar chaves alheias", () => {
    const existingDesign = { custom_user_key: { foo: 1 }, items_table: { compact: true } };
    const settings = readProposalTemplateSettings({ design_settings: existingDesign });
    const patch = toProposalTemplateWriteShape(settings, existingDesign);
    expect((patch.design_settings as any).custom_user_key).toEqual({ foo: 1 });
    expect((patch.design_settings as any).items_table.compact).toBe(true);
  });
});

describe("contractTemplateAdapter", () => {
  it("read() devolve defaults para doc_settings ausente", () => {
    const s = readContractTemplateSettings(null);
    expect(s.page.page_size).toBe("A4");
    expect(s.items_table.mode).toBe("single");
  });

  it("toWriteShape() preserva chaves legais (signatories, regras)", () => {
    const existing = {
      signatories: { admin: true },
      legal_rules: ["x", "y"],
      header: { header_text: "antigo" },
    };
    const settings = readContractTemplateSettings({ doc_settings: existing });
    const { doc_settings } = toContractTemplateWriteShape(settings, existing);
    expect((doc_settings as any).signatories).toEqual({ admin: true });
    expect((doc_settings as any).legal_rules).toEqual(["x", "y"]);
    expect((doc_settings as any).header.header_text).toBe("antigo");
  });
});
