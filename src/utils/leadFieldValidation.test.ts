import { describe, expect, it } from "vitest";
import {
  isMeaninglessValue,
  isPostalCodeField,
  resolveFieldPattern,
  validateLeadFieldValues,
  POSTAL_CODE_PT_PATTERN,
  type LeadFieldConstraint,
} from "./leadFieldValidation";

const postalField: LeadFieldConstraint = {
  field_key: "po_codigo_postal",
  field_label: "Código Postal",
  field_type: "text",
  is_required: true,
  pattern: POSTAL_CODE_PT_PATTERN,
  pattern_message: "O código postal deve ter o formato 1234-567",
};

const addressField: LeadFieldConstraint = {
  field_key: "po_morada",
  field_label: "Morada",
  field_type: "text",
  is_required: true,
  max_length: 200,
};

describe("isMeaninglessValue", () => {
  it.each(["", "   ", "-", "--", " - ", "—", "n/a", "N/A", "null", "undefined"])(
    "treats %j as meaningless",
    (value) => {
      expect(isMeaninglessValue(value)).toBe(true);
    },
  );

  it.each(["1234-567", "Rua das Flores 12", "0", "Sá"])("treats %j as meaningful", (value) => {
    expect(isMeaninglessValue(value)).toBe(false);
  });

  it("handles null, undefined, arrays and objects", () => {
    expect(isMeaninglessValue(null)).toBe(true);
    expect(isMeaninglessValue(undefined)).toBe(true);
    expect(isMeaninglessValue([])).toBe(true);
    expect(isMeaninglessValue(["-"])).toBe(true);
    expect(isMeaninglessValue(["Cozinha"])).toBe(false);
    expect(isMeaninglessValue({})).toBe(true);
    expect(isMeaninglessValue({ street: "x" })).toBe(false);
    expect(isMeaninglessValue(0)).toBe(false);
    expect(isMeaninglessValue(false)).toBe(false);
  });
});

describe("isPostalCodeField", () => {
  it.each(["po_codigo_postal", "codigo_postal", "postal_code", "billing_zip", "cep"])(
    "detects %s",
    (key) => {
      expect(isPostalCodeField(key)).toBe(true);
    },
  );

  it("does not misfire on unrelated keys", () => {
    expect(isPostalCodeField("po_localidade")).toBe(false);
    expect(isPostalCodeField("first_name")).toBe(false);
  });
});

describe("resolveFieldPattern", () => {
  it("prefers the configured pattern", () => {
    expect(resolveFieldPattern({ ...postalField, pattern: "^X$" })).toBe("^X$");
  });

  it("falls back to the Portuguese postal pattern for postal fields", () => {
    expect(resolveFieldPattern({ ...postalField, pattern: null })).toBe(POSTAL_CODE_PT_PATTERN);
  });

  it("returns null for ordinary fields", () => {
    expect(resolveFieldPattern(addressField)).toBeNull();
  });
});

describe("validateLeadFieldValues", () => {
  it("accepts a correctly formatted postal code", () => {
    const errors = validateLeadFieldValues([postalField], { po_codigo_postal: "1234-567" });
    expect(errors).toEqual([]);
  });

  it("rejects a lone dash as a required postal code", () => {
    const errors = validateLeadFieldValues([postalField], { po_codigo_postal: "-" });
    expect(errors).toHaveLength(1);
    expect(errors[0].fieldKey).toBe("po_codigo_postal");
    expect(errors[0].message).toContain("obrigatório");
  });

  it("rejects a lone dash as a required address", () => {
    const errors = validateLeadFieldValues([addressField], { po_morada: "-" });
    expect(errors).toHaveLength(1);
    expect(errors[0].fieldKey).toBe("po_morada");
  });

  it("rejects a badly formatted postal code with the configured message", () => {
    const errors = validateLeadFieldValues([postalField], { po_codigo_postal: "1234567" });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("O código postal deve ter o formato 1234-567");
  });

  it("enforces the postal format even when the definition has no pattern", () => {
    const errors = validateLeadFieldValues([{ ...postalField, pattern: null, pattern_message: null }], {
      po_codigo_postal: "1234 567",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("1234-567");
  });

  it("ignores format on optional fields left empty", () => {
    const errors = validateLeadFieldValues([{ ...postalField, is_required: false }], {});
    expect(errors).toEqual([]);
  });

  it("still validates format on optional fields that were filled", () => {
    const errors = validateLeadFieldValues([{ ...postalField, is_required: false }], {
      po_codigo_postal: "abc",
    });
    expect(errors).toHaveLength(1);
  });

  it("enforces min and max length", () => {
    const short = validateLeadFieldValues([{ ...addressField, min_length: 5 }], { po_morada: "Rua" });
    expect(short).toHaveLength(1);
    const long = validateLeadFieldValues([{ ...addressField, max_length: 5 }], {
      po_morada: "Rua das Flores",
    });
    expect(long).toHaveLength(1);
  });

  it("never throws on a malformed pattern", () => {
    const errors = validateLeadFieldValues([{ ...postalField, pattern: "([" }], {
      po_codigo_postal: "whatever",
    });
    expect(errors).toEqual([]);
  });

  it("reports every offending field once", () => {
    const errors = validateLeadFieldValues([postalField, addressField, postalField], {
      po_codigo_postal: "-",
      po_morada: "-",
    });
    expect(errors.map((e) => e.fieldKey)).toEqual(["po_codigo_postal", "po_morada"]);
  });

  it("ignores non-string values for format checks", () => {
    const errors = validateLeadFieldValues(
      [{ field_key: "po_area_remodelar", field_label: "Área", is_required: true }],
      { po_area_remodelar: ["Cozinha"] },
    );
    expect(errors).toEqual([]);
  });
});
