import { useState, useEffect, useMemo } from 'react';
import { format, setHours, setMinutes, addHours } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { X, ChevronDown, Send, Check, XCircle, HelpCircle, User, Mail, Phone } from 'lucide-react';
import { extractLeadContactInfo } from '@/utils/leadContactInfo';
import { ClientMentionInput } from './ClientMentionInput';
import { ContactMentionInput } from './ContactMentionInput';
import { InviteeSelector } from './InviteeSelector';
import { useScheduleInvitations } from '@/hooks/useScheduleInvitations';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ScheduleItem, ScheduleBoard, ScheduleResource, ScheduleItemStatus, BoardModule } from '@/types/scheduling';

interface ScheduleItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ScheduleItem | null;
  boards: ScheduleBoard[];
  resources: ScheduleResource[];
  contacts: { id: string; first_name: string; last_name: string }[];
  employees?: { id: string; first_name: string; last_name: string; reports_to?: string | null; user_id?: string | null }[];
  companyUsers?: { id: string; name: string }[];
  currentUserId?: string;
  currentEmployeeId?: string;
  defaultDate?: Date;
  companyId?: string;
  onSave: (data: Partial<ScheduleItem>, assigneeIds: string[]) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function ScheduleItemDialog({
  open,
  onOpenChange,
  item,
  boards,
  resources,
  contacts,
  employees = [],
  companyUsers = [],
  currentUserId,
  currentEmployeeId,
  defaultDate,
  companyId,
  onSave,
  onDelete,
}: ScheduleItemDialogProps) {
  const { t } = useTranslation();
  const { hasPermission, isSystemAdmin } = usePermissions();
  const { userType } = useCompany();
  const [loading, setLoading] = useState(false);
  const [inviteesOpen, setInviteesOpen] = useState(false);
  const [addressOptions, setAddressOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [selectedInvitees, setSelectedInvitees] = useState<Array<{ type: string; id: string; name: string }>>([]);
  const { sendInvitations } = useScheduleInvitations(companyId);
  const [leadInfo, setLeadInfo] = useState<{ name: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null>(null);

  // Fetch lead info when item has metadata.lead_id
  useEffect(() => {
    if (!open) {
      setLeadInfo(null);
      return;
    }
    const leadId = (item?.metadata as any)?.lead_id;
    if (!leadId) {
      setLeadInfo(null);
      return;
    }
    const fetchLead = async () => {
      const { data, error } = await supabase
        .from('anew_leads')
        .select('field_values, entity_id, entity:anew_entities(display_name, first_name, last_name)')
        .eq('id', leadId)
        .maybeSingle();
      if (error || !data) {
        setLeadInfo(null);
        return;
      }
      const info = extractLeadContactInfo(data.field_values as Record<string, any> | null);
      // Enrich with entity data if available
      const entity = data.entity as any;
      if (entity) {
        if (!info.firstName && entity.first_name) info.firstName = entity.first_name;
        if (!info.lastName && entity.last_name) info.lastName = entity.last_name;
        if (info.name === 'Lead' && entity.display_name) info.name = entity.display_name;
        if (info.firstName && info.lastName) {
          info.name = `${info.firstName} ${info.lastName}`;
        }
      }
      setLeadInfo(info);

      // Only use persisted location from the schedule_item itself — never fabricate from lead fields
      // The location is set by the book-slot edge function at booking time
      // and should only be overridden by explicit user action in the dialog
      const currentLocation = item?.location?.trim() || '';
      const isLocationInvalid = !currentLocation || /^[0,\s]+$/.test(currentLocation);
      if (isLocationInvalid) {
        // Leave location empty — do NOT auto-extract from lead field_values or entity addresses
        // This prevents stale/incorrect addresses from being shown
        setFormData(prev => ({ ...prev, location: '' }));
      }
    };
    fetchLead();
  }, [open, item]);

  const getDefaultDates = (date?: Date) => {
    const start = date
      ? setMinutes(setHours(date, 9), 0)
      : setMinutes(setHours(new Date(), 9), 0);
    const end = addHours(start, 1);
    return { start, end };
  };

  const { start: defaultStart, end: defaultEnd } = getDefaultDates(defaultDate);

  const [formData, setFormData] = useState({
    board_id: item?.board_id || boards[0]?.id || '',
    title: item?.title || '',
    description: item?.description || '',
    status: item?.status || 'scheduled' as ScheduleItemStatus,
    start_datetime: item?.start_datetime 
      ? format(new Date(item.start_datetime), "yyyy-MM-dd'T'HH:mm")
      : format(defaultStart, "yyyy-MM-dd'T'HH:mm"),
    end_datetime: item?.end_datetime 
      ? format(new Date(item.end_datetime), "yyyy-MM-dd'T'HH:mm")
      : format(defaultEnd, "yyyy-MM-dd'T'HH:mm"),
    all_day: item?.all_day || false,
    client_id: item?.client_id || '',
    contact_id: item?.contact_id || '',
    location: item?.location || '',
    priority: item?.priority || 0,
    notes: item?.notes || '',
    // Time-off specific fields
    user_id: item?.user_id || '',
    employee_id: item?.employee_id || '',
    time_off_type: item?.time_off_type || '',
    approval_status: item?.approval_status || 'pending',
    include_weekends: (item?.metadata as any)?.include_weekends ?? false,
  });

  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>(
    item?.assignees?.map(a => a.resource_id) || []
  );

  // Sync form data when dialog opens (for both new items and editing existing items)
  useEffect(() => {
    if (open) {
      const { start, end } = getDefaultDates(defaultDate);
      setFormData({
        board_id: item?.board_id || boards[0]?.id || '',
        title: item?.title || '',
        description: item?.description || '',
        status: item?.status || 'scheduled' as ScheduleItemStatus,
        start_datetime: item?.start_datetime 
          ? format(new Date(item.start_datetime), "yyyy-MM-dd'T'HH:mm")
          : format(start, "yyyy-MM-dd'T'HH:mm"),
        end_datetime: item?.end_datetime 
          ? format(new Date(item.end_datetime), "yyyy-MM-dd'T'HH:mm")
          : format(end, "yyyy-MM-dd'T'HH:mm"),
        all_day: item?.all_day || false,
        client_id: item?.client_id || '',
        contact_id: item?.contact_id || '',
        location: item?.location || '',
        priority: item?.priority || 0,
        notes: item?.notes || '',
        user_id: item?.user_id || '',
        employee_id: item?.employee_id || '',
        time_off_type: item?.time_off_type || '',
        approval_status: item?.approval_status || 'pending',
        include_weekends: (item?.metadata as any)?.include_weekends ?? false,
      });
      setSelectedResourceIds(item?.assignees?.map(a => a.resource_id) || []);
      setSelectedInvitees([]);
    }
  }, [open, item, boards, defaultDate]);

  // Check if selected board is a time-off board
  const selectedBoard = useMemo(() => 
    boards.find(b => b.id === formData.board_id),
    [boards, formData.board_id]
  );
  const isTimeOffBoard = selectedBoard?.board_type === 'time_off';
  
  // Read board module configuration from settings
  const boardModules = (selectedBoard?.settings as any)?.allowed_modules as BoardModule[] | undefined;
  const autoFillAddress = (selectedBoard?.settings as any)?.auto_fill_address === true;
  const showClient    = !isTimeOffBoard && (!boardModules || boardModules.includes('client'));
  const showContact   = !isTimeOffBoard && (!boardModules || boardModules.includes('contact'));
  const showLocation  = !isTimeOffBoard && (!boardModules || boardModules.includes('location'));
  const showPriority  = !isTimeOffBoard && (!boardModules || boardModules.includes('priority'));
  const showResources = !isTimeOffBoard && (!boardModules || boardModules.includes('resources'));

  // Company Admins (and below) can only schedule for themselves
  const isSelfOnly = !hasPermission('scheduling.items.manage');
  
  const filteredCompanyUsers = useMemo(() => {
    if (isSelfOnly && currentUserId) {
      return companyUsers.filter(u => u.id === currentUserId);
    }
    return companyUsers;
  }, [companyUsers, isSelfOnly, currentUserId]);

  // Auto-set user_id for self-only users when creating new items on time-off boards
  useEffect(() => {
    if (open && isTimeOffBoard && isSelfOnly && currentUserId && !item) {
      setFormData(f => ({ ...f, user_id: currentUserId }));
    }
  }, [open, isTimeOffBoard, isSelfOnly, currentUserId, item]);

  // Get time-off type options
  const timeOffTypes = [
    { value: 'vacation', label: t('scheduling.timeOff.vacation') },
    { value: 'sick_leave', label: t('scheduling.timeOff.sickLeave') },
    { value: 'personal', label: t('scheduling.timeOff.personal') },
    { value: 'unpaid', label: t('scheduling.timeOff.unpaid') },
    { value: 'absence', label: t('scheduling.timeOff.absence') },
    { value: 'other', label: t('scheduling.timeOff.other') },
  ];

  // Check if current user can approve (item employee reports to current user's employee)
  const canApprove = useMemo(() => {
    if (!currentEmployeeId || !formData.user_id) return false;
    // Check if the selected user has an employee record that reports to current user
    const selectedUserEmployee = employees.find(e => e.user_id === formData.user_id);
    return selectedUserEmployee?.reports_to === currentEmployeeId;
  }, [currentEmployeeId, formData.user_id, employees]);

  // Check if current user is the owner of this item (is one of the assignees)
  const isOwner = useMemo(() => {
    if (!item || !currentUserId) return true; // New items - always allow
    // Find if current user has a resource in the assignees
    const userResourceIds = resources
      .filter(r => r.user_id === currentUserId)
      .map(r => r.id);
    return item.assignees?.some(a => userResourceIds.includes(a.resource_id)) || 
           item.created_by === currentUserId;
  }, [item, currentUserId, resources]);

  // Can edit only if owner OR has edit permission OR is system/tenant admin
  const canEditItem = isOwner || isSystemAdmin || hasPermission('scheduling.items.edit');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.board_id || !formData.start_datetime || !formData.end_datetime) {
      return;
    }
    
    // For time-off boards, title can be auto-generated
    let title = formData.title;
    if (isTimeOffBoard && !title && formData.time_off_type) {
      const typeLabel = timeOffTypes.find(t => t.value === formData.time_off_type)?.label || formData.time_off_type;
      const selectedUser = companyUsers.find(u => u.id === formData.user_id);
      if (selectedUser) {
        title = `${typeLabel} - ${selectedUser.name}`;
      } else {
        title = typeLabel;
      }
    }
    
    if (!title) {
      toast.error(t('common.required'));
      return;
    }

    setLoading(true);
    try {
      await onSave({
        ...formData,
        title,
        id: item?.id,
        start_datetime: new Date(formData.start_datetime).toISOString(),
        end_datetime: new Date(formData.end_datetime).toISOString(),
        client_id: formData.client_id || null,
        contact_id: formData.contact_id || null,
        employee_id: formData.employee_id || null,
        user_id: isTimeOffBoard ? (formData.user_id || null) : null,
        time_off_type: isTimeOffBoard ? formData.time_off_type : null,
        approval_status: isTimeOffBoard ? formData.approval_status : null,
        metadata: {
          ...(item?.metadata || {}),
          include_weekends: isTimeOffBoard ? formData.include_weekends : undefined,
        },
      } as Partial<ScheduleItem>, selectedResourceIds);
      
      // Send invitations if any selected and it's a new item
      if (selectedInvitees.length > 0 && !item?.id) {
        toast.info(t('scheduling.item.invitesSentAfterSave'));
      }
      
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalAction = async (action: 'approve' | 'reject' | 'clarification') => {
    if (!item?.id) return;
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const updates: Partial<ScheduleItem> = {
        approval_status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'clarification_requested',
        approved_by: action === 'approve' ? user.user?.id : undefined,
        approved_at: action === 'approve' ? new Date().toISOString() : undefined,
      };
      
      await onSave({ ...item, ...updates }, selectedResourceIds);
      toast.success(t(`scheduling.timeOff.${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'clarificationRequested'}`));
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!item?.id || !onDelete) return;
    setLoading(true);
    try {
      await onDelete(item.id);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleResource = (resourceId: string) => {
    setSelectedResourceIds(prev =>
      prev.includes(resourceId)
        ? prev.filter(id => id !== resourceId)
        : [...prev, resourceId]
    );
  };

  // View-only mode for non-owners
  const isViewOnly = item && !canEditItem;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isViewOnly 
              ? t('scheduling.item.viewTitle') 
              : (item ? t('scheduling.item.editTitle') : t('scheduling.item.newTitle'))}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Board */}
            <div className="space-y-2">
              <Label>{t('scheduling.item.board')} *</Label>
              <Select
                value={formData.board_id}
                onValueChange={(value) => setFormData(f => ({ ...f, board_id: value }))}
                disabled={isViewOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('scheduling.item.selectBoard')} />
                </SelectTrigger>
                <SelectContent>
                  {boards.map(board => (
                    <SelectItem key={board.id} value={board.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: board.color }}
                        />
                        {board.name_key ? t(board.name_key) : board.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status - only show for non-time-off boards */}
            {!isTimeOffBoard && (
              <div className="space-y-2">
                <Label>{t('common.status')}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData(f => ({ ...f, status: value as ScheduleItemStatus }))}
                  disabled={isViewOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{t('common.draft')}</SelectItem>
                    <SelectItem value="scheduled">{t('common.scheduled')}</SelectItem>
                    <SelectItem value="confirmed">{t('common.confirmed')}</SelectItem>
                    <SelectItem value="in_progress">{t('common.inProgress')}</SelectItem>
                    <SelectItem value="completed">{t('common.completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('common.cancelled')}</SelectItem>
                    <SelectItem value="rescheduled">{t('common.rescheduled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Time-off specific fields */}
            {isTimeOffBoard && (
              <>
                {/* Time-off Type */}
                <div className="space-y-2">
                  <Label>{t('vacations.form.type')} *</Label>
                  <Select
                    value={formData.time_off_type}
                    onValueChange={(value) => setFormData(f => ({ ...f, time_off_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('scheduling.timeOff.selectType')} />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOffTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* User selector (Colaborador) */}
                <div className="col-span-2 space-y-2">
                  <Label>{t('scheduling.timeOff.employee')} *</Label>
                  <Select
                    value={formData.user_id}
                    onValueChange={(value) => setFormData(f => ({ ...f, user_id: value }))}
                    disabled={isSelfOnly}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('scheduling.timeOff.selectEmployee')} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCompanyUsers.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Approval status display */}
                {item?.id && (
                  <div className="col-span-2 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t('common.status')}:</span>
                        <Badge 
                          variant={
                            formData.approval_status === 'approved' ? 'default' :
                            formData.approval_status === 'rejected' ? 'destructive' :
                            'secondary'
                          }
                          className={
                            formData.approval_status === 'approved' ? 'bg-green-500' :
                            formData.approval_status === 'clarification_requested' ? 'bg-orange-500' : ''
                          }
                        >
                          {formData.approval_status === 'approved' && t('scheduling.timeOff.approved')}
                          {formData.approval_status === 'rejected' && t('scheduling.timeOff.rejected')}
                          {formData.approval_status === 'pending' && t('scheduling.timeOff.pending')}
                          {formData.approval_status === 'clarification_requested' && t('scheduling.timeOff.clarificationRequested')}
                        </Badge>
                      </div>
                      {canApprove && formData.approval_status === 'pending' && (
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="outline" 
                            className="text-green-600 border-green-600 hover:bg-green-50"
                            onClick={() => handleApprovalAction('approve')}
                            disabled={loading}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            {t('scheduling.timeOff.approve')}
                          </Button>
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="outline"
                            className="text-red-600 border-red-600 hover:bg-red-50"
                            onClick={() => handleApprovalAction('reject')}
                            disabled={loading}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            {t('scheduling.timeOff.reject')}
                          </Button>
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="outline"
                            className="text-orange-600 border-orange-600 hover:bg-orange-50"
                            onClick={() => handleApprovalAction('clarification')}
                            disabled={loading}
                          >
                            <HelpCircle className="w-4 h-4 mr-1" />
                            {t('scheduling.timeOff.requestClarification')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Title - only show for non-time-off or optionally */}
            {!isTimeOffBoard && (
              <div className="col-span-2 space-y-2">
                <Label>{t('common.title')} *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('scheduling.item.titlePlaceholder')}
                  required
                  disabled={isViewOnly}
                />
              </div>
            )}

            {/* Lead info card - shown when item is linked to a lead */}
            {leadInfo && (
              <div className="col-span-2 p-3 rounded-lg border bg-muted/30 space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  Lead
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{leadInfo.name}</span>
                  </div>
                  {leadInfo.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <a href={`mailto:${leadInfo.email}`} className="text-primary hover:underline truncate">{leadInfo.email}</a>
                    </div>
                  )}
                  {leadInfo.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <a href={`tel:${leadInfo.phone}`} className="text-primary hover:underline">{leadInfo.phone}</a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* All day checkbox */}
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox
                id="all_day"
                checked={formData.all_day}
                onCheckedChange={(checked) => setFormData(f => ({ ...f, all_day: !!checked }))}
                disabled={isViewOnly}
              />
              <Label htmlFor="all_day">{t('scheduling.item.allDay')}</Label>
            </div>

            {/* Include weekends checkbox - only for time-off boards */}
            {isTimeOffBoard && (
              <div className="col-span-2 flex items-center gap-2">
                <Checkbox
                  id="include_weekends"
                  checked={formData.include_weekends}
                  onCheckedChange={(checked) => setFormData(f => ({ ...f, include_weekends: !!checked }))}
                  disabled={isViewOnly}
                />
                <Label htmlFor="include_weekends">{t('scheduling.timeOff.includeWeekends')}</Label>
              </div>
            )}

            {/* Start */}
            <div className="space-y-2">
              <Label>{t('scheduling.item.start')} *</Label>
                <Input
                  type={formData.all_day ? 'date' : 'datetime-local'}
                  value={formData.all_day 
                    ? formData.start_datetime.split('T')[0] 
                    : formData.start_datetime
                  }
                  onChange={(e) => setFormData(f => ({ 
                    ...f, 
                    start_datetime: formData.all_day 
                      ? `${e.target.value}T00:00` 
                      : e.target.value 
                  }))}
                  required
                  disabled={isViewOnly}
                />
            </div>

            {/* End */}
            <div className="space-y-2">
              <Label>{t('scheduling.item.end')} *</Label>
                <Input
                  type={formData.all_day ? 'date' : 'datetime-local'}
                  value={formData.all_day 
                    ? formData.end_datetime.split('T')[0] 
                    : formData.end_datetime
                  }
                  onChange={(e) => setFormData(f => ({ 
                    ...f, 
                    end_datetime: formData.all_day 
                      ? `${e.target.value}T23:59` 
                      : e.target.value 
                  }))}
                  required
                  disabled={isViewOnly}
                />
            </div>

            {/* Client - hide for time-off */}
            {showClient && (
              <div className={showClient && !showContact ? "col-span-2 space-y-2" : "space-y-2"}>
                <Label>{t('scheduling.item.client')}</Label>
                <ClientMentionInput
                  selectedClientId={formData.client_id}
                  onClientSelect={async (clientId) => {
                    setFormData(f => ({ ...f, client_id: clientId }));
                    setAddressOptions([]);
                    setShowAddressPicker(false);
                    if (autoFillAddress && clientId) {
                      try {
                        const { data: clientData } = await supabase
                          .from('anew_clients')
                          .select('entity_id')
                          .eq('id', clientId)
                          .maybeSingle();
                        if (clientData?.entity_id) {
                          const { data: addrLinks } = await supabase
                            .from('anew_entity_addresses')
                            .select('address_id')
                            .eq('entity_id', clientData.entity_id);
                          if (!addrLinks || addrLinks.length === 0) {
                            toast.info('Este cliente não tem moradas registadas.');
                            setFormData(f => ({ ...f, location: '' }));
                          } else {
                            const addrIds = addrLinks.map(a => a.address_id);
                            const { data: addresses } = await supabase
                              .from('anew_addresses')
                              .select('id, street, number, city, postal_code, district')
                              .in('id', addrIds);
                            if (addresses && addresses.length === 1) {
                              const addr = addresses[0];
                              const loc = [addr.street, addr.number, addr.postal_code, addr.city, addr.district].filter(Boolean).join(', ');
                              setFormData(f => ({ ...f, location: loc }));
                            } else if (addresses && addresses.length > 1) {
                              const opts = addresses.map(addr => ({
                                id: addr.id,
                                label: [addr.street, addr.number, addr.postal_code, addr.city, addr.district].filter(Boolean).join(', '),
                              }));
                              setAddressOptions(opts);
                              setShowAddressPicker(true);
                            }
                          }
                        }
                      } catch (e) {
                        console.error('Error fetching client address:', e);
                      }
                    }
                    if (!clientId) {
                      if (autoFillAddress) setFormData(f => ({ ...f, location: '' }));
                    }
                  }}
                  placeholder={t('scheduling.item.clientPlaceholder')}
                  disabled={isViewOnly}
                />
              </div>
            )}

            {/* Contact - hide for time-off and construction boards */}
            {showContact && (
              <div className="space-y-2">
                <Label>{t('scheduling.item.contact')}</Label>
                <ContactMentionInput
                  selectedContactId={formData.contact_id}
                  onContactSelect={(contactId) => setFormData(f => ({ ...f, contact_id: contactId }))}
                  placeholder={t('scheduling.item.selectContact')}
                  disabled={isViewOnly}
                />
              </div>
            )}

            {/* Location - hide for time-off */}
            {showLocation && (
              <div className="col-span-2 space-y-2">
                <Label>{t('scheduling.item.location')}</Label>
                {showAddressPicker && addressOptions.length > 0 && (
                  <div className="space-y-1 p-2 border rounded-md bg-muted/50 mb-2">
                    <p className="text-xs text-muted-foreground font-medium">Selecione a morada:</p>
                    {addressOptions.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors"
                        onClick={() => {
                          setFormData(f => ({ ...f, location: opt.label }));
                          setShowAddressPicker(false);
                          setAddressOptions([]);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData(f => ({ ...f, location: e.target.value }))}
                  placeholder={t('scheduling.item.locationPlaceholder')}
                  disabled={isViewOnly}
                  readOnly={false}
                />
              </div>
            )}

            {/* Priority - hide for time-off */}
            {showPriority && (
              <div className="space-y-2">
                <Label>{t('scheduling.item.priority')}</Label>
                <Select
                  value={String(formData.priority)}
                  onValueChange={(value) => setFormData(f => ({ ...f, priority: Number(value) }))}
                  disabled={isViewOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('scheduling.item.priorityNormal')}</SelectItem>
                    <SelectItem value="1">{t('scheduling.item.priorityHigh')}</SelectItem>
                    <SelectItem value="2">{t('scheduling.item.priorityUrgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Resources - hide for time-off */}
            {showResources && (
              <div className="col-span-2 space-y-2">
                <Label>{t('scheduling.item.assignedResources')}</Label>
                <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[60px]">
                  {selectedResourceIds.map(id => {
                    const resource = resources.find(r => r.id === id);
                    if (!resource) return null;
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="flex items-center gap-1"
                        style={{ borderColor: resource.color }}
                      >
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: resource.color }}
                        />
                        {resource.name}
                        {!isViewOnly && (
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-destructive"
                            onClick={() => toggleResource(id)}
                          />
                        )}
                      </Badge>
                    );
                  })}
                  {selectedResourceIds.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t('scheduling.item.noResources')}
                    </span>
                  )}
                </div>
                {!isViewOnly && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {resources
                      .filter(r => !selectedResourceIds.includes(r.id))
                      .map(resource => (
                        <Badge
                          key={resource.id}
                          variant="outline"
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => toggleResource(resource.id)}
                        >
                          <div 
                            className="w-2 h-2 rounded-full mr-1" 
                            style={{ backgroundColor: resource.color }}
                          />
                          {resource.name}
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div className="col-span-2 space-y-2">
              <Label>{t('scheduling.item.description')}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                  placeholder={t('scheduling.item.descriptionPlaceholder')}
                  rows={2}
                  disabled={isViewOnly}
                />
            </div>

            {/* Invitees Section - hide for time-off and view-only */}
            {!isTimeOffBoard && !isViewOnly && (
              <div className="col-span-2">
                <Collapsible open={inviteesOpen} onOpenChange={setInviteesOpen}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        {t('scheduling.item.inviteParticipants')}
                        {selectedInvitees.length > 0 && (
                          <Badge variant="secondary">{selectedInvitees.length}</Badge>
                        )}
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${inviteesOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <InviteeSelector
                      companyId={companyId}
                      selectedInvitees={selectedInvitees}
                      onSelectionChange={setSelectedInvitees}
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {/* Notes */}
            <div className="col-span-2 space-y-2">
              <Label>{t('scheduling.item.notes')}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('scheduling.item.notesPlaceholder')}
                rows={2}
                disabled={isViewOnly}
              />
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <div>
              {item && onDelete && hasPermission('scheduling.items.delete') && canEditItem && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  {t('common.delete')}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                {isViewOnly ? t('common.close') : t('common.cancel')}
              </Button>
              {!isViewOnly && (item ? hasPermission('scheduling.items.edit') : hasPermission('scheduling.items.create')) && (
                <Button type="submit" disabled={loading}>
                  {item ? t('common.save') : t('common.create')}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
