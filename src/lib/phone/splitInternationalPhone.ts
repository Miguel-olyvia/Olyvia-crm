import { COUNTRY_CODES } from "@/constants/countryCodes";

export const DEFAULT_DIAL_CODE = "+351";

export interface SplitPhone {
  dialCode: string;
  digits: string;
}

const COUNTRIES_BY_DIAL_LENGTH = [...COUNTRY_CODES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
);

/**
 * Separa um telefone guardado numa só string no indicativo e nos dígitos.
 *
 * Aceita "+351912345678", "00351 912345678" (forma antiga, com 00) e números
 * sem indicativo. Sem indicativo reconhecido, só um valor vazio ou um número
 * nacional português de 9 dígitos recebe +351 — qualquer outro fica sem
 * indicativo, para não inventar um país errado a um número estrangeiro.
 */
export function splitInternationalPhone(raw: unknown): SplitPhone {
  const compact = typeof raw === "string" ? raw.replace(/[\s().-]/g, "") : "";
  if (!compact) return { dialCode: DEFAULT_DIAL_CODE, digits: "" };

  const normalized = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;

  if (normalized.startsWith("+")) {
    const country = COUNTRIES_BY_DIAL_LENGTH.find((c) => normalized.startsWith(c.dialCode));
    if (country) {
      return {
        dialCode: country.dialCode,
        digits: normalized.slice(country.dialCode.length).replace(/\D/g, ""),
      };
    }
    return { dialCode: "", digits: normalized.replace(/\D/g, "") };
  }

  const digits = normalized.replace(/\D/g, "");
  return { dialCode: digits.length === 9 ? DEFAULT_DIAL_CODE : "", digits };
}

/** Junta indicativo e dígitos no formato guardado ("+351912345678"). */
export function joinInternationalPhone(dialCode: string, digits: string): string {
  const onlyDigits = digits.replace(/\D/g, "");
  if (!onlyDigits) return "";
  return dialCode ? `${dialCode}${onlyDigits}` : onlyDigits;
}
