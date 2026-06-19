import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface ScheduleInvitation {
  id: string;
  schedule_item_id: string;
  invitee_type: 'user' | 'user_group' | 'company' | 'business_unit' | 'business_area';
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
  response_message?: string;
  invited_by: string;
  invited_at: string;
  responded_at?: string;
  email_sent: boolean;
  email_sent_at?: string;
  created_at: string;
  updated_at: string;
}

export interface InviteeOption {
  type: 'user' | 'user_group' | 'company' | 'business_unit' | 'business_area';
  id: string;
  name: string;
  subtext?: string;
}

export function useScheduleInvitations(companyId?: string) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const fetchInviteOptions = useCallback(async (): Promise<{
    users: InviteeOption[];
    groups: InviteeOption[];
    companies: InviteeOption[];
    businessUnits: InviteeOption[];
    businessAreas: InviteeOption[];
  }> => {
    setLoading(true);
    try {
      // Step 1: Resolve user IDs from anew_memberships (no profiles)
      let userIds: string[] = [];
      if (companyId) {
        const { data: memberships } = await supabase
          .from('anew_memberships')
          .select('user_id')
          .eq('organization_id', companyId)
          .eq('status', 'active');
        userIds = [...new Set((memberships || []).map(m => m.user_id))];
      }

      // Step 2: Fetch users + roles + orgs in parallel
      const [usersRes, groupsRes, orgsRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('anew_users').select('id, name, auth_user_id').in('id', userIds)
          : !companyId
            ? supabase.from('anew_users').select('id, name, auth_user_id')
            : Promise.resolve({ data: [] as any[], error: null }),
        supabase.from('anew_roles').select('id, name').order('name'),
        companyId
          ? supabase.from('anew_organizations').select('id, name, type').eq('id', companyId)
          : supabase.from('anew_organizations').select('id, name, type').order('name'),
      ]);

      return {
        users: ((usersRes.data || []) as any[]).map(u => ({
          type: 'user' as const,
          id: u.id,
          name: u.name || t('common.user'),
        })),
        groups: ((groupsRes.data || []) as any[]).map(g => ({
          type: 'user_group' as const,
          id: g.id,
          name: g.name,
          subtext: t('scheduling.invitees.group'),
        })),
        companies: ((orgsRes.data || []) as any[]).filter((o: any) => o.type === 'company').map((c: any) => ({
          type: 'company' as const,
          id: c.id,
          name: c.name,
          subtext: t('scheduling.invitees.company'),
        })),
        businessUnits: ((orgsRes.data || []) as any[]).filter((o: any) => o.type === 'business_unit').map((u: any) => ({
          type: 'business_unit' as const,
          id: u.id,
          name: u.name,
          subtext: t('scheduling.invitees.unit'),
        })),
        businessAreas: ((orgsRes.data || []) as any[]).filter((o: any) => o.type === 'department' || o.type === 'business_area').map((a: any) => ({
          type: 'business_area' as const,
          id: a.id,
          name: a.name,
          subtext: t('scheduling.invitees.area'),
        })),
      };
    } catch (error: any) {
      toast.error(t('scheduling.invitations.loadError') + ': ' + error.message);
      return { users: [], groups: [], companies: [], businessUnits: [], businessAreas: [] };
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  const sendInvitations = useCallback(async (
    scheduleItemId: string,
    invitees: Array<{ type: string; id: string }>,
    companyIdOverride?: string
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-schedule-invite', {
        body: {
          schedule_item_id: scheduleItemId,
          invitees,
          organization_id: companyIdOverride || companyId,
        },
      });

      if (error) throw error;

      const successCount = data.results?.filter((r: any) => r.status === 'success').length || 0;
      toast.success(t('scheduling.invitations.sentSuccess', { count: successCount }));
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.invitations.sendError') + ': ' + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  const fetchItemInvitations = useCallback(async (scheduleItemId: string): Promise<ScheduleInvitation[]> => {
    try {
      const { data, error } = await supabase
        .from('schedule_invitations')
        .select('*')
        .eq('schedule_item_id', scheduleItemId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ScheduleInvitation[];
    } catch (error: any) {
      console.error('Error fetching invitations:', error);
      return [];
    }
  }, []);

  const respondToInvitation = useCallback(async (
    invitationId: string,
    status: 'accepted' | 'declined' | 'tentative',
    message?: string
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('schedule_invitations')
        .update({
          status,
          response_message: message,
          responded_at: new Date().toISOString(),
        })
        .eq('id', invitationId);

      if (error) throw error;

      const statusKey = status === 'accepted' ? 'accepted' : status === 'declined' ? 'declined' : 'tentative';
      toast.success(t(`scheduling.invitations.response.${statusKey}`));
      return true;
    } catch (error: any) {
      toast.error(t('scheduling.invitations.responseError') + ': ' + error.message);
      return false;
    }
  }, [t]);

  const fetchMyInvitations = useCallback(async (): Promise<ScheduleInvitation[]> => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];

      const { data, error } = await supabase
        .from('schedule_invitations')
        .select(`
          *,
          schedule_item:schedule_items(id, title, start_datetime, end_datetime, location)
        `)
        .eq('invitee_type', 'user')
        .eq('invitee_id', user.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ScheduleInvitation[];
    } catch (error: any) {
      console.error('Error fetching my invitations:', error);
      return [];
    }
  }, []);

  return {
    loading,
    fetchInviteOptions,
    sendInvitations,
    fetchItemInvitations,
    respondToInvitation,
    fetchMyInvitations,
  };
}
