import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';
import type {
  ScheduleBoard,
  ScheduleItem,
  ScheduleResource,
  ScheduleItemAssignee,
  ScheduleFilters,
  AvailableSlot,
} from '@/types/scheduling';

export function useScheduling(companyId?: string) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  // BOARDS
  const fetchBoards = useCallback(async (): Promise<ScheduleBoard[]> => {
    setLoading(true);
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
      toast.error(t('scheduling.board.loadError') + ': ' + error.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  // Ensure time-off board exists
  const ensureTimeOffBoard = useCallback(async (): Promise<ScheduleBoard | null> => {
    if (!companyId) return null;
    
    try {
      // Check if time-off board exists using maybeSingle to avoid error if not found
      const { data: existing, error: fetchError } = await supabase
        .from('schedule_boards')
        .select('*')
        .eq('organization_id', companyId)
        .eq('board_type', 'time_off')
        .eq('is_system_board', true)
        .maybeSingle();
      
      if (fetchError) {
        console.error('Error checking time-off board:', fetchError);
        return null;
      }
      
      if (existing) return existing as ScheduleBoard;
      
      // Create time-off board
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) return null;
      
      const { data: newBoard, error } = await supabase
        .from('schedule_boards')
        .insert({
          name: 'Férias e Ausências',
          name_key: 'scheduling.timeOff.boardName',
          description: 'Gestão de férias, ausências e folgas',
          color: '#f59e0b',
          board_type: 'time_off',
          is_system_board: true,
          is_active: true,
          settings: {},
          created_by: businessUserId,
          organization_id: companyId,
        })
        .select()
        .single();
      
      if (error) throw error;
      return newBoard as ScheduleBoard;
    } catch (error: any) {
      console.error('Error ensuring time-off board:', error);
      return null;
    }
  }, [companyId]);

  const createBoard = useCallback(async (board: Partial<ScheduleBoard>): Promise<ScheduleBoard | null> => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Utilizador não autenticado');
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Perfil de utilizador não encontrado');

      const insertData = {
        name: board.name || 'Novo Board',
        description: board.description,
        color: board.color || '#3b82f6',
        settings: board.settings || {},
        is_active: board.is_active ?? true,
        created_by: businessUserId,
        organization_id: companyId,
      };

      const { data, error } = await supabase
        .from('schedule_boards')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      toast.success(t('scheduling.board.createSuccess'));
      return data as ScheduleBoard;
    } catch (error: any) {
      toast.error(t('scheduling.board.createError') + ': ' + error.message);
      return null;
    }
  }, [companyId, t]);

  const updateBoard = useCallback(async (id: string, updates: Partial<ScheduleBoard>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('schedule_boards')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success(t('scheduling.board.updateSuccess'));
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.board.updateError') + ': ' + error.message);
      return false;
    }
  }, [t]);

  const deleteBoard = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('schedule_boards')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      toast.success(t('scheduling.board.deleteSuccess'));
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.board.deleteError') + ': ' + error.message);
      return false;
    }
  }, [t]);

  // RESOURCES
  const fetchResources = useCallback(async (): Promise<ScheduleResource[]> => {
    try {
      let query = supabase
        .from('schedule_resources')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (companyId) {
        query = query.eq('organization_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      const resources = (data || []) as ScheduleResource[];

      // Resolve user names via anew_users (user_id is now anew_users.id)
      const userIds = resources.map(r => r.user_id).filter(Boolean) as string[];
      if (userIds.length > 0) {
        const { data: anewUsers } = await supabase
          .from('anew_users')
          .select('id, name')
          .in('id', userIds);

        if (anewUsers) {
          const nameMap = new Map(anewUsers.map(u => [u.id, u.name || '']));
          return resources.map(r => ({
            ...r,
            user: r.user_id && nameMap.has(r.user_id)
              ? { name: nameMap.get(r.user_id)! }
              : r.user,
          }));
        }
      }

      return resources;
    } catch (error: any) {
      toast.error(t('scheduling.resource.loadError') + ': ' + error.message);
      return [];
    }
  }, [companyId]);

  const createResource = useCallback(async (resource: Partial<ScheduleResource>): Promise<ScheduleResource | null> => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Utilizador não autenticado');
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Perfil de utilizador não encontrado');

      const insertData = {
        name: resource.name || 'Novo Recurso',
        resource_type: resource.resource_type || 'user',
        user_id: resource.user_id,
        employee_id: resource.employee_id,
        color: resource.color || '#10b981',
        max_daily_capacity: resource.max_daily_capacity || 8,
        is_active: resource.is_active ?? true,
        metadata: resource.metadata || {},
        created_by: businessUserId,
        organization_id: companyId,
      };

      const { data, error } = await supabase
        .from('schedule_resources')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      toast.success(t('scheduling.resource.createSuccess'));
      return data as ScheduleResource;
    } catch (error: any) {
      toast.error(t('scheduling.resource.createError') + ': ' + error.message);
      return null;
    }
  }, [companyId, t]);

  const updateResource = useCallback(async (id: string, updates: Partial<ScheduleResource>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('schedule_resources')
        .update(updates as any)
        .eq('id', id);

      if (error) throw error;
      toast.success(t('scheduling.resource.updateSuccess'));
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.resource.updateError') + ': ' + error.message);
      return false;
    }
  }, [t]);

  const deleteResource = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('schedule_resources')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      toast.success(t('scheduling.resource.deleteSuccess'));
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.resource.deleteError') + ': ' + error.message);
      return false;
    }
  }, [t]);

  // SCHEDULE ITEMS
  const fetchItems = useCallback(async (filters: ScheduleFilters): Promise<ScheduleItem[]> => {
    setLoading(true);
    try {
      let query = supabase
        .from('schedule_items')
        .select(`
          *,
          board:schedule_boards(id, name, color, board_type, is_system_board, name_key),
          assignees:schedule_item_assignees(
            id, resource_id, role, confirmed_at,
            resource:schedule_resources(id, name, color, resource_type, user_id)
          )
        `)
        .or(`and(start_datetime.gte.${filters.dateFrom.toISOString()},start_datetime.lte.${filters.dateTo.toISOString()}),and(end_datetime.gte.${filters.dateFrom.toISOString()},end_datetime.lte.${filters.dateTo.toISOString()}),and(start_datetime.lte.${filters.dateFrom.toISOString()},end_datetime.gte.${filters.dateTo.toISOString()})`)
        .order('start_datetime');

      if (companyId) {
        query = query.eq('organization_id', companyId);
      }

      if (filters.boardIds?.length) {
        query = query.in('board_id', filters.boardIds);
      }

      if (filters.clientId) {
        query = query.eq('client_id', filters.clientId);
      }

      if (filters.contactId) {
        query = query.eq('contact_id', filters.contactId);
      }

      if (filters.status?.length) {
        query = query.in('status', filters.status);
      }

      // NOTE: assigneeId filtering is done client-side after fetching,
      // to match by resource.user_id (who is assigned) instead of created_by

      const { data, error } = await query;
      if (error) throw error;

      // Filter by assigned resource's user_id (scope "mine" or "team")
      let items = (data || []) as unknown as ScheduleItem[];
      if (filters.assigneeIds && filters.assigneeIds.length > 0) {
        const allowedIds = new Set(filters.assigneeIds);
        items = items.filter(item =>
          item.assignees?.some(a => allowedIds.has((a as any).resource?.user_id || ""))
        );
      } else if (filters.assigneeId) {
        items = items.filter(item =>
          item.assignees?.some(a => (a as any).resource?.user_id === filters.assigneeId)
        );
      }

      // Filter by specific resources if needed
      if (filters.resourceIds?.length) {
        items = items.filter(item =>
          item.assignees?.some(a => filters.resourceIds!.includes(a.resource_id))
        );
      }

      return items;
    } catch (error: any) {
      toast.error(t('scheduling.item.loadError') + ': ' + error.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const createItem = useCallback(async (
    item: Partial<ScheduleItem>,
    assigneeResourceIds?: string[]
  ): Promise<ScheduleItem | null> => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Utilizador não autenticado');
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error('Perfil de utilizador não encontrado');

      const insertData = {
        board_id: item.board_id!,
        title: item.title || 'Novo Agendamento',
        description: item.description,
        status: item.status || 'draft',
        origin: item.origin || 'manual',
        start_datetime: item.start_datetime!,
        end_datetime: item.end_datetime!,
        all_day: item.all_day ?? false,
        client_id: item.client_id,
        contact_id: item.contact_id,
        deal_id: item.deal_id,
        employee_id: item.employee_id,
        user_id: item.user_id,
        location: item.location,
        location_lat: item.location_lat,
        location_lng: item.location_lng,
        color: item.color,
        priority: item.priority ?? 0,
        tags: item.tags,
        notes: item.notes,
        metadata: item.metadata || {},
        time_off_type: item.time_off_type,
        approval_status: item.approval_status,
        created_by: businessUserId,
        organization_id: companyId,
      };

      const { data, error } = await supabase
        .from('schedule_items')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Resolve assignees: if none provided, fall back to the creator so the item
      // appears in their "Os meus" calendar scope.
      let effectiveResourceIds = assigneeResourceIds ?? [];
      if (effectiveResourceIds.length === 0 && data) {
        // Find or create a schedule_resources row for the creator (anew_users.id)
        let { data: creatorResource } = await supabase
          .from('schedule_resources')
          .select('id')
          .eq('user_id', businessUserId)
          .eq('is_active', true)
          .maybeSingle();

        if (!creatorResource) {
          const { data: anewUser } = await supabase
            .from('anew_users')
            .select('name')
            .eq('id', businessUserId)
            .maybeSingle();

          const { data: newResource } = await supabase
            .from('schedule_resources')
            .insert({
              name: anewUser?.name || 'Utilizador',
              resource_type: 'user',
              user_id: businessUserId,
              color: '#10b981',
              is_active: true,
              metadata: {},
              created_by: businessUserId,
              organization_id: companyId,
            })
            .select('id')
            .single();
          creatorResource = newResource;
        }

        if (creatorResource?.id) {
          effectiveResourceIds = [creatorResource.id];
        }
      }

      // Add assignees (dedupe just in case)
      if (effectiveResourceIds.length && data) {
        const uniqueIds = Array.from(new Set(effectiveResourceIds));
        const assignees = uniqueIds.map(resourceId => ({
          item_id: data.id,
          resource_id: resourceId,
        }));

        await supabase.from('schedule_item_assignees').insert(assignees);
      }

      toast.success(t('scheduling.item.createSuccess'));
      return data as ScheduleItem;
    } catch (error: any) {
      toast.error(t('scheduling.item.createError') + ': ' + error.message);
      return null;
    }
  }, [companyId]);

  const updateItem = useCallback(async (
    id: string,
    updates: Partial<ScheduleItem>
  ): Promise<boolean> => {
    try {
      // Only send columns that actually exist in the schedule_items table
      const validColumns = [
        'board_id', 'title', 'description', 'location', 'start_datetime', 'end_datetime',
        'status', 'origin', 'contact_id', 'client_id', 'employee_id', 'user_id',
        'notes', 'metadata', 'organization_id', 'time_off_type',
        'approval_status', 'approved_by', 'approved_at',
      ];
      const cleanUpdates: Record<string, any> = {};
      for (const key of validColumns) {
        if (key in updates) {
          cleanUpdates[key] = (updates as any)[key];
        }
      }

      const { error } = await supabase
        .from('schedule_items')
        .update(cleanUpdates as any)
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.item.updateError') + ': ' + error.message);
      return false;
    }
  }, []);

  const deleteItem = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('schedule_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success(t('scheduling.item.deleteSuccess'));
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.item.deleteError') + ': ' + error.message);
      return false;
    }
  }, []);

  // Drag & drop - update dates
  const rescheduleItem = useCallback(async (
    id: string,
    newStart: Date,
    newEnd: Date
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('schedule_items')
        .update({
          start_datetime: newStart.toISOString(),
          end_datetime: newEnd.toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      toast.success(t('scheduling.item.rescheduleSuccess'));
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.item.rescheduleError') + ': ' + error.message);
      return false;
    }
  }, []);

  // ASSIGNEES
  const updateAssignees = useCallback(async (
    itemId: string,
    resourceIds: string[]
  ): Promise<boolean> => {
    try {
      // Remove existing
      await supabase
        .from('schedule_item_assignees')
        .delete()
        .eq('item_id', itemId);

      // Add new
      if (resourceIds.length) {
        const assignees = resourceIds.map(resourceId => ({
          item_id: itemId,
          resource_id: resourceId,
        }));

        const { error } = await supabase
          .from('schedule_item_assignees')
          .insert(assignees);

        if (error) throw error;
      }

      return true;
    } catch (error: any) {
      toast.error(t('scheduling.item.assigneesError') + ': ' + error.message);
      return false;
    }
  }, []);

  // AVAILABILITY
  const getAvailableSlots = useCallback(async (
    resourceId: string,
    date: Date,
    durationMinutes: number = 60
  ): Promise<AvailableSlot[]> => {
    try {
      const { data, error } = await supabase.rpc('get_resource_available_slots', {
        p_resource_id: resourceId,
        p_date: date.toISOString().split('T')[0],
        p_duration_minutes: durationMinutes,
      });

      if (error) throw error;
      return (data || []) as AvailableSlot[];
    } catch (error: any) {
      console.error('Erro ao obter slots disponíveis:', error);
      return [];
    }
  }, []);

  const checkConflict = useCallback(async (
    resourceId: string,
    start: Date,
    end: Date,
    excludeItemId?: string
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_schedule_conflict', {
        p_resource_id: resourceId,
        p_start: start.toISOString(),
        p_end: end.toISOString(),
        p_exclude_item_id: excludeItemId || null,
      });

      if (error) throw error;
      return data as boolean;
    } catch (error: any) {
      console.error('Erro ao verificar conflito:', error);
      return false;
    }
  }, []);

  return {
    loading,
    // Boards
    fetchBoards,
    createBoard,
    updateBoard,
    deleteBoard,
    ensureTimeOffBoard,
    // Resources
    fetchResources,
    createResource,
    updateResource,
    deleteResource,
    // Items
    fetchItems,
    createItem,
    updateItem,
    deleteItem,
    rescheduleItem,
    // Assignees
    updateAssignees,
    // Availability
    getAvailableSlots,
    checkConflict,
  };
}
