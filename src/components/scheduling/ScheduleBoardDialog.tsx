import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import type { ScheduleBoard, BoardModule } from '@/types/scheduling';

const ALL_MODULES: { value: BoardModule; labelKey: string }[] = [
  { value: 'client', labelKey: 'scheduling.item.client' },
  { value: 'contact', labelKey: 'scheduling.item.contact' },
  { value: 'lead', labelKey: 'scheduling.item.lead' },
  { value: 'location', labelKey: 'scheduling.item.location' },
  { value: 'priority', labelKey: 'scheduling.item.priority' },
  { value: 'resources', labelKey: 'scheduling.item.assignedResources' },
];

interface ScheduleBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board?: ScheduleBoard | null;
  onSave: (data: Partial<ScheduleBoard>) => Promise<void>;
}

export function ScheduleBoardDialog({
  open,
  onOpenChange,
  board,
  onSave,
}: ScheduleBoardDialogProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(false);
  
  const canEdit = board 
    ? hasPermission('scheduling.boards.edit') 
    : hasPermission('scheduling.boards.create');
  
  const isViewOnly = board && !hasPermission('scheduling.boards.edit');
  const isTimeOff = board?.board_type === 'time_off';
  
  const [formData, setFormData] = useState({
    name: board?.name || '',
    description: board?.description || '',
    color: board?.color || '#3b82f6',
  });

  const [allowedModules, setAllowedModules] = useState<BoardModule[]>([]);
  const [autoFillAddress, setAutoFillAddress] = useState(false);
  const [maxDailySlots, setMaxDailySlots] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setFormData({
        name: board?.name || '',
        description: board?.description || '',
        color: board?.color || '#3b82f6',
      });
      const settings = board?.settings as any;
      const modules = settings?.allowed_modules as BoardModule[] | undefined;
      setAllowedModules(modules || ALL_MODULES.map(m => m.value));
      setAutoFillAddress(settings?.auto_fill_address === true);
      setMaxDailySlots(settings?.max_daily_slots ?? null);
    }
  }, [board, open]);

  const toggleModule = (mod: BoardModule) => {
    setAllowedModules(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  };

  const COLORS = useMemo(() => [
    { value: '#3b82f6', label: t('scheduling.board.colorBlue') },
    { value: '#10b981', label: t('scheduling.board.colorGreen') },
    { value: '#f59e0b', label: t('scheduling.board.colorYellow') },
    { value: '#ef4444', label: t('scheduling.board.colorRed') },
    { value: '#8b5cf6', label: t('scheduling.board.colorPurple') },
    { value: '#ec4899', label: t('scheduling.board.colorPink') },
    { value: '#06b6d4', label: t('scheduling.board.colorCyan') },
    { value: '#84cc16', label: t('scheduling.board.colorLime') },
  ], [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || isViewOnly) return;

    setLoading(true);
    try {
      const existingSettings = (board?.settings as Record<string, any>) || {};
      const newSettings = {
        ...existingSettings,
        allowed_modules: allowedModules,
        auto_fill_address: autoFillAddress,
        max_daily_slots: maxDailySlots,
      };
      await onSave({
        ...formData,
        id: board?.id,
        settings: newSettings,
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  if (isViewOnly) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('scheduling.boardDetails')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('scheduling.board.name')}</Label>
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full shrink-0" 
                  style={{ backgroundColor: board.color }}
                />
                <span className="font-medium">{board.name}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('scheduling.board.description')}</Label>
              <p className="text-sm">
                {board.description || t('scheduling.noDescription')}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('scheduling.board.color')}</Label>
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full" 
                  style={{ backgroundColor: board.color }}
                />
                <span className="text-sm">
                  {COLORS.find(c => c.value === board.color)?.label || board.color}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('common.status')}</Label>
              <Badge variant={board.is_active ? 'default' : 'secondary'}>
                {board.is_active ? t('common.active') : t('common.inactive')}
              </Badge>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('common.close')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {board ? t('scheduling.editBoard') : t('scheduling.newBoard')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('scheduling.board.name')} *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
              placeholder={t('scheduling.board.namePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t('scheduling.board.description')}</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
              placeholder={t('scheduling.board.descriptionPlaceholder')}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('scheduling.board.color')}</Label>
            <Select
              value={formData.color}
              onValueChange={(value) => setFormData(f => ({ ...f, color: value }))}
            >
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: formData.color }}
                    />
                    {COLORS.find(c => c.value === formData.color)?.label || t('scheduling.board.color')}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {COLORS.map(color => (
                  <SelectItem key={color.value} value={color.value}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: color.value }}
                      />
                      {color.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Module configuration - only for non-time-off boards */}
          {!isTimeOff && (
            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-semibold">{t('scheduling.board.modules') || 'Módulos do Board'}</Label>
              <p className="text-xs text-muted-foreground">
                {t('scheduling.board.modulesDescription') || 'Selecione quais campos aparecem ao criar agendamentos neste board.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULES.map(mod => (
                  <label key={mod.value} className="flex items-center gap-2 cursor-pointer text-sm p-1.5 rounded hover:bg-accent transition-colors">
                    <Checkbox
                      checked={allowedModules.includes(mod.value)}
                      onCheckedChange={() => toggleModule(mod.value)}
                    />
                    {t(mod.labelKey) || mod.value}
                  </label>
                ))}
              </div>
              <div className="space-y-2 border-t pt-3">
                <Label className="text-sm">{t('scheduling.board.maxDailySlots') || 'Slots máximos por dia'}</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={maxDailySlots ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMaxDailySlots(val === '' ? null : Math.max(1, parseInt(val) || 1));
                  }}
                  placeholder={t('scheduling.board.noLimit') || 'No limit'}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  {t('scheduling.board.maxDailySlotsDescription') || 'Número máximo de agendamentos por dia neste board.'}
                </p>
              </div>
              {allowedModules.includes('client') && (
                <label className="flex items-center gap-2 cursor-pointer text-sm p-1.5 rounded hover:bg-accent transition-colors border-t pt-2">
                  <Checkbox
                    checked={autoFillAddress}
                    onCheckedChange={(checked) => setAutoFillAddress(checked === true)}
                  />
                  {t('scheduling.board.autoFillAddress') || 'Preencher morada automaticamente'}
                </label>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('common.cancel')}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={loading}>
                {board ? t('common.save') : t('common.create')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
