import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { PhoneCall, Mail, Users, StickyNote, Briefcase, ArrowRightLeft, Bot, Filter, MessageCircle, Eye, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string | null;
  date: string;
  actor: string | null;
  sentiment?: string | null;
}

interface LeadTimelineTabProps {
  entityId: string | null;
  organizationId: string;
  onRegisterCall: () => void;
  userMap: Record<string, string>;
}

const TYPE_CONFIG: Record<string, { icon: typeof PhoneCall; color: string; bg: string; label: string }> = {
  call: { icon: PhoneCall, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", label: "Chamada" },
  email: { icon: Mail, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", label: "Email" },
  meeting: { icon: Users, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30", label: "Reunião" },
  note: { icon: StickyNote, color: "text-muted-foreground", bg: "bg-muted", label: "Nota" },
  deal: { icon: Briefcase, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30", label: "Deal" },
  conversion: { icon: ArrowRightLeft, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30", label: "Conversão" },
  whatsapp: { icon: MessageCircle, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", label: "WhatsApp" },
  visit: { icon: CalendarIcon, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30", label: "Visita" },
  status_change: { icon: ArrowRightLeft, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", label: "Estado" },
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: "😊",
  neutral: "😐",
  negative: "😟",
};

export function LeadTimelineTab({ entityId, organizationId, onRegisterCall, userMap }: LeadTimelineTabProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  useEffect(() => {
    if (!entityId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    loadInteractions();
  }, [entityId]);

  useEffect(() => {
    if (!entityId) return;

    const handleRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{ entityId?: string }>;
      if (customEvent.detail?.entityId === entityId) {
        loadInteractions();
      }
    };

    window.addEventListener("entity-interaction-created", handleRefresh);
    return () => window.removeEventListener("entity-interaction-created", handleRefresh);
  }, [entityId]);

  const loadInteractions = async () => {
    if (!entityId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("entity_interactions")
      .select("*")
      .eq("entity_id", entityId)
      .order("interaction_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      const mapped: TimelineEvent[] = data.map(i => ({
        id: i.id,
        type: i.interaction_type || "note",
        title: i.interaction_type === "call" ? "Chamada telefónica" :
               i.interaction_type === "email" ? "Email enviado" :
               i.interaction_type === "meeting" ? "Reunião" :
               i.interaction_type === "whatsapp" ? "WhatsApp enviado" :
               i.interaction_type === "note" ? "Nota adicionada" :
               i.interaction_type === "visit" ? "Visita" :
               i.subject || "Interacção",
        description: i.notes || i.subject || null,
        date: i.interaction_at,
        actor: i.created_by ? (userMap[i.created_by] || null) : null,
        sentiment: i.sentiment,
      }));
      setEvents(mapped);
    }
    setLoading(false);
  };

  const filteredEvents = filter ? events.filter(e => e.type === filter) : events;
  const types = [...new Set(events.map(e => e.type))];

  if (loading) {
    return <p className="text-center text-sm text-muted-foreground py-8">A carregar timeline...</p>;
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Badge
          variant={filter === null ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setFilter(null)}
        >
          Todos
        </Badge>
        {types.map(t => {
          const cfg = TYPE_CONFIG[t] || TYPE_CONFIG.note;
          return (
            <Badge
              key={t}
              variant={filter === t ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setFilter(filter === t ? null : t)}
            >
              {cfg.label}
            </Badge>
          );
        })}
      </div>

      {/* Events */}
      {filteredEvents.length > 0 ? (
        <div className="space-y-1">
          {filteredEvents.map(event => {
            const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.note;
            const Icon = cfg.icon;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelectedEvent(event)}
                className="flex w-full items-start gap-3 py-2.5 border-b last:border-0 text-left transition-opacity hover:opacity-80"
              >
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {event.title}
                    {event.sentiment && <span className="ml-1">{SENTIMENT_EMOJI[event.sentiment]}</span>}
                  </p>
                  {event.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{event.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(event.date), "dd/MM/yyyy HH:mm", { locale: pt })}
                    {event.actor && ` · ${event.actor}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">Sem eventos registados</p>
      )}

      {/* Register activity */}
      <div className="border border-dashed rounded-md py-2.5 text-center">
        <button onClick={onRegisterCall} className="text-xs text-muted-foreground hover:text-foreground">
          + Registar atividade (📞 Chamada · 📝 Nota · 📅 Reunião · ✉️ Email)
        </button>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-lg">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEvent.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">
                    {format(new Date(selectedEvent.date), "dd/MM/yyyy HH:mm", { locale: pt })}
                    {selectedEvent.actor && ` · ${selectedEvent.actor}`}
                  </p>
                  {selectedEvent.sentiment && (
                    <p className="text-muted-foreground">
                      Sentimento {SENTIMENT_EMOJI[selectedEvent.sentiment]}
                    </p>
                  )}
                </div>

                <div className="rounded-md border bg-card p-4">
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {selectedEvent.description || "Sem detalhes adicionais."}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
