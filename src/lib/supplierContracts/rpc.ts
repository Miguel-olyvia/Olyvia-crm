// Chamadas às RPCs do Contrato de Fornecedor (CRM). As RPCs ainda não estão
// em types.ts (não regenerado): o cast é local e tipado, como em
// useSupplierListStats (rpc_supplier_portal_profile_status).
import { supabase } from "@/integrations/supabase/client";
import type {
  SupplierContractConditions,
  SupplierContractDetail,
  SupplierContractExpiring,
  SupplierContractKind,
  SupplierContractOrigin,
  SupplierContractPreview,
  SupplierContractsList,
  SupplierContractStatus,
  SupplierContractTemplate,
  SupplierContractVariable,
} from "./tipos";

export interface RpcError {
  message: string;
  hint?: string | null;
  code?: string | null;
  details?: string | null;
}

type AnyRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: RpcError | null }>;

/** Erro de uma RPC com o hint da BD (validation, invalid_state, no_portal, otp_required, ...). */
export class SupplierContractError extends Error {
  hint: string | null;
  code: string | null;
  constructor(e: RpcError) {
    super(e.message || "Erro inesperado");
    this.name = "SupplierContractError";
    this.hint = e.hint ?? null;
    this.code = e.code ?? null;
  }
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as AnyRpc).call(supabase, fn, args ?? {});
  if (error) throw new SupplierContractError(error);
  return data as T;
}

/** Mensagens das RPCs já vêm em PT; só se acrescenta o que fazer a seguir em alguns casos. */
export function describeContractError(err: unknown): string {
  if (err instanceof SupplierContractError) {
    switch (err.hint) {
      case "no_portal":
        return `${err.message}. Use o separador Portal para dar acesso ao fornecedor.`;
      case "no_portal_owner":
        return `${err.message}. Confirme no separador Portal quem é o titular da conta.`;
      case "no_signing_power":
        return `${err.message}. Peça a um administrador um papel com poderes para assinar contratos.`;
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erro inesperado";
}

export interface SaveDraftData {
  title?: string;
  kind?: SupplierContractKind;
  origin?: SupplierContractOrigin;
  template_id?: string | null;
  body_html?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  conditions?: Partial<SupplierContractConditions>;
}

export interface TemplateSaveData {
  name?: string;
  kind?: SupplierContractKind;
  description?: string | null;
  body_html?: string;
  is_active?: boolean;
}

export const supplierContractsRpc = {
  templateVariables: () => call<SupplierContractVariable[]>("rpc_supplier_contract_template_variables"),

  templatesList: (organizationId: string, kind: SupplierContractKind | null = null, includeInactive = false) =>
    call<SupplierContractTemplate[]>("rpc_supplier_contract_templates_list", {
      p_organization_id: organizationId,
      p_kind: kind,
      p_include_inactive: includeInactive,
    }),

  templateSave: (templateId: string | null, organizationId: string | null, data: TemplateSaveData) =>
    call<Pick<SupplierContractTemplate, "id" | "organization_id" | "name" | "kind" | "is_active" | "updated_at">>(
      "rpc_supplier_contract_template_save",
      { p_template_id: templateId, p_organization_id: organizationId, p_data: data },
    ),

  saveDraft: (contractId: string | null, supplierId: string | null, data: SaveDraftData) =>
    call<SupplierContractDetail>("rpc_supplier_contract_save_draft", {
      p_contract_id: contractId,
      p_supplier_id: supplierId,
      p_data: data,
    }),

  setConditions: (contractId: string, conditions: Partial<SupplierContractConditions>) =>
    call<SupplierContractDetail>("rpc_supplier_contract_set_conditions", {
      p_contract_id: contractId,
      p_conditions: conditions,
    }),

  newVersion: (contractId: string) =>
    call<SupplierContractDetail>("rpc_supplier_contract_new_version", { p_contract_id: contractId }),

  preview: (contractId: string) => call<SupplierContractPreview>("rpc_supplier_contract_preview", { p_contract_id: contractId }),

  send: (contractId: string) =>
    call<{ contract_id: string; status: SupplierContractStatus; sent_at: string; document_sha256: string; supplier_account_id: string }>(
      "rpc_supplier_contract_send",
      { p_contract_id: contractId },
    ),

  cancel: (contractId: string, reason: string | null) =>
    call<{ contract_id: string; status: SupplierContractStatus; cancelled_at: string }>("rpc_supplier_contract_cancel", {
      p_contract_id: contractId,
      p_reason: reason,
    }),

  countersign: (contractId: string) =>
    call<{ contract_id: string; status: SupplierContractStatus; company_signed_at: string; company_signed_by_name: string }>(
      "rpc_supplier_contract_countersign",
      { p_contract_id: contractId },
    ),

  list: (supplierId: string) => call<SupplierContractsList>("rpc_supplier_contracts_list", { p_supplier_id: supplierId }),

  get: (contractId: string) => call<SupplierContractDetail>("rpc_supplier_contract_get", { p_contract_id: contractId }),

  expiring: (days = 30) => call<SupplierContractExpiring[]>("rpc_supplier_contracts_expiring", { p_days: days }),
};

// Chaves das queries (react-query), partilhadas pela ficha e pela lista.
export const supplierContractKeys = {
  list: (supplierId: string | null) => ["supplier-contracts", "list", supplierId] as const,
  detail: (contractId: string | null) => ["supplier-contracts", "detail", contractId] as const,
  preview: (contractId: string | null, updatedAt: string | null) => ["supplier-contracts", "preview", contractId, updatedAt] as const,
  templates: (orgId: string | null) => ["supplier-contracts", "templates", orgId] as const,
  variables: () => ["supplier-contracts", "variables"] as const,
  orgStatuses: (orgId: string | null) => ["supplier-contracts", "org-statuses", orgId] as const,
  expiring: (days: number) => ["supplier-contracts", "expiring", days] as const,
};
