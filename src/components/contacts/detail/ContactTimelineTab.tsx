import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { PhoneCall, Mail, Users, StickyNote, Briefcase, ArrowRightLeft, Bot, Filter, Send } from "lucide-react";

interface TimelineEvent {
  id: string;
  type: string; // call, email, meeting, note, deal, conversion, automation
  title: string;
  description: string | null;
  date: string;
  actor: string | null;
  sentiment?: string | null;
  metadata?: Record<string, any>;
}

interface ContactTimelineTabProps {
  events: TimelineEvent[];
  onRegisterCall: () => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof PhoneCall; color: string; bg: string; label: string }> = {
  call: { icon: PhoneCall, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", label: "Chamada" },
  email: { icon: Mail, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", label: "Email" },
  meeting: { icon: Users, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30", label: "Reunião" },
  note: { icon: StickyNote, color: "text-muted-foreground", bg: "bg-muted", label: "Nota" },
  deal: { icon: Briefcase, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30", label: "Deal" },
  conversion: { icon: ArrowRightLeft, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30", label: "Conversão" },
  automation: { icon: Bot, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30", label: "Automação" },
  whatsapp: { icon: PhoneCall, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", label: "WhatsApp" },
  portal: { icon: Send, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30", label: "Portal Cliente" },
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: "😊",
  neutral: "😐",
  negative: "😟",
};

export function ContactTimelineTab({ events, onRegisterCall }: ContactTimelineTabProps) {
  const [filter, setFilter] = useState<string | null>(null);

  const filteredEvents = filter ? events.filter(e => e.type === filter) : events;
  const types = [...new Set(events.map(e => e.type))];

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
              <div key={event.id} className="flex items-start gap-3 py-2.5 border-b last:border-0">
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
                    {format(new Date(event.date), "dd/MM/yyyy", { locale: pt })}
                    {event.actor && ` · ${event.actor}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">Sem eventos registados</p>
      )}

      {/* Register activity button */}
      <div className="border border-dashed rounded-md py-2.5 text-center">
        <button onClick={onRegisterCall} className="text-xs text-muted-foreground hover:text-foreground">
          + Registar atividade (📞 Chamada · 📝 Nota · 📅 Reunião · ✉️ Email)
        </button>
      </div>
    </div>
  );
}
