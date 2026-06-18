import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import type { ScheduleBoard, ScheduleResource } from '@/types/scheduling';

interface AutoScheduleRuleForm {
  id?: string;
  name: string;
  board_id: string | null;
  is_active: boolean;
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
}

interface AutoScheduleRuleData {
  id?: string;
  name: string;
  board_id: string | null;
  is_active: boolean | null;
  trigger_type: string;
  trigger_conditions?: any;
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
  [key: string]: any;
}

interface AutoScheduleRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AutoScheduleRuleData | null;
  boards: ScheduleBoard[];
  resources: ScheduleResource[];
  onSave: (data: Partial<AutoScheduleRuleData>) => void;
}

export function AutoScheduleRuleDialog({
  open,
  onOpenChange,
  rule,
  boards,
  resources,
  onSave,
}: AutoScheduleRuleDialogProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  
  const canSave = rule 
    ? hasPermission('scheduling.rules.edit') 
    : hasPermission('scheduling.rules.create');
  
  const DAYS = [
    { value: 0, label: t('scheduling.weekdays.sun') },
    { value: 1, label: t('scheduling.weekdays.mon') },
    { value: 2, label: t('scheduling.weekdays.tue') },
    { value: 3, label: t('scheduling.weekdays.wed') },
    { value: 4, label: t('scheduling.weekdays.thu') },
    { value: 5, label: t('scheduling.weekdays.fri') },
    { value: 6, label: t('scheduling.weekdays.sat') },
  ];

  const [formData, setFormData] = useState<AutoScheduleRuleForm>({
    name: '',
    board_id: null,
    is_active: true,
    trigger_type: 'manual',
    trigger_conditions: null,
    preferred_resources: [],
    duration_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    earliest_time: '09:00',
    latest_time: '18:00',
    allowed_days: [1, 2, 3, 4, 5],
    strategy: 'nearest',
    max_items_per_day: null,
    respect_capacity: true,
    priority: 0,
  });

  useEffect(() => {
    if (rule) {
      setFormData({
        ...rule,
        is_active: rule.is_active ?? true,
        trigger_conditions: rule.trigger_conditions || null,
        preferred_resources: rule.preferred_resources || [],
        allowed_days: rule.allowed_days || [1, 2, 3, 4, 5],
      });
    } else {
      setFormData({
        name: '',
        board_id: null,
        is_active: true,
        trigger_type: 'manual',
        trigger_conditions: null,
        preferred_resources: [],
        duration_minutes: 60,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        earliest_time: '09:00',
        latest_time: '18:00',
        allowed_days: [1, 2, 3, 4, 5],
        strategy: 'nearest',
        max_items_per_day: null,
        respect_capacity: true,
        priority: 0,
      });
    }
  }, [rule, open]);

  const handleDayToggle = (day: number) => {
    const currentDays = formData.allowed_days || [];
    if (currentDays.includes(day)) {
      setFormData(prev => ({
        ...prev,
        allowed_days: currentDays.filter(d => d !== day),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        allowed_days: [...currentDays, day].sort(),
      }));
    }
  };

  const handleResourceToggle = (resourceId: string) => {
    const currentResources = formData.preferred_resources || [];
    if (currentResources.includes(resourceId)) {
      setFormData(prev => ({
        ...prev,
        preferred_resources: currentResources.filter(r => r !== resourceId),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        preferred_resources: [...currentResources, resourceId],
      }));
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    onSave({
      ...formData,
      id: rule?.id,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule ? t('scheduling.autoRules.editRule') : t('scheduling.autoRules.newRule')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">{t('scheduling.autoRules.ruleName')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('scheduling.autoRules.ruleNamePlaceholder')}
                />
              </div>

              <div>
                <Label htmlFor="board">{t('scheduling.autoRules.boardOptional')}</Label>
                <Select
                  value={formData.board_id || 'all'}
                  onValueChange={v => setFormData(prev => ({ ...prev, board_id: v === 'all' ? null : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('scheduling.allBoards')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('scheduling.allBoards')}</SelectItem>
                    {boards.map(board => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name_key ? t(board.name_key) : board.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">{t('scheduling.autoRules.priority')}</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority || 0}
                  onChange={e => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Trigger */}
            <div className="space-y-3">
              <Label>{t('scheduling.autoRules.trigger')}</Label>
              <Select
                value={formData.trigger_type}
                onValueChange={v => setFormData(prev => ({ ...prev, trigger_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t('scheduling.autoRules.triggerManualDesc')}</SelectItem>
                  <SelectItem value="on_create">{t('scheduling.autoRules.triggerOnCreateDesc')}</SelectItem>
                  <SelectItem value="on_status_change">{t('scheduling.autoRules.triggerStatusChangeDesc')}</SelectItem>
                  <SelectItem value="on_date">{t('scheduling.autoRules.triggerOnDateDesc')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Strategy */}
            <div className="space-y-3">
              <Label>{t('scheduling.autoRules.selectionStrategy')}</Label>
              <Select
                value={formData.strategy || 'nearest'}
                onValueChange={v => setFormData(prev => ({ ...prev, strategy: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nearest">{t('scheduling.autoRules.nearestGoogleMaps')}</SelectItem>
                  <SelectItem value="first_available">{t('scheduling.autoRules.strategyFirstAvailable')}</SelectItem>
                  <SelectItem value="round_robin">{t('scheduling.autoRules.strategyRoundRobin')}</SelectItem>
                  <SelectItem value="least_busy">{t('scheduling.autoRules.strategyLeastBusy')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time Settings */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="duration">{t('scheduling.autoRules.duration')}</Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.duration_minutes || 60}
                  onChange={e => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 60 }))}
                />
              </div>
              <div>
                <Label htmlFor="earliest">{t('scheduling.autoRules.timeWindow')}</Label>
                <Input
                  id="earliest"
                  type="time"
                  value={formData.earliest_time || '09:00'}
                  onChange={e => setFormData(prev => ({ ...prev, earliest_time: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="latest">&nbsp;</Label>
                <Input
                  id="latest"
                  type="time"
                  value={formData.latest_time || '18:00'}
                  onChange={e => setFormData(prev => ({ ...prev, latest_time: e.target.value }))}
                />
              </div>
            </div>

            {/* Buffer Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="buffer_before">{t('scheduling.autoRules.bufferBefore')}</Label>
                <Input
                  id="buffer_before"
                  type="number"
                  value={formData.buffer_before_minutes || 0}
                  onChange={e => setFormData(prev => ({ ...prev, buffer_before_minutes: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="buffer_after">{t('scheduling.autoRules.bufferAfter')}</Label>
                <Input
                  id="buffer_after"
                  type="number"
                  value={formData.buffer_after_minutes || 0}
                  onChange={e => setFormData(prev => ({ ...prev, buffer_after_minutes: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Allowed Days */}
            <div className="space-y-3">
              <Label>{t('scheduling.autoRules.allowedDays')}</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(day => (
                  <div
                    key={day.value}
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={formData.allowed_days?.includes(day.value)}
                      onCheckedChange={() => handleDayToggle(day.value)}
                    />
                    <Label htmlFor={`day-${day.value}`} className="text-sm cursor-pointer">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Preferred Resources */}
            <div className="space-y-3">
              <Label>{t('scheduling.autoRules.preferredResources')}</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                {resources.map(resource => (
                  <div key={resource.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`resource-${resource.id}`}
                      checked={formData.preferred_resources?.includes(resource.id)}
                      onCheckedChange={() => handleResourceToggle(resource.id)}
                    />
                    <Label htmlFor={`resource-${resource.id}`} className="text-sm cursor-pointer">
                      {resource.name}
                    </Label>
                  </div>
                ))}
                {resources.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-2">
                    {t('scheduling.autoRules.allResources')}
                  </p>
                )}
              </div>
            </div>

            {/* Capacity Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="max_items">{t('scheduling.autoRules.maxItemsPerDay')}</Label>
                <Input
                  id="max_items"
                  type="number"
                  value={formData.max_items_per_day || ''}
                  onChange={e => setFormData(prev => ({ 
                    ...prev, 
                    max_items_per_day: e.target.value ? parseInt(e.target.value) : null 
                  }))}
                  placeholder={t('scheduling.autoRules.noLimit')}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  id="respect_capacity"
                  checked={formData.respect_capacity ?? true}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, respect_capacity: v }))}
                />
                <Label htmlFor="respect_capacity">{t('scheduling.autoRules.respectCapacity')}</Label>
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={v => setFormData(prev => ({ ...prev, is_active: v }))}
              />
              <Label htmlFor="is_active">{t('scheduling.autoRules.ruleActive')}</Label>
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('scheduling.autoRules.cancel')}
          </Button>
          {canSave && (
            <Button onClick={handleSubmit} disabled={!formData.name.trim()}>
              {rule ? t('scheduling.autoRules.save') : t('scheduling.autoRules.createRule')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
