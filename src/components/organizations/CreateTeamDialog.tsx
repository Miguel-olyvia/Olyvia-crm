import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import type { Team, TeamFormData } from "@/hooks/useOrganizationTeams";

interface MemberOption {
  userId: string;
  name: string;
  avatarUrl: string | null;
  roleName: string;
}

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TeamFormData) => Promise<boolean>;
  members: MemberOption[];
  teams: Team[];
  editingTeam?: Team | null;
}

const ICONS = ["👑", "💼", "🔧", "📊", "🎯", "💡", "🚀", "📋", "🏗", "💬"];

const getInitials = (name: string) =>
  name.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export function CreateTeamDialog({
  open, onOpenChange, onSubmit, members, teams, editingTeam,
}: CreateTeamDialogProps) {
  const [icon, setIcon] = useState("💼");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Map of userId -> teamName for members already in a team
  const memberTeamMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) {
      if (editingTeam && team.id === editingTeam.id) continue;
      for (const uid of team.members) {
        map.set(uid, team.name);
      }
    }
    return map;
  }, [teams, editingTeam]);

  useEffect(() => {
    if (!open) return;
    if (editingTeam) {
      setIcon(editingTeam.icon || "💼");
      setName(editingTeam.name);
      setDescription(editingTeam.description || "");
      setLeaderId(editingTeam.leader_id || "");
      setSelectedMembers(new Set(editingTeam.members));
      setReportsTo(editingTeam.reports_to_team_id || null);
    } else {
      setIcon("💼");
      setName("");
      setDescription("");
      setLeaderId("");
      setSelectedMembers(new Set());
      setReportsTo(null);
    }
  }, [open, editingTeam]);

  // Auto-add leader to selected members
  useEffect(() => {
    if (leaderId && !selectedMembers.has(leaderId)) {
      setSelectedMembers(prev => new Set([...prev, leaderId]));
    }
  }, [leaderId]);

  const toggleMember = (uid: string) => {
    if (uid === leaderId) return; // Leader can't be deselected
    const inOtherTeam = memberTeamMap.has(uid);
    if (inOtherTeam) return; // Can't select members in other teams
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim() || !leaderId) return;
    setSubmitting(true);
    const data: TeamFormData = {
      name: name.trim(),
      icon,
      description: description.trim(),
      leader_id: leaderId,
      reports_to_team_id: reportsTo,
      member_ids: Array.from(selectedMembers),
    };
    const ok = await onSubmit(data);
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  const otherTeams = teams.filter(t => !editingTeam || t.id !== editingTeam.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editingTeam ? "✏️ Editar Grupo" : "+ Criar Grupo Hierárquico"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Defina o grupo, o líder e seleccione os membros
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-2">
          <div className="space-y-5 pb-2">
            {/* Icon picker */}
            <div className="space-y-2">
              <Label>Ícone</Label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(ic => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center text-lg transition-all border-2",
                      icon === ic
                        ? "border-primary bg-primary/10 shadow-sm scale-110"
                        : "border-transparent bg-muted hover:bg-muted/80"
                    )}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label>Nome do grupo *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Marketing"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Campanhas, geração de leads, branding"
                rows={2}
              />
            </div>

            {/* Leader */}
            <div className="space-y-2">
              <Label>Líder do grupo *</Label>
              <Select value={leaderId} onValueChange={setLeaderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar líder" />
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Member selection */}
            <div className="space-y-2">
              <Label>Seleccionar membros</Label>
              <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                {members.map(m => {
                  const isLeader = m.userId === leaderId;
                  const otherTeamName = memberTeamMap.get(m.userId);
                  const isDisabled = !!otherTeamName;
                  const isChecked = selectedMembers.has(m.userId);

                  return (
                    <div
                      key={m.userId}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 transition-colors",
                        isDisabled ? "opacity-50" : "hover:bg-muted/30 cursor-pointer"
                      )}
                      onClick={() => !isDisabled && toggleMember(m.userId)}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={isDisabled || isLeader}
                        className={cn(isLeader && "border-primary")}
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={m.avatarUrl || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                          {getInitials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{m.name}</span>
                        <p className="text-xs text-muted-foreground">{m.roleName}</p>
                      </div>
                      {isLeader && (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] gap-0.5">
                          <Star className="h-2.5 w-2.5" /> Líder
                        </Badge>
                      )}
                      {otherTeamName && (
                        <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200">
                          {otherTeamName}
                        </Badge>
                      )}
                      {!otherTeamName && !isLeader && !isChecked && (
                        <span className="text-[10px] text-emerald-600">Sem grupo</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Membros já noutro grupo aparecem desactivados. Para os mover, primeiro remova do grupo actual.
              </p>
            </div>

            {/* Reports to */}
            <div className="space-y-2">
              <Label>Este grupo reporta a:</Label>
              <Select
                value={reportsTo || "__none__"}
                onValueChange={v => setReportsTo(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum — topo da hierarquia</SelectItem>
                  {otherTeams.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.icon} {t.name} ({members.find(m => m.userId === t.leader_id)?.name || "Sem líder"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !leaderId || submitting}
            className="bg-primary"
          >
            {submitting ? "A guardar..." : editingTeam ? "Guardar Alterações" : "Criar Grupo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
