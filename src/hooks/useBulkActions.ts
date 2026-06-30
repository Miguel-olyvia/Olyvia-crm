import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";

export interface BulkActionOptions {
  tableName: string;
  onSuccess?: () => void;
  softDelete?: boolean; // Use soft delete (is_deleted) instead of hard delete
  organizationId?: string; // When provided, all writes are scoped to this org
}

export function useBulkActions({ tableName, onSuccess, softDelete = false, organizationId }: BulkActionOptions) {
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
      const updateData: Record<string, unknown> = {};
      
      // Handle different status field types
      if (statusField === "is_active") {
        updateData.is_active = bulkNewStatus === "active";
      } else if (statusField === "status") {
        updateData.status = bulkNewStatus;
      }

      if (!organizationId) throw new Error("organizationId required for bulk status change");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await (supabase
          .from(tableName as any)
          .update(updateData as any)
          .in("id", Array.from(selectedIds))
          .eq("organization_id", organizationId) as any);
        if (error) throw error;
      });

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

      await withAuditContext(supabase, businessUserId, async () => {
        if (softDelete) {
          const { error } = await (supabase
            .from(tableName as any)
            .update({
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by: businessUserId,
            } as any)
            .in("id", Array.from(selectedIds))
            .eq("organization_id", organizationId) as any);
          if (error) throw error;
        } else {
          const { error } = await (supabase
            .from(tableName as any)
            .delete()
            .in("id", Array.from(selectedIds))
            .eq("organization_id", organizationId) as any);
          if (error) throw error;
        }
      });

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
      const updateData: Record<string, unknown> = {};
      updateData[companyField] = bulkNewCompanyId;

      if (!organizationId) throw new Error("organizationId required for bulk company change");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await (supabase
          .from(tableName as any)
          .update(updateData as any)
          .in("id", Array.from(selectedIds))
          .eq("organization_id", organizationId) as any);
        if (error) throw error;
      });

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
