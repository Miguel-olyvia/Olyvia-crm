import { AlertTriangle, CalendarClock, CheckCircle2, ListTodo } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import type { DaySummary } from "@/lib/agenda/summary";

interface PulseStatProps {
  icon: LucideIcon;
  value: number;
  label: string;
  /** A cor diz o que a coisa É, não enfeita: tarefa, reunião, atraso, feito. */
  tone: "task" | "meeting" | "overdue" | "done";
}

const TONE_CLASSES: Record<PulseStatProps["tone"], { chip: string; value: string }> = {
  task: { chip: "bg-primary/10 text-primary", value: "text-foreground" },
  meeting: { chip: "bg-info/10 text-info", value: "text-foreground" },
  overdue: { chip: "bg-destructive/10 text-destructive", value: "text-destructive" },
  done: { chip: "bg-success/10 text-success", value: "text-muted-foreground" },
};

function PulseStat({ icon: Icon, value, label, tone }: PulseStatProps) {
  const classes = TONE_CLASSES[tone];

  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${classes.chip}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="leading-none">
        <span className={`font-mono text-lg font-semibold tabular-nums ${classes.value}`}>{value}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

interface DayPulseProps {
  summary: DaySummary;
  /** Enquanto carrega, mostram-se traços em vez de zeros: um zero é uma afirmação. */
  loading?: boolean;
}

/**
 * A linha de números do dia, com a barra de progresso das tarefas.
 *
 * Não é um painel de indicadores: é uma frase feita de números, lida da
 * esquerda para a direita — o que falta, o que está feito, onde é preciso
 * estar. O atraso só aparece quando existe, para não normalizar um zero
 * vermelho permanente e para o vermelho continuar a querer dizer alguma coisa
 * no dia em que aparece.
 */
export function DayPulse({ summary, loading = false }: DayPulseProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const totalTasks = summary.todo + summary.done;
  const percent = Math.round(summary.progress * 100);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <PulseStat icon={ListTodo} value={summary.todo} label={t("activities.myDay.pulseTodo")} tone="task" />
        <PulseStat
          icon={CalendarClock}
          value={summary.meetings}
          label={t("activities.myDay.pulseMeetings")}
          tone="meeting"
        />
        {summary.done > 0 && (
          <PulseStat
            icon={CheckCircle2}
            value={summary.done}
            label={t("activities.myDay.pulseDone")}
            tone="done"
          />
        )}
        {summary.overdue > 0 && (
          <PulseStat
            icon={AlertTriangle}
            value={summary.overdue}
            label={t("activities.myDay.pulseOverdue")}
            tone="overdue"
          />
        )}
      </div>

      {totalTasks > 0 && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalTasks}
          aria-valuenow={summary.done}
          aria-valuetext={t("activities.myDay.progressLabel", { done: summary.done, total: totalTasks })}
          className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
