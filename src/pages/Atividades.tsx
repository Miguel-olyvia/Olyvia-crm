import { useCallback, useMemo } from "react";
import { format, type Locale } from "date-fns";
import { enUS, pt, es, fr, de } from "date-fns/locale";
import { AlertTriangle, CalendarCheck2, CalendarClock, ListTodo, Lock, PartyPopper } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AgendaItemCard } from "@/components/atividades/AgendaItemCard";
import { DayHeader } from "@/components/atividades/DayHeader";
import { DayTrack, TrackEmpty, TrackGroup } from "@/components/atividades/DayTrack";
import { TaskCreateDialog } from "@/components/atividades/TaskCreateDialog";
import { TaskItemCard } from "@/components/atividades/TaskItemCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMyDay } from "@/hooks/useMyDay";
import { useMyDayTasks } from "@/hooks/useMyDayTasks";
import { buildDaySummary } from "@/lib/agenda/summary";
import { isTaskCompleted, toDateKey } from "@/lib/agenda/tasks";
import { useTranslation } from "@/hooks/useTranslation";

const LOCALES: Record<string, Locale> = { en: enUS, pt, es, fr, de };

/**
 * "O Meu Dia" — o dia de uma pessoa: as suas TAREFAS e as suas REUNIÕES.
 *
 * O ecrã responde a duas perguntas que um comercial faz de manhã, e responde-as
 * em sítios diferentes de propósito: "o que tenho de fazer" na pista da
 * esquerda, uma lista de conferir; "a que horas tenho de estar onde" na pista
 * da direita, uma linha do tempo. São duas naturezas de item — uma sem hora,
 * que só avança se a pessoa a empurrar; outra ancorada no relógio, que acontece
 * sozinha — e misturá-las na mesma lista faria as duas perderem-se.
 *
 * Os dados vêm de sítios diferentes: `schedule_items` (`useMyDay`, só leitura)
 * e `activities` (`useMyDayTasks`, com criação e conclusão) — mas em ambos vale
 * a mesma regra: sempre e só as próprias. As Atividades são a agenda PESSOAL,
 * sem âmbito NONE/OWNED/TEAM/ORG; a visão de equipa e de organização vive nos
 * Agendamentos, por decisão de produto — não é permissão em falta.
 * O que partilham — a janela do
 * dia, o recuo dos atrasados, a navegação — vive em `src/lib/agenda/`.
 */
export default function Atividades() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const {
    day,
    isToday,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    goToDay,
    sections,
    loading,
    error,
    refresh,
  } = useMyDay();

  const {
    sections: taskSections,
    loading: tasksLoading,
    error: tasksError,
    saving: tasksSaving,
    createTask,
    setTaskCompleted,
    refresh: refreshTasks,
  } = useMyDayTasks(day);

  const locale = LOCALES[language] || enUS;

  // Formatadores criados uma vez por idioma e passados aos itens, em vez de
  // cada cartão resolver o locale por si.
  const formatTime = useCallback((iso: string) => {
    const value = new Date(iso);
    return Number.isNaN(value.getTime()) ? "--:--" : format(value, "HH:mm");
  }, []);

  const formatShortDate = useCallback(
    (iso: string) => {
      const value = new Date(iso);
      return Number.isNaN(value.getTime()) ? "" : format(value, "d MMM", { locale });
    },
    [locale]
  );

  // O prazo é um `date` (`YYYY-MM-DD`), sem hora nem fuso: formata-se a partir
  // do texto, sem o converter para instante — `new Date("2026-09-04")` seria
  // meia-noite UTC e mostraria o dia anterior a ocidente de Greenwich.
  const formatDueDate = useCallback(
    (dueDate: string) => {
      const [year, month, dayOfMonth] = dueDate.slice(0, 10).split("-").map(Number);
      if (!year || !month || !dayOfMonth) return dueDate;
      return format(new Date(year, month - 1, dayOfMonth), "d MMM", { locale });
    },
    [locale]
  );

  const dayKey = useMemo(() => toDateKey(day), [day]);
  const summary = useMemo(() => buildDaySummary(taskSections, sections), [taskSections, sections]);

  // As concluídas do dia continuam à vista, mas separadas por uma regra: o que
  // ainda falta em cima, o que já está fechado por baixo e em surdina.
  const pendingToday = useMemo(
    () => taskSections.today.filter((task) => !isTaskCompleted(task)),
    [taskSections.today]
  );
  const doneToday = useMemo(
    () => taskSections.today.filter(isTaskCompleted),
    [taskSections.today]
  );  // As Atividades sao a agenda PESSOAL: mostram sempre o que e da propria
  // pessoa, sem ambito nenhum. Quem precisa de ver a equipa ou a organizacao
  // vai aos Agendamentos, que existem para isso.
  const canSeeAgenda = true;
  const isLoading = loading || tasksLoading;
  const hasTasks = taskSections.overdue.length + taskSections.today.length > 0;
  const hasAgenda = sections.overdue.length + sections.timed.length + sections.allDay.length > 0;

  const refreshAll = useCallback(() => {
    refresh();
    refreshTasks();
  }, [refresh, refreshTasks]);

  const createButton = (
    <TaskCreateDialog defaultDueDate={dayKey} saving={tasksSaving} onCreate={createTask} />
  );

  return (
    <div className="space-y-5 pb-10">
      <DayHeader
        day={day}
        locale={locale}
        isToday={isToday}
        summary={summary}
        loading={isLoading}
        onPreviousDay={goToPreviousDay}
        onNextDay={goToNextDay}
        onToday={goToToday}
        onSelectDay={goToDay}
        onRefresh={refreshAll}
        action={createButton}
      />

      {(error || tasksError) && (
        <div className="space-y-2">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t("activities.myDay.loadError")}: {error}
              </AlertDescription>
            </Alert>
          )}
          {tasksError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t("activities.myDay.tasksError")}: {tasksError}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {isLoading ? (
        <DayTracksSkeleton />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
          <DayTrack
            id="my-day-tasks"
            icon={ListTodo}
            title={t("activities.myDay.tasksTitle")}
            hint={t("activities.myDay.tasksHint")}
            count={taskSections.overdue.length + pendingToday.length}
            tone="task"
          >
            {hasTasks ? (
              <>
                <TrackGroup
                  label={t("activities.myDay.overdueTasks")}
                  count={taskSections.overdue.length}
                  tone="overdue"
                >
                  <ul className="space-y-0.5">
                    {taskSections.overdue.map((task) => (
                      <TaskItemCard
                        key={task.id}
                        task={task}
                        variant="overdue"
                        onToggle={setTaskCompleted}
                        disabled={tasksSaving}
                        formatDate={formatDueDate}
                      />
                    ))}
                  </ul>
                </TrackGroup>

                {pendingToday.length > 0 && (
                  <ul className="space-y-0.5">
                    {pendingToday.map((task) => (
                      <TaskItemCard
                        key={task.id}
                        task={task}
                        onToggle={setTaskCompleted}
                        disabled={tasksSaving}
                      />
                    ))}
                  </ul>
                )}

                {pendingToday.length === 0 && taskSections.overdue.length > 0 && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    {t("activities.myDay.emptyTasks")}
                  </p>
                )}

                <TrackGroup label={t("activities.myDay.doneToday")} count={doneToday.length}>
                  <ul className="space-y-0.5">
                    {doneToday.map((task) => (
                      <TaskItemCard
                        key={task.id}
                        task={task}
                        onToggle={setTaskCompleted}
                        disabled={tasksSaving}
                      />
                    ))}
                  </ul>
                </TrackGroup>
              </>
            ) : (
              <TrackEmpty
                icon={CalendarCheck2}
                tone="task"
                message={t("activities.myDay.emptyTasks")}
                action={
                  <TaskCreateDialog
                    defaultDueDate={dayKey}
                    saving={tasksSaving}
                    onCreate={createTask}
                    trigger="quiet"
                  />
                }
              />
            )}
          </DayTrack>

          <DayTrack
            id="my-day-agenda"
            icon={CalendarClock}
            title={t("activities.myDay.agendaTitle")}
            hint={t("activities.myDay.agendaHint")}
            count={sections.overdue.length + sections.timed.length + sections.allDay.length}
            tone="meeting"
          >
            {!canSeeAgenda ? (
              <TrackEmpty icon={Lock} tone="meeting" message={t("activities.myDay.noAccess")} />
            ) : hasAgenda ? (
              <>
                <TrackGroup
                  label={t("activities.myDay.overdueAgenda")}
                  count={sections.overdue.length}
                  tone="overdue"
                >
                  <ol className="space-y-3">
                    {sections.overdue.map((item) => (
                      <AgendaItemCard
                        key={item.id}
                        item={item}
                        variant="overdue"
                        formatTime={formatTime}
                        formatDate={formatShortDate}
                      />
                    ))}
                  </ol>
                </TrackGroup>

                {sections.timed.length > 0 && (
                  <ol className="space-y-3">
                    {sections.timed.map((item) => (
                      <AgendaItemCard key={item.id} item={item} formatTime={formatTime} />
                    ))}
                  </ol>
                )}

                <TrackGroup label={t("activities.myDay.noTimeTitle")} count={sections.allDay.length}>
                  <ol className="space-y-3">
                    {sections.allDay.map((item) => (
                      <AgendaItemCard
                        key={item.id}
                        item={item}
                        variant="allDay"
                        formatTime={formatTime}
                      />
                    ))}
                  </ol>
                </TrackGroup>
              </>
            ) : (
              <TrackEmpty
                icon={PartyPopper}
                tone="meeting"
                message={t("activities.myDay.emptyAgenda")}
              />
            )}
          </DayTrack>
        </div>
      )}
    </div>
  );
}

/** Esqueleto com a forma das duas pistas, para o ecrã não saltar ao carregar. */
function DayTracksSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
      {[0, 1].map((column) => (
        <div key={column} className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <Skeleton className="h-[3px] w-full rounded-none" />
          <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted/30 px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
