import { Link } from "react-router-dom";
import { Building2, MapPin, Sun, UserRound } from "lucide-react";
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

/**
 * Um agendamento, ancorado na linha do tempo do dia.
 *
 * A forma diz o que a coisa é: a hora vive fora do cartão, numa calha à
 * esquerda, ligada por um fio contínuo ao item seguinte. É esse fio que separa
 * visualmente a agenda das tarefas — uma reunião tem lugar no tempo e vizinhas
 * antes e depois; uma tarefa não tem nem uma coisa nem outra.
 *
 * A hora é a âncora e por isso é o texto mais forte da linha, em numerais de
 * largura fixa para as horas se alinharem na vertical e a coluna se ler de
 * relance como uma régua.
 */
export function AgendaItemCard({ item, formatTime, formatDate, variant = "default" }: AgendaItemCardProps) {
  const { t } = useTranslation();
  const entityHref = getEntityHref(item);
  const isOverdue = variant === "overdue";
  const isAllDay = variant === "allDay";

  return (
    <li className="group relative pl-[4.5rem]">
      {/* Calha da esquerda: hora, duração e — nos atrasados — o dia perdido. */}
      <div className="absolute left-0 top-2 w-[3.25rem] text-right">
        {isAllDay ? (
          <Sun className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <>
            <div
              className={`font-mono text-[0.9375rem] font-semibold leading-none tabular-nums ${
                isOverdue ? "text-destructive" : "text-foreground"
              }`}
            >
              {formatTime(item.start_datetime)}
            </div>
            {/* duration_minutes vem da base (coluna GENERATED) — nunca calculada aqui. */}
            {typeof item.duration_minutes === "number" && item.duration_minutes > 0 && (
              <div className="mt-1 text-[11px] leading-none tabular-nums text-muted-foreground">
                {t("activities.myDay.duration", { minutes: item.duration_minutes })}
              </div>
            )}
            {isOverdue && formatDate && (
              <div className="mt-1 text-[11px] leading-none text-destructive/80">
                {formatDate(item.start_datetime)}
              </div>
            )}
          </>
        )}
      </div>

      {/* O ponto e o fio: é isto que faz da coluna uma linha do tempo. O fio do
          último item não se desenha, para a régua acabar onde acaba o dia. */}
      <span
        aria-hidden="true"
        className={`absolute left-[4.05rem] top-[0.6rem] h-2.5 w-2.5 rounded-full ring-4 ring-card transition-transform duration-200 group-hover:scale-125 ${
          isOverdue ? "bg-destructive" : isAllDay ? "bg-muted-foreground/50" : "bg-info"
        }`}
      />
      <span
        aria-hidden="true"
        className="absolute left-[4.4rem] top-[1.4rem] -bottom-3 w-px bg-border group-last:hidden"
      />

      <div
        className={`rounded-xl border px-3 py-2.5 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-md)] ${
          isOverdue ? "border-destructive/30 bg-destructive/[0.04]" : "border-border/70 bg-card"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold leading-snug text-foreground">
            {item.title?.trim() || t("activities.myDay.untitled")}
          </span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${getStatusClass(item.status)}`}
          >
            {getStatusLabel(t, item.status)}
          </span>
        </div>

        <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          {isAllDay ? t("activities.myDay.allDay") : getTypeLabel(t, item.itemType)}
          {!isAllDay && (
            <span className="ml-2 normal-case tracking-normal tabular-nums">
              {formatTime(item.start_datetime)}–{formatTime(item.end_datetime)}
            </span>
          )}
        </p>

        {item.description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        )}

        {(item.entity || item.location) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
            {item.entity && entityHref && (
              <Link
                to={entityHref}
                className="inline-flex min-h-[24px] items-center gap-1.5 rounded-md px-1 -mx-1 font-medium transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card"
              >
                {item.entity.kind === "lead" ? (
                  <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{item.entity.name}</span>
              </Link>
            )}
            {item.location && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.location}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
