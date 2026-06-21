/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { parseContactsCsv, serializeContactsCsv } from "../csv";

describe("contacts CSV helpers", () => {
  it("round-trips person and company rows with semicolons, quotes, newlines and BOM", () => {
    const csv = serializeContactsCsv([
      {
        entityType: "person",
        firstName: "Ana",
        lastName: "Silva \"QA\"",
        companyName: "",
        email: "ana@example.com",
        phone: "+351 123 456",
        vat: "PT123",
        status: "active",
      },
      {
        entityType: "organization",
        firstName: "",
        lastName: "",
        companyName: "ACME; Lisboa\nNorte",
        email: "hello@acme.test",
        phone: "210000000",
        vat: "PT999",
        status: "inactive",
      },
    ]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\"ACME; Lisboa\nNorte\"");
    expect(csv).toContain("\"Silva \"\"QA\"\"\"");

    expect(parseContactsCsv(csv)).toEqual([
      {
        entityType: "person",
        firstName: "Ana",
        lastName: "Silva \"QA\"",
        companyName: "",
        displayName: "Ana Silva \"QA\"",
        email: "ana@example.com",
        phone: "+351 123 456",
        vat: "PT123",
        status: "active",
      },
      {
        entityType: "organization",
        firstName: "",
        lastName: "",
        companyName: "ACME; Lisboa\nNorte",
        displayName: "ACME; Lisboa\nNorte",
        email: "hello@acme.test",
        phone: "210000000",
        vat: "PT999",
        status: "inactive",
      },
    ]);
  });

  it("parses legacy exports by header name and keeps company rows importable", () => {
    const legacy = [
      "\uFEFFNome;Email;Telefone;NIF;Status;Tipo",
      "\"Empresa Legada\";\"sales@legacy.test\";\"219999999\";\"PT555\";\"active\";\"company\"",
    ].join("\r\n");

    expect(parseContactsCsv(legacy)).toEqual([
      {
        entityType: "organization",
        firstName: "",
        lastName: "",
        companyName: "Empresa Legada",
        displayName: "Empresa Legada",
        email: "sales@legacy.test",
        phone: "219999999",
        vat: "PT555",
        status: "active",
      },
    ]);
  });
});
