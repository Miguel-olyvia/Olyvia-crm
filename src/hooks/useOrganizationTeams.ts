import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

export interface Team {
  id: string;
  organization_id: string;
  name: string;
  icon: string;
  description: string | null;
  leader_id: string | null;
  reports_to_team_id: string | null;
  display_order: number;
  is_active: boolean;
  members: string[]; // user_ids
}

export interface TeamFormData {
  name: string;
  icon: string;
  description: string;
  leader_id: string;
  reports_to_team_id: string | null;
  member_ids: string[];
}

export function useOrganizationTeams(orgId: string) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTeams = useCallback(async () => {
    try {
      const { data: teamRows } = await (supabase as any)
        .from("organization_teams")
        .select("*")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (!teamRows || teamRows.length === 0) {
        setTeams([]);
        setLoading(false);
        return;
      }

      const teamIds = teamRows.map((t: any) => t.id);
      const { data: memberRows } = await (supabase as any)
        .from("organization_team_members")
        .select("team_id, user_id")
        .in("team_id", teamIds);

      const membersByTeam = new Map<string, string[]>();
      for (const m of (memberRows || [])) {
        const arr = membersByTeam.get(m.team_id) || [];
        arr.push(m.user_id);
        membersByTeam.set(m.team_id, arr);
      }

      const result: Team[] = teamRows.map((t: any) => ({
        ...t,
        members: membersByTeam.get(t.id) || [],
      }));

      setTeams(result);
    } catch (error) {
      console.error("Error loading teams:", error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const createTeam = useCallback(async (data: TeamFormData) => {
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const teamId = crypto.randomUUID();

      const { error } = await (supabase as any)
        .from("organization_teams")
        .insert({
          id: teamId,
          organization_id: orgId,
          name: data.name,
          icon: data.icon,
          description: data.description || null,
          leader_id: data.leader_id || null,
          reports_to_team_id: data.reports_to_team_id || null,
          display_order: teams.length,
          created_by: businessUserId,
        });

      if (error) throw error;

      // Add members
      const allMemberIds = new Set(data.member_ids);
      if (data.leader_id) allMemberIds.add(data.leader_id);

      if (allMemberIds.size > 0) {
        // Remove these users from any other team first (unique constraint)
        await (supabase as any)
          .from("organization_team_members")
          .delete()
          .in("user_id", Array.from(allMemberIds));

        const inserts = Array.from(allMemberIds).map(uid => ({
          team_id: teamId,
          user_id: uid,
        }));

        const { error: memberError } = await (supabase as any)
          .from("organization_team_members")
          .insert(inserts);

        if (memberError) throw memberError;
      }

      toast.success("Grupo criado com sucesso");
      await loadTeams();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar grupo");
      return false;
    }
  }, [orgId, teams.length, loadTeams]);

  const updateTeam = useCallback(async (teamId: string, data: TeamFormData) => {
    try {
      const { error } = await (supabase as any)
        .from("organization_teams")
        .update({
          name: data.name,
          icon: data.icon,
          description: data.description || null,
          leader_id: data.leader_id || null,
          reports_to_team_id: data.reports_to_team_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", teamId);

      if (error) throw error;

      // Sync members: remove old, add new
      const allMemberIds = new Set(data.member_ids);
      if (data.leader_id) allMemberIds.add(data.leader_id);

      // Delete existing members of this team
      await (supabase as any)
        .from("organization_team_members")
        .delete()
        .eq("team_id", teamId);

      // Remove these users from other teams (unique constraint)
      if (allMemberIds.size > 0) {
        await (supabase as any)
          .from("organization_team_members")
          .delete()
          .in("user_id", Array.from(allMemberIds));

        const inserts = Array.from(allMemberIds).map(uid => ({
          team_id: teamId,
          user_id: uid,
        }));

        const { error: memberError } = await (supabase as any)
          .from("organization_team_members")
          .insert(inserts);

        if (memberError) throw memberError;
      }

      toast.success("Grupo atualizado com sucesso");
      await loadTeams();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar grupo");
      return false;
    }
  }, [loadTeams]);

  const deleteTeam = useCallback(async (teamId: string) => {
    try {
      // Members are cascade-deleted, they'll appear in "Sem Grupo"
      const { error } = await (supabase as any)
        .from("organization_teams")
        .delete()
        .eq("id", teamId);

      if (error) throw error;
      toast.success("Grupo eliminado");
      await loadTeams();
    } catch (error: any) {
      toast.error(error.message || "Erro ao eliminar grupo");
    }
  }, [loadTeams]);

  const moveMemberToTeam = useCallback(async (userId: string, targetTeamId: string | null) => {
    try {
      // Remove from current team
      await (supabase as any)
        .from("organization_team_members")
        .delete()
        .eq("user_id", userId);

      if (targetTeamId) {
        const { error } = await (supabase as any)
          .from("organization_team_members")
          .insert({ team_id: targetTeamId, user_id: userId });
        if (error) throw error;
      }

      await loadTeams();
    } catch (error: any) {
      toast.error(error.message || "Erro ao mover membro");
    }
  }, [loadTeams]);

  const reorderTeams = useCallback(async (orderedIds: string[]) => {
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await (supabase as any)
          .from("organization_teams")
          .update({ display_order: i })
          .eq("id", orderedIds[i]);
      }
      await loadTeams();
    } catch (error: any) {
      console.error("Error reordering:", error);
    }
  }, [loadTeams]);

  const promoteToLeader = useCallback(async (teamId: string, userId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("organization_teams")
        .update({ leader_id: userId, updated_at: new Date().toISOString() })
        .eq("id", teamId);
      if (error) throw error;

      // Ensure user is in the team
      const team = teams.find(t => t.id === teamId);
      if (team && !team.members.includes(userId)) {
        await (supabase as any)
          .from("organization_team_members")
          .delete()
          .eq("user_id", userId);
        await (supabase as any)
          .from("organization_team_members")
          .insert({ team_id: teamId, user_id: userId });
      }

      toast.success("Líder atualizado");
      await loadTeams();
    } catch (error: any) {
      toast.error(error.message);
    }
  }, [teams, loadTeams]);

  return {
    teams,
    loading,
    createTeam,
    updateTeam,
    deleteTeam,
    moveMemberToTeam,
    reorderTeams,
    promoteToLeader,
    reload: loadTeams,
  };
}
