import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'sonner';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';

interface ServiceArea {
  id?: string;
  postal_code_prefix: string;
  priority: number;
  max_distance_km: number | null;
  is_active: boolean;
  _isNew?: boolean;
}

interface ResourceServiceAreasProps {
  resourceId: string | undefined;
  disabled?: boolean;
}

export function ResourceServiceAreas({ resourceId, disabled }: ResourceServiceAreasProps) {
  const { t } = useTranslation();
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resourceId) {
      setAreas([]);
      return;
    }
    loadAreas();
  }, [resourceId]);

  const loadAreas = async () => {
    if (!resourceId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('resource_service_areas')
      .select('id, postal_code_prefix, priority, max_distance_km, is_active')
      .eq('resource_id', resourceId)
      .order('priority', { ascending: false });
    
    if (!error && data) {
      setAreas(data.map(a => ({
        ...a,
        postal_code_prefix: a.postal_code_prefix || '',
        priority: a.priority ?? 1,
        max_distance_km: a.max_distance_km ?? null,
        is_active: a.is_active ?? true,
      })));
    }
    setLoading(false);
  };

  const addArea = () => {
    setAreas(prev => [...prev, {
      postal_code_prefix: '',
      priority: 1,
      max_distance_km: null,
      is_active: true,
      _isNew: true,
    }]);
  };

  const removeArea = async (index: number) => {
    const area = areas[index];
    if (area.id) {
      const { error } = await supabase
        .from('resource_service_areas')
        .delete()
        .eq('id', area.id);
      if (error) {
        toast.error(t('common.error'));
        return;
      }
    }
    setAreas(prev => prev.filter((_, i) => i !== index));
  };

  const updateArea = (index: number, field: keyof ServiceArea, value: any) => {
    setAreas(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  const saveAreas = async () => {
    if (!resourceId) return;
    setLoading(true);

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Business user not resolved');

      for (const area of areas) {
        if (!area.postal_code_prefix.trim()) continue;
        
        const base = {
          resource_id: resourceId,
          postal_code_prefix: area.postal_code_prefix.trim(),
          priority: area.priority,
          max_distance_km: area.max_distance_km,
          is_active: area.is_active,
        };

        if (area.id) {
          await supabase
            .from('resource_service_areas')
            .update(base)
            .eq('id', area.id);
        } else {
          await supabase
            .from('resource_service_areas')
            .insert([{ ...base, created_by: businessUserId }]);
        }
      }
      toast.success(t('common.saved'));
      await loadAreas();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (!resourceId) {
    return (
      <div className="text-sm text-muted-foreground italic">
        {t('scheduling.resource.saveFirstForAreas')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          {t('scheduling.resource.serviceAreas')}
        </Label>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={addArea}>
            <Plus className="h-3 w-3 mr-1" />
            {t('common.add')}
          </Button>
        )}
      </div>

      {areas.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">
          {t('scheduling.resource.noServiceAreas')}
        </p>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {areas.map((area, index) => (
          <div key={area.id || `new-${index}`} className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
            <Input
              className="w-24 h-8 text-sm"
              placeholder="1000"
              value={area.postal_code_prefix}
              onChange={(e) => updateArea(index, 'postal_code_prefix', e.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={disabled}
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">P:</span>
              <Input
                type="number"
                className="w-14 h-8 text-sm"
                min={1}
                max={10}
                value={area.priority}
                onChange={(e) => updateArea(index, 'priority', Number(e.target.value))}
                disabled={disabled}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">km:</span>
              <Input
                type="number"
                className="w-16 h-8 text-sm"
                placeholder="∞"
                value={area.max_distance_km ?? ''}
                onChange={(e) => updateArea(index, 'max_distance_km', e.target.value ? Number(e.target.value) : null)}
                disabled={disabled}
              />
            </div>
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={() => removeArea(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {!disabled && areas.length > 0 && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={saveAreas}
          disabled={loading}
          className="w-full"
        >
          {t('scheduling.resource.saveAreas')}
        </Button>
      )}
    </div>
  );
}
