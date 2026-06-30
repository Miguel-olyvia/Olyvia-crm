import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { withAuditContext } from "@/utils/auditContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/contexts/CompanyContext";

interface UnitOfMeasure {
  id: string;
  code: string;
  description: string | null;
  organization_id: string | null;
}

export default function UnitsOfMeasure() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasure | null>(null);
  const [unitToDelete, setUnitToDelete] = useState<UnitOfMeasure | null>(null);
  const [formData, setFormData] = useState({ code: "", description: "" });
  const [saving, setSaving] = useState(false);

  const loadUnits = useCallback(async () => {
    setLoading(true);
    try {
      // uom is a hybrid table: global records (organization_id IS NULL) are shared;
      // org-specific records are scoped by organization_id.
      // Show both the org's own records and the global ones.
      let uomQuery = supabase
        .from("uom")
        .select("id, code, description, organization_id")
        .order("code");
      if (activeCompany?.id) {
        uomQuery = uomQuery.or(`organization_id.eq.${activeCompany.id},organization_id.is.null`);
      } else {
        uomQuery = uomQuery.is("organization_id", null);
      }
      const { data, error } = await uomQuery;

      if (error) throw error;
      setUnits(data || []);
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [t, toast, activeCompany?.id]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const filteredUnits = units.filter(
    (unit) =>
      unit.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (unit.description?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const handleOpenDialog = (unit?: UnitOfMeasure) => {
    if (unit) {
      setEditingUnit(unit);
      setFormData({ code: unit.code, description: unit.description || "" });
    } else {
      setEditingUnit(null);
      setFormData({ code: "", description: "" });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code.trim()) {
      toast({
        title: t("common.error"),
        description: t("uom.codeRequired"),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        throw new Error('Perfil de utilizador não encontrado.');
      }

      if (editingUnit) {
        // Only allow editing org-owned records; global records (organization_id IS NULL) are read-only
        if (!editingUnit.organization_id || !activeCompany?.id) {
          throw new Error('Cannot edit a global UOM record or missing active company');
        }
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase
            .from("uom")
            .update({
              code: formData.code.trim(),
              description: formData.description.trim() || null,
            })
            .eq("id", editingUnit.id)
            .eq("organization_id", activeCompany.id);
          if (error) throw error;
        });
        toast({ title: t("uom.updatedSuccess") });
      } else {
        if (!activeCompany?.id) {
          throw new Error('No active company — cannot create UOM without an organization scope');
        }
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase.from("uom").insert({
            code: formData.code.trim(),
            description: formData.description.trim() || null,
            organization_id: activeCompany.id,
          });
          if (error) throw error;
        });
        toast({ title: t("uom.addedSuccess") });
      }

      setDialogOpen(false);
      loadUnits();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!unitToDelete) return;

    try {
      // Only allow deleting org-owned records; global records (organization_id IS NULL) are protected
      if (!unitToDelete.organization_id || !activeCompany?.id) {
        throw new Error('Cannot delete a global UOM record or missing active company');
      }
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        throw new Error('Perfil de utilizador não encontrado.');
      }
      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await supabase
          .from("uom")
          .delete()
          .eq("id", unitToDelete.id)
          .eq("organization_id", activeCompany.id);
        if (error) throw error;
      });
      toast({ title: t("uom.deletedSuccess") });
      setDeleteDialogOpen(false);
      setUnitToDelete(null);
      loadUnits();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">{t("uom.title")}</h1>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            {t("uom.addNew")}
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("uom.code")}</TableHead>
                <TableHead>{t("uom.description")}</TableHead>
                <TableHead className="w-24 text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : filteredUnits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    {t("common.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUnits.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="font-medium">{unit.code}</TableCell>
                    <TableCell>{unit.description || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.edit')}
                          onClick={() => handleOpenDialog(unit)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.delete')}
                          onClick={() => {
                            setUnitToDelete(unit);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUnit ? t("common.edit") : t("uom.addNew")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">{t("uom.code")} *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, code: e.target.value }))
                }
                placeholder="kg, m², un"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t("uom.description")}</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder={t("uom.descriptionPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.deleteConfirmation")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
