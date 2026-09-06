import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type TrackTone = "task" | "meeting";

const TONE: Record<TrackTone, { rule: string; chip: string; count: string }> = {
  task: {
    rule: "bg-gradient-to-r from-primary via-accent to-transparent",
    chip: "bg-primary/10 text-primary",
    count: "text-primary",
  },
  meeting: {
    rule: "bg-gradient-to-r from-info via-info/40 to-transparent",
    chip: "bg-info/10 text-info",
    count: "text-info",
  },
};

interface DayTrackProps {
  id: string;
  icon: LucideIcon;
  title: string;
  /** O que a coluna é, em meia dúzia de palavras. */
  hint?: string;
  count: number;
  tone: TrackTone;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * Uma das duas colunas do dia.
 *
 * O ecrã tem duas naturezas de item que não se podem confundir: a tarefa, que
 * só acontece se a pessoa a for buscar, e o agendamento, que acontece à hora
 * marcada quer ela queira quer não. Em vez de as empilhar na mesma lista com
 * ícones diferentes, cada uma tem a sua pista, a sua cor e a sua gramática —
 * lista de conferir à esquerda, linha do tempo à direita.
 */
export function DayTrack({ id, icon: Icon, title, hint, count, tone, action, children }: DayTrackProps) {
  const classes = TONE[tone];

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-sm)]"
    >
      {/* Filete de cor no topo: identifica a pista sem gastar uma etiqueta. */}
      <div aria-hidden="true" className={`h-[3px] w-full ${classes.rule}`} />

      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${classes.chip}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id={`${id}-title`}
              className="truncate text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground"
            >
              {title}
              <span className={`ml-2 font-mono text-sm tabular-nums ${count > 0 ? classes.count : "text-muted-foreground"}`}>
                {count}
              </span>
            </h2>
            {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

interface TrackGroupProps {
  label: string;
  count: number;
  tone?: "overdue" | "muted";
  children: ReactNode;
}

/**
 * Sub-bloco dentro de uma pista: "em atraso", "concluídas", "sem hora".
 *
 * Fica dentro da mesma pista em vez de virar um cartão próprio — o atraso de
 * uma tarefa continua a ser trabalho da lista de tarefas, e arrancá-lo para
 * fora partiria em quatro um ecrã que só tem duas ideias.
 */
export function TrackGroup({ label, count, tone = "muted", children }: TrackGroupProps) {
  if (count === 0) return null;

  const isOverdue = tone === "overdue";

  return (
    <div className={isOverdue ? "mb-3 rounded-xl bg-destructive/[0.05] p-2 ring-1 ring-inset ring-destructive/20 dark:bg-destructive/10 dark:ring-destructive/30" : "mt-4"}>
      <div className="flex items-center gap-2 px-1.5 pb-1.5">
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
            isOverdue ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        <span
          className={`font-mono text-[11px] tabular-nums ${isOverdue ? "text-destructive/70" : "text-muted-foreground/70"}`}
        >
          {count}
        </span>
        <span
          aria-hidden="true"
          className={`h-px flex-1 ${isOverdue ? "bg-destructive/20" : "bg-border"}`}
        />
      </div>
      {children}
    </div>
  );
}

interface TrackEmptyProps {
  icon: LucideIcon;
  message: string;
  tone: TrackTone;
  action?: ReactNode;
}

/**
 * Vazio com intenção. Um dia sem nada marcado é uma boa notícia, não um erro —
 * por isso o vazio tem o tom da pista, e não o cinzento de uma falha.
 */
export function TrackEmpty({ icon: Icon, message, tone, action }: TrackEmptyProps) {
  const classes = TONE[tone];

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <span className={`grid h-10 w-10 place-items-center rounded-full ${classes.chip}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="max-w-[28ch] text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
