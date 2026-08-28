import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { useAdministrativeDivisions } from '@/hooks/useAdministrativeDivisions';
import { toast } from '@/lib/toast';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';

interface DistrictCoverage {
  district_id: string;
  priority: number;
  is_active: boolean;
}

interface ResourceServiceAreasProps {
  resourceId: string | undefined;
  disabled?: boolean;
}

/**
 * "Distritos de atuação" — replaces the free-text postal_code_prefix based
 * resource_service_areas UI with a district checklist backed by
 * resource_districts. resource_service_areas stays in the schema untouched,
 * as a fallback, until this new flow is validated in production.
 */
export function ResourceServiceAreas({ resourceId, disabled }: ResourceServiceAreasProps) {
  const { t } = useTranslation();
  const { districts, loading: loadingDistricts } = useAdministrativeDivisions('PT');
  const [coverage, setCoverage] = useState<Map<string, DistrictCoverage>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!resourceId) {
      setCoverage(new Map());
      return;
    }
    loadCoverage();
  }, [resourceId]);

  const loadCoverage = async () => {
    if (!resourceId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('resource_districts')
      .select('district_id, priority, is_active')
      .eq('resource_id', resourceId);

    if (!error && data) {
      setCoverage(new Map(data.map(d => [d.district_id, d])));
    }
    setLoading(false);
  };

  const toggleDistrict = (districtId: string) => {
    setCoverage(prev => {
      const next = new Map(prev);
      if (next.has(districtId)) {
        next.delete(districtId);
      } else {
        next.set(districtId, { district_id: districtId, priority: 1, is_active: true });
      }
      return next;
    });
  };

  const updatePriority = (districtId: string, priority: number) => {
    setCoverage(prev => {
      const existing = prev.get(districtId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(districtId, { ...existing, priority });
      return next;
    });
  };

  const save = async () => {
    if (!resourceId) return;
    setSaving(true);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Business user not resolved');

      const { error: deleteError } = await supabase
        .from('resource_districts')
        .delete()
        .eq('resource_id', resourceId);
      if (deleteError) throw deleteError;

      const rows = Array.from(coverage.values()).map(c => ({
        resource_id: resourceId,
        district_id: c.district_id,
        priority: c.priority,
        is_active: c.is_active,
        created_by: businessUserId,
      }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('resource_districts').insert(rows);
        if (insertError) throw insertError;
      }

      toast.success(t('common.saved'));
      await loadCoverage();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
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
      <Label className="flex items-center gap-1.5">
        <MapPin className="h-4 w-4" />
        Distritos de atuação
      </Label>

      {(loading || loadingDistricts) && (
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      )}

      {!loading && !loadingDistricts && (
        <ScrollArea className="h-48 border rounded-lg p-2">
          <div className="space-y-1.5">
            {districts.map(district => {
              const selected = coverage.get(district.id);
              return (
                <div key={district.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`resource-district-${district.id}`}
                    checked={!!selected}
                    onCheckedChange={() => toggleDistrict(district.id)}
                    disabled={disabled}
                  />
                  <label
                    htmlFor={`resource-district-${district.id}`}
                    className="text-sm flex-1 cursor-pointer"
                  >
                    {district.name}
                  </label>
                  {selected && (
                    <Input
                      type="number"
                      className="w-14 h-7 text-xs"
                      min={1}
                      max={10}
                      value={selected.priority}
                      onChange={(e) => updatePriority(district.id, Number(e.target.value) || 1)}
                      disabled={disabled}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {!disabled && (
        <Button type="button" variant="secondary" size="sm" onClick={save} disabled={saving} className="w-full">
          {t('scheduling.resource.saveAreas')}
        </Button>
      )}
    </div>
  );
}
