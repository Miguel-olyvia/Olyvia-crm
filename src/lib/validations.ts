import { z } from "zod";

// Contact validation schema
export const contactSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100, "First name must be less than 100 characters"),
  last_name: z.string().trim().min(1, "Last name is required").max(100, "Last name must be less than 100 characters"),
});

// Contact schema for companies (last_name optional)
export const contactCompanySchema = contactSchema.extend({
  last_name: z.string().trim().max(100, "Last name must be less than 100 characters").optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email format").max(255, "Email must be less than 255 characters").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "Phone must be less than 20 characters").optional().or(z.literal("")),
  position: z.string().trim().max(100, "Position must be less than 100 characters").optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).optional(),
  source: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(2000, "Notes must be less than 2000 characters").optional().or(z.literal("")),
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

// Quote line validation schema
export const quoteLineSchema = z.object({
  qt: z.number().min(0, "Quantity must be positive").max(999999, "Quantity is too large"),
  margem_percent: z.number().min(0, "Margin must be at least 0"),
  iva_percent: z.number().min(0, "VAT must be at least 0").max(100, "VAT must be at most 100"),
  int_percent: z.number().min(0, "Internal % must be at least 0").max(100, "Internal % must be at most 100"),
});
