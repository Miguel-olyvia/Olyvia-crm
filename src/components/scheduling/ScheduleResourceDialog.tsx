import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import { ResourceServiceAreas } from './ResourceServiceAreas';
import type { ScheduleResource } from '@/types/scheduling';

interface ScheduleResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: ScheduleResource | null;
  employees: { id: string; first_name: string; last_name: string }[];
  users: { id: string; name: string }[];
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
  onSave,
}: ScheduleResourceDialogProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(false);
  
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
      });
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
    if (!formData.name || isViewOnly) return;

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

  // Get user name by ID
  const getUserName = (userId: string) => {
    return users.find(u => u.id === userId)?.name || '-';
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
            />
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
            />
          </div>

          <ResourceServiceAreas resourceId={resource?.id} disabled={isViewOnly} />

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
