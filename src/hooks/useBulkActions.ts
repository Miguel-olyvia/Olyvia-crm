import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import type { Database } from "@/integrations/supabase/types";

/**
 * Name of a Supabase RPC actually declared in `Database["public"]["Functions"]`.
 * Using this instead of a bare `string` keeps `supabase.rpc(name, params)` calls
 * type-checking against the real generated schema (supabase.rpc's generic
 * overload requires `FnName extends string & keyof Schema["Functions"]`, which
 * a plain `string` never satisfies).
 */
type SupabaseRpcName = keyof Database["public"]["Functions"];

export interface BulkActionOptions {
  tableName: string;
  onSuccess?: () => void;
  softDelete?: boolean; // Use soft delete (is_deleted) instead of hard delete
  organizationId?: string; // When provided, all writes are scoped to this org
  /**
   * Names of bulk RPCs (created to emit ONE consolidated audit row per affected
   * entity instead of the N-row trigger fan-out a raw multi-row update/delete
   * produces). When provided, the corresponding handler calls
   * `supabase.rpc(name, params)` instead of mutating the table directly.
   * When omitted, the handler falls back to the previous direct
   * update/delete `.in("id", ids)` behavior for tables that don't have a
   * bulk RPC yet.
   */
  bulkStatusRpc?: SupabaseRpcName;
  bulkDeleteRpc?: SupabaseRpcName;
  bulkOrgRpc?: SupabaseRpcName;
  /**
   * Name of the parameter that carries the target organization id in
   * `bulkOrgRpc`. RPC signatures are not uniform across modules
   * (e.g. `rpc_bulk_org_brand` uses `p_new_org_id`, while
   * `rpc_bulk_org_product_attribute` uses `p_new_organization_id`).
   * Defaults to "p_new_org_id".
   */
  bulkOrgRpcNewOrgParam?: string;
}

export function useBulkActions({
  tableName,
  onSuccess,
  softDelete = false,
  organizationId,
  bulkStatusRpc,
  bulkDeleteRpc,
  bulkOrgRpc,
  bulkOrgRpcNewOrgParam = "p_new_org_id",
}: BulkActionOptions) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkOrgDialogOpen, setBulkOrgDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState("active");
  const [bulkNewCompanyId, setBulkNewCompanyId] = useState("");
  const [processing, setProcessing] = useState(false);

  const toggleSelectAll = (allIds: string[]) => {
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkStatusChange = async (statusField: string = "is_active") => {
    if (selectedIds.size === 0) return;
    setProcessing(true);

    try {
      if (!organizationId) throw new Error("organizationId required for bulk status change");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      const ids = Array.from(selectedIds);

      if (bulkStatusRpc) {
        const { error } = await supabase.rpc(bulkStatusRpc, {
          p_ids: ids,
          p_organization_id: organizationId,
          p_is_active: bulkNewStatus === "active",
        });
        if (error) throw error;
      } else {
        const updateData: Record<string, unknown> = {};

        // Handle different status field types
        if (statusField === "is_active") {
          updateData.is_active = bulkNewStatus === "active";
        } else if (statusField === "status") {
          updateData.status = bulkNewStatus;
        }

        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await (supabase
            .from(tableName as any)
            .update(updateData as any)
            .in("id", ids)
            .eq("organization_id", organizationId) as any);
          if (error) throw error;
        });
      }

      toast({
        title: t('common.statusUpdated'),
        description: `${selectedIds.size} registos atualizados.`
      });
      clearSelection();
      setBulkStatusDialogOpen(false);
      onSuccess?.();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setProcessing(true);

    try {
      if (!organizationId) throw new Error("organizationId required for bulk delete");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      const ids = Array.from(selectedIds);

      if (bulkDeleteRpc && !softDelete) {
        const { error } = await supabase.rpc(bulkDeleteRpc, {
          p_ids: ids,
          p_organization_id: organizationId,
        });
        if (error) throw error;
      } else {
        await withAuditContext(supabase, businessUserId, async () => {
          if (softDelete) {
            const { error } = await (supabase
              .from(tableName as any)
              .update({
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by: businessUserId,
              } as any)
              .in("id", ids)
              .eq("organization_id", organizationId) as any);
            if (error) throw error;
          } else {
            const { error } = await (supabase
              .from(tableName as any)
              .delete()
              .in("id", ids)
              .eq("organization_id", organizationId) as any);
            if (error) throw error;
          }
        });
      }

      toast({
        title: t('common.deleteSuccess'),
        description: `${selectedIds.size} registos eliminados.`
      });
      clearSelection();
      setBulkDeleteDialogOpen(false);
      onSuccess?.();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkCompanyChange = async (companyField: string = "organization_id") => {
    if (selectedIds.size === 0 || !bulkNewCompanyId) return;
    setProcessing(true);

    try {
      if (!organizationId) throw new Error("organizationId required for bulk company change");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      const ids = Array.from(selectedIds);

      if (bulkOrgRpc) {
        const { error } = await supabase.rpc(bulkOrgRpc, {
          p_ids: ids,
          p_organization_id: organizationId,
          [bulkOrgRpcNewOrgParam]: bulkNewCompanyId,
        });
        if (error) throw error;
      } else {
        const updateData: Record<string, unknown> = {};
        updateData[companyField] = bulkNewCompanyId;

        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await (supabase
            .from(tableName as any)
            .update(updateData as any)
            .in("id", ids)
            .eq("organization_id", organizationId) as any);
          if (error) throw error;
        });
      }

      toast({
        title: t('common.orgUpdated'),
        description: `${selectedIds.size} registos atualizados.`
      });
      clearSelection();
      setBulkOrgDialogOpen(false);
      setBulkNewCompanyId("");
      onSuccess?.();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return {
    selectedIds,
    setSelectedIds,
    toggleSelectAll,
    toggleSelectOne,
    clearSelection,
    bulkStatusDialogOpen,
    setBulkStatusDialogOpen,
    bulkDeleteDialogOpen,
    setBulkDeleteDialogOpen,
    bulkOrgDialogOpen,
    setBulkOrgDialogOpen,
    bulkNewStatus,
    setBulkNewStatus,
    bulkNewCompanyId,
    setBulkNewCompanyId,
    processing,
    setProcessing,
    handleBulkStatusChange,
    handleBulkDelete,
    handleBulkCompanyChange,
  };
}
