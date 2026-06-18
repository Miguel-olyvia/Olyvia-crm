import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Settings2, Clock, MapPin, Users, Zap, Pencil, Trash2, Loader2 } from 'lucide-react';
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { toast } from 'sonner';
import { AutoScheduleRuleDialog } from './AutoScheduleRuleDialog';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionGate } from '@/components/PermissionGate';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';
import type { ScheduleBoard, ScheduleResource } from '@/types/scheduling';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AutoScheduleRule {
  id: string;
  name: string;
  board_id: string | null;
  organization_id: string | null;
  is_active: boolean | null;
  trigger_type: string;
  trigger_conditions: Record<string, any> | null;
  preferred_resources: string[] | null;
  duration_minutes: number | null;
  buffer_before_minutes: number | null;
  buffer_after_minutes: number | null;
  earliest_time: string | null;
  latest_time: string | null;
  allowed_days: number[] | null;
  strategy: string | null;
  max_items_per_day: number | null;
  respect_capacity: boolean | null;
  priority: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AutoScheduleRulesTabProps {
  companyId?: string;
  boards: ScheduleBoard[];
  resources: ScheduleResource[];
}

export function AutoScheduleRulesTab({ companyId, boards, resources }: AutoScheduleRulesTabProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const [rules, setRules] = useState<AutoScheduleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AutoScheduleRule | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<AutoScheduleRule | null>(null);

  const TRIGGER_TYPE_LABELS: Record<string, string> = {
    on_create: t('scheduling.autoRules.triggerOnCreate'),
    on_status_change: t('scheduling.autoRules.triggerStatusChange'),
    on_date: t('scheduling.autoRules.triggerOnDate'),
    manual: t('scheduling.autoRules.triggerManual'),
  };

  const STRATEGY_LABELS: Record<string, string> = {
    first_available: t('scheduling.autoRules.strategyFirstAvailable'),
    round_robin: t('scheduling.autoRules.strategyRoundRobin'),
    least_busy: t('scheduling.autoRules.strategyLeastBusy'),
    nearest: t('scheduling.autoRules.strategyNearest'),
  };

  const DAY_NAMES = [
    t('scheduling.weekdays.sun'),
    t('scheduling.weekdays.mon'),
    t('scheduling.weekdays.tue'),
    t('scheduling.weekdays.wed'),
    t('scheduling.weekdays.thu'),
    t('scheduling.weekdays.fri'),
    t('scheduling.weekdays.sat'),
  ];

  const fetchRules = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('auto_schedule_rules')
        .select('*')
        .order('priority', { ascending: true });

      if (companyId) {
        query = query.or(`organization_id.eq.${companyId},organization_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRules((data as AutoScheduleRule[]) || []);
    } catch (error) {
      console.error('Error fetching rules:', error);
      toast.error(t('scheduling.autoRules.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [companyId]);

  const handleToggleActive = async (rule: AutoScheduleRule) => {
    try {
      const { error } = await supabase
        .from('auto_schedule_rules')
        .update({ is_active: !rule.is_active })
        .eq('id', rule.id);

      if (error) throw error;

      setRules(prev =>
        prev.map(r => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
      );
      toast.success(rule.is_active ? t('scheduling.autoRules.ruleDeactivated') : t('scheduling.autoRules.ruleActivated'));
    } catch (error) {
      console.error('Error toggling rule:', error);
      toast.error(t('scheduling.autoRules.updateError'));
    }
  };

  const handleDelete = async () => {
    if (!ruleToDelete) return;

    try {
      const { error } = await supabase
        .from('auto_schedule_rules')
        .delete()
        .eq('id', ruleToDelete.id);

      if (error) throw error;

      setRules(prev => prev.filter(r => r.id !== ruleToDelete.id));
      toast.success(t('scheduling.autoRules.ruleDeleted'));
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error(t('scheduling.autoRules.deleteError'));
    } finally {
      setRuleToDelete(null);
    }
  };

  const handleEdit = (rule: AutoScheduleRule) => {
    setSelectedRule(rule);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedRule(null);
    setDialogOpen(true);
  };

  const handleSave = async (data: Partial<AutoScheduleRule>) => {
    try {
      if (data.id) {
        // Update
        const { id, created_at, updated_at, created_by, ...updateData } = data;
        const { error } = await supabase
          .from('auto_schedule_rules')
          .update(updateData)
          .eq('id', id);

        if (error) throw error;
        toast.success(t('scheduling.autoRules.ruleUpdated'));
      } else {
        // Create
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) throw new Error('Business user not resolved');
        const { id, created_at, updated_at, ...insertData } = data as any;
        const { error } = await supabase
          .from('auto_schedule_rules')
          .insert([{
            ...insertData,
            created_by: businessUserId,
            organization_id: companyId,
          }]);

        if (error) throw error;
        toast.success(t('scheduling.autoRules.ruleCreated'));
      }

      fetchRules();
      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving rule:', error);
      toast.error(t('scheduling.autoRules.saveError'));
    }
  };

  const getBoardName = (boardId: string | null) => {
    if (!boardId) return t('scheduling.allBoards');
    const board = boards.find(b => b.id === boardId);
    if (!board) return t('scheduling.autoRules.boardNotFound');
    return board.name_key ? t(board.name_key) : board.name;
  };

  const getPreferredResourceNames = (resourceIds: string[] | null) => {
    if (!resourceIds || resourceIds.length === 0) return null;
    return resourceIds
      .map(id => resources.find(r => r.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <OlyviaLoader size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">{t('scheduling.autoRules.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('scheduling.autoRules.subtitle')}
          </p>
        </div>
        <PermissionGate permission="scheduling.rules.create">
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-2" />
            {t('scheduling.autoRules.newRule')}
          </Button>
        </PermissionGate>
      </div>

      <div className="grid gap-4">
        {rules.map(rule => (
          <Card key={rule.id} className={!rule.is_active ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Settings2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{rule.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {getBoardName(rule.board_id)}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasPermission('scheduling.rules.edit') && (
                    <Switch
                      checked={rule.is_active ?? false}
                      onCheckedChange={() => handleToggleActive(rule)}
                    />
                  )}
                  {hasPermission('scheduling.rules.edit') && (
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {hasPermission('scheduling.rules.delete') && (
                    <Button variant="ghost" size="icon" onClick={() => setRuleToDelete(rule)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {TRIGGER_TYPE_LABELS[rule.trigger_type] || rule.trigger_type}
                </Badge>

                {rule.strategy && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {STRATEGY_LABELS[rule.strategy] || rule.strategy}
                  </Badge>
                )}

                {rule.duration_minutes && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {rule.duration_minutes} min
                  </Badge>
                )}

                {rule.earliest_time && rule.latest_time && (
                  <Badge variant="secondary">
                    {rule.earliest_time} - {rule.latest_time}
                  </Badge>
                )}

                {rule.allowed_days && rule.allowed_days.length > 0 && rule.allowed_days.length < 7 && (
                  <Badge variant="secondary">
                    {rule.allowed_days.map(d => DAY_NAMES[d]).join(', ')}
                  </Badge>
                )}

                {rule.preferred_resources && rule.preferred_resources.length > 0 && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {t('scheduling.autoRules.resources', { count: rule.preferred_resources.length })}
                  </Badge>
                )}

                {rule.max_items_per_day && (
                  <Badge variant="secondary">
                    {t('scheduling.autoRules.maxPerDay', { count: rule.max_items_per_day })}
                  </Badge>
                )}

                {rule.priority !== null && rule.priority !== 0 && (
                  <Badge variant="outline">
                    {t('scheduling.autoRules.priority')}: {rule.priority}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {rules.length === 0 && (
          <Card className="p-8 text-center">
            <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('scheduling.autoRules.noRules')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('scheduling.autoRules.noRulesDescription')}
            </p>
            <PermissionGate permission="scheduling.rules.create">
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                {t('scheduling.autoRules.createRule')}
              </Button>
            </PermissionGate>
          </Card>
        )}
      </div>

      <AutoScheduleRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rule={selectedRule}
        boards={boards}
        resources={resources}
        onSave={handleSave}
      />

      <AlertDialog open={!!ruleToDelete} onOpenChange={(open) => !open && setRuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scheduling.autoRules.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('scheduling.autoRules.deleteConfirm', { name: ruleToDelete?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {t('scheduling.autoRules.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}