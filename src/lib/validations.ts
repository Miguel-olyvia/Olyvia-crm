import { z } from "zod";

// Shared optional fields present on the contact edit dialog, regardless of
// person/company variant (vat, address, notes, etc.). Extracted so both
// contactSchema variants validate them consistently.
export const contactEditExtraFieldsSchema = z.object({
  email: z.string().trim().email("Invalid email format").max(255, "Email must be less than 255 characters").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "Phone must be less than 20 characters").optional().or(z.literal("")),
  vat: z.string().trim().max(50, "VAT must be less than 50 characters").optional().or(z.literal("")),
  position: z.string().trim().max(100, "Position must be less than 100 characters").optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).optional(),
  notes: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
  address: z.string().trim().max(255, "Address must be less than 255 characters").optional().or(z.literal("")),
  city: z.string().trim().max(100, "City must be less than 100 characters").optional().or(z.literal("")),
  postal_code: z.string().trim().max(20, "Postal code must be less than 20 characters").optional().or(z.literal("")),
});

// Contact validation schema
export const contactSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100, "First name must be less than 100 characters"),
  last_name: z.string().trim().min(1, "Last name is required").max(100, "Last name must be less than 100 characters"),
}).merge(contactEditExtraFieldsSchema);

// Contact schema for companies (last_name optional)
export const contactCompanySchema = contactSchema.extend({
  last_name: z.string().trim().max(100, "Last name must be less than 100 characters").optional().or(z.literal("")),
  source: z.string().trim().max(100).optional().or(z.literal("")),
});

// Company validation schema
export const companySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200, "Company name must be less than 200 characters"),
  vat: z.string().trim().max(50, "VAT must be less than 50 characters").optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email format").max(255, "Email must be less than 255 characters").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "Phone must be less than 20 characters").optional().or(z.literal("")),
  website: z.string().trim().url("Invalid website URL").max(255, "Website must be less than 255 characters").optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
});

// Address validation schema
export const addressSchema = z.object({
  street: z.string().trim().max(255, "Street must be less than 255 characters").optional().or(z.literal("")),
  number: z.string().trim().max(20, "Number must be less than 20 characters").optional().or(z.literal("")),
  floor_number: z.string().trim().max(20, "Floor must be less than 20 characters").optional().or(z.literal("")),
  postal_code: z.string().trim().max(20, "Postal code must be less than 20 characters").optional().or(z.literal("")),
  city: z.string().trim().max(100, "City must be less than 100 characters").optional().or(z.literal("")),
  municipality: z.string().trim().max(100, "Municipality must be less than 100 characters").optional().or(z.literal("")),
  district: z.string().trim().max(100, "District must be less than 100 characters").optional().or(z.literal("")),
});

// Deal validation schema
export const dealSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().trim().max(2000, "Description must be less than 2000 characters").optional().or(z.literal("")),
  value: z.number().min(0, "Value must be positive").max(999999999, "Value is too large"),
  probability: z.number().min(0, "Probability must be at least 0").max(100, "Probability must be at most 100"),
  expected_close_date: z.string().optional(),
});

// Proposal validation schema
export const proposalSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().trim().max(2000, "Description must be less than 2000 characters").optional().or(z.literal("")),
  value: z.number().min(0, "Value must be positive").max(999999999, "Value is too large"),
  notes: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
  valid_until: z.string().optional(),
});

// Activity validation schema
export const activitySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().trim().max(2000, "Description must be less than 2000 characters").optional().or(z.literal("")),
  type: z.enum(["call", "meeting", "email", "task", "note"]),
  due_date: z.string().optional(),
});

// Calendar visit validation schema
export const calendarVisitSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().trim().max(2000, "Description must be less than 2000 characters").optional().or(z.literal("")),
  location: z.string().trim().max(255, "Location must be less than 255 characters").optional().or(z.literal("")),
  notes: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
  visit_type: z.enum(["meeting", "site_visit", "presentation", "other"]),
  status: z.enum(["scheduled", "completed", "cancelled", "rescheduled"]),
});

// Quote validation schema
export const quoteSchema = z.object({
  obra_endereco: z.string().trim().max(500, "Address must be less than 500 characters").optional().or(z.literal("")),
  obra_notas: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
  modelo_base: z.string().trim().min(1, "Model is required"),
  desconto_global_percent: z.number().min(0, "Discount must be at least 0").max(100, "Discount must be at most 100"),
  validade_dias: z.number().int("Validity must be a whole number").min(1, "Validity must be at least 1 day").max(365, "Validity must be at most 365 days").optional(),
});

// Lead edit dialog validation schema (general fields; dynamic campaign fields
// are not statically typed and are validated separately per field type).
export const leadEditGeneralFieldsSchema = z.object({
  first_name: z.string().trim().max(100, "First name must be less than 100 characters").optional().or(z.literal("")),
  last_name: z.string().trim().max(100, "Last name must be less than 100 characters").optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email format").max(255, "Email must be less than 255 characters").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "Phone must be less than 20 characters").optional().or(z.literal("")),
  company_name: z.string().trim().max(200, "Company name must be less than 200 characters").optional().or(z.literal("")),
});

export const leadEditNotesSchema = z.object({
  notes: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
});

// Lead contact registration validation schema (AnewLeadContactDialog)
export const leadContactSchema = z.object({
  contactResult: z.string().trim().min(1, "Selecione um resultado do contacto"),
  status: z.string().trim().max(100, "Status must be less than 100 characters").optional().or(z.literal("")),
  notes: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
  assignedTo: z.string().trim().max(100, "Assigned user is invalid").optional().or(z.literal("")),
});

// Client meeting scheduling validation schema (ScheduleClientMeetingDialog)
export const clientMeetingScheduleSchema = z.object({
  subject: z.string().trim().max(255, "Subject must be less than 255 characters").optional().or(z.literal("")),
  notes: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
  channel: z.enum(["in_person", "video", "phone"], {
    errorMap: () => ({ message: "Invalid channel" }),
  }),
  scheduledAt: z
    .string()
    .trim()
    .min(1, "Data/hora obrigatória")
    .refine((val) => !Number.isNaN(new Date(val).getTime()), "Invalid date/time"),
});

// Client meeting outcome registration validation schema (RegisterMeetingDialog)
export const clientMeetingRegisterSchema = z.object({
  subject: z.string().trim().max(2000, "Subject must be less than 2000 characters").optional().or(z.literal("")),
  location: z.string().trim().max(255, "Location must be less than 255 characters").optional().or(z.literal("")),
  sentiment: z.enum(["positive", "neutral", "negative"]).nullable().optional(),
});

// Contact call registration validation schema (RegisterCallDialog)
export const contactCallSchema = z.object({
  result: z.enum(["answered", "no_answer", "busy", "voicemail", "wrong_number"], {
    errorMap: () => ({ message: "Invalid call result" }),
  }),
  sentiment: z.enum(["positive", "neutral", "negative"]).nullable().optional(),
  subject: z.string().trim().max(255, "Subject must be less than 255 characters").optional().or(z.literal("")),
});

// Quote line validation schema
export const quoteLineSchema = z.object({
  qt: z.number().min(0, "Quantity must be positive").max(999999, "Quantity is too large"),
  margem_percent: z.number().min(0, "Margin must be at least 0"),
  iva_percent: z.number().min(0, "VAT must be at least 0").max(100, "VAT must be at most 100"),
  int_percent: z.number().min(0, "Internal % must be at least 0").max(100, "Internal % must be at most 100"),
});

// Product kind dialog validation schema (configurator-lab)
// `kind` may be null ("Sem tipo definido" is a valid, intentional choice).
export const productKindDialogSchema = z.object({
  kind: z
    .enum(["simple", "component", "configurable"], {
      errorMap: () => ({ message: "Selecione um tipo de produto válido" }),
    })
    .nullable(),
});

// Configurator slot edit dialog validation schema
export const slotEditDialogSchema = z.object({
  label: z.string().trim().min(1, "O nome é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  required: z.boolean(),
});

// Form Builder — step title (secondary field, may be left empty to hide the
// step title on the public form, but must respect a sane max length).
export const formBuilderStepTitleSchema = z.object({
  step_title: z.string().trim().max(200, "O título deve ter menos de 200 caracteres").optional().or(z.literal("")),
});

// Form Builder — new/extra field configuration
export const formBuilderFieldSchema = z.object({
  field_key: z
    .string()
    .trim()
    .min(1, "A chave é obrigatória")
    .max(100, "A chave deve ter menos de 100 caracteres")
    .regex(/^[a-z0-9_\s]+$/i, "A chave só pode conter letras, números, espaços e underscores"),
  field_label: z.string().trim().min(1, "O label é obrigatório").max(200, "O label deve ter menos de 200 caracteres"),
  field_type: z.string().trim().min(1, "O tipo é obrigatório"),
  is_required: z.boolean(),
  placeholder: z.string().trim().max(200, "O placeholder deve ter menos de 200 caracteres").optional().or(z.literal("")),
  help_text: z.string().trim().max(500, "O texto de ajuda deve ter menos de 500 caracteres").optional().or(z.literal("")),
});

// Form branding configuration validation schema
const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Cor inválida (use formato hexadecimal, ex: #85D3BE)");
const optionalUrl = z.string().trim().url("URL inválido").max(2048, "URL demasiado longo").optional().or(z.literal(""));

export const formBrandingConfigSchema = z.object({
  logo_url: optionalUrl,
  favicon_url: optionalUrl,
  background_image_url: optionalUrl,
  primary_color: hexColor,
  secondary_color: hexColor,
  background_color: hexColor,
  text_color: hexColor,
  button_text_color: hexColor,
  accent_color: hexColor,
  font_family: z.string().trim().min(1, "A fonte é obrigatória").max(200),
  form_title: z.string().trim().max(200, "O título deve ter menos de 200 caracteres").optional().or(z.literal("")),
  form_subtitle: z.string().trim().max(300, "O subtítulo deve ter menos de 300 caracteres").optional().or(z.literal("")),
  submit_button_text: z.string().trim().max(100).optional().or(z.literal("")),
  next_button_text: z.string().trim().max(100).optional().or(z.literal("")),
  previous_button_text: z.string().trim().max(100).optional().or(z.literal("")),
  success_title: z.string().trim().max(200).optional().or(z.literal("")),
  success_message: z.string().trim().max(2000).optional().or(z.literal("")),
  success_redirect_url: optionalUrl,
  footer_text: z.string().trim().max(500).optional().or(z.literal("")),
  privacy_policy_url: optionalUrl,
  terms_url: optionalUrl,
  location_rejection_message: z.string().trim().max(500).optional().or(z.literal("")),
  custom_css: z.string().trim().max(20000, "CSS demasiado longo").optional().or(z.literal("")),
});

// Form location configuration validation schema
export const formLocationConfigSchema = z.object({
  country_code: z.string().trim().max(10, "Código de país inválido").optional().or(z.literal("")),
  location_required: z.boolean(),
  district_ids: z.array(z.string().trim().min(1)).optional(),
});

// Forms list page — create/edit form metadata validation schema
export const formMetadataSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  slug: z
    .string()
    .trim()
    .min(1, "O slug é obrigatório")
    .max(200, "O slug deve ter menos de 200 caracteres")
    .regex(/^[a-z0-9-]+$/, "O slug só pode conter letras minúsculas, números e hífens"),
  description: z.string().trim().max(1000, "A descrição deve ter menos de 1000 caracteres").optional().or(z.literal("")),
  organization_id: z.string().trim().min(1, "A empresa é obrigatória"),
  form_type: z.enum(["lead", "contact", "survey", "feedback", "registration"], {
    errorMap: () => ({ message: "Selecione um tipo de formulário válido" }),
  }),
});

// Service subcategory create/edit validation schema
export const serviceSubcategorySchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  parent_id: z.string().trim().min(1, "A categoria pai é obrigatória"),
});

// Service fee create/edit validation schema. service_id is optional because a
// fee type may apply generally (no specific service link).
export const serviceFeeSchema = z.object({
  name: z.string().trim().min(1, "O nome da taxa é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  service_id: z.string().trim().max(200).optional().or(z.literal("")),
  amount: z.coerce.number({ invalid_type_error: "O valor deve ser um número" }).min(0, "O valor deve ser positivo").max(999999999, "O valor é demasiado elevado"),
});

// Marketing channel create/edit validation schema
export const channelSchema = z.object({
  name: z.string().trim().min(1, "O nome do canal é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  type: z.string().trim().min(1, "O tipo é obrigatório"),
  campaign_id: z.string().trim().min(1, "A campanha é obrigatória"),
});

// Campaign create/edit validation schema. Only the name is mandatory in the
// existing business logic (organization/district/country/source/form are all
// stored as nullable and default to "no selection" — kept optional here to
// avoid changing existing save behavior).
export const campaignSchema = z.object({
  name: z.string().trim().min(1, "O nome da campanha é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  organization_id: z.string().trim().max(100).optional().or(z.literal("")),
  country_code: z.string().trim().max(10).optional().or(z.literal("")),
  source_id: z.string().trim().max(100).optional().or(z.literal("")),
  form_id: z.string().trim().max(100).optional().or(z.literal("")),
  selected_district_ids: z.array(z.string().trim().min(1)).optional(),
});

// Campaign detail page — marketing list selection validation schema. The
// selection may be intentionally emptied (to unlink all lists), so the array
// itself is optional; each id, when present, must be a non-empty string.
export const campaignDetailMarketingListsSchema = z.object({
  selectedListIds: z.array(z.string().trim().min(1, "Lista inválida")),
});

// Campaign detail page — channel create/edit dialog validation schema
export const campaignDetailChannelSchema = z.object({
  name: z.string().trim().min(1, "O nome do canal é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  type: z.string().trim().min(1, "O tipo é obrigatório"),
});

// Campaign form wizard — step 1 "campaign setup" (name/type/sources) validation
// schema. Mirrors the pre-existing manual length checks in CampaignFormWizard.
export const campaignWizardSetupSchema = z.object({
  name: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
  type: z.string().trim().min(1, "O tipo é obrigatório"),
  selected_source_ids: z.array(z.string()).optional(),
  default_source_id: z.string().trim().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if ((data.selected_source_ids?.length || 0) > 0 && !data.default_source_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "Selecione uma fonte primária" });
  }
});

// Multi-address form entry schema (organizations/members with multiple
// addresses managed via MultiAddressForm)
export const multiAddressEntrySchema = z.object({
  street: z.string().trim().max(255, "Street must be less than 255 characters").optional().or(z.literal("")),
  number: z.string().trim().max(20, "Number must be less than 20 characters").optional().or(z.literal("")),
  floor: z.string().trim().max(20, "Floor must be less than 20 characters").optional().or(z.literal("")),
  unit: z.string().trim().max(20, "Unit must be less than 20 characters").optional().or(z.literal("")),
  postal_code: z.string().trim().max(20, "Postal code must be less than 20 characters").optional().or(z.literal("")),
  city: z.string().trim().max(100, "City must be less than 100 characters").optional().or(z.literal("")),
  district: z.string().trim().max(100, "District must be less than 100 characters").optional().or(z.literal("")),
  country: z.string().trim().min(1, "Country is required").max(2, "Country must be a 2-letter code"),
  extra: z.string().trim().max(500, "Extra info must be less than 500 characters").optional().or(z.literal("")),
});

// Organization form — core fields (general tab). Address entries validated
// separately per-item via multiAddressEntrySchema in MultiAddressForm; fiscal
// address details validated inline via organizationFiscalAddressSchema.
export const organizationFormSchema = z.object({
  name: z.string().trim().min(1, "O nome da organização é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  type: z.string().trim().min(1, "O tipo é obrigatório"),
  phone: z.string().trim().max(20, "O telefone deve ter menos de 20 caracteres").optional().or(z.literal("")),
  isFiscal: z.boolean(),
  nif: z.string().trim().max(50, "O NIF deve ter menos de 50 caracteres").optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.isFiscal && !data.nif.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nif"], message: "O NIF é obrigatório para organizações fiscais" });
  }
});

// Organization form — new fiscal address details (only validated when the
// user chooses to enter a new fiscal address instead of reusing an existing one)
export const organizationFiscalAddressSchema = z.object({
  street: z.string().trim().min(1, "A morada é obrigatória").max(255, "A morada deve ter menos de 255 caracteres"),
  postal_code: z.string().trim().min(1, "O código postal é obrigatório").max(20, "O código postal deve ter menos de 20 caracteres"),
  city: z.string().trim().min(1, "A cidade é obrigatória").max(100, "A cidade deve ter menos de 100 caracteres"),
});

// User form (create/edit) validation schema — basic profile fields.
// Password is optional here because edit mode allows leaving it blank to
// keep the current password; UserFormEnhanced enforces "required on create"
// separately since that depends on isEdit, which Zod alone can't know.
export const userFormSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  email: z.string().trim().min(1, "O email é obrigatório").email("Formato de email inválido").max(255, "O email deve ter menos de 255 caracteres"),
  password: z.string().trim().min(8, "A password deve ter pelo menos 8 caracteres").max(72, "A password deve ter menos de 72 caracteres").optional().or(z.literal("")),
});

// Organization member edit dialog validation schema.
export const memberEditSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  email: z.string().trim().email("Formato de email inválido").max(255, "O email deve ter menos de 255 caracteres").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "O telefone deve ter menos de 20 caracteres").optional().or(z.literal("")),
  position: z.string().trim().max(100, "O cargo deve ter menos de 100 caracteres").optional().or(z.literal("")),
  password: z.string().trim().min(8, "A password deve ter pelo menos 8 caracteres").max(72, "A password deve ter menos de 72 caracteres").optional().or(z.literal("")),
});

// Send proposal / send quote dialog validation schema — external email dispatch.
export const sendDocumentEmailSchema = z.object({
  recipientName: z.string().trim().max(200, "O nome deve ter menos de 200 caracteres").optional().or(z.literal("")),
  recipientEmail: z.string().trim().email("Formato de email inválido").max(255, "O email deve ter menos de 255 caracteres"),
  recipients: z.array(z.string().trim().email("Um dos destinatários tem um email inválido")).min(1, "É necessário pelo menos um destinatário"),
});

// Generic entity email dialog validation schema (to/cc/subject/body).
export const sendEntityEmailSchema = z.object({
  to: z.string().trim().email("Formato de email inválido").max(255, "O email deve ter menos de 255 caracteres"),
  cc: z.array(z.string().trim().email("Um dos emails em CC é inválido")).optional().default([]),
  subject: z.string().trim().min(1, "O assunto é obrigatório").max(255, "O assunto deve ter menos de 255 caracteres"),
  body: z.string().trim().min(1, "O corpo do email é obrigatório"),
});

// Auth page (login/signup) validation schemas.
export const authLoginSchema = z.object({
  email: z.string().trim().min(1, "O email é obrigatório").email("Formato de email inválido"),
  password: z.string().min(1, "A password é obrigatória"),
});

export const authSignupSchema = z.object({
  fullName: z.string().trim().min(1, "O nome completo é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  email: z.string().trim().min(1, "O email é obrigatório").email("Formato de email inválido"),
  password: z.string().min(8, "A password deve ter pelo menos 8 caracteres").max(72, "A password deve ter menos de 72 caracteres"),
});

// Post-signup onboarding profile (WelcomeOrgDialog). Every field is optional
// and skippable; length constraints and enum values mirror the signup_profile
// CHECK constraints in supabase/migrations/20261110060000_create_signup_profile_table.sql.
// Exported so WelcomeOrgDialog renders its <Select> options from the same
// list instead of hand-copying a third parallel list.
export const SIGNUP_INDUSTRY_OPTIONS = [
  "technology",
  "financial_services",
  "real_estate",
  "healthcare",
  "education",
  "retail_ecommerce",
  "manufacturing",
  "construction",
  "professional_services",
  "media_marketing",
  "hospitality_tourism",
  "nonprofit",
  "government",
  "other",
] as const;

export const SIGNUP_EMPLOYEE_COUNT_OPTIONS = ["1", "2-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;

// Trims the raw input before deciding whether it's "empty" (skippable) or a
// real value that must satisfy the length bounds — a plain
// `.trim().min(1).optional().or(z.literal(""))` chain rejects whitespace-only
// input, because the min(1) check runs on the trimmed value while the
// z.literal("") fallback still matches against the raw (untrimmed) input.
const trimmedOptionalString = (max: number, message: string) =>
  z.preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z.union([z.literal(""), z.string().min(1, message).max(max, message)])
  );

export const signupProfileSchema = z.object({
  companyName: trimmedOptionalString(200, "O nome da empresa deve ter entre 1 e 200 caracteres"),
  industry: z.enum(SIGNUP_INDUSTRY_OPTIONS).optional().or(z.literal("")),
  employeeCountRange: z.enum(SIGNUP_EMPLOYEE_COUNT_OPTIONS).optional().or(z.literal("")),
  jobTitle: trimmedOptionalString(150, "O cargo deve ter entre 1 e 150 caracteres"),
});

export type SignupProfileFormData = z.infer<typeof signupProfileSchema>;

// Warehouse validation schema
export const warehouseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be less than 200 characters"),
  code: z.string().trim().min(1, "Code is required").max(50, "Code must be less than 50 characters"),
  address: z.string().trim().max(255, "Address must be less than 255 characters").optional().or(z.literal("")),
  city: z.string().trim().max(100, "City must be less than 100 characters").optional().or(z.literal("")),
  postal_code: z.string().trim().max(20, "Postal code must be less than 20 characters").optional().or(z.literal("")),
  country: z.string().trim().max(100, "Country must be less than 100 characters").optional().or(z.literal("")),
  manager_name: z.string().trim().max(100, "Manager name must be less than 100 characters").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "Phone must be less than 20 characters").optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email format").max(255, "Email must be less than 255 characters").optional().or(z.literal("")),
  capacity: z.string().trim().regex(/^\d+$/, "Capacity must be a positive whole number").optional().or(z.literal("")),
});

// Purchase order header validation schema (line items are validated separately
// via the existing "at least one item" check in the submit handler).
export const purchaseOrderSchema = z.object({
  supplier_id: z.string().trim().min(1, "Supplier is required"),
  order_date: z.string().trim().min(1, "Order date is required"),
  expected_delivery: z.string().trim().optional().or(z.literal("")),
  status: z.enum(["pending", "ordered", "received", "cancelled"]),
  notes: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
});

// Product attribute validation schema (code required on create)
export const productAttributeSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(50, "Code must be less than 50 characters").regex(/^[a-z0-9_]+$/, "Code must contain only lowercase letters, numbers and underscores"),
  label: z.string().trim().min(1, "Label is required").max(100, "Label must be less than 100 characters"),
  value_type: z.enum(["string", "number", "boolean", "list", "date"]),
  unit: z.string().trim().max(50, "Unit must be less than 50 characters").optional().or(z.literal("")),
});

// Product attribute validation schema for editing (code is disabled/immutable in the edit form)
export const productAttributeEditSchema = productAttributeSchema.extend({
  code: z.string().trim().max(50, "Code must be less than 50 characters").optional().or(z.literal("")),
});

// Product category validation schema (parent optional — top-level categories are allowed)
export const productCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be less than 200 characters"),
  slug: z.string().trim().max(200, "Slug must be less than 200 characters").regex(/^[a-z0-9-]*$/, "Slug must contain only lowercase letters, numbers and hyphens").optional().or(z.literal("")),
  description: z.string().trim().max(2000, "Description must be less than 2000 characters").optional().or(z.literal("")),
  parent_id: z.string().trim().optional().or(z.literal("")),
  sort_order: z.number().int("Sort order must be a whole number").min(0, "Sort order must be at least 0"),
});

// Product subcategory validation schema (parent category is mandatory)
export const productSubcategorySchema = productCategorySchema.extend({
  parent_id: z.string().trim().min(1, "Parent category is required"),
});

// Service category validation schema (company is mandatory)
export const serviceCategorySchema = productCategorySchema.extend({
  organization_id: z.string().trim().min(1, "Company is required"),
});

// Password reset / first-login password schema (ResetPassword page, FirstLoginModal).
// Both flows require a minimum of 8 characters and matching confirmation.
export const passwordResetSchema = z
  .object({
    password: z.string().min(8, "A password deve ter no mínimo 8 caracteres."),
    confirmPassword: z.string().min(1, "Confirme a password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As passwords não coincidem.",
    path: ["confirmPassword"],
  });

// Profile personal data schema (EditProfileDialog - "profile" tab).
export const profileFieldsSchema = z.object({
  firstName: z.string().trim().max(100, "First name must be less than 100 characters").optional().or(z.literal("")),
  lastName: z.string().trim().max(100, "Last name must be less than 100 characters").optional().or(z.literal("")),
});

// Profile password change schema (EditProfileDialog - "password" tab). Kept at the
// dialog's pre-existing 6-character minimum to preserve behavior.
export const profilePasswordSchema = z
  .object({
    newPassword: z.string().min(6, "A password deve ter no mínimo 6 caracteres."),
    confirmPassword: z.string().min(1, "Confirme a password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As passwords não coincidem.",
    path: ["confirmPassword"],
  });

// Contract detail dialog schema (ContractDetailDialog - "detalhes"/"notas" tabs).
export const contractDetailFormSchema = z
  .object({
    proposal_id: z.string().trim().optional().or(z.literal("")),
    template_id: z.string().trim().optional().or(z.literal("")),
    start_date: z.string().trim().optional().or(z.literal("")),
    end_date: z.string().trim().optional().or(z.literal("")),
    notes: z.string().trim().max(5000, "Notes must be less than 5000 characters").optional().or(z.literal("")),
    payment_terms: z.string().trim().max(255, "Payment terms must be less than 255 characters").optional().or(z.literal("")),
  })
  .refine(
    (data) => !data.start_date || !data.end_date || new Date(data.start_date) <= new Date(data.end_date),
    { message: "A data de fim deve ser posterior à data de início", path: ["end_date"] }
  );

// Contract "fill in contract" prompt variable values - arbitrary string map.
export const contractPromptValuesSchema = z.record(
  z.string().trim().max(1000, "Value must be less than 1000 characters")
);

// Signatory OTP verification code (SignatoryOtpDialog).
export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "O código deve ter 6 dígitos.");

// Team creation/editing schema (CreateTeamDialog).
export const teamFormSchema = z.object({
  name: z.string().trim().min(1, "O nome do grupo é obrigatório").max(100, "Team name must be less than 100 characters"),
  description: z.string().trim().max(500, "Description must be less than 500 characters").optional().or(z.literal("")),
  icon: z.string().trim().min(1, "Icon is required"),
  leader_id: z.string().trim().min(1, "O líder do grupo é obrigatório"),
  member_ids: z.array(z.string()).min(1, "Selecione pelo menos um membro"),
});

// Shared time-of-day (HH:mm) validator used by scheduling schemas below.
const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora inválido (use HH:mm)");

// Shared hex color validator used by scheduling schemas below.
const scheduleHexColor = z
  .string()
  .trim()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Cor inválida (use formato hexadecimal, ex: #3b82f6)");

// Auto-schedule rule dialog validation schema (scheduling/AutoScheduleRuleDialog)
export const autoScheduleRuleSchema = z.object({
  name: z.string().trim().min(1, "O nome da regra é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  trigger_type: z.enum(["manual", "on_create", "on_status_change", "on_date"], {
    errorMap: () => ({ message: "Selecione um tipo de gatilho válido" }),
  }),
  duration_minutes: z.number({ invalid_type_error: "A duração deve ser um número" }).int("A duração deve ser um número inteiro").min(1, "A duração deve ser pelo menos 1 minuto").max(1440, "A duração deve ser no máximo 1440 minutos"),
  buffer_before_minutes: z.number({ invalid_type_error: "O tempo de intervalo deve ser um número" }).int("Deve ser um número inteiro").min(0, "Não pode ser negativo").max(1440, "Valor demasiado elevado"),
  buffer_after_minutes: z.number({ invalid_type_error: "O tempo de intervalo deve ser um número" }).int("Deve ser um número inteiro").min(0, "Não pode ser negativo").max(1440, "Valor demasiado elevado"),
  earliest_time: timeOfDaySchema,
  latest_time: timeOfDaySchema,
  max_items_per_day: z.number({ invalid_type_error: "Deve ser um número" }).int("Deve ser um número inteiro").min(1, "Deve ser pelo menos 1").max(1000, "Valor demasiado elevado").nullable(),
  priority: z.number({ invalid_type_error: "A prioridade deve ser um número" }).int("A prioridade deve ser um número inteiro"),
}).refine((data) => data.earliest_time < data.latest_time, {
  message: "A hora de início deve ser anterior à hora de fim",
  path: ["latest_time"],
});

// Schedule board dialog validation schema (scheduling/ScheduleBoardDialog)
export const scheduleBoardSchema = z.object({
  name: z.string().trim().min(1, "O nome do board é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  description: z.string().trim().max(2000, "A descrição deve ter menos de 2000 caracteres").optional().or(z.literal("")),
  color: scheduleHexColor,
  max_daily_slots: z.number({ invalid_type_error: "Deve ser um número" }).int("Deve ser um número inteiro").min(1, "Deve ser pelo menos 1").max(1000, "Valor demasiado elevado").nullable(),
});

// Schedule item dialog validation schema (scheduling/ScheduleItemDialog)
export const scheduleItemSchema = z.object({
  board_id: z.string().trim().min(1, "O board é obrigatório"),
  title: z.string().trim().min(1, "O título é obrigatório").max(200, "O título deve ter menos de 200 caracteres"),
  start_datetime: z.string().trim().min(1, "A data de início é obrigatória").refine((val) => !Number.isNaN(new Date(val).getTime()), "Data de início inválida"),
  end_datetime: z.string().trim().min(1, "A data de fim é obrigatória").refine((val) => !Number.isNaN(new Date(val).getTime()), "Data de fim inválida"),
  location: z.string().trim().max(255, "A localização deve ter menos de 255 caracteres").optional().or(z.literal("")),
  notes: z.string().trim().max(2000, "As notas devem ter menos de 2000 caracteres").optional().or(z.literal("")),
  priority: z.number({ invalid_type_error: "A prioridade deve ser um número" }).int("A prioridade deve ser um número inteiro").min(0).max(2),
}).refine((data) => new Date(data.start_datetime).getTime() <= new Date(data.end_datetime).getTime(), {
  message: "A data de fim deve ser posterior à data de início",
  path: ["end_datetime"],
});

// Schedule resource dialog validation schema (scheduling/ScheduleResourceDialog)
export const scheduleResourceSchema = z.object({
  name: z.string().trim().min(1, "O nome do recurso é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  resource_type: z.enum(["user", "equipment", "room", "vehicle"], {
    errorMap: () => ({ message: "Selecione um tipo de recurso válido" }),
  }),
  color: scheduleHexColor,
  max_daily_capacity: z.number({ invalid_type_error: "A capacidade deve ser um número" }).int("A capacidade deve ser um número inteiro").min(1, "A capacidade deve ser pelo menos 1").max(24, "A capacidade deve ser no máximo 24"),
});

// Schedule settings dialog — general/working settings validation schema
export const scheduleSettingsSchema = z.object({
  country_code: z.string().trim().min(2, "O país é obrigatório").max(10, "Código de país inválido"),
  timezone: z.string().trim().min(1, "O fuso horário é obrigatório").max(100, "Fuso horário inválido"),
  week_starts_on: z.number().int().min(0).max(1),
  working_hours_start: timeOfDaySchema,
  working_hours_end: timeOfDaySchema,
  working_days: z.array(z.number().int().min(0).max(6)).min(1, "Selecione pelo menos um dia de trabalho"),
  weekend_color: scheduleHexColor,
  holiday_color: scheduleHexColor,
  show_weekends: z.boolean(),
  show_holidays: z.boolean(),
}).refine((data) => data.working_hours_start < data.working_hours_end, {
  message: "A hora de início deve ser anterior à hora de fim",
  path: ["working_hours_end"],
});

// Schedule settings dialog — new holiday entry validation schema
export const scheduleHolidaySchema = z.object({
  name: z.string().trim().min(1, "O nome do feriado é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  holiday_date: z.string().trim().min(1, "A data é obrigatória").refine((val) => !Number.isNaN(new Date(val).getTime()), "Data inválida"),
});

// Lead contact result taxonomy create/edit validation schema (LeadContactResults page)
export const leadContactResultConfigSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(100, "O nome deve ter menos de 100 caracteres"),
  description: z.string().trim().max(500, "A descrição deve ter menos de 500 caracteres").optional().or(z.literal("")),
  icon: z.string().trim().min(1, "O ícone é obrigatório"),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Cor inválida (use formato hexadecimal, ex: #6b7280)"),
  workflow_next_status: z.string().trim().max(100, "Estado inválido").optional().or(z.literal("")),
  is_positive: z.boolean(),
  is_negative: z.boolean(),
  requires_callback: z.boolean(),
  requires_visit: z.boolean(),
  is_active: z.boolean(),
});

// Marketing integration — new API token name validation schema (MarketingIntegration page).
// Optional (a default name is generated from the campaign when left blank).
export const marketingTokenNameSchema = z.object({
  newTokenName: z.string().trim().max(200, "O nome do token deve ter menos de 200 caracteres").optional().or(z.literal("")),
});

// Team Hub entry create/edit validation schema (TeamHub page)
export const teamHubEntrySchema = z.object({
  type: z.enum(["bug", "improvement", "task", "knowledge"], {
    errorMap: () => ({ message: "Selecione um tipo válido" }),
  }),
  title: z.string().trim().min(1, "O título é obrigatório").max(200, "O título deve ter menos de 200 caracteres"),
  description: z.string().trim().min(1, "A descrição é obrigatória").max(5000, "A descrição deve ter menos de 5000 caracteres"),
  priority: z.enum(["low", "medium", "high"], {
    errorMap: () => ({ message: "Selecione uma prioridade válida" }),
  }),
  status: z.enum(["pending", "in_progress", "done"], {
    errorMap: () => ({ message: "Selecione um estado válido" }),
  }),
  tags: z.string().trim().max(500, "As tags devem ter menos de 500 caracteres").optional().or(z.literal("")),
});

// Team Hub list filter validation schema (TeamHub page)
export const teamHubFilterTypeSchema = z.enum(["all", "bug", "improvement", "task", "knowledge"], {
  errorMap: () => ({ message: "Filtro de tipo inválido" }),
});

// SMTP server configuration validation schema (SmtpManagement page). Handles
// sensitive credentials (host/user/password), so required fields are enforced strictly.
export const smtpConfigSchema = z.object({
  name: z.string().trim().min(1, "O nome do perfil é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  smtp_host: z.string().trim().min(1, "O servidor SMTP é obrigatório").max(255, "O servidor deve ter menos de 255 caracteres"),
  smtp_port: z.coerce.number({ invalid_type_error: "A porta deve ser um número" }).int("A porta deve ser um número inteiro").min(1, "Porta inválida").max(65535, "Porta inválida"),
  smtp_username: z.string().trim().min(1, "O utilizador é obrigatório").max(255, "O utilizador deve ter menos de 255 caracteres"),
  smtp_password: z.string().min(1, "A password é obrigatória").max(255, "A password deve ter menos de 255 caracteres"),
  encryption: z.enum(["tls", "ssl", "none"], {
    errorMap: () => ({ message: "Selecione um tipo de encriptação válido" }),
  }),
  from_email: z.string().trim().min(1, "O email do remetente é obrigatório").email("Formato de email inválido").max(255, "O email deve ter menos de 255 caracteres"),
  from_name: z.string().trim().max(200, "O nome do remetente deve ter menos de 200 caracteres").optional().or(z.literal("")),
  reply_to: z.string().trim().email("Formato de email inválido").max(255, "O email deve ter menos de 255 caracteres").optional().or(z.literal("")),
  daily_limit: z.coerce.number({ invalid_type_error: "O limite deve ser um número" }).int("O limite deve ser um número inteiro").min(1, "O limite deve ser pelo menos 1").max(1000000, "Valor demasiado elevado"),
  is_default: z.boolean(),
});

// Brand create/edit validation schema (Brands page)
export const brandFormSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  slug: z.string().trim().max(200, "O slug deve ter menos de 200 caracteres").regex(/^[a-z0-9-]*$/, "O slug só pode conter letras minúsculas, números e hífens").optional().or(z.literal("")),
  description: z.string().trim().max(2000, "A descrição deve ter menos de 2000 caracteres").optional().or(z.literal("")),
  website: z.string().trim().url("URL inválido").max(255, "O website deve ter menos de 255 caracteres").optional().or(z.literal("")),
  logo_url: z.string().trim().url("URL inválido").max(2048, "O URL do logo é demasiado longo").optional().or(z.literal("")),
});

// Lead source taxonomy create/edit validation schema (LeadSources page)
export const leadSourceFormSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  description: z.string().trim().max(1000, "A descrição deve ter menos de 1000 caracteres").optional().or(z.literal("")),
  icon: z.string().trim().min(1, "O ícone é obrigatório"),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Cor inválida (use formato hexadecimal, ex: #3B82F6)"),
  is_active: z.boolean(),
  organization_id: z.string().trim().max(200).optional().or(z.literal("")),
  utm_aliases: z.array(z.string().trim().regex(/^[a-z0-9_-]+$/, "Alias inválido")).max(20, "Máximo de 20 aliases por Source"),
});

// Role create/edit validation schema (Roles page)
export const roleFormSchema = z.object({
  code: z.string().trim().max(100, "O código deve ter menos de 100 caracteres").optional().or(z.literal("")),
  name: z.string().trim().min(1, "O nome da role é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  description: z.string().trim().max(2000, "A descrição deve ter menos de 2000 caracteres").optional().or(z.literal("")),
  can_sign_contracts: z.boolean(),
  permissions: z.array(z.string().trim().min(1, "Permissão inválida")),
});

// Contract template create/edit validation schema (ContractTemplates page)
export const contractTemplateFormSchema = z.object({
  name: z.string().trim().min(1, "O nome da minuta é obrigatório").max(200, "O nome deve ter menos de 200 caracteres"),
  body_html: z.string().trim().min(1, "O corpo da minuta é obrigatório"),
  is_active: z.boolean(),
  is_default: z.boolean(),
  signatory_user_id: z.string().trim().min(1, "Signatário inválido").nullable(),
  signatory_role_id: z.string().trim().min(1, "Cargo de signatário inválido").nullable(),
});

// Support access request validation schema (SupportAccessModal - platform staff only)
export const supportAccessRequestSchema = z.object({
  orgId: z.string().trim().min(1, "Seleccione uma organização"),
  reason: z.string().trim().min(10, "O motivo deve ter pelo menos 10 caracteres").max(2000, "O motivo deve ter menos de 2000 caracteres"),
  duration: z.enum(["1", "2", "4", "8"], {
    errorMap: () => ({ message: "Duração inválida" }),
  }),
});

// Quote builder — "add items" dialog validation schema (quote/AddItemsDialog).
// Validates the selected-items payload immediately before it is emitted via onAddItems.
export const quoteAddItemsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1, "Item inválido"),
        quantity: z.number({ invalid_type_error: "A quantidade deve ser um número" }).int("A quantidade deve ser um número inteiro").min(1, "A quantidade deve ser pelo menos 1").max(999999, "Quantidade demasiado elevada"),
      })
    )
    .min(1, "Selecione pelo menos um item"),
});
