const PHONE_KEY_PATTERN = /(phone|telefone|telemovel|telemóvel)/i;

export interface PhoneFieldCandidate {
  field_key: string;
  field_type?: string | null;
  contact_field_mapping?: string | null;
}

/**
 * Um campo de lead é um telefone quando o tipo, o mapeamento de contacto ou
 * (para campos de texto) o nome da chave o dizem. É o critério único do ecrã
 * (seletor de indicativo) e da validação (contagem de dígitos).
 */
export const isPhoneField = (field: PhoneFieldCandidate): boolean =>
  field.field_type === "phone" ||
  field.contact_field_mapping === "phone" ||
  (field.field_type === "text" && PHONE_KEY_PATTERN.test(field.field_key));
