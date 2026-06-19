import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Save, Search } from "lucide-react";
import { getOrgTypeLabel, OrgType } from "@/components/orgchart/OrgChartCard";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface OrgAssociationsTabProps {
  orgId: string;
  orgName: string;
  orgType: string;
  canManage: boolean;
}

interface AssociableOrg {
  id: string;
  name: string;
  type: string;
  isAssociated: boolean;
}

export function OrgAssociationsTab({ orgId, orgName, orgType, canManage }: OrgAssociationsTabProps) {
  const { t, language } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgs, setOrgs] = useState<AssociableOrg[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialSelected, setInitialSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const isCompanyLike = ['holding', 'empresa', 'filial'].includes(orgType?.toLowerCase());
  const targetTypes = isCompanyLike
    ? ['departamento', 'equipa', 'divisao', 'projeto']
    : ['holding', 'empresa', 'filial'];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Find root org
      const { data: hierarchy } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");

      // Find root by traversing up
      let rootId = orgId;
      const parentMap = new Map<string, string>();
      for (const h of (hierarchy || [])) {
        parentMap.set(h.child_org_id, h.parent_org_id);
      }
      while (parentMap.has(rootId)) {
        rootId = parentMap.get(rootId)!;
      }

      // Get all descendants of root
      const allChildIds = new Set<string>();
      allChildIds.add(rootId);
      const buildDescendants = (parentId: string) => {
        for (const h of (hierarchy || [])) {
          if (h.parent_org_id === parentId && !allChildIds.has(h.child_org_id)) {
            allChildIds.add(h.child_org_id);
            buildDescendants(h.child_org_id);
          }
        }
      };
      buildDescendants(rootId);

      // Get orgs of target types within the tree
      const { data: treeOrgs } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name, type")
        .in("id", Array.from(allChildIds))
        .in("type", targetTypes)
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
      setSelected(new Set(associatedIds));
      setInitialSelected(new Set(associatedIds));
    } catch (error) {
      console.error("Error loading associations:", error);
    } finally {
      setLoading(false);
    }
  }, [orgId, orgType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = (id: string) => {
    if (!canManage) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasChanges = (() => {
    if (selected.size !== initialSelected.size) return true;
    for (const id of selected) {
      if (!initialSelected.has(id)) return true;
    }
    return false;
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      await (supabase as any)
        .from("anew_org_associations")
        .delete()
        .or(`org_id.eq.${orgId},associated_org_id.eq.${orgId}`);

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

      toast.success(t('orgChart.associationsSaved'));
      setInitialSelected(new Set(selected));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredOrgs = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  // Group by type
  const grouped = filteredOrgs.reduce<Record<string, AssociableOrg[]>>((acc, org) => {
    const key = org.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(org);
    return acc;
  }, {});

  const typeOrder = ['departamento', 'divisao', 'equipa', 'projeto', 'holding', 'empresa', 'filial'];
  const sortedTypes = Object.keys(grouped).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));

  const targetLabel = isCompanyLike
    ? t('orgChart.departments')
    : t('orgChart.companies');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("organizations.relations")}
          </CardTitle>
          <CardDescription>
            {t('orgChart.associationsDescription', { name: orgName, target: targetLabel })}
          </CardDescription>
        </div>
        {canManage && hasChanges && (
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="w-4 h-4 mr-2" />
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {t('orgChart.noAssociableOrgs')}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{selected.size} {t('common.selected')}</span>
              <span>·</span>
              <span>{orgs.length} {t('common.available')}</span>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-6">
                {sortedTypes.map(type => (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs font-medium">
                        {getOrgTypeLabel(type as OrgType, language)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({grouped[type].filter(o => selected.has(o.id)).length}/{grouped[type].length})
                      </span>
                    </div>
                    <div className="space-y-1">
                      {grouped[type].map(org => (
                        <label
                          key={org.id}
                          className={cn(
                            "flex items-center gap-3 p-2.5 rounded-lg transition-colors",
                            canManage ? "hover:bg-muted/50 cursor-pointer" : "cursor-default",
                            selected.has(org.id) && "bg-primary/5"
                          )}
                        >
                          <Checkbox
                            checked={selected.has(org.id)}
                            onCheckedChange={() => handleToggle(org.id)}
                            disabled={!canManage}
                          />
                          <span className="text-sm font-medium flex-1">{org.name}</span>
                          {selected.has(org.id) && (
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                              {t('common.linked')}
                            </Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
