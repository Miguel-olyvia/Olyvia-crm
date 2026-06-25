import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MemberDataDialog } from "./MemberDataDialog";
import { CreateTeamDialog } from "./CreateTeamDialog";
import { TeamGroupCard, UnassignedMembersSection } from "./TeamGroupCard";
import { useOrganizationTeams, Team } from "@/hooks/useOrganizationTeams";
import { usePresence } from "@/hooks/usePresence";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, Plus, ChevronRight, ChevronDown, User, GripVertical,
  Mail, Phone, MessageCircle, Eye, Briefcase, Edit, RefreshCw,
  Trophy, AlertTriangle, TrendingUp, Building2, FileDown, ArrowUp, ArrowDown,
  Clock, UserMinus, Globe, BarChart3, Target, UsersRound,
} from "lucide-react";
import { getOrgTypeLabel, OrgType } from "@/components/orgchart/OrgChartCard";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MemberHierarchyTabProps {
  orgId: string;
  orgName: string;
  orgType: string;
  canManage: boolean;
}

interface OrgNode {
  id: string;
  name: string;
  type: string;
  members: MemberNode[];
  children: OrgNode[];
}

interface MemberNode {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  position: string;
  roleName: string;
  roleCode: string;
  orgId: string;
  orgName: string;
  startDate: string | null;
  authUserId: string | null;
  reportsTo: { userId: string; name: string }[];
  subordinates: { userId: string; name: string }[];
  // Performance data (loaded lazily)
  leadCount?: number;
  dealCount?: number;
  dealValue?: number;
  conversionRate?: number;
  lastLoginAt?: string | null;
  teamSize?: number;
}

interface ReportingLink {
  id: string;
  member_id: string;
  reports_to_id: string;
  organization_id: string;
}

export function MemberHierarchyTab({ orgId, orgName, orgType, canManage }: MemberHierarchyTabProps) {
  const { t, language } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<OrgNode | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [reportingLinks, setReportingLinks] = useState<ReportingLink[]>([]);
  const [allMembers, setAllMembers] = useState<MemberNode[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberNode | null>(null);
  const [memberActivities, setMemberActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Drag state
  const [draggedMember, setDraggedMember] = useState<MemberNode | null>(null);
  const [dragOverOrg, setDragOverOrg] = useState<string | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<{ member: MemberNode; targetOrg: OrgNode } | null>(null);


  // KPI data
  const [kpis, setKpis] = useState({ total: 0, online: 0, inactive: 0, totalLeads: 0, totalDeals: 0, totalDealValue: 0 });

  // Teams
  const { teams, loading: teamsLoading, createTeam, updateTeam, deleteTeam, moveMemberToTeam, promoteToLeader, reload: reloadTeams } = useOrganizationTeams(orgId);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const [dragOverTeam, setDragOverTeam] = useState<string | null>(null);
  const [draggedUserId, setDraggedUserId] = useState<string | null>(null);

  // Presence — use same system as internal chat
  const [currentAnewUserId, setCurrentAnewUserId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await (supabase as any).from("anew_users").select("id").eq("auth_user_id", session.user.id).maybeSingle();
      setCurrentAnewUserId(data?.id || null);
    })();
  }, []);
  const { isOnline: isUserOnline, onlineUserIds } = usePresence(currentAnewUserId);

  // Org path for breadcrumbs
  const [orgAncestors, setOrgAncestors] = useState<{ id: string; name: string; type: string }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get hierarchy
      const { data: hierarchy } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");

      const childrenMap = new Map<string, string[]>();
      const parentMap = new Map<string, string>();
      for (const h of (hierarchy || [])) {
        const arr = childrenMap.get(h.parent_org_id) || [];
        arr.push(h.child_org_id);
        childrenMap.set(h.parent_org_id, arr);
        parentMap.set(h.child_org_id, h.parent_org_id);
      }

      const allOrgIds = new Set<string>();
      allOrgIds.add(orgId);
      const collectDescendants = (pid: string) => {
        for (const cid of (childrenMap.get(pid) || [])) {
          if (!allOrgIds.has(cid)) {
            allOrgIds.add(cid);
            collectDescendants(cid);
          }
        }
      };
      collectDescendants(orgId);

      // Build ancestor path
      const ancestors: string[] = [];
      let current = orgId;
      while (parentMap.has(current)) {
        current = parentMap.get(current)!;
        ancestors.unshift(current);
      }

      // 2. Get org details (including ancestors)
      const allRelevantOrgIds = [...Array.from(allOrgIds), ...ancestors];
      const { data: orgs } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name, type")
        .in("id", allRelevantOrgIds);

      const orgMap = new Map<string, { id: string; name: string; type: string }>();
      for (const o of (orgs || [])) orgMap.set(o.id, o);

      // Set ancestor path
      const ancestorPath = ancestors
        .map(aid => orgMap.get(aid))
        .filter(Boolean) as { id: string; name: string; type: string }[];
      const currentOrg = orgMap.get(orgId);
      if (currentOrg) ancestorPath.push(currentOrg);
      setOrgAncestors(ancestorPath);

      // 3. Get memberships
      const { data: memberships } = await (supabase as any)
        .from("anew_memberships")
        .select("id, user_id, organization_id, role_id, status, start_date")
        .in("organization_id", Array.from(allOrgIds))
        .eq("status", "active");

      // 4. Get user details (name, email, phone, avatar, position, auth_user_id)
      const userIds = [...new Set((memberships || []).map((m: any) => m.user_id))];
      const { data: users } = userIds.length > 0
        ? await (supabase as any).from("anew_users").select("id, name, email, phone, avatar_url, position, auth_user_id").in("id", userIds)
        : { data: [] };

      const userMap = new Map<string, any>();
      for (const u of (users || [])) userMap.set(u.id, u);

      // 5. Get roles
      const roleIds = [...new Set((memberships || []).filter((m: any) => m.role_id).map((m: any) => m.role_id))];
      const { data: roles } = roleIds.length > 0
        ? await (supabase as any).from("anew_roles").select("id, name, code").in("id", roleIds)
        : { data: [] };

      const roleMap = new Map<string, { name: string; code: string }>();
      for (const r of (roles || [])) roleMap.set(r.id, { name: r.name, code: r.code || "" });

      // 6. Get reporting links from organization_teams (leader -> members)
      const { data: orgTeams } = await (supabase as any)
        .from("organization_teams")
        .select("id, leader_id, organization_id")
        .in("organization_id", Array.from(allOrgIds));

      const teamIds = (orgTeams || []).map((t: any) => t.id);
      let teamMemberRows: any[] = [];
      if (teamIds.length > 0) {
        const { data: tmRows } = await (supabase as any)
          .from("organization_team_members")
          .select("team_id, user_id")
          .in("team_id", teamIds);
        teamMemberRows = tmRows || [];
      }

      // Convert team structure into reporting links format
      const syntheticLinks: ReportingLink[] = [];
      for (const team of (orgTeams || [])) {
        if (!team.leader_id) continue;
        const members = teamMemberRows.filter((tm: any) => tm.team_id === team.id && tm.user_id !== team.leader_id);
        for (const m of members) {
          syntheticLinks.push({
            id: `${team.id}-${m.user_id}`,
            member_id: m.user_id,
            reports_to_id: team.leader_id,
            organization_id: team.organization_id,
          });
        }
      }

      setReportingLinks(syntheticLinks);

      // 7. Get performance data - leads assigned per user
      const authUserIds = users?.filter((u: any) => u.auth_user_id).map((u: any) => u.auth_user_id) || [];

      const leadCounts = new Map<string, number>();
      const dealCounts = new Map<string, number>();
      const dealValues = new Map<string, number>();
      const convertedCounts = new Map<string, number>();

      if (userIds.length > 0) {
        // Leads assigned to these users (by anew_users.id)
        const { data: leadData } = await (supabase as any)
          .from("anew_leads")
          .select("assigned_to, status")
          .in("assigned_to", userIds)
          .in("organization_id", Array.from(allOrgIds));

        for (const l of (leadData || [])) {
          leadCounts.set(l.assigned_to, (leadCounts.get(l.assigned_to) || 0) + 1);
          if (l.status === "converted") {
            convertedCounts.set(l.assigned_to, (convertedCounts.get(l.assigned_to) || 0) + 1);
          }
        }

        // Deals by auth_user_id (deals.assigned_to references auth.users)
        if (authUserIds.length > 0) {
          const { data: dealData } = await (supabase as any)
            .from("deals")
            .select("assigned_to, value")
            .in("assigned_to", authUserIds)
            .in("organization_id", Array.from(allOrgIds));

          // Map auth_user_id -> anew_user_id for deals
          const authToAnewMap = new Map<string, string>();
          for (const u of (users || [])) {
            if (u.auth_user_id) authToAnewMap.set(u.auth_user_id, u.id);
          }

          for (const d of (dealData || [])) {
            const anewId = authToAnewMap.get(d.assigned_to);
            if (anewId) {
              dealCounts.set(anewId, (dealCounts.get(anewId) || 0) + 1);
              dealValues.set(anewId, (dealValues.get(anewId) || 0) + (d.value || 0));
            }
          }
        }
      }

      // 8. Get last login from auth.users (via anew_users.auth_user_id)
      // We can't query auth.users directly, so we'll use presence/last_sign_in heuristic
      // Use anew_users.updated_at as proxy for activity

      // Build members list
      const membersList: MemberNode[] = (memberships || []).map((m: any) => {
        const user = userMap.get(m.user_id) || {};
        const role = roleMap.get(m.role_id) || { name: "-", code: "" };
        const orgInfo = orgMap.get(m.organization_id);

        const reportsTo = syntheticLinks
          .filter((l: any) => l.member_id === m.user_id && l.organization_id === m.organization_id)
          .map((l: any) => ({ userId: l.reports_to_id, name: userMap.get(l.reports_to_id)?.name || "?" }));

        const subordinates = syntheticLinks
          .filter((l: any) => l.reports_to_id === m.user_id && l.organization_id === m.organization_id)
          .map((l: any) => ({ userId: l.member_id, name: userMap.get(l.member_id)?.name || "?" }));

        const lc = leadCounts.get(m.user_id) || 0;
        const cc = convertedCounts.get(m.user_id) || 0;

        return {
          userId: m.user_id,
          membershipId: m.id,
          name: user.name || "?",
          email: user.email || "",
          phone: user.phone || "",
          avatarUrl: user.avatar_url || null,
          position: user.position || "",
          roleName: role.name,
          roleCode: role.code,
          orgId: m.organization_id,
          orgName: orgInfo?.name || "",
          startDate: m.start_date,
          authUserId: user.auth_user_id || null,
          reportsTo,
          subordinates,
          leadCount: lc,
          dealCount: dealCounts.get(m.user_id) || 0,
          dealValue: dealValues.get(m.user_id) || 0,
          conversionRate: lc > 0 ? Math.round((cc / lc) * 100) : 0,
          lastLoginAt: null, // Will use updated_at as proxy
          teamSize: subordinates.length,
        };
      });

      setAllMembers(membersList);

      // Compute KPIs
      const totalMembers = new Set(membersList.map(m => m.userId)).size;
      const totalLeads = membersList.reduce((sum, m) => sum + (m.leadCount || 0), 0);
      const totalDeals = membersList.reduce((sum, m) => sum + (m.dealCount || 0), 0);
      const totalDealValue = membersList.reduce((sum, m) => sum + (m.dealValue || 0), 0);
      // Inactive: no deals and no leads (simplified heuristic)
      const inactiveCount = membersList.filter(m => !m.leadCount && !m.dealCount).length;
      setKpis({
        total: totalMembers,
        online: 0, // Will be computed reactively from presence
        inactive: inactiveCount,
        totalLeads,
        totalDeals,
        totalDealValue,
      });

      // Build org tree
      const buildOrgNode = (oid: string): OrgNode | null => {
        const org = orgMap.get(oid);
        if (!org) return null;

        const orgMembers = membersList
          .filter(m => m.orgId === oid)
          .sort((a, b) => {
            // Managers first, then by lead count desc, then name
            if (a.subordinates.length !== b.subordinates.length) return b.subordinates.length - a.subordinates.length;
            if ((a.leadCount || 0) !== (b.leadCount || 0)) return (b.leadCount || 0) - (a.leadCount || 0);
            return a.name.localeCompare(b.name);
          });

        const childIds = childrenMap.get(oid) || [];
        const childNodes = childIds
          .map(cid => allOrgIds.has(cid) ? buildOrgNode(cid) : null)
          .filter(Boolean) as OrgNode[];

        const typePriority: Record<string, number> = { holding: 0, empresa: 1, filial: 2, departamento: 3, divisao: 4, equipa: 5, projeto: 6 };
        childNodes.sort((a, b) => (typePriority[a.type] ?? 99) - (typePriority[b.type] ?? 99) || a.name.localeCompare(b.name));

        return { ...org, members: orgMembers, children: childNodes };
      };

      const rootNode = buildOrgNode(orgId);
      setTree(rootNode);
      setExpandedOrgs(new Set([orgId]));
    } catch (error) {
      console.error("Error loading member hierarchy:", error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load activities when a member is selected
  useEffect(() => {
    if (!selectedMember?.userId) {
      setMemberActivities([]);
      return;
    }
    const loadActivities = async () => {
      setLoadingActivities(true);
      try {
        const { data: rawData } = await supabase
          .from("entity_interactions")
          .select("id, subject, interaction_type, created_at, result")
          .eq("created_by", selectedMember.userId)
          .order("created_at", { ascending: false })
          .limit(5);
        const data = (rawData || []).map(r => ({
          id: r.id,
          title: r.subject || "Sem título",
          type: r.interaction_type || "note",
          created_at: r.created_at,
          completed: !!r.result,
        }));
        setMemberActivities(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingActivities(false);
      }
    };
    loadActivities();
  }, [selectedMember?.userId]);

  const toggleOrg = (oid: string) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(oid)) next.delete(oid);
      else next.add(oid);
      return next;
    });
  };

  const expandAll = () => {
    if (!tree) return;
    const ids = new Set<string>();
    const collect = (node: OrgNode) => { ids.add(node.id); node.children.forEach(collect); };
    collect(tree);
    setExpandedOrgs(ids);
  };

  // Drag & drop handlers
  const handleDragStart = (member: MemberNode) => {
    if (!canManage) return;
    setDraggedMember(member);
  };

  const handleDragOver = (e: React.DragEvent, orgId: string) => {
    e.preventDefault();
    setDragOverOrg(orgId);
  };

  const handleDragLeave = () => {
    setDragOverOrg(null);
  };

  const handleDrop = (targetOrgId: string) => {
    if (!draggedMember || draggedMember.orgId === targetOrgId) {
      setDraggedMember(null);
      setDragOverOrg(null);
      return;
    }
    const targetOrg = tree ? findOrgInTree(tree, targetOrgId) : null;
    if (targetOrg) {
      setMoveConfirm({ member: draggedMember, targetOrg });
    }
    setDraggedMember(null);
    setDragOverOrg(null);
  };

  const confirmMove = async () => {
    if (!moveConfirm) return;
    const { member, targetOrg } = moveConfirm;
    try {
      // Update membership organization_id
      const { error } = await (supabase as any)
        .from("anew_memberships")
        .update({ organization_id: targetOrg.id })
        .eq("id", member.membershipId);
      if (error) throw error;
      toast.success(`${member.name} movido para ${targetOrg.name}`);
      setMoveConfirm(null);
      setSelectedMember(null);
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };


  // Move member up/down in org hierarchy
  const moveMemberToOrg = (member: MemberNode, targetOrgId: string) => {
    const targetOrg = tree ? findOrgInTree(tree, targetOrgId) : null;
    if (targetOrg && member.orgId !== targetOrgId) {
      setMoveConfirm({ member, targetOrg });
    }
  };

  // Get initials from name
  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  };

  // Determine member status
  const getMemberStatus = (member: MemberNode) => {
    const isTopPerformer = (member.conversionRate || 0) >= 10 && (member.leadCount || 0) >= 20;
    const isInactive = !member.leadCount && !member.dealCount;
    return { isTopPerformer, isInactive };
  };

  // Get all org options for detail panel "Move to"
  const flatOrgs = useMemo(() => {
    if (!tree) return [];
    const result: { id: string; name: string; type: string }[] = [];
    const collect = (node: OrgNode) => {
      result.push({ id: node.id, name: node.name, type: node.type });
      node.children.forEach(collect);
    };
    collect(tree);
    return result;
  }, [tree]);

  // Compute aggregated metrics for an org group
  const getOrgGroupMetrics = (node: OrgNode) => {
    let totalLeads = 0, totalConversions = 0;
    const collectMetrics = (n: OrgNode) => {
      for (const m of n.members) {
        totalLeads += m.leadCount || 0;
        if (m.leadCount && m.conversionRate) {
          totalConversions += Math.round((m.leadCount * m.conversionRate) / 100);
        }
      }
      n.children.forEach(collectMetrics);
    };
    collectMetrics(node);
    const allMembers = countAllMembers(node);
    const avgConversion = totalLeads > 0 ? Math.round((totalConversions / totalLeads) * 100) : 0;
    return { totalLeads, avgConversion, memberCount: allMembers };
  };

  const countAllMembers = (node: OrgNode): number => {
    return node.members.length + node.children.reduce((sum, c) => sum + countAllMembers(c), 0);
  };

  // Get role badge color
  const getRoleBadgeColor = (roleCode: string) => {
    if (roleCode === "system_admin") return "bg-red-100 text-red-700 border-red-200";
    if (roleCode === "super_admin") return "bg-purple-100 text-purple-700 border-purple-200";
    if (roleCode === "org_admin") return "bg-blue-100 text-blue-700 border-blue-200";
    return "bg-muted text-muted-foreground border-border";
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "call": case "phone": return <Phone className="h-3.5 w-3.5 text-green-500" />;
      case "email": return <Mail className="h-3.5 w-3.5 text-blue-500" />;
      case "meeting": case "visit": return <Users className="h-3.5 w-3.5 text-purple-500" />;
      case "task": return <Target className="h-3.5 w-3.5 text-orange-500" />;
      case "whatsapp": return <Phone className="h-3.5 w-3.5 text-emerald-500" />;
      case "note": return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const formatCurrency = (value: number) => {
    const fixed = Math.abs(value).toFixed(0);
    return '€' + fixed.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hoje " + date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Ontem " + date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) + " " + date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  };

  // Render org node in the left panel
  const renderOrgNode = (node: OrgNode, depth: number = 0) => {
    const isExpanded = expandedOrgs.has(node.id);
    const hasContent = node.members.length > 0 || node.children.length > 0;
    const isRoot = depth === 0;
    const metrics = getOrgGroupMetrics(node);
    const isDragOver = dragOverOrg === node.id;

    return (
      <div key={node.id} className={cn(depth > 0 && "ml-2")}>
        {/* Org group header */}
        <div
          className={cn(
            "flex items-center gap-2 py-2.5 px-3 rounded-lg cursor-pointer transition-all border",
            isRoot ? "bg-primary/5 border-primary/20 mb-1" : "border-transparent hover:bg-muted/50 mb-0.5",
            isDragOver && "bg-primary/10 border-primary/40 ring-2 ring-primary/20"
          )}
          onClick={() => hasContent && toggleOrg(node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={() => handleDrop(node.id)}
        >
          {hasContent ? (
            isExpanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : <span className="w-4" />}

          <OrgTypeIcon type={node.type} />
          <span className="font-semibold text-sm">{node.name}</span>
          <Badge variant="outline" className="text-[10px] ml-1">{metrics.memberCount}</Badge>

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {metrics.totalLeads > 0 && (
              <span>{metrics.totalLeads.toLocaleString("pt-PT")} leads · {metrics.avgConversion}% conversão</span>
            )}
            {!isRoot && node.members.some(m => m.subordinates.length > 0) && (
              <span className="text-muted-foreground/60">Supervisiona toda a equipa</span>
            )}
          </div>
        </div>

        {/* Members - rendered with reporting hierarchy indentation */}
        {isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {(() => {
              // Build reporting tree for this org's members
              const orgMemberIds = new Set(node.members.map(m => m.userId));
              const childrenMap = new Map<string, MemberNode[]>();
              const hasParent = new Set<string>();
              
              // Find reporting links within this org
              for (const link of reportingLinks) {
                if (link.organization_id === node.id && orgMemberIds.has(link.member_id) && orgMemberIds.has(link.reports_to_id)) {
                  hasParent.add(link.member_id);
                  const children = childrenMap.get(link.reports_to_id) || [];
                  const member = node.members.find(m => m.userId === link.member_id);
                  if (member) children.push(member);
                  childrenMap.set(link.reports_to_id, children);
                }
              }
              
              // Root members = those without a parent in this org
              const rootMembers = node.members.filter(m => !hasParent.has(m.userId));
              
              const renderMemberWithHierarchy = (member: MemberNode, indent: number): React.ReactNode => {
                const { isTopPerformer, isInactive } = getMemberStatus(member);
                const isSelected = selectedMember?.userId === member.userId && selectedMember?.orgId === member.orgId;
                const subordinatesInOrg = childrenMap.get(member.userId) || [];
                
                return (
                  <React.Fragment key={`${node.id}-${member.userId}`}>
                    <div
                      draggable={canManage}
                      onDragStart={() => handleDragStart(member)}
                      style={{ marginLeft: `${(indent + 1) * 16}px` }}
                      className={cn(
                        "flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all border",
                        isSelected
                          ? "bg-primary/10 border-primary/30 shadow-sm"
                          : "border-transparent hover:bg-muted/40",
                        isTopPerformer && !isSelected && "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/50",
                        isInactive && !isSelected && "bg-red-50/50 dark:bg-red-950/10 border-red-200/30",
                      )}
                      onClick={() => setSelectedMember(member)}
                    >
                      {/* Drag handle */}
                      {canManage && (
                        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing" />
                      )}

                      {/* Indent connector line */}
                      {indent > 0 && (
                        <span className="text-muted-foreground/40 text-xs">└</span>
                      )}

                      {/* Avatar with online status */}
                      <div className="relative shrink-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatarUrl || undefined} />
                          <AvatarFallback className={cn(
                            "text-xs font-semibold",
                            isTopPerformer ? "bg-emerald-200 text-emerald-800" :
                            isInactive ? "bg-red-200 text-red-800" :
                            "bg-primary/15 text-primary"
                          )}>
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn(
                          "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                          isUserOnline(member.userId) ? "bg-emerald-500" : "bg-gray-300"
                        )} />
                      </div>

                      {/* Name & role */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{member.name}</span>
                          <Badge className={cn("text-[10px] px-1.5 py-0 h-4 border font-medium", getRoleBadgeColor(member.roleCode))}>
                            {member.roleName}
                          </Badge>
                          {isTopPerformer && (
                            <Tooltip>
                              <TooltipTrigger><Trophy className="h-3.5 w-3.5 text-amber-500" /></TooltipTrigger>
                              <TooltipContent>Top Performer</TooltipContent>
                            </Tooltip>
                          )}
                          {isInactive && (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Inativo
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {member.position || member.roleName}
                          {subordinatesInOrg.length > 0 && ` · Supervisiona ${subordinatesInOrg.length} membros`}
                        </div>
                      </div>

                      {/* Mini metrics */}
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        {(member.leadCount || 0) > 0 && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="flex items-center gap-0.5 text-muted-foreground">
                                <FileDown className="h-3 w-3" />
                                {member.leadCount}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Leads atribuídas</TooltipContent>
                          </Tooltip>
                        )}
                        {(member.dealCount || 0) > 0 && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="flex items-center gap-0.5 text-amber-600">
                                <Briefcase className="h-3 w-3" />
                                {member.dealCount}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Deals activos</TooltipContent>
                          </Tooltip>
                        )}
                        {(member.conversionRate || 0) > 0 && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className={cn(
                                "flex items-center gap-0.5 font-medium",
                                (member.conversionRate || 0) >= 8 ? "text-emerald-600" :
                                (member.conversionRate || 0) >= 4 ? "text-amber-600" : "text-red-500"
                              )}>
                                <BarChart3 className="h-3 w-3" />
                                {member.conversionRate}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Taxa de conversão</TooltipContent>
                          </Tooltip>
                        )}
                        {(member.dealValue || 0) > 0 && (
                          <span className="text-emerald-600 font-medium">
                            {formatCurrency(member.dealValue || 0)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Render subordinates recursively */}
                    {subordinatesInOrg
                      .sort((a, b) => (b.subordinates.length - a.subordinates.length) || a.name.localeCompare(b.name))
                      .map(sub => renderMemberWithHierarchy(sub, indent + 1))}
                  </React.Fragment>
                );
              };
              
              return rootMembers
                .sort((a, b) => {
                  if (a.subordinates.length !== b.subordinates.length) return b.subordinates.length - a.subordinates.length;
                  if ((a.leadCount || 0) !== (b.leadCount || 0)) return (b.leadCount || 0) - (a.leadCount || 0);
                  return a.name.localeCompare(b.name);
                })
                .map(m => renderMemberWithHierarchy(m, 0));
            })()}

            {/* Child orgs */}
            {node.children.map(child => renderOrgNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // (orgOptions removed - dialog no longer needs org selection)

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-5 gap-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
            <Skeleton className="h-[500px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Hierarquia — {orgName}
            </h2>
            <p className="text-sm text-muted-foreground">Arraste membros entre equipas para mudar hierarquia</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <FileDown className="h-4 w-4 mr-1" />
              Exportar
            </Button>
            {canManage && (
              <>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => { setEditingTeam(null); setTeamDialogOpen(true); }}
                >
                  <UsersRound className="w-4 h-4 mr-1" />
                  + Criar Grupo
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Mini KPIs */}
        {(() => {
          const assignedUserIds = new Set(teams.flatMap(t => t.members));
          const uniqueUsers = new Set(allMembers.map(m => m.userId));
          const unassignedCount = [...uniqueUsers].filter(uid => !assignedUserIds.has(uid)).length;
          const totalConversion = kpis.totalLeads > 0 
            ? Math.round(allMembers.reduce((s, m) => s + ((m.conversionRate || 0) * (m.leadCount || 0)), 0) / kpis.totalLeads) 
            : 0;
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <KpiChip icon={<Users className="h-3.5 w-3.5" />} label="Total" value={kpis.total} />
              <KpiChip icon={<span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />} label="Online" value={allMembers.filter(m => isUserOnline(m.userId)).length} color="text-emerald-600" />
              <KpiChip icon={<FileDown className="h-3.5 w-3.5" />} label="Leads" value={kpis.totalLeads.toLocaleString("pt-PT")} />
              <KpiChip icon={<Briefcase className="h-3.5 w-3.5" />} label="Deals" value={`${kpis.totalDeals} · ${formatCurrency(kpis.totalDealValue)}`} />
              <KpiChip icon={<BarChart3 className="h-3.5 w-3.5" />} label="Conversão" value={`${totalConversion}%`} />
              {unassignedCount > 0 && (
                <KpiChip icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Sem grupo" value={unassignedCount} color="text-red-600" />
              )}
            </div>
          );
        })()}

        {/* Main 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          {/* LEFT — Team Groups */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-320px)] min-h-[500px]">
                <div className="p-4 space-y-3">
                  {teams.length === 0 && !teamsLoading ? (
                    <>
                      {/* Fallback: show old org tree if no teams created */}
                      {!tree ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          {t("organizations.noMembers")}
                        </p>
                      ) : (
                        renderOrgNode(tree)
                      )}
                    </>
                  ) : (
                    <>
                      {/* Team group cards */}
                      {teams.map(team => {
                        const teamMembers = allMembers
                          .filter(m => team.members.includes(m.userId))
                          .map(m => ({
                            userId: m.userId,
                            name: m.name,
                            avatarUrl: m.avatarUrl,
                            roleName: m.roleName,
                            roleCode: m.roleCode,
                            position: m.position,
                            leadCount: m.leadCount,
                            dealCount: m.dealCount,
                            conversionRate: m.conversionRate,
                            isOnline: isUserOnline(m.userId),
                            isInactive: !m.leadCount && !m.dealCount,
                          }));

                        const leaderMember = allMembers.find(m => m.userId === team.leader_id);
                        const reportsToTeam = teams.find(t => t.id === team.reports_to_team_id);
                        const otherTeams2 = teams.filter(t => t.id !== team.id).map(t => ({ id: t.id, name: t.name, icon: t.icon }));

                        return (
                          <TeamGroupCard
                            key={team.id}
                            team={team}
                            members={teamMembers}
                            leaderName={leaderMember?.name || "—"}
                            reportsToTeamName={reportsToTeam ? `${reportsToTeam.icon} ${reportsToTeam.name}` : undefined}
                            canManage={canManage}
                            isCollapsed={collapsedTeams.has(team.id)}
                            onToggleCollapse={() => {
                              setCollapsedTeams(prev => {
                                const next = new Set(prev);
                                if (next.has(team.id)) next.delete(team.id);
                                else next.add(team.id);
                                return next;
                              });
                            }}
                            onEdit={() => { setEditingTeam(team); setTeamDialogOpen(true); }}
                            onDelete={() => deleteTeam(team.id)}
                            onAddMember={() => { setEditingTeam(team); setTeamDialogOpen(true); }}
                            onMemberClick={(uid) => {
                              const m = allMembers.find(x => x.userId === uid);
                              if (m) setSelectedMember(m);
                            }}
                            onMoveMember={(uid, targetTeamId) => moveMemberToTeam(uid, targetTeamId)}
                            onPromoteLeader={(uid) => promoteToLeader(team.id, uid)}
                            otherTeams={otherTeams2}
                            onDragStartMember={(uid) => setDraggedUserId(uid)}
                            onDragOverGroup={(e) => { e.preventDefault(); setDragOverTeam(team.id); }}
                            onDragLeaveGroup={() => setDragOverTeam(null)}
                            onDropGroup={() => {
                              if (draggedUserId) {
                                moveMemberToTeam(draggedUserId, team.id);
                                setDraggedUserId(null);
                                setDragOverTeam(null);
                              }
                            }}
                            isDragOver={dragOverTeam === team.id}
                            formatCurrency={formatCurrency}
                          />
                        );
                      })}

                      {/* Unassigned members */}
                      {(() => {
                        const assignedIds = new Set(teams.flatMap(t => t.members));
                        const uniqueMembers = Array.from(
                          new Map(allMembers.map(m => [m.userId, m])).values()
                        );
                        const unassigned = uniqueMembers
                          .filter(m => !assignedIds.has(m.userId))
                          .map(m => ({
                            userId: m.userId,
                            name: m.name,
                            avatarUrl: m.avatarUrl,
                            roleName: m.roleName,
                            roleCode: m.roleCode,
                            position: m.position,
                            leadCount: m.leadCount,
                            dealCount: m.dealCount,
                            conversionRate: m.conversionRate,
                            isOnline: isUserOnline(m.userId),
                            isInactive: !m.leadCount && !m.dealCount,
                          }));

                        return (
                          <UnassignedMembersSection
                            members={unassigned}
                            canManage={canManage}
                            teams={teams.map(t => ({ id: t.id, name: t.name, icon: t.icon }))}
                            onMemberClick={(uid) => {
                              const m = allMembers.find(x => x.userId === uid);
                              if (m) setSelectedMember(m);
                            }}
                            onMoveMember={(uid, tid) => moveMemberToTeam(uid, tid)}
                            onDragStartMember={(uid) => setDraggedUserId(uid)}
                          />
                        );
                      })()}
                    </>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* RIGHT — Member Detail */}
          <div className="space-y-4">
            {selectedMember ? (
              <MemberDetailPanel
                member={selectedMember}
                activities={memberActivities}
                loadingActivities={loadingActivities}
                orgAncestors={orgAncestors}
                flatOrgs={flatOrgs}
                canManage={canManage}
                onMoveTo={(orgId) => moveMemberToOrg(selectedMember, orgId)}
                formatCurrency={formatCurrency}
                formatRelativeDate={formatRelativeDate}
                getInitials={getInitials}
                getRoleBadgeColor={getRoleBadgeColor}
                getActivityIcon={getActivityIcon}
                allMembers={allMembers}
                isUserOnline={isUserOnline}
                teams={teams}
                onMoveToTeam={(teamId) => moveMemberToTeam(selectedMember.userId, teamId)}
                onPromoteToLeader={(teamId) => promoteToLeader(teamId, selectedMember.userId)}
                currentUserId={currentAnewUserId}
              />
            ) : (
              <Card className="flex items-center justify-center h-[400px]">
                <div className="text-center text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Selecione um membro para ver detalhes</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Move confirmation dialog */}
      <AlertDialog open={!!moveConfirm} onOpenChange={(open) => !open && setMoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Mover <strong>{moveConfirm?.member.name}</strong> de{" "}
              <strong>{moveConfirm?.member.orgName}</strong> para{" "}
              <strong>{moveConfirm?.targetOrg.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Create/Edit Team Dialog */}
      <CreateTeamDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        onSubmit={async (data) => {
          if (editingTeam) {
            return await updateTeam(editingTeam.id, data);
          } else {
            return await createTeam(data);
          }
        }}
        members={Array.from(new Map(allMembers.map(m => [m.userId, {
          userId: m.userId,
          name: m.name,
          avatarUrl: m.avatarUrl,
          roleName: m.roleName,
        }])).values())}
        teams={teams}
        editingTeam={editingTeam}
      />
    </>
  );
}

// ── Sub-components ──

function KpiChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-background text-sm">
      <span className={cn("flex items-center", color)}>{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn("font-bold", color)}>{value}</span>
    </div>
  );
}

function OrgTypeIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    holding: "text-purple-500",
    empresa: "text-blue-500",
    filial: "text-green-500",
    departamento: "text-amber-500",
    divisao: "text-cyan-500",
    equipa: "text-orange-500",
    projeto: "text-pink-500",
  };
  const icons: Record<string, string> = {
    holding: "🏛️",
    empresa: "🏢",
    filial: "🏬",
    departamento: "📁",
    divisao: "📂",
    equipa: "👥",
    projeto: "📋",
  };
  return <span className="text-sm">{icons[type] || "🏢"}</span>;
}

interface MemberDetailPanelProps {
  member: MemberNode;
  activities: any[];
  loadingActivities: boolean;
  orgAncestors: { id: string; name: string; type: string }[];
  flatOrgs: { id: string; name: string; type: string }[];
  canManage: boolean;
  onMoveTo: (orgId: string) => void;
  formatCurrency: (v: number) => string;
  formatRelativeDate: (d: string) => string;
  getInitials: (name: string) => string;
  getRoleBadgeColor: (code: string) => string;
  getActivityIcon: (type: string) => React.ReactNode;
  allMembers: MemberNode[];
  isUserOnline: (userId: string) => boolean;
  teams?: Team[];
  onMoveToTeam?: (teamId: string | null) => void;
  onPromoteToLeader?: (teamId: string) => void;
  currentUserId?: string | null;
}

function MemberDetailPanel({
  member, activities, loadingActivities, orgAncestors, flatOrgs,
  canManage, onMoveTo, formatCurrency, formatRelativeDate,
  getInitials, getRoleBadgeColor, getActivityIcon, allMembers, isUserOnline,
  teams, onMoveToTeam, onPromoteToLeader, currentUserId,
}: MemberDetailPanelProps) {
  const navigate = useNavigate();
  const [dataDialogOpen, setDataDialogOpen] = useState(false);
  const [dataDialogTab, setDataDialogTab] = useState<"leads" | "deals">("leads");
  const allOrgIds = useMemo(() => flatOrgs.map(o => o.id), [flatOrgs]);

  // Find the member's org in the ancestor list + current org for breadcrumb
  const memberOrg = flatOrgs.find(o => o.id === member.orgId);

  // Get who this member reports to
  const reportsToNames = member.reportsTo.length > 0
    ? member.reportsTo.map(r => r.name).join(", ")
    : "— (Topo)";

  return (
    <>
    <ScrollArea className="h-[calc(100vh-320px)] min-h-[500px]">
      <div className="space-y-4 pr-2">
        {/* Avatar + Header */}
        <Card>
          <CardContent className="pt-6 pb-4 text-center">
            <div className="relative inline-block mb-3">
              <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
                <AvatarImage src={member.avatarUrl || undefined} />
                <AvatarFallback className="text-xl font-bold bg-primary/15 text-primary">
                  {getInitials(member.name)}
                </AvatarFallback>
              </Avatar>
              <span className={cn(
                "absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-background",
                member.leadCount || member.dealCount ? "bg-emerald-500" : "bg-gray-300"
              )} />
            </div>
            <h3 className="text-lg font-bold">{member.name}</h3>
            <p className="text-sm text-muted-foreground">{member.position || member.roleName} · {member.orgName}</p>

            <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
              <Badge className={cn("text-[10px] border font-medium", getRoleBadgeColor(member.roleCode))}>
                {member.roleName}
              </Badge>
              {member.position && (
                <Badge variant="outline" className="text-[10px]">
                  {member.position}
                </Badge>
              )}
              <Badge variant="outline" className={cn("text-[10px]", isUserOnline(member.userId) ? "border-emerald-300 text-emerald-600" : "border-gray-300 text-gray-500")}>
                <span className={cn("h-1.5 w-1.5 rounded-full mr-1", isUserOnline(member.userId) ? "bg-emerald-500" : "bg-gray-400")} />
                {isUserOnline(member.userId) ? "Online" : "Offline"}
              </Badge>
            </div>

            {/* Contact info */}
            {(member.email || member.phone) && (
              <div className="mt-3 space-y-1">
                {member.email && (
                  <a href={`mailto:${member.email}`} className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline">
                    <Mail className="h-3 w-3" />
                    {member.email}
                  </a>
                )}
                {member.phone && (
                  <a href={`tel:${member.phone}`} className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline">
                    <Phone className="h-3 w-3" />
                    {member.phone}
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hierarchy / Move */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-3">
              <Building2 className="h-3.5 w-3.5" />
              Hierarquia
            </h4>

            {/* Breadcrumb path */}
            <div className="flex items-center gap-1 text-xs flex-wrap mb-3">
              {orgAncestors.map((a, i) => (
                <span key={a.id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground">→</span>}
                  <span className={cn(
                    "px-1.5 py-0.5 rounded",
                    a.id === member.orgId ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                  )}>
                    {a.name}
                  </span>
                </span>
              ))}
              {/* If member org is not in ancestors, show it */}
              {memberOrg && !orgAncestors.find(a => a.id === memberOrg.id) && (
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">→</span>
                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{memberOrg.name}</span>
                </span>
              )}
            </div>

            {/* Move to */}
            {canManage && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-orange-600">Mover para:</p>
                {flatOrgs.filter(o => o.id !== member.orgId).slice(0, 5).map(org => (
                  <button
                    key={org.id}
                    onClick={() => onMoveTo(org.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-sm transition-colors text-left"
                  >
                    <OrgTypeIcon type={org.type} />
                    <span className="flex-1">{org.name}</span>
                    {org.id === member.orgId ? (
                      <span className="text-xs text-muted-foreground">Actual</span>
                    ) : (
                      <span className="text-muted-foreground">→</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-3">
              <BarChart3 className="h-3.5 w-3.5" />
              Performance
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <PerfCard label="Leads atribuídas" value={member.leadCount ? String(member.leadCount) : "—"} />
              <PerfCard label="Deals activos" value={member.dealCount ? String(member.dealCount) : "—"} />
              <PerfCard
                label="Receita gerada"
                value={member.dealValue ? formatCurrency(member.dealValue) : "—"}
                color={member.dealValue ? "text-emerald-600" : undefined}
              />
              <PerfCard
                label="Conversão"
                value={member.conversionRate ? `${member.conversionRate}%` : "—"}
                color={member.conversionRate && member.conversionRate >= 8 ? "text-emerald-600" : undefined}
              />
              <PerfCard
                label="Equipa sob gestão"
                value={member.teamSize ? String(member.teamSize) : "—"}
              />
              <PerfCard label="Último login" value="hoje" color="text-primary" />
            </div>
          </CardContent>
        </Card>

        {/* Dados na Organização */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-3">
              <Globe className="h-3.5 w-3.5" />
              Dados na Organização
            </h4>
            <div className="space-y-2 text-sm">
              <DetailRow label="Empresa" value={orgAncestors.find(a => a.type === "empresa")?.name || orgAncestors[0]?.name || member.orgName} />
              {(() => {
                const memberTeam = teams?.find(t => t.members.includes(member.userId));
                return <DetailRow label="Grupo" value={memberTeam ? `${memberTeam.icon} ${memberTeam.name}` : "— Sem grupo"} />;
              })()}
              {(() => {
                const dept = orgAncestors.find(a => a.type === "departamento");
                return dept ? <DetailRow label="Departamento" value={dept.name} /> : null;
              })()}
              <DetailRow label="Cargo" value={member.position || "—"} />
              <DetailRow label="Role no CRM" value={<Badge className={cn("text-[10px] border", getRoleBadgeColor(member.roleCode))}>{member.roleName}</Badge>} />
              <DetailRow
                label="Membro desde"
                value={member.startDate ? new Date(member.startDate).toLocaleDateString("pt-PT") : "—"}
              />
              <DetailRow label="Reporta a" value={reportsToNames} />
              <DetailRow
                label="Supervisiona"
                value={member.subordinates.length > 0 ? `${member.subordinates.length} membros` : "—"}
              />
              {/* Move to team */}
              {canManage && teams && teams.length > 0 && onMoveToTeam && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium mb-1.5">Mover para grupo:</p>
                  <Select
                    value={teams.find(t => t.members.includes(member.userId))?.id || "__none__"}
                    onValueChange={v => onMoveToTeam(v === "__none__" ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem grupo</SelectItem>
                      {teams.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.icon} {t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actividade Recente */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-3">
              <Clock className="h-3.5 w-3.5" />
              Actividade Recente
            </h4>
            {loadingActivities ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : activities.length > 0 ? (
              <div className="space-y-2">
                {activities.map(a => (
                  <div key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 shrink-0">{getActivityIcon(a.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{formatRelativeDate(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">Sem actividade recente</p>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-1.5">
          {currentUserId !== member.userId && (
            <Button
              className="w-full bg-primary"
              size="sm"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("internal-chat:open", { detail: { userId: member.userId } }));
              }}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Enviar Mensagem
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => { setDataDialogTab("leads"); setDataDialogOpen(true); }}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Ver Leads Atribuídas
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => { setDataDialogTab("deals"); setDataDialogOpen(true); }}
          >
            <Briefcase className="h-4 w-4 mr-2" />
            Ver Deals
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigate(`/users?edit=${member.userId}`)}
          >
            <Edit className="h-4 w-4 mr-2" />
            Editar Perfil
          </Button>
          {canManage && (
            <>
              {teams && onPromoteToLeader && (() => {
                const memberTeam = teams.find(t => t.members.includes(member.userId));
                if (memberTeam && memberTeam.leader_id !== member.userId) {
                  return (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => onPromoteToLeader(memberTeam.id)}>
                      <Trophy className="h-4 w-4 mr-2" />
                      Promover a Líder
                    </Button>
                  );
                }
                return null;
              })()}
              <Button variant="outline" size="sm" className="w-full" onClick={() => { setDataDialogTab("leads"); setDataDialogOpen(true); }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reatribuir Leads
              </Button>
              {teams && onMoveToTeam && teams.some(t => t.members.includes(member.userId)) && (
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => onMoveToTeam(null)}>
                  <UserMinus className="h-4 w-4 mr-2" />
                  Remover do Grupo
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </ScrollArea>

    <MemberDataDialog
      open={dataDialogOpen}
      onOpenChange={setDataDialogOpen}
      memberId={member.userId}
      memberName={member.name}
      authUserId={member.authUserId}
      orgIds={allOrgIds}
      initialTab={dataDialogTab}
    />
    </>
  );
}

function PerfCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border p-2.5 text-center">
      <div className={cn("text-lg font-bold", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function findOrgInTree(node: OrgNode, id: string): OrgNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findOrgInTree(child, id);
    if (found) return found;
  }
  return null;
}
