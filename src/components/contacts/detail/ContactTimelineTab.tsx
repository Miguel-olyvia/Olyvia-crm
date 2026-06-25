import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { PhoneCall, Mail, Users, StickyNote, Briefcase, ArrowRightLeft, Bot, Filter, Send, Pencil, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  /** When provided, the tab also loads contact_status_history for this contact. */
  contactId?: string | null;
  /** The entity_id (distinct from contactId). When provided, loads anew_entity_history and entity_audit_log. */
  entityId?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  contacted: "Contactado",
  qualified: "Qualificado",
  unqualified: "Não qualificado",
  customer: "Cliente",
  lost: "Perdido",
  active: "Ativo",
  inactive: "Inativo",
};

const statusLabel = (s: string | null | undefined): string => (s ? STATUS_LABELS[s] || s : "—");

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
  status_change: { icon: ArrowRightLeft, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", label: "Estado" },
  created: { icon: Sparkles, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30", label: "Criação" },
  role_status_changed: { icon: RefreshCw, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30", label: "Lifecycle" },
  field_change: { icon: Pencil, color: "text-slate-600", bg: "bg-slate-100 dark:bg-slate-800/50", label: "Edição" },
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: "😊",
  neutral: "😐",
  negative: "😟",
};

export function ContactTimelineTab({ events, onRegisterCall, contactId, entityId }: ContactTimelineTabProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const [statusEvents, setStatusEvents] = useState<TimelineEvent[]>([]);
  const [entityEvents, setEntityEvents] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    if (!contactId) {
      setStatusEvents([]);
      return;
    }
    let isCancelled = false;

    const loadStatusHistory = async () => {
      const { data, error } = await (supabase as any)
        .from("contact_status_history")
        .select("id, old_status, new_status, changed_by, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error || !data) return;

      const actorIds = [...new Set(data.map((d: any) => d.changed_by).filter(Boolean))] as string[];
      const actorMap: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: users } = await supabase.from("anew_users").select("id, name").in("id", actorIds);
        (users || []).forEach((u: any) => { if (u.name) actorMap[u.id] = u.name; });
      }

      const mapped: TimelineEvent[] = data.map((d: any) => ({
        id: `status-${d.id}`,
        type: "status_change",
        title: "Estado alterado",
        description: `${statusLabel(d.old_status)} → ${statusLabel(d.new_status)}`,
        date: d.created_at,
        actor: d.changed_by ? (actorMap[d.changed_by] || null) : null,
      }));

      if (!isCancelled) setStatusEvents(mapped);
    };

    loadStatusHistory();
    return () => { isCancelled = true; };
  }, [contactId]);

  useEffect(() => {
    if (!entityId) {
      setEntityEvents([]);
      return;
    }
    let isCancelled = false;

    const loadEntityHistory = async () => {
      const [lifecycleRes, auditRes] = await Promise.all([
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

      // Resolve actor names.
      const actorMap: Record<string, string> = {};
      const actorIds = [...new Set([
        ...((lifecycleRes.data || []).map((d: any) => d.changed_by)),
        ...((auditRes.data || []).map((d: any) => d.changed_by)),
      ].filter(Boolean))] as string[];
      if (actorIds.length > 0) {
        const { data: users } = await supabase.from("anew_users").select("id, name").in("id", actorIds);
        (users || []).forEach((u: any) => { if (u.name) actorMap[u.id] = u.name; });
      }

      // Lifecycle events (created / role_status_changed / field_change).
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
          actor: d.changed_by ? (actorMap[d.changed_by] || null) : null,
        };
      });

      // Field diffs from the generic audit log.
      const auditEvents: TimelineEvent[] = [];
      for (const row of (auditRes.data || []) as any[]) {
        const actor = row.changed_by ? (actorMap[row.changed_by] || null) : null;

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
        } else if (row.operation === "INSERT" && row.table_name !== "anew_contacts" && row.table_name !== "anew_entities") {
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

      if (!isCancelled) setEntityEvents([...lifecycleEvents, ...auditEvents]);
    };

    loadEntityHistory();
    return () => { isCancelled = true; };
  }, [entityId]);

  const mergedEvents = useMemo(() => {
    if (statusEvents.length === 0 && entityEvents.length === 0) return events;
    return [...events, ...statusEvents, ...entityEvents].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [events, statusEvents, entityEvents]);

  const filteredEvents = filter ? mergedEvents.filter(e => e.type === filter) : mergedEvents;
  const types = [...new Set(mergedEvents.map(e => e.type))];

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
                    {format(new Date(event.date), "dd/MM/yyyy HH:mm", { locale: pt })}
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
