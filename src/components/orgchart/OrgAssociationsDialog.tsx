import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Unlink } from "lucide-react";
import { getOrgTypeLabel, OrgType } from "./OrgChartCard";

interface OrgAssociationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string;
  orgType: string;
  rootOrgId: string;
  onSuccess: () => void;
}

interface AssociableOrg {
  id: string;
  name: string;
  type: string;
  isAssociated: boolean;
}

export function OrgAssociationsDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  orgType,
  rootOrgId,
  onSuccess,
}: OrgAssociationsDialogProps) {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgs, setOrgs] = useState<AssociableOrg[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Determine which types to show as associable
  const isCompanyLike = ['holding', 'empresa', 'filial'].includes(orgType);
  const targetTypes = isCompanyLike
    ? ['departamento', 'equipa', 'divisao', 'projeto']
    : ['holding', 'empresa', 'filial'];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const tTypes = ['holding', 'empresa', 'filial'].includes(orgType)
        ? ['departamento', 'equipa', 'divisao', 'projeto']
        : ['holding', 'empresa', 'filial'];

      // Get all orgs in the same tree (descendants of root)
      const { data: hierarchy } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");

      const allChildIds = new Set<string>();
      const buildDescendants = (parentId: string) => {
        for (const h of (hierarchy || [])) {
          if (h.parent_org_id === parentId && !allChildIds.has(h.child_org_id)) {
            allChildIds.add(h.child_org_id);
            buildDescendants(h.child_org_id);
          }
        }
      };
      allChildIds.add(rootOrgId);
      buildDescendants(rootOrgId);

      // Get orgs of target types within the tree
      const { data: treeOrgs } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name, type")
        .in("id", Array.from(allChildIds))
        .in("type", tTypes)
        .eq("status", "active")
        .order("name");

      // Get existing associations
      const { data: existingAssocs } = await (supabase as any)
        .from("anew_org_associations")
        .select("org_id, associated_org_id")
        .or(`org_id.eq.${orgId},associated_org_id.eq.${orgId}`);

      const associatedIds = new Set<string>();
      for (const a of (existingAssocs || [])) {
        if (a.org_id === orgId) associatedIds.add(a.associated_org_id);
        if (a.associated_org_id === orgId) associatedIds.add(a.org_id);
      }

      const associable = (treeOrgs || [])
        .filter((o: any) => o.id !== orgId)
        .map((o: any) => ({
          id: o.id,
          name: o.name,
          type: o.type,
          isAssociated: associatedIds.has(o.id),
        }));

      setOrgs(associable);
      setSelected(associatedIds);
    } catch (error) {
      console.error("Error loading associations:", error);
    } finally {
      setLoading(false);
    }
  }, [orgId, rootOrgId, orgType]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const handleToggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete all existing associations for this org
      await (supabase as any)
        .from("anew_org_associations")
        .delete()
        .or(`org_id.eq.${orgId},associated_org_id.eq.${orgId}`);

      // Insert new ones
      if (selected.size > 0) {
        const rows = Array.from(selected).map(assocId => ({
          org_id: orgId,
          associated_org_id: assocId,
          association_type: 'cross_functional',
        }));
        const { error } = await (supabase as any)
          .from("anew_org_associations")
          .insert(rows);
        if (error) throw error;
      }

      toast({ title: t('common.success'), description: t('orgChart.associationsSaved') });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const targetLabel = isCompanyLike
    ? t('orgChart.departments')
    : t('orgChart.companies');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t('orgChart.manageAssociations')}
          </DialogTitle>
          <DialogDescription>
            {t('orgChart.associationsDescription', { name: orgName, target: targetLabel })}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t('orgChart.noAssociableOrgs')}
          </p>
        ) : (
          <>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {orgs.map(org => (
                  <label
                    key={org.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selected.has(org.id)}
                      onCheckedChange={() => handleToggle(org.id)}
                    />
                    <span className="text-sm font-medium flex-1">{org.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {getOrgTypeLabel(org.type as OrgType, language)}
                    </Badge>
                  </label>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
