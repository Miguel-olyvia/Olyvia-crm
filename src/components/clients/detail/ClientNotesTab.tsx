import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, StickyNote, Pin, Send, PhoneCall, Mail, Users, MessageCircle, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface ClientNotesTabProps {
  entityId: string;
  organizationId: string;
}

interface NoteRecord {
  id: string;
  notes: string | null;
  subject: string | null;
  interaction_at: string;
  created_by: string | null;
  interaction_type: string | null;
}

const TYPE_ICON: Record<string, { icon: typeof StickyNote; label: string }> = {
  call: { icon: PhoneCall, label: "Chamada" },
  email: { icon: Mail, label: "Email" },
  meeting: { icon: Users, label: "Reunião" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  visit: { icon: CalendarIcon, label: "Visita" },
  note: { icon: StickyNote, label: "Nota" },
};

export function ClientNotesTab({ entityId, organizationId }: ClientNotesTabProps) {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadNotes();
  }, [entityId]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("entity_interactions")
        .select("id, notes, subject, interaction_at, created_by, interaction_type")
        .eq("entity_id", entityId)
        .not("notes", "is", null)
        .order("interaction_at", { ascending: false })
        .limit(50);
      setNotes(data || []);
    } catch (e) {
      console.error("Error loading notes:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get anew user id
      const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", user.id).maybeSingle();
      const createdBy = anewUser?.id || user.id;

      await supabase.from("entity_interactions").insert({
        entity_id: entityId,
        interaction_type: "note",
        notes: newNote.trim(),
        interaction_at: new Date().toISOString(),
        created_by: createdBy,
        organization_id: organizationId,
      });

      setNewNote("");
      toast({ title: "Nota adicionada" });
      loadNotes();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 mt-4">
      {/* New note input */}
      <div className="space-y-2">
        <Textarea
          placeholder="Escrever nota interna..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAddNote} disabled={saving || !newNote.trim()} className="gap-1">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Guardar nota
          </Button>
        </div>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="text-center py-8">
          <StickyNote className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Sem notas registadas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(note => {
            const typeCfg = TYPE_ICON[note.interaction_type || "note"] || TYPE_ICON.note;
            const TypeIcon = typeCfg.icon;
            return (
            <div key={note.id} className="border rounded-lg px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase">{typeCfg.label}</span>
              </div>
              {note.subject && <p className="text-sm font-medium mb-1">{note.subject}</p>}
              <p className="text-sm whitespace-pre-wrap">{note.notes}</p>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {format(new Date(note.interaction_at), "dd/MM/yyyy HH:mm", { locale: pt })}
              </p>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
