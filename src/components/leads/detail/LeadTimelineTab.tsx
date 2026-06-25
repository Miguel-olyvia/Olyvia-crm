import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { PhoneCall, Mail, Users, StickyNote, Briefcase, ArrowRightLeft, Bot, Filter, MessageCircle, Eye, CalendarIcon, Sparkles, Pencil, RefreshCw } from "lucide-react";
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
  created: { icon: Sparkles, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30", label: "Criação" },
  role_status_changed: { icon: RefreshCw, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30", label: "Lifecycle" },
  field_change: { icon: Pencil, color: "text-slate-600", bg: "bg-slate-100 dark:bg-slate-800/50", label: "Edição" },
};

// Human-readable PT labels for audited field names.
const FIELD_LABELS: Record<string, string> = {
  display_name: "nome",
  first_name: "nome próprio",
  last_name: "apelido",
  status: "estado",
  email: "email",
  phone: "telefone",
  phone_number: "telefone",
  notes: "notas",
  source: "origem",
  type: "tipo",
  assigned_to: "responsável",
  score: "pontuação",
  vat: "NIF",
};

const fieldLabel = (field: string): string => FIELD_LABELS[field] || field.replace(/_/g, " ");

// Skip noisy audited columns that carry no meaning for the user-facing timeline.
const AUDIT_IGNORED_FIELDS = new Set([
  "id", "entity_id", "organization_id", "root_organization_id",
  "created_at", "updated_at", "created_by", "search_text",
]);

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

    try {
      // Fetch the three timeline sources in parallel.
      const [interactionsRes, lifecycleRes, auditRes] = await Promise.all([
        supabase
          .from("entity_interactions")
          .select("*")
          .eq("entity_id", entityId)
          .order("interaction_at", { ascending: false })
          .limit(100),
        (supabase as any)
          .from("anew_entity_history")
          .select("id, change_type, field_name, old_value, new_value, changed_by, created_at, metadata")
          .eq("entity_id", entityId)
          .order("created_at", { ascending: false })
          .limit(100),
        (supabase as any)
          .from("entity_audit_log")
          .select("id, table_name, operation, changed_fields, changed_by, created_at")
          .eq("entity_id", entityId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      // Resolve any actor ids that aren't already in the inherited userMap.
      const localUserMap: Record<string, string> = { ...userMap };
      const extraActorIds = [
        ...(lifecycleRes.data || []).map((d: any) => d.changed_by),
        ...(auditRes.data || []).map((d: any) => d.changed_by),
      ].filter((id: string | null): id is string => !!id && !localUserMap[id]);
      const uniqueExtraIds = [...new Set(extraActorIds)];
      if (uniqueExtraIds.length > 0) {
        const { data: users } = await supabase
          .from("anew_users")
          .select("id, name")
          .in("id", uniqueExtraIds);
        (users || []).forEach((u: any) => { if (u.name) localUserMap[u.id] = u.name; });
      }

      // 1. Commercial interactions.
      const interactionEvents: TimelineEvent[] = (interactionsRes.data || []).map((i: any) => ({
        id: `interaction-${i.id}`,
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
        actor: i.created_by ? (localUserMap[i.created_by] || null) : null,
        sentiment: i.sentiment,
      }));

      // 2. Lifecycle events (created / converted / role changes).
      const lifecycleEvents: TimelineEvent[] = (lifecycleRes.data || []).map((d: any) => {
        const isCreated = d.change_type === "created";
        const isRoleStatus = d.change_type === "role_status_changed" || d.change_type === "status_changed";
        const type = isCreated ? "created" : isRoleStatus ? "role_status_changed" : "field_change";

        let title: string;
        let description: string | null = null;
        if (isCreated) {
          const kind = d.metadata?.kind;
          title = kind === "contact" ? "Contacto criado" : kind === "client" ? "Cliente criado" : "Lead criada";
        } else if (isRoleStatus) {
          title = "Estado do ciclo de vida alterado";
          description = d.old_value && d.new_value
            ? `${d.old_value} → ${d.new_value}`
            : d.metadata?.old_status && d.metadata?.new_status
              ? `${d.metadata.old_status} → ${d.metadata.new_status}`
              : (d.new_value || d.metadata?.new_status || null);
        } else {
          const label = d.field_name ? fieldLabel(d.field_name) : "campo";
          title = `Editou ${label}`;
          description = d.old_value || d.new_value ? `${d.old_value ?? "—"} → ${d.new_value ?? "—"}` : null;
        }

        return {
          id: `lifecycle-${d.id}`,
          type,
          title,
          description,
          date: d.created_at,
          actor: d.changed_by ? (localUserMap[d.changed_by] || null) : null,
        };
      });

      // 3. Field diffs from the generic audit log (one event per changed field on UPDATE).
      const auditEvents: TimelineEvent[] = [];
      for (const row of (auditRes.data || []) as any[]) {
        const actor = row.changed_by ? (localUserMap[row.changed_by] || null) : null;

        if (row.operation === "UPDATE" && row.changed_fields && typeof row.changed_fields === "object") {
          const entries = Object.entries(row.changed_fields as Record<string, { old: unknown; new: unknown }>)
            .filter(([field]) => !AUDIT_IGNORED_FIELDS.has(field));
          entries.forEach(([field, diff], idx) => {
            const oldVal = diff?.old == null ? "—" : String(diff.old);
            const newVal = diff?.new == null ? "—" : String(diff.new);
            auditEvents.push({
              id: `audit-${row.id}-${idx}`,
              type: "field_change",
              title: `Editou ${fieldLabel(field)}`,
              description: `${oldVal} → ${newVal}`,
              date: row.created_at,
              actor,
            });
          });
        } else if (row.operation === "INSERT" && row.table_name !== "anew_leads" && row.table_name !== "anew_entities") {
          // Satellite inserts (emails, phones, addresses) — surface as a lightweight edit.
          auditEvents.push({
            id: `audit-${row.id}`,
            type: "field_change",
            title: "Registo adicionado",
            description: null,
            date: row.created_at,
            actor,
          });
        }
      }

      // Dedupe field-diff events that the entity_history and audit_log both record
      // for the same change. Key on title + description + minute-rounded timestamp.
      const seenFieldChanges = new Set<string>();
      const merged = [...interactionEvents, ...lifecycleEvents, ...auditEvents]
        .filter((e) => {
          if (e.type !== "field_change") return true;
          const minute = new Date(e.date).toISOString().slice(0, 16);
          const key = `${e.title}|${e.description ?? ""}|${minute}`;
          if (seenFieldChanges.has(key)) return false;
          seenFieldChanges.add(key);
          return true;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setEvents(merged);
    } catch (err) {
      console.error("Error loading lead timeline:", err);
    } finally {
      setLoading(false);
    }
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
