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


interface RegisterMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
  organizationId: string;
  contactId: string;
  onMeetingRegistered?: () => void;
  onOpenWhatsApp?: (entityId: string, entityName: string) => void;
  onOpenEmail?: (entityId: string, entityName: string) => void;
}

const NEXT_ACTIONS = [
  { value: "follow_up", label: "Follow-up" },
  { value: "send_proposal", label: "Enviar proposta" },
  { value: "schedule_meeting", label: "Agendar reunião" },
  { value: "send_info", label: "Enviar informação" },
];

export function RegisterMeetingDialog({
  open, onOpenChange, entityId, entityName, organizationId, contactId, onMeetingRegistered, onOpenWhatsApp, onOpenEmail,
}: RegisterMeetingDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [channelOpening, setChannelOpening] = useState(false);
  const [sentiment, setSentiment] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [duration, setDuration] = useState("30");
  const [participants, setParticipants] = useState("");
  const [decisions, setDecisions] = useState("");
  const [notes, setNotes] = useState("");
  const [nextActionType, setNextActionType] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [nextActionChannel, setNextActionChannel] = useState<string | null>(null);
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 16));

  const needsChannel = nextActionType === "send_proposal" || nextActionType === "send_info";

  const openChannel = (channel: string) => {
    setChannelOpening(true);
    setTimeout(() => {
      if (channel === "email" && onOpenEmail) {
        onOpenEmail(entityId, entityName);
      } else if (channel === "whatsapp" && onOpenWhatsApp) {
        onOpenWhatsApp(entityId, entityName);
      }
      setChannelOpening(false);
    }, 100);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", user.id).maybeSingle();
      const createdBy = anewUser?.id || user.id;

      const fullNotes = [
        location && `📍 Local: ${location}`,
        participants && `👥 Participantes: ${participants}`,
        subject && `📋 Assuntos: ${subject}`,
        decisions && `✅ Decisões: ${decisions}`,
        notes,
      ].filter(Boolean).join("\n\n");

      await supabase.from("entity_interactions").insert({
        entity_id: entityId,
        interaction_type: "meeting",
        subject: `Reunião com ${entityName}`,
        notes: fullNotes || null,
        sentiment: sentiment || null,
        duration_minutes: parseInt(duration) || null,
        interaction_at: new Date(meetingDate).toISOString(),
        next_action_type: nextActionType || null,
        next_action_date: nextActionDate || null,
        next_action_channel: needsChannel ? nextActionChannel : null,
        created_by: createdBy,
        organization_id: organizationId,
      });

      // Update last_interaction_at
      await (supabase as any).from("anew_clients").update({
        last_interaction_at: new Date(meetingDate).toISOString(),
      }).eq("id", contactId);

      // Open channel if selected
      const selectedChannel = needsChannel ? nextActionChannel : null;

      toast({ title: "Reunião registada" });
      onMeetingRegistered?.();
      onOpenChange(false);
      // Reset
      setSentiment(null); setSubject(""); setLocation(""); setDuration("30");
      setParticipants(""); setDecisions(""); setNotes("");
      setNextActionType(""); setNextActionDate(""); setNextActionChannel(null);

      if (selectedChannel) {
        openChannel(selectedChannel);
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (channelOpening) return; onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>📅 Registar Reunião — {entityName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data/hora</Label>
              <Input type="datetime-local" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duração (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Local</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Escritório, online..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Participantes</Label>
            <Input value={participants} onChange={e => setParticipants(e.target.value)} placeholder="Nomes dos participantes" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sentimento</Label>
            <div className="flex gap-2">
              {[{ v: "positive", e: "😊" }, { v: "neutral", e: "😐" }, { v: "negative", e: "😟" }].map(s => (
                <button key={s.v} type="button"
                  className={`text-2xl p-1.5 rounded-md border-2 transition-all ${sentiment === s.v ? "border-primary bg-primary/10 scale-110" : "border-transparent hover:border-muted-foreground/30"}`}
                  onClick={() => setSentiment(sentiment === s.v ? null : s.v)}
                >{s.e}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assuntos discutidos</Label>
            <Textarea value={subject} onChange={e => setSubject(e.target.value)} rows={2} placeholder="Tópicos abordados..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Decisões tomadas</Label>
            <Textarea value={decisions} onChange={e => setDecisions(e.target.value)} rows={2} placeholder="O que ficou decidido..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Próxima acção</Label>
              <Select value={nextActionType} onValueChange={setNextActionType}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {NEXT_ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data/hora próxima acção</Label>
              <Input type="datetime-local" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} />
            </div>
          </div>
          {needsChannel && (
            <div className="space-y-1.5">
              <Label className="text-xs">Enviar por</Label>
              <div className="flex gap-2">
                {[
                  { value: "whatsapp", label: "WhatsApp", emoji: "💬" },
                  { value: "email", label: "Email", emoji: "📧" },
                ].map(ch => (
                  <Button
                    key={ch.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNextActionChannel(ch.value);
                      openChannel(ch.value);
                    }}
                    className="flex-1"
                  >
                    <span className="mr-1">{ch.emoji}</span> {ch.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Notas adicionais</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
