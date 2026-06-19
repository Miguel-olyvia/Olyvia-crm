import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Link as LinkIcon } from 'lucide-react';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';

interface OrgChartAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string;
  onSuccess: () => void;
}

export function OrgChartAddDialog({
  open,
  onOpenChange,
  parentId,
  onSuccess,
}: OrgChartAddDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [unlinkedOrgs, setUnlinkedOrgs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (open) {
      setNewName('');
      setSelectedId('');
      loadUnlinkedOrgs();
    }
  }, [open, parentId]);

  const loadUnlinkedOrgs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's visible org IDs via memberships + hierarchy
      const { data: anewUser } = await (supabase as any)
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!anewUser) return;

      const { data: memberships } = await (supabase as any)
        .from("anew_memberships")
        .select("organization_id")
        .eq("user_id", anewUser.id)
        .eq("status", "active");

      const memberOrgIds = new Set((memberships || []).map((m: any) => m.organization_id));

      // Get full hierarchy to resolve descendants
      const { data: hierarchyAll } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");

      const childrenMap: Record<string, string[]> = {};
      const allChildIds = new Set<string>();
      (hierarchyAll || []).forEach((h: any) => {
        allChildIds.add(h.child_org_id);
        if (!childrenMap[h.parent_org_id]) childrenMap[h.parent_org_id] = [];
        childrenMap[h.parent_org_id].push(h.child_org_id);
      });

      // Collect all descendant org IDs from user's membership orgs
      const visibleIds = new Set<string>();
      const collectDescendants = (orgId: string) => {
        visibleIds.add(orgId);
        (childrenMap[orgId] || []).forEach(childId => {
          if (!visibleIds.has(childId)) collectDescendants(childId);
        });
      };
      memberOrgIds.forEach((orgId: string) => collectDescendants(orgId));

      // Exclude orgs already linked as children and the parent itself
      visibleIds.delete(parentId);
      const excludeChildIds = new Set((hierarchyAll || []).map((h: any) => h.child_org_id));

      const visibleArray = Array.from(visibleIds).filter(id => !excludeChildIds.has(id));
      if (visibleArray.length === 0) { setUnlinkedOrgs([]); return; }

      const { data: orgs } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name")
        .eq("status", "active")
        .in("id", visibleArray)
        .order("name");

      setUnlinkedOrgs(orgs || []);
    } catch (error) {
      console.error("Error loading unlinked orgs:", error);
    }
  };

  const handleCreateNew = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Perfil de utilizador não encontrado');

      // Create new org
      const { data: newOrg, error: orgError } = await (supabase as any)
        .from("anew_organizations")
        .insert({ name: newName.trim(), type: 'unit', created_by: businessUserId })
        .select("id")
        .single();

      if (orgError) throw orgError;

      // Create hierarchy relationship
      const { error: hierError } = await (supabase as any)
        .from("anew_hierarchy")
        .insert({ parent_org_id: parentId, child_org_id: newOrg.id, created_by: businessUserId });

      if (hierError) throw hierError;

      toast({ title: t('common.success'), description: t('orgChart.entityAdded') });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleAssociateExisting = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Perfil de utilizador não encontrado');

      const { error } = await (supabase as any)
        .from("anew_hierarchy")
        .insert({ parent_org_id: parentId, child_org_id: selectedId, created_by: businessUserId });

      if (error) throw error;

      toast({ title: t('common.success'), description: t('orgChart.entityAdded') });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('orgChart.addChild')}</DialogTitle>
          <DialogDescription>{t('orgChart.addEntityDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Create New */}
          <div className="space-y-2">
            <Label>{t('orgChart.createNew')}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t('organizations.form.name')}
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <Button onClick={handleCreateNew} disabled={loading || !newName.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                {t('common.create')}
              </Button>
            </div>
          </div>

          {/* Associate Existing */}
          {unlinkedOrgs.length > 0 && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">{t('common.or')}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('orgChart.useExisting')}</Label>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.selectOption')} />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedOrgs.map(org => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAssociateExisting}
                  disabled={loading || !selectedId}
                  variant="outline"
                  className="w-full"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  {loading ? t('common.saving') : t('common.associate')}
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
