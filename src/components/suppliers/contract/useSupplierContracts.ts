// Leituras do Contrato de Fornecedor no CRM (react-query). Só leituras.
//   useSupplierContractsList(supplierId)   → rpc_supplier_contracts_list (versões, conditions_locked, can_*)
//   useSupplierContractDetail(contractId)  → rpc_supplier_contract_get (documento, ficheiros, histórico)
//   useSupplierContractOrgStatuses(orgId)  → estado do contrato por fornecedor para a lista de Fornecedores:
//       supplier_contracts lida pela RLS (supplier_contracts_select_crm: suppliers.view na org) +
//       rpc_supplier_contracts_expiring(30) para "expira em N dias".
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { supplierContractKeys, supplierContractsRpc } from "@/lib/supplierContracts/rpc";
import type { SupplierContractStatus } from "@/lib/supplierContracts/tipos";

export function useSupplierContractsList(supplierId: string | null, enabled = true) {
  return useQuery({
    queryKey: supplierContractKeys.list(supplierId),
    queryFn: () => supplierContractsRpc.list(supplierId as string),
    enabled: !!supplierId && enabled,
    staleTime: 30 * 1000,
  });
}

export function useSupplierContractDetail(contractId: string | null) {
  return useQuery({
    queryKey: supplierContractKeys.detail(contractId),
    queryFn: () => supplierContractsRpc.get(contractId as string),
    enabled: !!contractId,
    staleTime: 15 * 1000,
  });
}

/** Depois de uma escrita: a lista do fornecedor, o detalhe e o estado na lista de Fornecedores. */
export function useInvalidateSupplierContracts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["supplier-contracts"] });
}

// ── Estado por fornecedor (lista de Fornecedores) ────────────────────────────

export interface SupplierContractListState {
  /** Estado a mostrar: o assinado em vigor, senão o em curso, senão o da última versão. */
  status: SupplierContractStatus;
  contractNumber: string;
  version: number;
  validUntil: string | null;
  /** Assinado com fim da validade dentro de 30 dias (rpc_supplier_contracts_expiring). */
  daysLeft: number | null;
  /** Há um assinado e, ao mesmo tempo, uma versão nova em curso. */
  openVersion: { status: SupplierContractStatus; version: number } | null;
}

interface ContractRow {
  supplier_id: string;
  status: SupplierContractStatus;
  contract_number: string;
  version: number;
  valid_until: string | null;
}

const OPEN: readonly SupplierContractStatus[] = ["draft", "sent", "signed_supplier"];
const PAGE = 1000;

// Tabela ainda fora de types.ts: cliente sem tipos só para esta leitura.
const untyped = supabase as unknown as SupabaseClient;

async function loadOrgStatuses(orgId: string): Promise<Map<string, SupplierContractListState>> {
  const rows: ContractRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await untyped
      .from("supplier_contracts")
      .select("supplier_id, status, contract_number, version, valid_until")
      .eq("organization_id", orgId)
      .order("supplier_id")
      .order("version", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const part = (data ?? []) as ContractRow[];
    rows.push(...part);
    if (part.length < PAGE) break;
  }

  // Expira em N dias: a RPC devolve todas as orgs visíveis; filtra-se a desta lista.
  const expiring = new Map<string, number>();
  try {
    const list = await supplierContractsRpc.expiring(30);
    for (const e of list ?? []) if (e.organization_id === orgId) expiring.set(e.supplier_id, e.days_left);
  } catch {
    /* sem a RPC, a lista mostra só o estado */
  }

  const bySupplier = new Map<string, ContractRow[]>();
  for (const r of rows) {
    const arr = bySupplier.get(r.supplier_id);
    if (arr) arr.push(r);
    else bySupplier.set(r.supplier_id, [r]);
  }

  const out = new Map<string, SupplierContractListState>();
  for (const [supplierId, list] of bySupplier) {
    list.sort((a, b) => b.version - a.version);
    const signed = list.find((r) => r.status === "signed") ?? null;
    const open = list.find((r) => OPEN.includes(r.status)) ?? null;
    const main = signed ?? open ?? list[0];
    out.set(supplierId, {
      status: main.status,
      contractNumber: main.contract_number,
      version: main.version,
      validUntil: main.valid_until,
      daysLeft: signed && main === signed ? expiring.get(supplierId) ?? null : null,
      openVersion: signed && open ? { status: open.status, version: open.version } : null,
    });
  }
  return out;
}

export function useSupplierContractOrgStatuses(orgId: string | null | undefined) {
  const { hasPermission, loading } = usePermissions();
  const canView = hasPermission("suppliers.view");
  return useQuery({
    queryKey: supplierContractKeys.orgStatuses(orgId ?? null),
    queryFn: () => loadOrgStatuses(orgId as string),
    enabled: !!orgId && !loading && canView,
    staleTime: 60 * 1000,
  });
}
