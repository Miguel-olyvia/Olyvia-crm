import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';

export interface ScheduleSettings {
  id: string;
  organization_id: string | null;
  country_code: string;
  timezone: string;
  week_starts_on: number;
  weekend_color: string;
  holiday_color: string;
  show_weekends: boolean;
  show_holidays: boolean;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
}

export interface ScheduleHoliday {
  id: string;
  country_code: string;
  organization_id: string | null;
  name: string;
  holiday_date: string;
  is_recurring: boolean;
  is_custom: boolean;
}

const DEFAULT_SETTINGS: Omit<ScheduleSettings, 'id' | 'organization_id'> = {
  country_code: 'PT',
  timezone: 'Europe/Lisbon',
  week_starts_on: 1,
  weekend_color: '#f3f4f6',
  holiday_color: '#fef3c7',
  show_weekends: true,
  show_holidays: true,
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  working_days: [1, 2, 3, 4, 5],
};

export function useScheduleSettings(companyId?: string) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [holidays, setHolidays] = useState<ScheduleHoliday[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!companyId) return;
    
    try {
      const { data, error } = await supabase
        .from('schedule_settings')
        .select('*')
        .eq('organization_id', companyId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setSettings(data as ScheduleSettings);
      } else {
        // Return default settings if none exist (id empty means needs insert)
        setSettings({
          id: '',
          organization_id: companyId || null,
          ...DEFAULT_SETTINGS,
        });
      }
    } catch (error) {
      console.error('Error fetching schedule settings:', error);
    }
  }, [companyId]);

  const fetchHolidays = useCallback(async (countryCode: string) => {
    try {
      console.log('Fetching holidays for country:', countryCode);
      
      // Fetch from external API via edge function
      const { data, error } = await supabase.functions.invoke('fetch-holidays', {
        body: { countryCode, year: new Date().getFullYear() }
      });

      if (error) {
        console.error('Error fetching holidays from API:', error);
        // Fallback to database holidays
        const { data: dbHolidays } = await supabase
          .from('schedule_holidays')
          .select('*')
          .or(`country_code.eq.${countryCode},organization_id.eq.${companyId}`)
          .order('holiday_date');
        setHolidays((dbHolidays || []) as ScheduleHoliday[]);
        return;
      }

      if (data?.holidays) {
        console.log('Received holidays:', data.holidays.length);
        // Combine API holidays with custom company holidays from database
        const { data: customHolidays } = await supabase
          .from('schedule_holidays')
          .select('*')
          .eq('organization_id', companyId)
          .eq('is_custom', true);

        const apiHolidays = data.holidays.map((h: any) => ({
          id: `api-${h.holiday_date}-${h.name}`,
          ...h,
        }));

        const allHolidays = [...apiHolidays, ...(customHolidays || [])];
        setHolidays(allHolidays as ScheduleHoliday[]);
      }
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  }, [companyId]);

  const saveSettings = useCallback(async (newSettings: Partial<ScheduleSettings>) => {
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Business user not resolved');

      // Check if settings exist (id is not empty string)
      if (settings?.id && settings.id !== '') {
        // Update existing
        const { error } = await supabase
          .from('schedule_settings')
          .update(newSettings)
          .eq('id', settings.id);

        if (error) throw error;
        setSettings(prev => prev ? { ...prev, ...newSettings } : null);
      } else {
        // Create new - exclude 'id' field to let DB generate it
        const { id, ...settingsWithoutId } = newSettings as Partial<ScheduleSettings> & { id?: string };
        const { data, error } = await supabase
          .from('schedule_settings')
          .insert({
            ...DEFAULT_SETTINGS,
            ...settingsWithoutId,
            organization_id: companyId,
            created_by: businessUserId,
          })
          .select()
          .single();

        if (error) throw error;
        setSettings(data as ScheduleSettings);
      }

      toast.success(t('scheduling.settings.saveSuccess'));
      
      // Refetch holidays if country changed
      if (newSettings.country_code) {
        await fetchHolidays(newSettings.country_code);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(t('scheduling.settings.saveError'));
    }
  }, [settings, companyId, fetchHolidays, t]);

  const addHoliday = useCallback(async (holiday: Omit<ScheduleHoliday, 'id' | 'organization_id'>) => {
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Business user not resolved');

      const { data, error } = await supabase
        .from('schedule_holidays')
        .insert({
          ...holiday,
          organization_id: companyId,
          is_custom: true,
          created_by: businessUserId,
        })
        .select()
        .single();

      if (error) throw error;
      setHolidays(prev => [...prev, data as ScheduleHoliday]);
      toast.success(t('scheduling.settings.holidayAdded'));
    } catch (error) {
      console.error('Error adding holiday:', error);
      toast.error(t('scheduling.settings.holidayAddError'));
    }
  }, [companyId, t]);

  const deleteHoliday = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('schedule_holidays')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setHolidays(prev => prev.filter(h => h.id !== id));
      toast.success(t('scheduling.settings.holidayRemoved'));
    } catch (error) {
      console.error('Error deleting holiday:', error);
      toast.error(t('scheduling.settings.holidayRemoveError'));
    }
  }, [t]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchSettings();
      setLoading(false);
    };
    load();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings?.country_code) {
      fetchHolidays(settings.country_code);
    }
  }, [settings?.country_code, fetchHolidays]);

  return {
    settings,
    holidays,
    loading,
    saveSettings,
    addHoliday,
    deleteHoliday,
    refetch: fetchSettings,
  };
}
