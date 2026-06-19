import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { format, type Locale } from "date-fns";
import { enUS, pt, es, fr, de } from "date-fns/locale";
import { Calendar, Clock, MapPin, User, FileText, MessageSquare, Pencil, X, Check, Phone, Mail, ClipboardList } from "lucide-react";
import type { CalendarVisit } from "@/hooks/useCalendarScheduling";
import { useTranslation } from "@/hooks/useTranslation";
import { sanitizeFieldValue } from "@/utils/sanitize";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";

interface CalendarItemDetailsDialogProps {
  item: CalendarVisit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (visitId: string, data: {
    title: string;
    description?: string;
    visit_type: string;
    location?: string;
    start_time: string;
    end_time: string;
    status: string;
    notes?: string;
  }) => Promise<boolean>;
}

export function CalendarItemDetailsDialog({
  item,
  open,
  onOpenChange,
  onUpdate,
}: CalendarItemDetailsDialogProps) {
  const { t, language } = useTranslation();
  const { userType } = useCompany();
  const { hasPermission, isSystemAdmin } = usePermissions();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    visit_type: "meeting",
    location: "",
    start_time: "",
    end_time: "",
    status: "scheduled",
    notes: "",
  });
  
  const dateLocale = useMemo(() => {
    const locales: Record<string, Locale> = { en: enUS, pt, es, fr, de };
    return locales[language] || enUS;
  }, [language]);

  // Reset form when item changes or dialog opens
  useEffect(() => {
    if (item && open) {
      setFormData({
        title: item.title || "",
        description: item.description || "",
        visit_type: item.visit_type || "meeting",
        location: item.location || "",
        start_time: item.start_time ? format(new Date(item.start_time), "yyyy-MM-dd'T'HH:mm") : "",
        end_time: item.end_time ? format(new Date(item.end_time), "yyyy-MM-dd'T'HH:mm") : "",
        status: item.status || "scheduled",
        notes: item.notes || "",
      });
      setIsEditing(false);
    }
  }, [item, open]);

  // Fetch lead field definitions when we have a lead with campaign_id
  const [fieldDefinitions, setFieldDefinitions] = useState<any[]>([]);
  useEffect(() => {
    if (!open || !item?.lead?.campaign_id) {
      setFieldDefinitions([]);
      return;
    }
    const fetchDefs = async () => {
      const { data } = await supabase
        .from("lead_field_definitions")
        .select("field_key, field_label, field_type, is_required, sort_order, step_number")
        .eq("campaign_id", item.lead!.campaign_id!)
        .eq("is_active", true)
        .order("step_number")
        .order("sort_order");
      setFieldDefinitions(data || []);
    };
    fetchDefs();
  }, [open, item?.lead?.campaign_id]);
  
  if (!item) return null;

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-info/10 text-info border-info/30",
      completed: "bg-success/10 text-success border-success/30",
      cancelled: "bg-destructive/10 text-destructive border-destructive/30",
      rescheduled: "bg-warning/10 text-warning border-warning/30",
    };
    return colors[status] || colors.scheduled;
  };

  const getSourceLabel = (source?: 'schedule' | 'activity') => {
    if (source === 'activity') return t('calendar.activity');
    return t('calendar.scheduleVisit');
  };

  const getTranslatedStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      scheduled: t('calendar.status.scheduled'),
      completed: t('calendar.status.completed'),
      cancelled: t('calendar.status.cancelled'),
      rescheduled: t('calendar.status.rescheduled'),
    };
    return statusMap[status] || status;
  };

  const getTranslatedVisitType = (type: string) => {
    const typeMap: Record<string, string> = {
      meeting: t('calendar.visitType.meeting'),
      phone_call: t('calendar.visitType.phoneCall'),
      site_visit: t('calendar.visitType.siteVisit'),
      demo: t('calendar.visitType.demo'),
      follow_up: t('calendar.visitType.followUp'),
    };
    return typeMap[type] || type;
  };

  const handleSave = async () => {
    if (!onUpdate || !item) return;
    
    setSaving(true);
    const success = await onUpdate(item.id, {
      title: formData.title,
      description: formData.description || undefined,
      visit_type: formData.visit_type,
      location: formData.location || undefined,
      start_time: formData.start_time,
      end_time: formData.end_time,
      status: formData.status,
      notes: formData.notes || undefined,
    });
    setSaving(false);
    
    if (success) {
      setIsEditing(false);
      onOpenChange(false);
    }
  };

  // Admin types (system, tenant, company) always can edit schedule visits
  const isAdmin = isSystemAdmin || hasPermission('calendar.edit');
  const canEdit = item.source !== 'activity' && !!onUpdate && isAdmin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {isEditing ? (
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="text-xl font-semibold"
                />
              ) : (
                <DialogTitle className="text-xl">{item.title}</DialogTitle>
              )}
              <Badge variant="outline" className="text-xs">
                {getSourceLabel(item.source)}
              </Badge>
            </div>
            {canEdit && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="w-4 h-4 mr-1" />
                {t('common.edit')}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status and Type */}
          {isEditing ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('calendar.form.status')}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">{t('calendar.status.scheduled')}</SelectItem>
                    <SelectItem value="completed">{t('calendar.status.completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('calendar.status.cancelled')}</SelectItem>
                    <SelectItem value="rescheduled">{t('calendar.status.rescheduled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('calendar.form.visitType')}</Label>
                <Select
                  value={formData.visit_type}
                  onValueChange={(value) => setFormData({ ...formData, visit_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting">{t('calendar.visitType.meeting')}</SelectItem>
                    <SelectItem value="phone_call">{t('calendar.visitType.phoneCall')}</SelectItem>
                    <SelectItem value="site_visit">{t('calendar.visitType.siteVisit')}</SelectItem>
                    <SelectItem value="demo">{t('calendar.visitType.demo')}</SelectItem>
                    <SelectItem value="follow_up">{t('calendar.visitType.followUp')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={getStatusColor(item.status)}>
                {getTranslatedStatus(item.status)}
              </Badge>
              <Badge variant="secondary">
                {getTranslatedVisitType(item.visit_type)}
              </Badge>
              {item.board_color && (
                <div 
                  className="w-4 h-4 rounded-full border"
                  style={{ backgroundColor: item.board_color }}
                  title={t('calendar.filter.board')}
                />
              )}
            </div>
          )}

          {/* Date and Time */}
          {isEditing ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('calendar.form.startTime')}</Label>
                <Input
                  type="datetime-local"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('calendar.form.endTime')}</Label>
                <Input
                  type="datetime-local"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Calendar className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">
                  {format(new Date(item.start_time), "EEEE, d MMMM yyyy", { locale: dateLocale })}
                </p>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Clock className="w-4 h-4" />
                  <span>
                    {format(new Date(item.start_time), "HH:mm")} - {format(new Date(item.end_time), "HH:mm")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Contact (read-only) */}
          {(item.contact || item.lead) && (
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{t('calendar.table.contact')}</p>
                <p className="font-medium">
                  {item.contact?.first_name || item.lead?.name || '—'} {item.contact?.last_name || ''}
                </p>
                {(item.contact?.email || item.lead?.email) && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <Mail className="w-4 h-4" />
                    <span>{item.contact?.email || item.lead?.email}</span>
                  </div>
                )}
                {(item.contact?.phone || item.lead?.phone) && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <Phone className="w-4 h-4" />
                    <span>{item.contact?.phone || item.lead?.phone}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Assigned User (read-only) */}
          {item.assigned_user && (
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{t('calendar.table.assignedTo')}</p>
                <p className="font-medium">{item.assigned_user.name}</p>
              </div>
            </div>
          )}

          {/* Location */}
          {isEditing ? (
            <div className="space-y-2">
              <Label>{t('calendar.form.location')}</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder={t('calendar.form.locationPlaceholder')}
              />
            </div>
          ) : item.location ? (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{t('calendar.table.location')}</p>
                <p className="font-medium">{item.location}</p>
              </div>
            </div>
          ) : null}

          {/* Description */}
          {isEditing ? (
            <div className="space-y-2">
              <Label>{t('calendar.form.description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('calendar.form.descriptionPlaceholder')}
                rows={3}
              />
            </div>
          ) : item.description ? (
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{t('calendar.form.description')}</p>
                <p className="text-sm">{item.description}</p>
              </div>
            </div>
          ) : null}

          {/* Notes */}
          {isEditing ? (
            <div className="space-y-2">
              <Label>{t('calendar.form.notes')}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t('calendar.form.notesPlaceholder')}
                rows={2}
              />
            </div>
          ) : item.notes ? (
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{t('calendar.form.notes')}</p>
                <p className="text-sm">{item.notes}</p>
              </div>
            </div>
          ) : null}

          {/* Lead Form Fields */}
          {!isEditing && item.lead?.field_values && fieldDefinitions.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-muted-foreground" />
                  <h4 className="font-semibold text-sm">Campos do Formulário</h4>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {fieldDefinitions
                    .filter((fd: any) => !fd.field_key.startsWith('_'))
                    .map((fd: any) => {
                      const val = item.lead!.field_values?.[fd.field_key];
                      const displayVal = val != null && val !== '' 
                        ? sanitizeFieldValue(Array.isArray(val) ? val.join(', ') : val)
                        : '—';
                      return (
                        <div key={fd.field_key}>
                          <p className="text-xs text-muted-foreground">
                            {fd.field_label}
                            {fd.is_required && <span className="text-destructive">*</span>}
                          </p>
                          <p className="text-sm font-medium">{displayVal}</p>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}

          {/* Edit Actions */}
          {isEditing && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                <X className="w-4 h-4 mr-1" />
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Check className="w-4 h-4 mr-1" />
                {t('common.save')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
<<<<<<< ours
<<<<<<< ours
}
=======
}
>>>>>>> theirs
=======
}
>>>>>>> theirs
