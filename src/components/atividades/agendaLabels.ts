import type { AgendaItem } from "@/lib/agenda/types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Vocabulário de tipos: reutiliza as chaves `activities.type.*` órfãs e as
 * `calendar.visitType.*` já em uso. Não há coluna `item_type`, por isso o valor
 * chega em bruto de `metadata` e pode ser qualquer coisa — daí o `default`.
 */
const TYPE_KEYS: Record<string, string> = {
  task: "activities.type.task",
  call: "activities.type.call",
  phone_call: "activities.type.call",
  email: "activities.type.email",
  meeting: "activities.type.meeting",
  note: "activities.type.note",
  visit: "activities.type.visit",
  site_visit: "calendar.visitType.siteVisit",
  demo: "calendar.visitType.demo",
  follow_up: "calendar.visitType.followUp",
};

/**
 * Etiqueta do tipo. A ausência de tipo é o CASO NORMAL (98% dos itens medidos
 * no remoto), por isso devolve a etiqueta genérica em vez de "desconhecido".
 */
export function getTypeLabel(t: Translate, itemType: string | null): string {
  if (!itemType) return t("activities.type.generic");
  const key = TYPE_KEYS[itemType];
  return key ? t(key) : itemType.replace(/_/g, " ");
}

const STATUS_KEYS: Record<string, string> = {
  draft: "activities.itemStatus.draft",
  scheduled: "activities.itemStatus.scheduled",
  confirmed: "activities.itemStatus.confirmed",
  in_progress: "activities.itemStatus.inProgress",
  completed: "activities.itemStatus.completed",
  cancelled: "activities.itemStatus.cancelled",
  rescheduled: "activities.itemStatus.rescheduled",
};

export function getStatusLabel(t: Translate, status: string): string {
  const key = STATUS_KEYS[status];
  return key ? t(key) : status;
}

/** Mesma paleta do calendário, para os dois ecrãs não discordarem sobre cores. */
export function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-transparent",
    scheduled: "bg-info/20 text-info border-info/30",
    confirmed: "bg-success/20 text-success border-success/30",
    in_progress: "bg-warning/20 text-warning border-warning/30",
    completed: "bg-success/20 text-success border-success/30",
    cancelled: "bg-destructive/20 text-destructive border-destructive/30",
    rescheduled: "bg-warning/20 text-warning border-warning/30",
  };
  return classes[status] || classes.scheduled;
}

/**
 * Rota da entidade associada. Ambas as listagens abrem o painel de detalhe a
 * partir do parâmetro `open` (AnewLeads.tsx:478, AnewClients.tsx:814), por isso
 * a ligação aterra directamente na ficha e não numa lista qualquer.
 */
export function getEntityHref(item: AgendaItem): string | null {
  if (!item.entity) return null;
  const base = item.entity.kind === "lead" ? "/leads" : "/clients";
  return `${base}?open=${encodeURIComponent(item.entity.id)}`;
}
