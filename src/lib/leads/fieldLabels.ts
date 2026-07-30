// Shared fallback label resolution for raw form field_values keys, used
// wherever a submission's field_key cannot be resolved against
// lead_field_definitions/form_fields (e.g. no campaign, deleted definition).
// Originally introduced for the "Formulários" tab in src/pages/AnewLeads.tsx;
// extracted here so other surfaces (e.g. the pending form_submissions review
// page) can reuse the exact same humanization instead of re-implementing it.

export const COMMON_FORM_FIELD_LABELS: Record<string, string> = {
  first_name: "Primeiro Nome",
  last_name: "Apelido",
  display_name: "Nome",
  email: "Email",
  phone: "Telefone",
  phone_number: "Telefone",
  morada: "Morada",
  address: "Morada",
  cidade: "Localidade",
  city: "Localidade",
  codigo_postal: "Código Postal",
  postal_code: "Código Postal",
  source: "Origem",
  notes: "Notas",
};

export function humanizeFormFieldKey(key: string): string {
  return COMMON_FORM_FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
