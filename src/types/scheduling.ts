// Scheduling Module Types

export type ScheduleItemStatus = 'draft' | 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled';
export type ScheduleItemOrigin = 'manual' | 'auto' | 'import' | 'api';
export type ScheduleFieldType = 'text' | 'number' | 'date' | 'datetime' | 'select' | 'multiselect' | 'checkbox' | 'user' | 'link' | 'email' | 'phone' | 'currency' | 'rating';
export type ScheduleEventType = 'created' | 'updated' | 'rescheduled' | 'assigned' | 'unassigned' | 'status_changed' | 'confirmed' | 'cancelled' | 'completed' | 'comment';

export interface ScheduleBoard {
  id: string;
  name: string;
  description?: string;
  color: string;
  organization_id?: string;
  is_active: boolean;
  settings: Record<string, any>;
  board_type?: string;
  is_system_board?: boolean;
  name_key?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleField {
  id: string;
  name: string;
  label: string;
  field_type: ScheduleFieldType;
  options?: { value: string; label: string; color?: string }[];
  default_value?: string;
  is_required: boolean;
  is_system: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BoardScheduleField {
  id: string;
  board_id: string;
  field_id: string;
  sort_order: number;
  is_visible: boolean;
  width: number;
  created_at: string;
  field?: ScheduleField;
}

export interface ScheduleResource {
  id: string;
  name: string;
  resource_type: 'user' | 'equipment' | 'room' | 'vehicle';
  user_id?: string;
  employee_id?: string;
  color: string;
  max_daily_capacity: number;
  organization_id?: string;
  is_active: boolean;
  metadata: Record<string, any>;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  user?: { name: string };
  employee?: { first_name: string; last_name: string };
}

export interface ScheduleItem {
  id: string;
  board_id: string;
  title: string;
  description?: string;
  status: ScheduleItemStatus;
  origin: ScheduleItemOrigin;
  start_datetime: string;
  end_datetime: string;
  all_day: boolean;
  duration_minutes?: number;
  client_id?: string;
  contact_id?: string;
  deal_id?: string;
  employee_id?: string;
  user_id?: string;
  location?: string;
  location_lat?: number;
  location_lng?: number;
  color?: string;
  priority: number;
  tags?: string[];
  notes?: string;
  metadata: Record<string, any>;
  organization_id?: string;
  // Time-off specific fields
  time_off_type?: string;
  approval_status?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  vacation_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  board?: Partial<ScheduleBoard>;
  client?: { first_name?: string; last_name?: string; company_name?: string };
  contact?: { first_name: string; last_name: string };
  employee?: { first_name: string; last_name: string };
  user_profile?: { name: string } | null;
  assignees?: ScheduleItemAssignee[];
}

export interface ScheduleItemFieldValue {
  id: string;
  item_id: string;
  field_id: string;
  value_text?: string;
  value_number?: number;
  value_date?: string;
  value_json?: any;
  created_at: string;
  updated_at: string;
  field?: ScheduleField;
}

export interface ScheduleItemAssignee {
  id: string;
  item_id: string;
  resource_id: string;
  role: 'assignee' | 'lead' | 'observer';
  confirmed_at?: string;
  created_at: string;
  resource?: ScheduleResource;
}

export interface ResourceAvailabilityRule {
  id: string;
  resource_id: string;
  day_of_week: number; // 0-6, 0=Sunday
  start_time: string;
  end_time: string;
  is_available: boolean;
  valid_from?: string;
  valid_until?: string;
  created_at: string;
  updated_at: string;
}

export interface ResourceTimeOff {
  id: string;
  resource_id: string;
  title: string;
  reason?: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time?: string;
  end_time?: string;
  approved: boolean;
  approved_by?: string;
  approved_at?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface AutoScheduleRule {
  id: string;
  name: string;
  board_id?: string;
  organization_id?: string;
  is_active: boolean;
  trigger_type: 'on_create' | 'on_status_change' | 'on_date' | 'manual';
  trigger_conditions?: Record<string, any>;
  preferred_resources?: string[];
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  earliest_time: string;
  latest_time: string;
  allowed_days: number[];
  strategy: 'first_available' | 'round_robin' | 'least_busy';
  max_items_per_day?: number;
  respect_capacity: boolean;
  priority: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleItemEvent {
  id: string;
  item_id: string;
  event_type: ScheduleEventType;
  description?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  created_by: string;
  created_at: string;
}

// Board module configuration types
export type BoardModule = 'client' | 'contact' | 'lead' | 'location' | 'priority' | 'resources';

export interface BoardModuleSettings {
  allowed_modules?: BoardModule[];
  auto_fill_address?: boolean;
}

// UI-specific types
export interface CalendarViewItem extends ScheduleItem {
  displayColor: string;
  resourceNames: string[];
}

export interface AvailableSlot {
  slot_start: string;
  slot_end: string;
}

export interface ScheduleFilters {
  boardIds?: string[];
  resourceIds?: string[];
  clientId?: string;
  contactId?: string;
  status?: ScheduleItemStatus[];
  dateFrom: Date;
  dateTo: Date;
  assigneeId?: string;
  assigneeIds?: string[];
}
