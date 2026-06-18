// Shared contact and client field mapping constants
// Used by FormBuilder, CampaignFieldsConfig, and edge functions

export const CONTACT_FIELDS = [
  { value: "", label: "Sem mapeamento" },
  { value: "first_name", label: "Nome" },
  { value: "last_name", label: "Apelido" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "mobile", label: "Telemóvel" },
  { value: "position", label: "Cargo" },
  { value: "department", label: "Departamento" },
  { value: "address", label: "Morada" },
  { value: "city", label: "Cidade" },
  { value: "postal_code", label: "Código Postal" },
  { value: "country", label: "País" },
  { value: "notes", label: "Notas" },
  { value: "website", label: "Website" },
  { value: "linkedin", label: "LinkedIn" },
];

export const CLIENT_FIELDS = [
  { value: "", label: "Sem mapeamento" },
  { value: "first_name", label: "Nome" },
  { value: "last_name", label: "Apelido" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "company_name", label: "Nome da Empresa" },
  { value: "vat", label: "NIF/VAT" },
  { value: "position", label: "Cargo" },
  { value: "industry", label: "Indústria" },
  { value: "website", label: "Website" },
  { value: "notes", label: "Notas" },
];

// Default field type mapping for auto-creating fields from properties
export const CONTACT_FIELD_DEFAULTS: Record<string, { field_type: string; is_required: boolean }> = {
  first_name: { field_type: "text", is_required: true },
  last_name: { field_type: "text", is_required: false },
  email: { field_type: "email", is_required: true },
  phone: { field_type: "phone", is_required: false },
  mobile: { field_type: "phone", is_required: false },
  position: { field_type: "text", is_required: false },
  department: { field_type: "text", is_required: false },
  address: { field_type: "text", is_required: false },
  city: { field_type: "text", is_required: false },
  postal_code: { field_type: "text", is_required: false },
  country: { field_type: "text", is_required: false },
  notes: { field_type: "textarea", is_required: false },
  website: { field_type: "url", is_required: false },
  linkedin: { field_type: "url", is_required: false },
};

// Base fields to seed when creating a new lead form
export const LEAD_FORM_BASE_FIELDS = [
  { field_key: "first_name", field_label: "Primeiro Nome", field_type: "text", is_required: true, contact_field_mapping: "first_name" },
  { field_key: "last_name", field_label: "Apelido", field_type: "text", is_required: false, contact_field_mapping: "last_name" },
  { field_key: "email", field_label: "Email", field_type: "email", is_required: true, contact_field_mapping: "email" },
  { field_key: "phone", field_label: "Telefone", field_type: "phone", is_required: false, contact_field_mapping: "phone" },
];
