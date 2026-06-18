import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  GripVertical, ChevronDown, ChevronRight, Plus, Edit, Trash2, MoreHorizontal,
  Star, FileDown, Briefcase, BarChart3, Trophy, AlertTriangle, Crown,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Team } from "@/hooks/useOrganizationTeams";

interface MemberInfo {
  userId: string;
  name: string;
  avatarUrl: string | null;
  roleName: string;
  roleCode: string;
  position: string;
  leadCount?: number;
  dealCount?: number;
  conversionRate?: number;
  isOnline: boolean;
  isInactive: boolean;
}

interface TeamGroupCardProps {
  team: Team;
  members: MemberInfo[];
  leaderName: string;
  reportsToTeamName?: string;
  canManage: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddMember: () => void;
  onMemberClick: (userId: string) => void;
  onMoveMember: (userId: string, targetTeamId: string | null) => void;
  onPromoteLeader: (userId: string) => void;
  otherTeams: { id: string; name: string; icon: string }[];
  // DnD
  onDragStartMember?: (userId: string) => void;
  onDragOverGroup?: (e: React.DragEvent) => void;
  onDragLeaveGroup?: () => void;
  onDropGroup?: () => void;
  isDragOver?: boolean;
  formatCurrency: (v: number) => string;
}

const GRADIENT_COLORS: Record<string, string> = {
  "👑": "from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20",
  "💼": "from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20",
  "🔧": "from-slate-50 to-gray-50 dark:from-slate-950/20 dark:to-gray-950/20",
  "📊": "from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20",
  "🎯": "from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20",
  "💡": "from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20",
  "🚀": "from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20",
  "📋": "from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20",
  "🏗": "from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20",
  "💬": "from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/20",
};

const BORDER_COLORS: Record<string, string> = {
  "👑": "border-amber-200 dark:border-amber-800",
  "💼": "border-purple-200 dark:border-purple-800",
  "🔧": "border-slate-200 dark:border-slate-800",
  "📊": "border-blue-200 dark:border-blue-800",
  "🎯": "border-red-200 dark:border-red-800",
  "💡": "border-yellow-200 dark:border-yellow-800",
  "🚀": "border-violet-200 dark:border-violet-800",
  "📋": "border-green-200 dark:border-green-800",
  "🏗": "border-orange-200 dark:border-orange-800",
  "💬": "border-teal-200 dark:border-teal-800",
};

const getInitials = (name: string) =>
  name.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

const getRoleBadgeColor = (code: string) => {
  if (code === "system_admin") return "bg-red-100 text-red-700 border-red-200";
  if (code === "super_admin") return "bg-purple-100 text-purple-700 border-purple-200";
  if (code === "org_admin") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-muted text-muted-foreground border-border";
};

export function TeamGroupCard({
  team, members, leaderName, reportsToTeamName, canManage,
  isCollapsed, onToggleCollapse, onEdit, onDelete, onAddMember,
  onMemberClick, onMoveMember, onPromoteLeader, otherTeams,
  onDragStartMember, onDragOverGroup, onDragLeaveGroup, onDropGroup, isDragOver,
  formatCurrency,
}: TeamGroupCardProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const leader = members.find(m => m.userId === team.leader_id);
  const regularMembers = members.filter(m => m.userId !== team.leader_id);

  const totalLeads = members.reduce((s, m) => s + (m.leadCount || 0), 0);
  const totalDeals = members.reduce((s, m) => s + (m.dealCount || 0), 0);
  const avgConversion = totalLeads > 0
    ? Math.round(members.reduce((s, m) => s + (m.conversionRate || 0) * (m.leadCount || 0), 0) / totalLeads)
    : 0;

  const gradient = GRADIENT_COLORS[team.icon] || GRADIENT_COLORS["💼"];
  const borderColor = BORDER_COLORS[team.icon] || BORDER_COLORS["💼"];

  return (
    <div
      className={cn(
        "rounded-xl border-2 transition-all overflow-hidden",
        borderColor,
        isDragOver && "ring-2 ring-primary border-dashed border-primary"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={onDragOverGroup}
      onDragLeave={onDragLeaveGroup}
      onDrop={onDropGroup}
    >
      {/* Header */}
      <div className={cn("px-4 py-3 flex items-center gap-2 bg-gradient-to-r", gradient)}>
        {canManage && (
          <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab shrink-0" />
        )}
        <button onClick={onToggleCollapse} className="shrink-0">
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="text-lg">{team.icon}</span>
        <span className="font-bold text-sm">{team.name}</span>
        <Badge variant="outline" className="text-[10px] ml-1">{members.length}</Badge>

        {/* Metrics */}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          {totalLeads > 0 && <span>{totalLeads} leads</span>}
          {avgConversion > 0 && <span>{avgConversion}% conv.</span>}
          {totalDeals > 0 && <span>{totalDeals} deals</span>}
        </div>

        {/* Actions on hover */}
        {canManage && (hovered || menuOpen) && (
          <div className="flex items-center gap-1 ml-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAddMember}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Adicionar membro</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar grupo</TooltipContent>
            </Tooltip>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar grupo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Reports to indicator */}
      {reportsToTeamName && (
        <div className="px-4 py-1 text-[11px] text-muted-foreground bg-muted/30 border-b">
          ↳ Reporta a: {reportsToTeamName}
        </div>
      )}

      {/* Body */}
      {!isCollapsed && (
        <div className="divide-y">
          {/* Leader */}
          {leader && (
            <div
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-50/50 dark:bg-purple-950/10 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors"
              onClick={() => onMemberClick(leader.userId)}
            >
              <div className="relative shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={leader.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs bg-purple-200 text-purple-800 font-semibold">
                    {getInitials(leader.name)}
                  </AvatarFallback>
                </Avatar>
                <span className={cn(
                  "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                  leader.isOnline ? "bg-emerald-500" : "bg-gray-300"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold truncate">{leader.name}</span>
                  <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] gap-0.5 h-4">
                    <Star className="h-2.5 w-2.5" /> Líder
                  </Badge>
                  <Badge className={cn("text-[10px] px-1.5 h-4 border", getRoleBadgeColor(leader.roleCode))}>
                    {leader.roleName}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{leader.position || leader.roleName}</span>
              </div>
              <MemberMetrics member={leader} />
            </div>
          )}

          {/* Separator */}
          {leader && regularMembers.length > 0 && (
            <div className="px-4 py-1.5 text-[11px] text-muted-foreground bg-muted/20">
              ↳ Reportam ao {leaderName}:
            </div>
          )}

          {/* Regular members */}
          {regularMembers.map(member => (
            <MemberRow
              key={member.userId}
              member={member}
              canManage={canManage}
              teamId={team.id}
              otherTeams={otherTeams}
              onClick={() => onMemberClick(member.userId)}
              onMoveMember={onMoveMember}
              onPromoteLeader={onPromoteLeader}
              onDragStart={() => onDragStartMember?.(member.userId)}
            />
          ))}

          {/* Empty state */}
          {regularMembers.length === 0 && !leader && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              📦 Arraste membros para aqui ou clique + para adicionar
            </div>
          )}
          {regularMembers.length === 0 && leader && (
            <div className="px-4 py-4 text-center text-xs text-muted-foreground">
              📦 Arraste membros para aqui ou clique + para adicionar
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MemberMetrics({ member }: { member: MemberInfo }) {
  return (
    <div className="flex items-center gap-2.5 text-xs shrink-0">
      {(member.leadCount || 0) > 0 && (
        <span className="flex items-center gap-0.5 text-muted-foreground">
          <FileDown className="h-3 w-3" />
          {member.leadCount}
        </span>
      )}
      {(member.dealCount || 0) > 0 && (
        <span className="flex items-center gap-0.5 text-amber-600">
          <Briefcase className="h-3 w-3" />
          {member.dealCount}
        </span>
      )}
      {(member.conversionRate || 0) > 0 && (
        <span className={cn(
          "flex items-center gap-0.5 font-medium",
          (member.conversionRate || 0) >= 8 ? "text-emerald-600" : "text-muted-foreground"
        )}>
          <BarChart3 className="h-3 w-3" />
          {member.conversionRate}%
        </span>
      )}
    </div>
  );
}

interface MemberRowProps {
  member: MemberInfo;
  canManage: boolean;
  teamId: string;
  otherTeams: { id: string; name: string; icon: string }[];
  onClick: () => void;
  onMoveMember: (userId: string, teamId: string | null) => void;
  onPromoteLeader: (userId: string) => void;
  onDragStart: () => void;
}

function MemberRow({
  member, canManage, teamId, otherTeams, onClick, onMoveMember, onPromoteLeader, onDragStart,
}: MemberRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors",
        "hover:bg-muted/30",
        member.isInactive && "bg-red-50/30 dark:bg-red-950/5"
      )}
      draggable={canManage}
      onDragStart={onDragStart}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {canManage && (
        <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab" />
      )}

      <div className="relative shrink-0">
        <Avatar className="h-7 w-7">
          <AvatarImage src={member.avatarUrl || undefined} />
          <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
            {getInitials(member.name)}
          </AvatarFallback>
        </Avatar>
        <span className={cn(
          "absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-background",
          member.isOnline ? "bg-emerald-500" : "bg-gray-300"
        )} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium truncate">{member.name}</span>
          <Badge className={cn("text-[9px] px-1 h-3.5 border", getRoleBadgeColor(member.roleCode))}>
            {member.roleName}
          </Badge>
          {member.isInactive && (
            <Badge variant="destructive" className="text-[9px] px-1 h-3.5 gap-0.5">
              <AlertTriangle className="h-2 w-2" />
            </Badge>
          )}
        </div>
        {member.position && (
          <span className="text-[11px] text-muted-foreground">{member.position}</span>
        )}
      </div>

      <MemberMetrics member={member} />

      {/* Actions on hover */}
      {canManage && hovered && (
        <div className="flex items-center gap-0.5 ml-1" onClick={e => e.stopPropagation()}>
          {/* Move to another team */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {otherTeams.map(t => (
                <DropdownMenuItem key={t.id} onClick={() => onMoveMember(member.userId, t.id)}>
                  {t.icon} {t.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onMoveMember(member.userId, null)}>
                Remover do grupo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Promote to leader */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPromoteLeader(member.userId)}>
                <Crown className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Promover a Líder</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

// Unassigned members section
interface UnassignedSectionProps {
  members: MemberInfo[];
  canManage: boolean;
  teams: { id: string; name: string; icon: string }[];
  onMemberClick: (userId: string) => void;
  onMoveMember: (userId: string, teamId: string) => void;
  onDragStartMember?: (userId: string) => void;
}

export function UnassignedMembersSection({
  members, canManage, teams, onMemberClick, onMoveMember, onDragStartMember,
}: UnassignedSectionProps) {
  if (members.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-red-200 dark:border-red-800 overflow-hidden">
      <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/20 flex items-center gap-2">
        <span className="text-sm">⚠️</span>
        <span className="font-bold text-sm text-red-700 dark:text-red-400">Sem Grupo</span>
        <Badge variant="destructive" className="text-[10px]">{members.length} membros não atribuídos</Badge>
      </div>
      <div className="divide-y">
        {members.map(member => (
          <div
            key={member.userId}
            className="flex items-center gap-2 px-4 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
            draggable={canManage}
            onDragStart={() => onDragStartMember?.(member.userId)}
            onClick={() => onMemberClick(member.userId)}
          >
            <div className="relative shrink-0">
              <Avatar className="h-7 w-7">
                <AvatarImage src={member.avatarUrl || undefined} />
                <AvatarFallback className="text-[10px] bg-red-100 text-red-700 font-semibold">
                  {getInitials(member.name)}
                </AvatarFallback>
              </Avatar>
              <span className={cn(
                "absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-background",
                member.isOnline ? "bg-emerald-500" : "bg-gray-300"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate">{member.name}</span>
              {member.position && (
                <p className="text-[11px] text-muted-foreground">{member.position}</p>
              )}
            </div>

            {/* Quick assign */}
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                  <Button variant="outline" size="sm" className="h-6 text-[11px] px-2">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    Atribuir
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {teams.map(t => (
                    <DropdownMenuItem key={t.id} onClick={() => onMoveMember(member.userId, t.id)}>
                      {t.icon} {t.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
