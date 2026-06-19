/**
 * configurator-runtime — wrappers tipados para as RPCs do Lab (Fase 3+4).
 *
 * organizationId e priceContext são SEMPRE explícitos. Sem fallback implícito.
 * templateId é opcional: se omitido, RPC usa o template ativo do produto
 * (comportamento comercial). Se fornecido, opera sobre essa versão (Lab).
 * Sem pricing nesta fase.
 */
import { supabase } from "@/integrations/supabase/client";

export type ConfigSlotType =
  | "attribute_value"
  | "component_product"
  | "quantity"
  | "measure"
  | "boolean"
  | "custom_input";

export interface ResolvedTemplate {
  id: string;
  organization_id: string;
  product_id: string;
  name: string;
  version: number;
  is_active: boolean;
}
export interface ResolvedBlock {
  id: string;
  template_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
}
export interface ResolvedSlot {
  id: string;
  block_id: string;
  slot_key: string;
  label: string;
  slot_type: ConfigSlotType;
  attribute_id: string | null;
  required: boolean;
  min_quantity: number | null;
  max_quantity: number | null;
  sort_order: number;
}
export interface ResolvedOption {
  id: string;
  slot_id: string;
  attribute_value_id: string | null;
  component_product_id: string | null;
  label: string;
  is_enabled: boolean;
  default_quantity: number | null;
  sort_order: number;
}
export interface ResolvedRule {
  id: string;
  template_id: string;
  rule_type: string;
  source_slot_id: string | null;
  source_operator: string | null;
  source_value: any;
  target_slot_id: string | null;
  target_action: string;
  target_value: any;
  priority: number;
  message: string | null;
  is_active: boolean;
}

export interface ResolveResult {
  template: ResolvedTemplate | null;
  blocks: ResolvedBlock[];
  slots: ResolvedSlot[];
  options: ResolvedOption[];
  rules: ResolvedRule[];
  price_context_id: string | null;
  price_context_warning: string | null;
  organization_id: string;
}

export type ValidateMode = "runtime" | "template_check";

export interface ValidationIssue {
  slot_id?: string;
  rule_id?: string;
  code: string;
  message: string;
}

export interface ValidateResult {
  mode: ValidateMode;
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  structural_errors: ValidationIssue[];
  structural_warnings: ValidationIssue[];
  effective_options_per_slot: Record<string, string[]>;
  hidden_slots: string[];
  required_slots: string[];
}

export type ConfigSelection = Record<
  string,
  { option_id?: string; quantity?: number; value?: string | number | boolean } | null
>;

export interface ResolveParams {
  productId: string;
  organizationId: string;
  priceContext?: string | null;
  templateId?: string | null;
}

export interface ValidateParams {
  productId: string;
  organizationId: string;
  selection: ConfigSelection;
  priceContext?: string | null;
  mode: ValidateMode;
  templateId?: string | null;
}

function humanizeRpcError(code: string): string {
  if (code === "forbidden") return "Sem permissão para este produto nesta organização.";
  if (code === "invalid_template_for_product")
    return "A versão selecionada não pertence a este produto/organização.";
  return code;
}

export async function resolveConfiguration(p: ResolveParams): Promise<ResolveResult | { error: string }> {
  const { data, error } = await (supabase as any).rpc("resolve_product_configuration", {
    p_product_id: p.productId,
    p_organization_id: p.organizationId,
    p_price_context: p.priceContext ?? null,
    p_template_id: p.templateId ?? null,
  });
  if (error) {
    console.error("[configurator-runtime] resolve error", error);
    return { error: error.message };
  }
  if (data && (data as any).error) return { error: humanizeRpcError((data as any).error) };
  return data as ResolveResult;
}

export async function validateConfiguration(p: ValidateParams): Promise<ValidateResult | { error: string }> {
  const { data, error } = await (supabase as any).rpc("validate_product_configuration", {
    p_product_id: p.productId,
    p_organization_id: p.organizationId,
    p_selection: p.selection ?? {},
    p_price_context: p.priceContext ?? null,
    p_mode: p.mode,
    p_template_id: p.templateId ?? null,
  });
  if (error) {
    console.error("[configurator-runtime] validate error", error);
    return { error: error.message };
  }
  if (data && (data as any).error) return { error: humanizeRpcError((data as any).error) };
  return data as ValidateResult;
}
