import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { scheduleResourceSchema } from '@/lib/validations';
import { ResourceServiceAreas } from './ResourceServiceAreas';
import type { ScheduleResource } from '@/types/scheduling';

interface ScheduleResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: ScheduleResource | null;
  employees: { id: string; first_name: string; last_name: string }[];
  users: { id: string; name: string }[];
  // Full/unscoped roster used only for resolving the display name of an already-assigned
  // user (not a scope violation). Falls back to `users` if not provided.
  allUsers?: { id: string; name: string }[];
  onSave: (data: Partial<ScheduleResource>) => Promise<void>;
}

const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

export function ScheduleResourceDialog({
  open,
  onOpenChange,
  resource,
  employees,
  users,
  allUsers,
  onSave,
}: ScheduleResourceDialogProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canEdit = resource
    ? hasPermission('scheduling.resources.edit') 
    : hasPermission('scheduling.resources.create');
  
  // If viewing an existing resource without edit permission, show view-only mode
  const isViewOnly = resource && !hasPermission('scheduling.resources.edit');
  
  const [formData, setFormData] = useState({
    name: '',
    resource_type: 'user' as ScheduleResource['resource_type'],
    user_id: '',
    employee_id: '',
    color: '#10b981',
    max_daily_capacity: 8,
    is_active: true,
  });

  // Reset form when dialog opens or resource changes
  useEffect(() => {
    if (open) {
      setFormData({
        name: resource?.name || '',
        resource_type: resource?.resource_type || 'user',
        user_id: resource?.user_id || '',
        employee_id: resource?.employee_id || '',
        color: resource?.color || '#10b981',
        max_daily_capacity: resource?.max_daily_capacity || 8,
        // Recursos antigos podem ter a coluna a null; nesse caso contam como
        // activos, que e o que a base assume por omissao.
        is_active: resource?.is_active ?? true,
      });
      setFieldErrors({});
    }
  }, [open, resource]);

  const RESOURCE_TYPES = useMemo(() => [
    { value: 'user', label: t('scheduling.resourceType.user') },
    { value: 'equipment', label: t('scheduling.resourceType.equipment') },
    { value: 'room', label: t('scheduling.resourceType.room') },
    { value: 'vehicle', label: t('scheduling.resourceType.vehicle') },
  ], [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewOnly) return;

    const validation = scheduleResourceSchema.safeParse({
      name: formData.name,
      resource_type: formData.resource_type,
      color: formData.color,
      max_daily_capacity: formData.max_daily_capacity,
    });
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => { if (err.path[0]) errors[err.path[0].toString()] = err.message; });
      setFieldErrors(errors);
      toast({ title: validation.error.errors[0].message, variant: 'destructive' });
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      await onSave({
        ...formData,
        id: resource?.id,
        user_id: formData.user_id || undefined,
        employee_id: formData.employee_id || undefined,
      } as Partial<ScheduleResource>);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  // Get readable type label
  const getTypeLabel = (type: string) => {
    return RESOURCE_TYPES.find(t => t.value === type)?.label || type;
  };

  // Get user name by ID.
  // Uses the full/unscoped roster (`allUsers`) because showing the name of an
  // already-assigned resource is not a scope violation, even if that user falls
  // outside the viewer's own scheduling.items.view scope (`users`).
  const getUserName = (userId: string) => {
    return (allUsers ?? users).find(u => u.id === userId)?.name || '-';
  };

  // Get employee name by ID
  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    return emp ? `${emp.first_name} ${emp.last_name}` : '-';
  };

  // View-only mode for existing resources when user lacks edit permission
  if (isViewOnly) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('scheduling.resourceDetails')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('scheduling.resource.name')}</Label>
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full shrink-0" 
                  style={{ backgroundColor: resource.color }}
                />
                <span className="font-medium">{resource.name}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('scheduling.resource.type')}</Label>
              <Badge variant="outline">{getTypeLabel(resource.resource_type)}</Badge>
            </div>

            {resource.resource_type === 'user' && (
              <>
                {resource.user_id && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">{t('scheduling.resource.systemUser')}</Label>
                    <p className="text-sm">{getUserName(resource.user_id)}</p>
                  </div>
                )}

                {resource.employee_id && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">{t('scheduling.resource.employee')}</Label>
                    <p className="text-sm">{getEmployeeName(resource.employee_id)}</p>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('scheduling.resource.color')}</Label>
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full" 
                  style={{ backgroundColor: resource.color }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('scheduling.resource.dailyCapacity')}</Label>
              <Badge variant="secondary">{resource.max_daily_capacity}h{t('scheduling.perDay')}</Badge>
            </div>

            <ResourceServiceAreas resourceId={resource.id} disabled />

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
            {resource ? t('scheduling.editResource') : t('scheduling.newResource')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('scheduling.resource.name')} *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
              placeholder={t('scheduling.resource.namePlaceholder')}
              required
              className={fieldErrors.name ? 'border-destructive' : ''}
            />
            {fieldErrors.name && <p className="text-sm text-destructive mt-1">{fieldErrors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t('scheduling.resource.type')}</Label>
            <Select
              value={formData.resource_type}
              onValueChange={(value) => setFormData(f => ({ 
                ...f, 
                resource_type: value as ScheduleResource['resource_type'],
                user_id: '',
                employee_id: '',
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.resource_type === 'user' && (
            <>
              <div className="space-y-2">
                <Label>{t('scheduling.resource.systemUser')}</Label>
                <Select
                  value={formData.user_id || 'none'}
                  onValueChange={(value) => setFormData(f => ({ ...f, user_id: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('scheduling.resource.selectUser')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('scheduling.resource.none')}</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('scheduling.resource.employee')}</Label>
                <Select
                  value={formData.employee_id || 'none'}
                  onValueChange={(value) => setFormData(f => ({ ...f, employee_id: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('scheduling.resource.selectEmployee')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('scheduling.resource.none')}</SelectItem>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>{t('scheduling.resource.color')}</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    formData.color === color ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData(f => ({ ...f, color }))}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('scheduling.resource.dailyCapacity')}</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={formData.max_daily_capacity}
              onChange={(e) => setFormData(f => ({ ...f, max_daily_capacity: Number(e.target.value) }))}
              className={fieldErrors.max_daily_capacity ? 'border-destructive' : ''}
            />
            {fieldErrors.max_daily_capacity && <p className="text-sm text-destructive mt-1">{fieldErrors.max_daily_capacity}</p>}
          </div>

          <ResourceServiceAreas resourceId={resource?.id} disabled={isViewOnly} />

          {/* Desactivar em vez de apagar.
              Apagar um recurso e em cascata: leva as atribuicoes dele nas
              visitas, e perde-se o registo de quem fez o que. Para quem sai da
              empresa a saida certa e esta -- o historico fica, e a pessoa
              deixa de aparecer para marcacoes novas. */}
          {resource && canEdit && (
            <div className="flex items-center justify-between">
              <Label htmlFor="resource-active">
                {formData.is_active
                  ? t('scheduling.resourceActive')
                  : t('scheduling.resourceInactive')}
              </Label>
              <Switch
                id="resource-active"
                checked={formData.is_active}
                disabled={loading}
                onCheckedChange={(v) => setFormData(f => ({ ...f, is_active: v }))}
              />
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
                {resource ? t('common.save') : t('common.create')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
