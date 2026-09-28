import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useScheduleSettings, ScheduleSettings, ScheduleHoliday } from '@/hooks/useScheduleSettings';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { scheduleSettingsSchema, scheduleHolidaySchema } from '@/lib/validations';
import { format } from 'date-fns';
import { enUS, pt, es, fr, de } from 'date-fns/locale';

interface ScheduleSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
}

export function ScheduleSettingsDialog({ open, onOpenChange, companyId }: ScheduleSettingsDialogProps) {
  const { t, language } = useTranslation();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const { settings, holidays, loading, saveSettings, addHoliday, deleteHoliday } = useScheduleSettings(companyId);

  const canEditSettings = hasPermission('scheduling.settings');

  const [formData, setFormData] = useState<Partial<ScheduleSettings>>({});
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [holidayErrors, setHolidayErrors] = useState<Record<string, string>>({});
  const [lunchEnabled, setLunchEnabled] = useState(false);

  const locale = useMemo(() => {
    const locales: Record<string, typeof enUS> = { en: enUS, pt, es, fr, de };
    return locales[language] || enUS;
  }, [language]);

  const COUNTRIES = useMemo(() => [
    { code: 'PT', name: t('scheduling.settings.countryPortugal'), timezone: 'Europe/Lisbon' },
    { code: 'ES', name: t('scheduling.settings.countrySpain'), timezone: 'Europe/Madrid' },
    { code: 'FR', name: t('scheduling.settings.countryFrance'), timezone: 'Europe/Paris' },
    { code: 'DE', name: t('scheduling.settings.countryGermany'), timezone: 'Europe/Berlin' },
    { code: 'GB', name: t('scheduling.settings.countryUK'), timezone: 'Europe/London' },
    { code: 'IT', name: t('scheduling.settings.countryItaly'), timezone: 'Europe/Rome' },
    { code: 'BR', name: t('scheduling.settings.countryBrazil'), timezone: 'America/Sao_Paulo' },
    { code: 'US', name: t('scheduling.settings.countryUSA'), timezone: 'America/New_York' },
  ], [t]);

  const DAYS_OF_WEEK = useMemo(() => [
    { value: 0, label: t('scheduling.settings.sunday') },
    { value: 1, label: t('scheduling.settings.monday') },
    { value: 2, label: t('scheduling.settings.tuesday') },
    { value: 3, label: t('scheduling.settings.wednesday') },
    { value: 4, label: t('scheduling.settings.thursday') },
    { value: 5, label: t('scheduling.settings.friday') },
    { value: 6, label: t('scheduling.settings.saturday') },
  ], [t]);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
      setLunchEnabled(
        settings.lunch_window_start != null
        && settings.lunch_window_end != null
        && settings.lunch_duration_minutes != null
      );
    }
  }, [settings]);

  const handleSave = async () => {
    const lunch = lunchEnabled
      ? {
          lunch_window_start: formData.lunch_window_start || null,
          lunch_window_end: formData.lunch_window_end || null,
          lunch_duration_minutes: formData.lunch_duration_minutes ?? null,
        }
      : {
          lunch_window_start: null,
          lunch_window_end: null,
          lunch_duration_minutes: null,
        };

    // The toggle is UI-only state, invisible to the schema: with it on but a
    // field left empty, the "all-or-none" refine below sees zero fields
    // filled and passes silently, saving the toggle as if it had never been
    // turned on. Catch that here, before it ever reaches the schema.
    if (lunchEnabled && (lunch.lunch_window_start === null || lunch.lunch_window_end === null || lunch.lunch_duration_minutes === null)) {
      const missingField = lunch.lunch_window_start === null
        ? 'lunch_window_start'
        : lunch.lunch_window_end === null
          ? 'lunch_window_end'
          : 'lunch_duration_minutes';
      setFieldErrors({ [missingField]: t('scheduling.settings.lunchBreakIncomplete') });
      toast({ title: t('scheduling.settings.lunchBreakIncomplete'), variant: 'destructive' });
      return;
    }

    const validation = scheduleSettingsSchema.safeParse({
      country_code: formData.country_code || 'PT',
      timezone: formData.timezone || '',
      week_starts_on: formData.week_starts_on ?? 1,
      working_hours_start: formData.working_hours_start || '09:00',
      working_hours_end: formData.working_hours_end || '18:00',
      working_days: formData.working_days || [1, 2, 3, 4, 5],
      weekend_color: formData.weekend_color || '#f3f4f6',
      holiday_color: formData.holiday_color || '#fef3c7',
      show_weekends: formData.show_weekends ?? true,
      show_holidays: formData.show_holidays ?? true,
      notify_client_on_reschedule: formData.notify_client_on_reschedule ?? false,
      notify_client_on_reassign: formData.notify_client_on_reassign ?? false,
      ...lunch,
    });
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => { if (err.path[0]) errors[err.path[0].toString()] = err.message; });
      setFieldErrors(errors);
      toast({ title: validation.error.errors[0].message, variant: 'destructive' });
      return;
    }
    setFieldErrors({});

    setSaving(true);
    await saveSettings({ ...formData, ...lunch });
    setSaving(false);
    onOpenChange(false);
  };

  const handleCountryChange = (code: string) => {
    const country = COUNTRIES.find(c => c.code === code);
    setFormData(prev => ({
      ...prev,
      country_code: code,
      timezone: country?.timezone || prev.timezone,
    }));
  };

  const handleWorkingDayToggle = (day: number) => {
    setFormData(prev => {
      const current = prev.working_days || [1, 2, 3, 4, 5];
      const updated = current.includes(day)
        ? current.filter(d => d !== day)
        : [...current, day].sort();
      return { ...prev, working_days: updated };
    });
  };

  const handleAddHoliday = async () => {
    const validation = scheduleHolidaySchema.safeParse({
      name: newHoliday.name,
      holiday_date: newHoliday.date,
    });
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => { if (err.path[0]) errors[err.path[0].toString()] = err.message; });
      setHolidayErrors(errors);
      toast({ title: validation.error.errors[0].message, variant: 'destructive' });
      return;
    }
    setHolidayErrors({});

    await addHoliday({
      name: newHoliday.name,
      holiday_date: newHoliday.date,
      country_code: formData.country_code || 'PT',
      is_recurring: false,
      is_custom: true,
    });
    setNewHoliday({ name: '', date: '' });
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <OlyviaLoader size={40} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('scheduling.settings.title')}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">{t('scheduling.settings.general')}</TabsTrigger>
            <TabsTrigger value="working">{t('scheduling.settings.working')}</TabsTrigger>
            <TabsTrigger value="holidays">{t('scheduling.settings.holidays')}</TabsTrigger>
            <TabsTrigger value="notifications">{t('scheduling.settings.notifications')}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('scheduling.settings.country')}</Label>
                <Select
                  value={formData.country_code || 'PT'}
                  onValueChange={handleCountryChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(country => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('scheduling.settings.timezone')}</Label>
                <Input
                  value={formData.timezone || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                  placeholder="Europe/Lisbon"
                  className={fieldErrors.timezone ? 'border-destructive' : ''}
                />
                {fieldErrors.timezone && <p className="text-sm text-destructive mt-1">{fieldErrors.timezone}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('scheduling.settings.weekStartsOn')}</Label>
              <Select
                value={String(formData.week_starts_on ?? 1)}
                onValueChange={(v) => setFormData(prev => ({ ...prev, week_starts_on: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t('scheduling.settings.sunday')}</SelectItem>
                  <SelectItem value="1">{t('scheduling.settings.monday')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('scheduling.settings.weekendColor')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={formData.weekend_color || '#f3f4f6'}
                    onChange={(e) => setFormData(prev => ({ ...prev, weekend_color: e.target.value }))}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={formData.weekend_color || '#f3f4f6'}
                    onChange={(e) => setFormData(prev => ({ ...prev, weekend_color: e.target.value }))}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('scheduling.settings.holidayColor')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={formData.holiday_color || '#fef3c7'}
                    onChange={(e) => setFormData(prev => ({ ...prev, holiday_color: e.target.value }))}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={formData.holiday_color || '#fef3c7'}
                    onChange={(e) => setFormData(prev => ({ ...prev, holiday_color: e.target.value }))}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>{t('scheduling.settings.showWeekends')}</Label>
              <Switch
                checked={formData.show_weekends ?? true}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, show_weekends: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>{t('scheduling.settings.highlightHolidays')}</Label>
              <Switch
                checked={formData.show_holidays ?? true}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, show_holidays: v }))}
              />
            </div>
          </TabsContent>

          <TabsContent value="working" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('scheduling.settings.startTime')}</Label>
                <Input
                  type="time"
                  value={formData.working_hours_start || '09:00'}
                  onChange={(e) => setFormData(prev => ({ ...prev, working_hours_start: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('scheduling.settings.endTime')}</Label>
                <Input
                  type="time"
                  value={formData.working_hours_end || '18:00'}
                  onChange={(e) => setFormData(prev => ({ ...prev, working_hours_end: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('scheduling.settings.workingDays')}</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <Badge
                    key={day.value}
                    variant={(formData.working_days || [1, 2, 3, 4, 5]).includes(day.value) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => handleWorkingDayToggle(day.value)}
                  >
                    {day.label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('scheduling.settings.clickToToggle')}
              </p>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label className="text-base">{t('scheduling.settings.lunchBreak')}</Label>
              <div className="flex items-center justify-between">
                <Label htmlFor="lunch-break-toggle">{t('scheduling.settings.lunchBreakToggle')}</Label>
                <Switch
                  id="lunch-break-toggle"
                  checked={lunchEnabled}
                  onCheckedChange={setLunchEnabled}
                  disabled={!canEditSettings}
                />
              </div>
              {lunchEnabled && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>{t('scheduling.settings.lunchWindowStart')}</Label>
                      <Input
                        type="time"
                        value={formData.lunch_window_start || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, lunch_window_start: e.target.value }))}
                        className={fieldErrors.lunch_window_start ? 'border-destructive' : ''}
                      />
                      {fieldErrors.lunch_window_start && <p className="text-sm text-destructive mt-1">{fieldErrors.lunch_window_start}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label>{t('scheduling.settings.lunchWindowEnd')}</Label>
                      <Input
                        type="time"
                        value={formData.lunch_window_end || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, lunch_window_end: e.target.value }))}
                        className={fieldErrors.lunch_window_end ? 'border-destructive' : ''}
                      />
                      {fieldErrors.lunch_window_end && <p className="text-sm text-destructive mt-1">{fieldErrors.lunch_window_end}</p>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('scheduling.settings.lunchDuration')}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={240}
                      value={formData.lunch_duration_minutes ?? ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        lunch_duration_minutes: e.target.value === '' ? null : Number(e.target.value),
                      }))}
                      className={fieldErrors.lunch_duration_minutes ? 'border-destructive' : ''}
                    />
                    {fieldErrors.lunch_duration_minutes && <p className="text-sm text-destructive mt-1">{fieldErrors.lunch_duration_minutes}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('scheduling.settings.lunchBreakHelp')}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="holidays" className="space-y-4 mt-4">
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  placeholder={t('scheduling.settings.holidayName')}
                  value={newHoliday.name}
                  onChange={(e) => setNewHoliday(prev => ({ ...prev, name: e.target.value }))}
                  className={holidayErrors.name ? 'border-destructive' : ''}
                />
                {holidayErrors.name && <p className="text-sm text-destructive mt-1">{holidayErrors.name}</p>}
              </div>
              <div>
                <Input
                  type="date"
                  value={newHoliday.date}
                  onChange={(e) => setNewHoliday(prev => ({ ...prev, date: e.target.value }))}
                  className={`w-40 ${holidayErrors.holiday_date ? 'border-destructive' : ''}`}
                />
                {holidayErrors.holiday_date && <p className="text-sm text-destructive mt-1">{holidayErrors.holiday_date}</p>}
              </div>
              {canEditSettings && (
                <Button onClick={handleAddHoliday} disabled={!newHoliday.name || !newHoliday.date}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('scheduling.settings.date')}</TableHead>
                  <TableHead>{t('scheduling.settings.name')}</TableHead>
                  <TableHead>{t('scheduling.settings.type')}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map(holiday => (
                  <TableRow key={holiday.id}>
                    <TableCell>
                      {format(new Date(holiday.holiday_date), 'dd MMM yyyy', { locale })}
                    </TableCell>
                    <TableCell>{holiday.name}</TableCell>
                    <TableCell>
                      <Badge variant={holiday.is_custom ? 'secondary' : 'outline'}>
                        {holiday.is_custom ? t('scheduling.settings.custom') : t('scheduling.settings.national')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {holiday.is_custom && canEditSettings && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteHoliday(holiday.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {holidays.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t('scheduling.settings.noHolidays')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              {t('scheduling.settings.notificationsIntro')}
            </p>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-reschedule">{t('scheduling.settings.notifyOnReschedule')}</Label>
                <p className="text-sm text-muted-foreground">{t('scheduling.settings.notifyOnRescheduleDesc')}</p>
              </div>
              <Switch
                id="notify-reschedule"
                checked={formData.notify_client_on_reschedule ?? false}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, notify_client_on_reschedule: v }))}
                disabled={!canEditSettings}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-reassign">{t('scheduling.settings.notifyOnReassign')}</Label>
                <p className="text-sm text-muted-foreground">{t('scheduling.settings.notifyOnReassignDesc')}</p>
              </div>
              <Switch
                id="notify-reassign"
                checked={formData.notify_client_on_reassign ?? false}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, notify_client_on_reassign: v }))}
                disabled={!canEditSettings}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {t('scheduling.settings.notifyChannelsNote')}
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {canEditSettings && (
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
