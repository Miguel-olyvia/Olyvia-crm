import { sanitizeFieldValue } from "@/utils/sanitize";

type LeadLocationSource = {
  field_values?: Record<string, unknown> | null;
} | null;

const LOCATION_ALIASES = {
  address: ["morada", "address", "endereco", "endereço", "rua"],
  city: ["cidade", "city", "localidade"],
  postalCode: ["codigo_postal", "postal_code", "cp", "cep"],
} as const;

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/[-_\s]/g, "");
}

function stringifyLeadFieldValue(value: unknown): string {
  if (value == null || value === "") return "";

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const addressLine = [record.street, record.number].filter(Boolean).join(" ");
    const candidate =
      addressLine ||
      (typeof record.address_line1 === "string" ? record.address_line1 : "") ||
      (typeof record.value === "string" ? record.value : "");

    return sanitizeFieldValue(candidate);
  }

  return sanitizeFieldValue(value);
}

function findLeadFieldValue(
  fieldValues: Record<string, unknown>,
  aliases: readonly string[],
): string | null {
  for (const key of Object.keys(fieldValues)) {
    if (key === "_meta") continue;

    const normalizedKey = normalizeLookupKey(key);
    for (const alias of aliases) {
      const normalizedAlias = normalizeLookupKey(alias);
      if (normalizedKey === normalizedAlias || normalizedKey.endsWith(normalizedAlias)) {
        const normalizedValue = stringifyLeadFieldValue(fieldValues[key]);
        if (normalizedValue) return normalizedValue;
      }
    }
  }

  return null;
}

export function extractLeadLocation(leadData: LeadLocationSource): string {
  const fieldValues = leadData?.field_values;
  if (!fieldValues) return "";

  const address = findLeadFieldValue(fieldValues, LOCATION_ALIASES.address);
  const city = findLeadFieldValue(fieldValues, LOCATION_ALIASES.city);
  const postalCode = findLeadFieldValue(fieldValues, LOCATION_ALIASES.postalCode);

  return [address, city, postalCode].filter(Boolean).join(", ");
}
