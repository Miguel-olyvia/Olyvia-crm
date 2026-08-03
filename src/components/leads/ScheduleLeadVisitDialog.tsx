import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCalendarScheduling } from "@/hooks/useCalendarScheduling";
import { extractLeadLocation } from "@/lib/leads/location";

const DURATIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 h" },
  { value: "90", label: "1h30" },
  { value: "120", label: "2 h" },
];

function formatDateTimeLocal(date: Date): string {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0"), min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

interface ScheduleLeadVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: { id: string; organization_id?: string | null; field_values?: Record<string, any> | null } | null;
  leadName: string;
  companyId: string | null;
  onScheduled?: () => void;
}

export function ScheduleLeadVisitDialog({ open, onOpenChange, lead, leadName, companyId, onScheduled }: ScheduleLeadVisitDialogProps) {
  const { toast } = useToast();
  const { createVisit, loading } = useCalendarScheduling(companyId || undefined);
  const [orgUsers, setOrgUsers] = useState<{ id: string; name: string }[]>([]);

  const [visitType, setVisitType] = useState("meeting");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !lead) return;

    setVisitType("meeting");
    setTitle(`Visita/Reunião com ${leadName}`);
    setStartTime(formatDateTimeLocal(new Date(Date.now() + 60 * 60000)));
    setDuration("60");
    setLocation(extractLeadLocation(lead) || "");
    setAssignedTo("");
    setNotes("");

    const loadOrgUsers = async () => {
      if (!companyId) { setOrgUsers([]); return; }
      const { data: members } = await supabase
        .from("anew_memberships")
        .select("user_id")
        .eq("organization_id", companyId)
        .eq("status", "active");
      const userIds = [...new Set((members || []).map((m: any) => m.user_id).filter(Boolean))];
      if (userIds.length === 0) { setOrgUsers([]); return; }
      const { data: users } = await supabase.from("anew_users").select("id, name").in("id", userIds);
      setOrgUsers((users || []).slice().sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")));
    };
    loadOrgUsers();
  }, [open, lead, leadName, companyId]);

  const handleSchedule = async () => {
    if (!lead || !title || !startTime) {
      toast({ title: "Campos em falta", description: "Preencha o título e a data/hora.", variant: "destructive" });
      return;
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + parseInt(duration) * 60000);

    const success = await createVisit({
      lead_id: lead.id,
      title,
      visit_type: visitType,
      location,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "scheduled",
      notes,
      assigned_to: assignedTo || undefined,
    });

    if (success) {
      onOpenChange(false);
      onScheduled?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar Visita / Reunião</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={visitType} onValueChange={setVisitType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="site_visit">Visita</SelectItem>
                <SelectItem value="meeting">Reunião</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data / Hora</Label>
              <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Duração</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Morada, sala, link de videochamada..." />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem responsável —</SelectItem>
                {orgUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Assunto, agenda, observações..." rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSchedule} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
