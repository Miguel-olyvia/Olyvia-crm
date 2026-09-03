import { Link } from "react-router-dom";
import { Clock, MapPin, Building2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import type { AgendaItem } from "@/lib/agenda/types";
import { getEntityHref, getStatusClass, getStatusLabel, getTypeLabel } from "./agendaLabels";

interface AgendaItemCardProps {
  item: AgendaItem;
  /** Formatação da hora, injectada pela página para não repetir o locale por item. */
  formatTime: (iso: string) => string;
  /** Nos atrasados mostra-se também o dia, que já não é o dia visível. */
  formatDate?: (iso: string) => string;
  variant?: "default" | "overdue" | "allDay";
}

export function AgendaItemCard({ item, formatTime, formatDate, variant = "default" }: AgendaItemCardProps) {
  const { t } = useTranslation();
  const entityHref = getEntityHref(item);
  const isOverdue = variant === "overdue";

  return (
    <div
      className={`flex gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
        isOverdue ? "border-destructive/30 bg-destructive/5" : "bg-card"
      }`}
    >
      {/* Coluna da hora: alinhada e monoespaçada para a linha do tempo se ler na vertical. */}
      <div className="w-20 shrink-0 text-right">
        {variant === "allDay" ? (
          <span className="text-xs text-muted-foreground">{t("activities.myDay.allDay")}</span>
        ) : (
          <>
            <div className="font-mono text-sm font-semibold tabular-nums">
              {formatTime(item.start_datetime)}
            </div>
            {/* duration_minutes vem da base (coluna GENERATED) — nunca calculada aqui. */}
            {typeof item.duration_minutes === "number" && item.duration_minutes > 0 && (
              <div className="text-xs text-muted-foreground">
                {t("activities.myDay.duration", { minutes: item.duration_minutes })}
              </div>
            )}
            {isOverdue && formatDate && (
              <div className="text-xs text-destructive">{formatDate(item.start_datetime)}</div>
            )}
          </>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">
            {item.title?.trim() || t("activities.myDay.untitled")}
          </span>
          <Badge variant="outline" className="shrink-0 text-xs">
            {getTypeLabel(t, item.itemType)}
          </Badge>
          <Badge variant="outline" className={`shrink-0 text-xs ${getStatusClass(item.status)}`}>
            {getStatusLabel(t, item.status)}
          </Badge>
        </div>

        {item.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {item.entity && entityHref && (
            <Link to={entityHref} className="flex items-center gap-1 hover:text-foreground hover:underline">
              {item.entity.kind === "lead" ? (
                <UserRound className="h-3.5 w-3.5" />
              ) : (
                <Building2 className="h-3.5 w-3.5" />
              )}
              <span className="truncate">{item.entity.name}</span>
            </Link>
          )}
          {item.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{item.location}</span>
            </span>
          )}
          {variant !== "allDay" && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(item.start_datetime)} — {formatTime(item.end_datetime)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
