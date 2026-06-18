import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ScheduleItem, ScheduleBoard, ScheduleResource } from '@/types/scheduling';
import { extractLeadContactInfo } from '@/utils/leadContactInfo';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';

const DEFAULT_VISITS_BOARD_NAME = 'Visitas';
const DEFAULT_VISITS_BOARD_COLOR = '#3b82f6';
const ACTIVITIES_SOURCE_COLOR = '#8b5cf6'; // Purple for activities

export interface CalendarVisit {
  id: string;
  title: string;
  description: string | null;
  visit_type: string;
  location: string | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  contact: {
    first_name: string;
    last_name: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  lead: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    field_values?: Record<string, any> | null;
    campaign_id?: string | null;
  } | null;
  assigned_user: {
    id: string;
    name: string;
  } | null;
  board_color?: string;
  source?: 'schedule' | 'activity';
}

export function useCalendarScheduling(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [visitsBoard, setVisitsBoard] = useState<ScheduleBoard | null>(null);

  // Get or create the default "Visitas" board for this company
  const ensureVisitsBoard = useCallback(async (): Promise<ScheduleBoard | null> => {
    if (visitsBoard) return visitsBoard;

    try {
      // Try to find existing board
      let query = supabase
        .from('schedule_boards')
        .select('*')
        .eq('name', DEFAULT_VISITS_BOARD_NAME)
        .eq('is_active', true);

      if (companyId) {
        query = query.eq('organization_id', companyId);
      }

      const { data: existing, error: fetchError } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();

      if (existing && !fetchError) {
        setVisitsBoard(existing as ScheduleBoard);
        return existing as ScheduleBoard;
      }

      // Create new board if not found
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) return null;

      const { data: newBoard, error: createError } = await supabase
        .from('schedule_boards')
        .insert({
          name: DEFAULT_VISITS_BOARD_NAME,
          description: 'Agendamento de visitas e reuniões',
          color: DEFAULT_VISITS_BOARD_COLOR,
          is_active: true,
          settings: { visit_types: ['meeting', 'phone_call', 'site_visit', 'demo', 'follow_up'] },
          created_by: businessUserId,
          organization_id: companyId,
        })
        .select()
        .single();

      if (createError) throw createError;
      setVisitsBoard(newBoard as ScheduleBoard);
      return newBoard as ScheduleBoard;
    } catch (error: any) {
      console.error('Error ensuring visits board:', error);
      return null;
    }
  }, [companyId, visitsBoard]);

  // Fetch all boards for filtering
  const fetchBoards = useCallback(async (): Promise<ScheduleBoard[]> => {
    try {
      let query = supabase
        .from('schedule_boards')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (companyId) {
        query = query.eq('organization_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ScheduleBoard[];
    } catch (error: any) {
      console.error('Error fetching boards:', error);
      return [];
    }
  }, [companyId]);

  // Fetch visits (schedule_items from ALL boards or filtered) + activities
  const fetchVisits = useCallback(async (filters: {
    assigned_to?: string;
    dateFrom?: Date;
    dateTo?: Date;
    boardIds?: string[];
    includeActivities?: boolean;
  } = {}): Promise<CalendarVisit[]> => {
    setLoading(true);
    try {
      // Ensure visits board exists (for creating new visits)
      await ensureVisitsBoard();

      // Fetch schedule items
      let query = supabase
        .from('schedule_items')
        .select(`
          id,
          title,
          description,
          location,
          start_datetime,
          end_datetime,
          status,
          notes,
          metadata,
          created_by,
          assignees:schedule_item_assignees(
            resource:schedule_resources(
              user_id
            )
          ),
          board:schedule_boards(id, name, color)
        `)
        .order('start_datetime', { ascending: true });

      // Filter by specific boards if provided
      if (filters.boardIds && filters.boardIds.length > 0) {
        query = query.in('board_id', filters.boardIds);
      }

      if (companyId) {
        query = query.eq('organization_id', companyId);
      }

      if (filters.dateFrom) {
        query = query.gte('start_datetime', filters.dateFrom.toISOString());
      }

      if (filters.dateTo) {
        const endOfDay = new Date(filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('start_datetime', endOfDay.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch lead details (name/email/phone) for visits linked via metadata.lead_id
      const leadIds = Array.from(
        new Set(
          (data || [])
            .map((it: any) => it?.metadata?.lead_id)
            .filter((id: any) => typeof id === 'string' && id.length > 0)
        )
      ) as string[];

      const leadById = new Map<string, { id: string; name: string; email: string | null; phone: string | null; field_values?: Record<string, any> | null; campaign_id?: string | null }>();
      if (leadIds.length > 0) {
      const { data: leadsData, error: leadsError } = await supabase
          .from('anew_leads')
          .select('id, field_values, campaign_id, entity:anew_entities(id, display_name, first_name, last_name)')
          .in('id', leadIds);

        if (!leadsError && leadsData) {
          leadsData.forEach((l: any) => {
            const info = extractLeadContactInfo(l.field_values);
            leadById.set(l.id, { id: l.id, ...info, field_values: l.field_values, campaign_id: l.campaign_id });
          });
        } else if (leadsError) {
          // Don't block calendar rendering if user doesn't have lead access
          console.warn('[useCalendarScheduling] Unable to fetch leads for visits:', leadsError.message);
        }
      }

      // Resolve user names from anew_users (no joins to profiles)
      const allUserIds = new Set<string>();
      (data || []).forEach((item: any) => {
        item.assignees?.forEach((a: any) => {
          if (a.resource?.user_id) allUserIds.add(a.resource.user_id);
        });
      });

      const userNameMap = new Map<string, { id: string; name: string }>();
      if (allUserIds.size > 0) {
        const { data: anewUsers } = await supabase
          .from('anew_users')
          .select('id, name')
          .in('id', Array.from(allUserIds));

        anewUsers?.forEach((u: any) => {
          if (u.id) {
            userNameMap.set(u.id, { id: u.id, name: u.name || '' });
          }
        });
      }

      // Transform schedule items to CalendarVisit format
      const visits: CalendarVisit[] = (data || []).map((item: any) => {
        const assignee = item.assignees?.[0]?.resource;
        const user = assignee?.user_id ? userNameMap.get(assignee.user_id) : null;
        const leadId = item?.metadata?.lead_id as string | undefined;
        
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          visit_type: item.metadata?.visit_type || 'meeting',
          location: item.location,
          start_time: item.start_datetime,
          end_time: item.end_datetime,
          status: item.status === 'scheduled' ? 'scheduled' : 
                  item.status === 'completed' ? 'completed' :
                  item.status === 'cancelled' ? 'cancelled' : 
                  item.status === 'rescheduled' ? 'rescheduled' : 'scheduled',
          notes: item.notes,
          contact: null,
          lead: leadId ? (leadById.get(leadId) || { id: leadId, ...extractLeadContactInfo(null) }) : null,
          assigned_user: user ? { id: user.id, name: user.name } : null,
          board_color: item.board?.color,
          source: 'schedule' as const,
          _created_by: item.created_by,
          _resource_user_id: assignee?.user_id,
        };
      });

      // Activities overlay removed — legacy table no longer used

      // Sort all items by start time
      visits.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      // Filter by assigned_to if specified
      if (filters.assigned_to && filters.assigned_to !== 'all') {
        const uid = filters.assigned_to;
        return visits.filter(v => 
          v.assigned_user?.id === uid || 
          (v as any)._resource_user_id === uid
        );
      }

      return visits;
    } catch (error: any) {
      toast.error('Erro ao carregar visitas: ' + error.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [companyId, ensureVisitsBoard]);

  // Create a visit (schedule_item in Visitas board)
  const createVisit = useCallback(async (visitData: {
    contact_id: string;
    title: string;
    description?: string;
    visit_type: string;
    location?: string;
    start_time: string;
    end_time: string;
    status: string;
    notes?: string;
    assigned_to?: string;
  }): Promise<boolean> => {
    try {
      const board = await ensureVisitsBoard();
      if (!board) throw new Error('Não foi possível obter o board de visitas');

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Utilizador não autenticado');

      // Create schedule item
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Perfil de utilizador não encontrado');
      const { data: item, error: itemError } = await supabase
        .from('schedule_items')
        .insert({
          board_id: board.id,
          title: visitData.title,
          description: visitData.description,
          location: visitData.location,
          start_datetime: visitData.start_time,
          end_datetime: visitData.end_time,
          status: visitData.status === 'scheduled' ? 'scheduled' :
                  visitData.status === 'completed' ? 'completed' :
                  visitData.status === 'cancelled' ? 'cancelled' : 'scheduled',
          origin: 'manual',
          contact_id: visitData.contact_id,
          notes: visitData.notes,
          metadata: { visit_type: visitData.visit_type },
          organization_id: companyId,
          created_by: businessUserId,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // Find or create resource for assigned user and add as assignee
      // assignedUserId should be anew_users.id (internal id) since schedule_resources.user_id references anew_users
      let assignedUserId = visitData.assigned_to;
      if (!assignedUserId) {
        assignedUserId = businessUserId;
      }
      
      // Check if resource exists for this user
      let { data: resource } = await supabase
        .from('schedule_resources')
        .select('id')
        .eq('user_id', assignedUserId)
        .eq('is_active', true)
        .single();

      if (!resource) {
        // Get user name for resource
        const { data: anewUser } = await supabase
          .from('anew_users')
          .select('name')
          .eq('id', assignedUserId)
          .maybeSingle();

        // Create resource for user
        const { data: newResource, error: resourceError } = await supabase
          .from('schedule_resources')
          .insert({
            name: anewUser?.name || 'Utilizador',
            resource_type: 'user',
            user_id: assignedUserId,
            color: '#10b981',
            is_active: true,
            metadata: {},
            created_by: businessUserId,
            organization_id: companyId,
          })
          .select()
          .single();

        if (!resourceError) {
          resource = newResource;
        }
      }

      // Add assignee if resource exists
      if (resource && item) {
        await supabase
          .from('schedule_item_assignees')
          .insert({
            item_id: item.id,
            resource_id: resource.id,
          });
      }

      toast.success('Visita agendada com sucesso!');
      return true;
    } catch (error: any) {
      toast.error('Erro ao agendar visita: ' + error.message);
      return false;
    }
  }, [companyId, ensureVisitsBoard]);

  // Update visit status
  const updateVisitStatus = useCallback(async (
    visitId: string,
    newStatus: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
  ): Promise<boolean> => {
    try {
      const mappedStatus = newStatus === 'rescheduled' ? 'scheduled' : newStatus;
      
      const { error } = await supabase
        .from('schedule_items')
        .update({ status: mappedStatus })
        .eq('id', visitId);

      if (error) throw error;
      toast.success('Estado atualizado');
      return true;
    } catch (error: any) {
      toast.error('Erro ao atualizar: ' + error.message);
      return false;
    }
  }, []);

  // Update visit (full edit)
  const updateVisit = useCallback(async (
    visitId: string,
    visitData: {
      title: string;
      description?: string;
      visit_type: string;
      location?: string;
      start_time: string;
      end_time: string;
      status: string;
      notes?: string;
    }
  ): Promise<boolean> => {
    try {
      const mappedStatus = visitData.status === 'scheduled' ? 'scheduled' :
                          visitData.status === 'completed' ? 'completed' :
                          visitData.status === 'cancelled' ? 'cancelled' : 'scheduled';

      // Preserve existing metadata (e.g. metadata.lead_id) and only update visit_type
      const { data: existing, error: existingError } = await supabase
        .from('schedule_items')
        .select('metadata')
        .eq('id', visitId)
        .single();

      if (existingError) throw existingError;
      const existingMeta = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, any>)
        : {};
      const nextMetadata = { ...existingMeta, visit_type: visitData.visit_type };
      
      const { error } = await supabase
        .from('schedule_items')
        .update({
          title: visitData.title,
          description: visitData.description,
          location: visitData.location,
          start_datetime: visitData.start_time,
          end_datetime: visitData.end_time,
          status: mappedStatus,
          notes: visitData.notes,
          metadata: nextMetadata,
        })
        .eq('id', visitId);

      if (error) throw error;
      toast.success('Visita atualizada com sucesso!');
      return true;
    } catch (error: any) {
      toast.error('Erro ao atualizar visita: ' + error.message);
      return false;
    }
  }, []);

  return {
    loading,
    fetchVisits,
    fetchBoards,
    createVisit,
    updateVisit,
    updateVisitStatus,
    visitsBoard,
  };
}
