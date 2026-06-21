import { describe, expect, it } from "vitest";
import { extractLeadLocation } from "@/lib/leads/location";

describe("extractLeadLocation", () => {
  it("combines prefixed address aliases, city, and postal code", () => {
    const result = extractLeadLocation({
      field_values: {
        po_morada: "Rua Principal 10",
        billing_city: "Lisboa",
        codigo_postal: "1000-001",
      },
    });

    expect(result).toBe("Rua Principal 10, Lisboa, 1000-001");
  });

  it("ignores _meta and empty values", () => {
    const result = extractLeadLocation({
      field_values: {
        _meta: { source: "crm" },
        address: "",
        city: "Porto",
        postal_code: "",
      },
    });

    expect(result).toBe("Porto");
  });

  it("sanitizes html and supports object-like address values", () => {
    const result = extractLeadLocation({
      field_values: {
        morada: { street: "<b>Av. da Liberdade</b>", number: "200" },
        cidade: "Braga",
      },
    });

    expect(result).toBe("Av. da Liberdade 200, Braga");
  });

  it("returns an empty string when field_values are missing", () => {
    expect(extractLeadLocation(null)).toBe("");
    expect(extractLeadLocation({ field_values: null })).toBe("");
  });
});
