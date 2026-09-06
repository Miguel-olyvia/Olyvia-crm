import { format, type Locale } from "date-fns";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import type { DaySummary } from "@/lib/agenda/summary";
import { DayPulse } from "./DayPulse";

interface DayHeaderProps {
  day: Date;
  locale: Locale;
  isToday: boolean;
  summary: DaySummary;
  loading?: boolean;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onRefresh: () => void;
  /** Acção principal do ecrã (criar tarefa), no canto do cabeçalho. */
  action?: ReactNode;
}

/**
 * O cabeçalho do dia.
 *
 * A hierarquia é deliberada: o elemento maior do ecrã é o NÚMERO do dia, não o
 * título da página. Quem abre isto de manhã já sabe em que aplicação está — o
 * que precisa de fixar num relance é que dia está a ver, sobretudo depois de
 * navegar para trás ou para a frente. O título do ecrã fica reduzido a uma
 * sobrancelha, e o dia por extenso vive no `h1` para quem usa leitor de ecrã.
 */
export function DayHeader({
  day,
  locale,
  isToday,
  summary,
  loading = false,
  onPreviousDay,
  onNextDay,
  onToday,
  onRefresh,
  action,
}: DayHeaderProps) {
  const { t } = useTranslation();

  const dayNumber = format(day, "dd");
  const weekday = format(day, "EEEE", { locale });
  const monthAndYear = format(day, "MMMM yyyy", { locale });
  const fullLabel = format(day, "EEEE, d MMMM yyyy", { locale });

  return (
    <header className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-sm)]">
      {/* Atmosfera: um halo da cor da marca no canto, atrás do conteúdo. Dá
          profundidade ao cabeçalho sem lhe acrescentar mais uma caixa. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-gradient-to-br from-primary via-accent to-primary opacity-[0.14] blur-3xl dark:opacity-25"
      />

      <div className="relative flex flex-col gap-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex items-center gap-4 sm:gap-5">
            <span
              aria-hidden="true"
              className="font-mono text-[3.25rem] font-semibold leading-[0.85] tracking-tighter tabular-nums text-foreground sm:text-[4rem]"
            >
              {dayNumber}
            </span>

            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                {t("activities.title")}
              </p>
              <h1 className="sr-only">{fullLabel}</h1>
              <p
                aria-hidden="true"
                className="truncate text-xl font-semibold capitalize leading-tight text-foreground sm:text-2xl"
              >
                {weekday}
              </p>
              <p
                aria-hidden="true"
                className="text-sm capitalize text-muted-foreground"
              >
                {monthAndYear}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Navegação como um só controlo segmentado: ontem / hoje / amanhã
                são a mesma decisão, e três botões soltos leem-se como três. */}
            <div className="inline-flex items-center rounded-full border border-border/70 bg-background/80 p-1 shadow-sm backdrop-blur-sm">
              <button
                type="button"
                onClick={onPreviousDay}
                aria-label={t("activities.myDay.yesterday")}
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onToday}
                aria-current={isToday ? "date" : undefined}
                className={`h-9 rounded-full px-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 ${
                  isToday
                    ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[var(--shadow-sm)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t("activities.myDay.today")}
              </button>
              <button
                type="button"
                onClick={onNextDay}
                aria-label={t("activities.myDay.tomorrow")}
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              aria-label={t("activities.myDay.refresh")}
              className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            {action}
          </div>
        </div>

        <DayPulse summary={summary} loading={loading} />
      </div>
    </header>
  );
}
