import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, type Locale } from "date-fns";
import { enUS, pt, es, fr, de } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ListTodo,
  MapPin,
  PartyPopper,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { WelcomeOrgDialog } from "@/components/WelcomeOrgDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useTranslation } from "@/hooks/useTranslation";
import { useMyDay } from "@/hooks/useMyDay";
import { useMyDayTasks } from "@/hooks/useMyDayTasks";
import { fetchSidebarAlertData } from "@/hooks/useSidebarAlertCounts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DayTrack, TrackEmpty, TrackGroup } from "@/components/atividades/DayTrack";
import { TaskCreateDialog } from "@/components/atividades/TaskCreateDialog";
import { TaskItemCard } from "@/components/atividades/TaskItemCard";
import { QuickLinks } from "@/components/home/QuickLinks";
import { isTaskCompleted, toDateKey } from "@/lib/agenda/tasks";
import type { AgendaItem } from "@/lib/agenda/types";
import {
  buildAlertRows,
  getAgendaItemAction,
  getFirstName,
  getGreetingKey,
} from "@/lib/agenda/today";

const LOCALES: Record<string, Locale> = { en: enUS, pt, es, fr, de };

/**
 * "Hoje" — o primeiro ecrã depois do login.
 *
 * Responde a "o que tenho de fazer agora?": a agenda do dia, as tarefas por
 * fazer ou em atraso e os alertas comerciais por tratar, cada linha com um
 * botão que leva ao sítio onde a coisa se resolve. Os atalhos para o resto do
 * Olyvia (o antigo lançador) ficam por baixo, recolhidos.
 *
 * Não há aqui leitura nova: a agenda e as tarefas vêm dos mesmos hooks das
 * Atividades (`useMyDay`, `useMyDayTasks` — sempre e só as da própria pessoa) e
 * os alertas da mesma query em cache que acende os contadores da barra lateral.
 */
const Home = () => {
  const { t, language } = useTranslation();
  const { companies, isLoading: companiesLoading, activeCompany } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { anewUserId } = usePermissionScope();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (companiesLoading) return;
    const flag = sessionStorage.getItem("showWelcomeOrg");
    if (flag === "true" && companies.length === 0) {
      setShowWelcome(true);
      sessionStorage.removeItem("showWelcomeOrg");
    } else if (flag === "true" && companies.length > 0) {
      sessionStorage.removeItem("showWelcomeOrg");
    }
  }, [companies, companiesLoading]);

  const locale = LOCALES[language] || enUS;
  const now = useMemo(() => new Date(), []);

  // Nome para a saudação. Uma linha só, pelo id de negócio já resolvido.
  const { data: userName } = useQuery({
    queryKey: ["today", "user-name", anewUserId],
    enabled: !!anewUserId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("anew_users")
        .select("name")
        .eq("id", anewUserId)
        .maybeSingle();
      return (data?.name as string | undefined) ?? "";
    },
  });

  const { day, sections, loading: agendaLoading, error: agendaError } = useMyDay();
  const {
    sections: taskSections,
    loading: tasksLoading,
    error: tasksError,
    saving: tasksSaving,
    createTask,
    setTaskCompleted,
  } = useMyDayTasks(day);

  // Mesma chave da barra lateral: partilha a cache e o refrescamento em tempo
  // real que ela já subscreve — não abre canal nem query nova.
  const activeOrgId = activeCompany?.id;
  const { data: alertData } = useQuery({
    queryKey: ["notifications", "sidebar-counts", activeOrgId ?? null],
    queryFn: () => fetchSidebarAlertData(activeOrgId),
    staleTime: 0,
  });

  // Enquanto as permissões carregam, ou sem empresa, o antigo lançador mostrava
  // tudo; mantém-se a regra para os atalhos.
  const canSeeLink = useCallback(
    (permission?: string) => {
      if (!permission) return true;
      if (permissionsLoading || companies.length === 0) return true;
      return hasPermission(permission);
    },
    [permissionsLoading, companies.length, hasPermission]
  );
  const can = useCallback(
    (permission: string) => !permissionsLoading && hasPermission(permission),
    [permissionsLoading, hasPermission]
  );

  const canOpenMyDay = can("scheduling.items.view");

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
  // O prazo é texto `YYYY-MM-DD…`: formata-se sem o converter para instante
  // (mesma regra das Atividades — evita mostrar o dia anterior a ocidente de UTC).
  const formatDueDate = useCallback(
    (dueDate: string) => {
      const [year, month, dayOfMonth] = dueDate.slice(0, 10).split("-").map(Number);
      if (!year || !month || !dayOfMonth) return dueDate;
      return format(new Date(year, month - 1, dayOfMonth), "d MMM", { locale });
    },
    [locale]
  );

  const dayKey = useMemo(() => toDateKey(day), [day]);
  const pendingToday = useMemo(
    () => taskSections.today.filter((task) => !isTaskCompleted(task)),
    [taskSections.today]
  );
  const todayAgenda = useMemo(() => [...sections.timed, ...sections.allDay], [sections.timed, sections.allDay]);
  const alertRows = useMemo(() => buildAlertRows(alertData?.counts ?? {}, can), [alertData, can]);

  const meetingsCount = todayAgenda.length;
  const todoCount = pendingToday.length;
  const overdueCount = taskSections.overdue.length + sections.overdue.length;
  const alertsCount = alertRows.reduce((sum, row) => sum + row.count, 0);
  const isLoading = agendaLoading || tasksLoading;
  const allClear = !isLoading && meetingsCount + todoCount + overdueCount + alertsCount === 0;

  const greeting = t(getGreetingKey(now));
  const firstName = getFirstName(userName);
  const dateLabel = format(now, "PPPP", { locale });

  return (
    <>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
        {/* Cabeçalho: saudação, data e o resumo do dia em números. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground first-letter:uppercase">{dateLabel}</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {firstName ? `${greeting}, ${firstName}` : greeting}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {allClear ? t("today.allClear") : t("today.subtitle")}
            </p>
            {!isLoading && !allClear && (
              <ul className="mt-3 flex flex-wrap gap-2">
                <SummaryChip count={meetingsCount} label={t("activities.myDay.pulseMeetings")} tone="info" />
                <SummaryChip count={todoCount} label={t("activities.myDay.pulseTodo")} tone="primary" />
                {overdueCount > 0 && (
                  <SummaryChip count={overdueCount} label={t("activities.myDay.pulseOverdue")} tone="destructive" />
                )}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canOpenMyDay && (
              <Button asChild variant="outline" className="flex-1 sm:flex-none">
                <Link to="/atividades">
                  <ListTodo className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("today.openMyDay")}
                </Link>
              </Button>
            )}
            <TaskCreateDialog defaultDueDate={dayKey} saving={tasksSaving} onCreate={createTask} />
          </div>
        </header>

        {(agendaError || tasksError) && (
          <div className="space-y-2">
            {agendaError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("activities.myDay.loadError")}: {agendaError}
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
          <TodaySkeleton />
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {/* Agenda de hoje */}
            <DayTrack
              id="today-agenda"
              icon={CalendarClock}
              title={t("today.agenda.title")}
              hint={t("today.agenda.hint")}
              count={meetingsCount + sections.overdue.length}
              tone="meeting"
            >
              {meetingsCount + sections.overdue.length === 0 ? (
                <TrackEmpty
                  icon={PartyPopper}
                  tone="meeting"
                  message={t("today.agenda.empty")}
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link to="/scheduling">{t("today.agenda.emptyCta")}</Link>
                    </Button>
                  }
                />
              ) : (
                <>
                  <TrackGroup label={t("today.agenda.missed")} count={sections.overdue.length} tone="overdue">
                    <ul className="space-y-2">
                      {sections.overdue.map((item) => (
                        <AgendaRow
                          key={item.id}
                          item={item}
                          overdue
                          formatTime={formatTime}
                          formatDate={formatShortDate}
                          can={can}
                        />
                      ))}
                    </ul>
                  </TrackGroup>
                  {todayAgenda.length > 0 && (
                    <ul className="space-y-2">
                      {todayAgenda.map((item) => (
                        <AgendaRow key={item.id} item={item} formatTime={formatTime} can={can} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </DayTrack>

            {/* Tarefas por fazer e em atraso */}
            <DayTrack
              id="today-tasks"
              icon={ListTodo}
              title={t("today.tasks.title")}
              hint={t("today.tasks.hint")}
              count={todoCount + taskSections.overdue.length}
              tone="task"
              action={
                canOpenMyDay ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/atividades">{t("today.tasks.seeAll")}</Link>
                  </Button>
                ) : undefined
              }
            >
              {todoCount + taskSections.overdue.length === 0 ? (
                <TrackEmpty
                  icon={CalendarCheck2}
                  tone="task"
                  message={t("today.tasks.empty")}
                  action={
                    <TaskCreateDialog
                      defaultDueDate={dayKey}
                      saving={tasksSaving}
                      onCreate={createTask}
                      trigger="quiet"
                    />
                  }
                />
              ) : (
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
                </>
              )}
            </DayTrack>

            {/* Alertas comerciais por tratar */}
            <div className="lg:col-span-2">
              <DayTrack
                id="today-alerts"
                icon={BellRing}
                title={t("today.alerts.title")}
                hint={t("today.alerts.hint")}
                count={alertsCount}
                tone="task"
              >
                {alertRows.length === 0 ? (
                  <TrackEmpty icon={CheckCircle2} tone="task" message={t("today.alerts.empty")} />
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {alertRows.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-warning/15 px-2 font-mono text-sm font-semibold tabular-nums text-warning">
                            {row.count}
                          </span>
                          <span className="truncate text-sm font-medium text-foreground">{t(row.labelKey)}</span>
                        </div>
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link to={row.href}>
                            {t("today.alerts.open")}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </DayTrack>
            </div>
          </div>
        )}

        <QuickLinks canSee={canSeeLink} />
      </div>

      <WelcomeOrgDialog open={showWelcome} onClose={() => setShowWelcome(false)} />
    </>
  );
};

const CHIP_TONES = {
  info: "bg-info/10 text-info",
  primary: "bg-primary/10 text-primary",
  destructive: "bg-destructive/10 text-destructive",
} as const;

function SummaryChip({ count, label, tone }: { count: number; label: string; tone: keyof typeof CHIP_TONES }) {
  return (
    <li className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${CHIP_TONES[tone]}`}>
      <span className="font-mono font-semibold tabular-nums">{count}</span>
      <span>{label}</span>
    </li>
  );
}

interface AgendaRowProps {
  item: AgendaItem;
  overdue?: boolean;
  formatTime: (iso: string) => string;
  formatDate?: (iso: string) => string;
  can: (permission: string) => boolean;
}

/** Um agendamento numa linha: hora, o quê, com quem, e o botão para lá ir. */
function AgendaRow({ item, overdue = false, formatTime, formatDate, can }: AgendaRowProps) {
  const { t } = useTranslation();
  const action = getAgendaItemAction(item, can);
  const isAllDay = !!item.all_day;

  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${
        overdue ? "border-destructive/30 bg-destructive/[0.04]" : "border-border/70 bg-card"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="w-12 shrink-0 pt-0.5 text-right">
          <div
            className={`font-mono text-sm font-semibold leading-none tabular-nums ${
              overdue ? "text-destructive" : "text-foreground"
            }`}
          >
            {isAllDay ? "—" : formatTime(item.start_datetime)}
          </div>
          {overdue && formatDate && (
            <div className="mt-1 text-[11px] leading-none text-destructive/80">{formatDate(item.start_datetime)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {item.title?.trim() || t("activities.myDay.untitled")}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {isAllDay && <span>{t("activities.myDay.allDay")}</span>}
            {item.entity && (
              <span className="inline-flex min-w-0 items-center gap-1">
                {item.entity.kind === "lead" ? (
                  <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{item.entity.name}</span>
              </span>
            )}
            {item.location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.location}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="w-full shrink-0 sm:w-auto">
        <Link to={action.href}>
          {t(action.labelKey)}
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </Button>
    </li>
  );
}

/** Esqueleto com a forma das pistas, para o ecrã não saltar ao carregar. */
function TodaySkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
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

export default Home;
