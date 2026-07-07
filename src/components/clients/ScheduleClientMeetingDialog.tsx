import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ScheduleClientMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  organizationId: string;
  rootOrganizationId: string;
  entityName: string;
  onScheduled?: () => void;
}

const CHANNELS = [
  { value: "in_person", label: "Presencial" },
  { value: "video", label: "Videochamada" },
  { value: "phone", label: "Telefone" },
];

/**
 * Bug 10 — Clients "Agendar reunião". Creates a single entity_interactions row
 * (interaction_type='meeting') via rpc_schedule_client_meeting, which performs the
 * write and its single consolidated audit row atomically (audit_bypass +
 * fn_manual_audit_log pattern).
 */
export function ScheduleClientMeetingDialog({
  open,
  onOpenChange,
  entityId,
  organizationId,
  rootOrganizationId,
  entityName,
  onScheduled,
}: ScheduleClientMeetingDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [channel, setChannel] = useState<string>("in_person");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });

  const resetForm = () => {
    setSubject("");
    setNotes("");
    setChannel("in_person");
    setScheduledAt(() => {
      const d = new Date(Date.now() + 60 * 60 * 1000);
      return d.toISOString().slice(0, 16);
    });
  };

  const handleSchedule = async () => {
    if (!scheduledAt) {
      toast({ title: "Data/hora obrigatória", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("rpc_schedule_client_meeting", {
        p_entity_id: entityId,
        p_organization_id: organizationId,
        p_root_organization_id: rootOrganizationId,
        p_subject: subject || null,
        p_notes: notes || null,
        p_scheduled_at: new Date(scheduledAt).toISOString(),
        p_channel: channel || null,
      });
      if (error) throw error;

      toast({ title: "Reunião agendada" });
      resetForm();
      onScheduled?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao agendar reunião", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar reunião {entityName ? `— ${entityName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Data/hora</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Motivo da reunião" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Canal</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSchedule} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
