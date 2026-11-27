import { supabase } from "@/integrations/supabase/client";
import {
  formatInternationalPhone,
  joinInternationalPhone,
  normalizeLegacyPhonePrefix,
  splitInternationalPhone,
} from "@/lib/phone/splitInternationalPhone";

/**
 * O telefone e o email PRINCIPAIS de uma ficha (anew_entity_phones / anew_entity_emails).
 *
 * E a fonte do que o Info, a proposta e o portal mostram, por isso e dela que o Editar Lead
 * parte. Ordem canonica, a mesma do portal (sms-otp: `is_primary desc, created_at desc, id desc`):
 * dos principais, o mais recente e, na mesma hora, o de id maior. A tabela nao tem updated_at.
 *
 * Um erro de leitura propaga-se: quem chama distingue «a ficha nao tem principal» (null) de
 * «nao se conseguiu ler» (excecao), porque uma ficha ilegivel nao pode passar por vazia.
 */
export interface EntityPrimaryPhone {
  phone_number: string;
  country_code: string | null;
}

export async function getEntityPrimaryPhone(entityId: string): Promise<EntityPrimaryPhone | null> {
  const { data, error } = await supabase
    .from("anew_entity_phones")
    .select("phone_number, country_code")
    .eq("entity_id", entityId)
    .eq("is_primary", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.phone_number ? data : null;
}

export async function getEntityPrimaryEmail(entityId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("anew_entity_emails")
    .select("email")
    .eq("entity_id", entityId)
    .eq("is_primary", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.email ? data.email : null;
}

/**
 * O telefone da ficha como o formulario o guarda: indicativo + numero («+351 965818833»).
 * Um numero ja internacional («+4541736520», sem indicativo a parte) fica como esta.
 */
export function phoneFormValueFromEntity(phone: EntityPrimaryPhone): string | null {
  const raw = phone.phone_number.trim();
  const international = raw.startsWith("+") || raw.startsWith("00");
  const joined = international ? raw : joinInternationalPhone(phone.country_code ?? "", raw);
  if (!joined) return null;
  return formatInternationalPhone(normalizeLegacyPhonePrefix(joined));
}

const fullDigits = (raw: string): string => {
  const { dialCode, digits } = splitInternationalPhone(normalizeLegacyPhonePrefix(raw));
  return `${dialCode}${digits}`.replace(/\D/g, "");
};

/** Mesmo numero, escrito como for: so contam o indicativo e os digitos. */
export const samePhone = (a: string, b: string): boolean => fullDigits(a) === fullDigits(b);

/** Mesmo email: sem espacos nas pontas e sem diferenca de maiusculas. */
export const sameEmail = (a: string, b: string): boolean =>
  (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

/**
 * O PostgREST nao encontrou a funcao (a migration que a cria ainda nao esta na base): codigo
 * PGRST202, ou so a mensagem «Could not find the function public.xxx(...) in the schema cache».
 * Nao e uma recusa do utilizador, e uma avaria de configuracao: quem chama mostra um texto claro
 * e regista-a, em vez de mostrar o nome interno da funcao.
 */
export const isMissingFunctionError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "PGRST202" || (typeof message === "string" && /could not find the function/i.test(message));
};
