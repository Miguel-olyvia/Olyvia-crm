// Portal do Fornecedor — formulário "Os meus dados" / "Confirme os seus dados".
// Validação e normalização no cliente, espelhando sp_update_my_supplier_data
// (o servidor volta a validar e devolve hint "validation" com a mensagem).
// Limites iguais aos do formulário do fornecedor no CRM (Suppliers.tsx), para
// que o que o fornecedor grava continue válido quando a empresa edita a ficha.

import { z } from "zod";
import { codigoPostalValido, normalizarCodigoPostal } from "@/lib/addresses/validarMorada";
import type { SpSupplierData, SpSupplierDataInput } from "@/lib/supplierPortal/spRpc";
import { traduzir } from "@/portal-i18n/traduzir";
import type { ParamsDeTraducao } from "@/portal-i18n/tipos";

export const DEFAULT_PHONE_COUNTRY_CODE = "+351";

/** O que o formulário edita (tudo texto). O NIF não entra: é só leitura. */
export interface SupplierDataFormValues {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  phone_country_code: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  website: string;
}

export type SupplierDataField = keyof SupplierDataFormValues;
export type SupplierDataErrors = Partial<Record<SupplierDataField, string>>;

/** As mensagens de validação, já no idioma pedido. */
export interface SupplierDataMessages {
  nameRequired: string;
  emailInvalid: string;
  phoneInvalid: string;
  postalCodeInvalid: string;
  websiteInvalid: string;
  tooLong: (max: number) => string;
}

type Traduzir = (chave: string, params?: ParamsDeTraducao) => string;

/** Mensagens de validação a partir de uma função `t` (a do idioma do portal). */
export function supplierDataMessages(t: Traduzir): SupplierDataMessages {
  return {
    nameRequired: t("sp.dados.erro.nomeObrigatorio"),
    emailInvalid: t("sp.dados.erro.emailInvalido"),
    phoneInvalid: t("sp.dados.erro.telefoneInvalido"),
    postalCodeInvalid: t("sp.dados.erro.codigoPostalInvalido"),
    websiteInvalid: t("sp.dados.erro.websiteInvalido"),
    tooLong: (max) => t("sp.dados.erro.demasiadoLongo", { max }),
  };
}

/** As mensagens em português: o que `validateSupplierData` usa quando não se passa outro idioma. */
export const SUPPLIER_DATA_MESSAGES: SupplierDataMessages = supplierDataMessages((chave, params) =>
  traduzir("pt", chave, params),
);

const trim = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Vazio, "Portugal", "PT" ou "PRT" (qualquer caixa) → as regras portuguesas aplicam-se (igual ao servidor). */
export function isPortugal(country: string | null | undefined): boolean {
  const c = trim(country).toLowerCase();
  return c === "" || c === "portugal" || c === "pt" || c === "prt";
}

/** Sem esquema → https://; espaços fora. Vazio fica vazio. */
export function normalizeWebsite(value: string | null | undefined): string {
  const v = trim(value).replace(/\s+/g, "");
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function websiteValid(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && /\.[a-z]{2,}$/i.test(url.hostname);
  } catch {
    return false;
  }
}

/** Ficha do CRM → valores do formulário. */
export function toFormValues(data: SpSupplierData | null | undefined): SupplierDataFormValues {
  return {
    name: trim(data?.name),
    contact_person: trim(data?.contact_person),
    email: trim(data?.email),
    phone: trim(data?.phone),
    phone_country_code: trim(data?.phone_country_code) || DEFAULT_PHONE_COUNTRY_CODE,
    address: trim(data?.address),
    postal_code: trim(data?.postal_code),
    city: trim(data?.city),
    country: trim(data?.country),
    website: trim(data?.website),
  };
}

/** Valores sem espaços nas pontas, email em minúsculas, CP e website normalizados. */
export function normalizeSupplierData(values: SupplierDataFormValues): SupplierDataFormValues {
  const country = trim(values.country);
  const postal = trim(values.postal_code);
  return {
    name: trim(values.name).replace(/\s+/g, " "),
    contact_person: trim(values.contact_person),
    email: trim(values.email).toLowerCase(),
    phone: trim(values.phone).replace(/\s+/g, " "),
    phone_country_code: trim(values.phone_country_code) || DEFAULT_PHONE_COUNTRY_CODE,
    address: trim(values.address),
    postal_code: isPortugal(country) ? normalizarCodigoPostal(postal) : postal,
    city: trim(values.city),
    country,
    website: normalizeWebsite(values.website),
  };
}

/** O esquema de validação com as mensagens dadas (as regras são as mesmas em qualquer idioma). */
function buildSupplierDataSchema(messages: SupplierDataMessages) {
  const optional = (max: number) => z.string().max(max, messages.tooLong(max));
  return z
    .object({
      name: z.string().min(1, messages.nameRequired).max(200, messages.tooLong(200)),
      contact_person: optional(200),
      email: z
        .string()
        .max(255, messages.tooLong(255))
        .refine((v) => v === "" || z.string().email().safeParse(v).success, messages.emailInvalid),
      phone: z
        .string()
        .max(20, messages.tooLong(20))
        .refine((v) => v === "" || /^[0-9 ()+./-]+$/.test(v), messages.phoneInvalid),
      phone_country_code: optional(10),
      address: optional(255),
      postal_code: optional(20),
      city: optional(100),
      country: optional(100),
      website: z
        .string()
        .max(255, messages.tooLong(255))
        .refine((v) => v === "" || websiteValid(v), messages.websiteInvalid),
    })
    .superRefine((v, ctx) => {
      if (v.postal_code && isPortugal(v.country) && !codigoPostalValido(v.postal_code)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["postal_code"], message: messages.postalCodeInvalid });
      }
    });
}

/** Só os campos alterados; {} = sem alterações (o servidor só marca a confirmação). */
export type SupplierDataPayload = Partial<SpSupplierDataInput>;

export type SupplierDataValidation =
  | { ok: true; values: SupplierDataFormValues; payload: SupplierDataPayload }
  | { ok: false; errors: SupplierDataErrors };

/**
 * Normaliza e valida; devolve o primeiro erro de cada campo ou o payload a
 * enviar (só o que mudou face a `initial`, os valores vindos da ficha).
 * `messages` dá o idioma das mensagens (português se não se passar).
 */
export function validateSupplierData(
  values: SupplierDataFormValues,
  initial: SupplierDataFormValues,
  messages: SupplierDataMessages = SUPPLIER_DATA_MESSAGES,
): SupplierDataValidation {
  const normalized = normalizeSupplierData(values);
  const parsed = buildSupplierDataSchema(messages).safeParse(normalized);
  if (!parsed.success) {
    const errors: SupplierDataErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as SupplierDataField | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, values: normalized, payload: toPayload(normalized, initial) };
}

const PAYLOAD_FIELDS = [
  "name",
  "contact_person",
  "email",
  "phone",
  "phone_country_code",
  "address",
  "city",
  "postal_code",
  "country",
  "website",
] as const satisfies readonly SupplierDataField[];

/**
 * Só os campos alterados face a `initial` (vazio → null, limpa o campo).
 * O servidor grava cada chave presente em TODAS as fichas do fornecedor, por
 * isso não se pode enviar o que não mudou: copiaria a ficha mais recente para
 * as outras empresas. Os dois lados são normalizados antes de comparar, para
 * que caixa do email, https://, espaços ou o indicativo por omissão não contem
 * como alteração. Telefone e indicativo vão juntos (um sem o outro não faz
 * sentido noutra ficha).
 */
export function toPayload(values: SupplierDataFormValues, initial: SupplierDataFormValues): SupplierDataPayload {
  const next = normalizeSupplierData(values);
  const prev = normalizeSupplierData(initial);
  const orNull = (s: string) => (s === "" ? null : s);
  const changed = new Set<SupplierDataField>(PAYLOAD_FIELDS.filter((f) => next[f] !== prev[f]));
  if (changed.has("phone") || changed.has("phone_country_code")) {
    changed.add("phone");
    changed.add("phone_country_code");
  }
  const payload: SupplierDataPayload = {};
  for (const f of PAYLOAD_FIELDS) {
    if (!changed.has(f)) continue;
    if (f === "name") payload.name = next.name;
    else payload[f] = orNull(next[f]);
  }
  return payload;
}

/** "A, B" para o aviso de empresas ligadas (sem vazios nem repetidos). */
export function joinCompanyNames(names: string[]): string {
  return Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).join(", ");
}
