import { useCallback, useMemo } from "react";
import { format, type Locale } from "date-fns";
import { enUS, pt, es, fr, de } from "date-fns/locale";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { AgendaItemCard } from "@/components/atividades/AgendaItemCard";
import { AgendaSection } from "@/components/atividades/AgendaSection";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMyDay } from "@/hooks/useMyDay";
import { useTranslation } from "@/hooks/useTranslation";

const LOCALES: Record<string, Locale> = { en: enUS, pt, es, fr, de };

/**
 * "O Meu Dia" — Fase 2a do módulo de Atividades: SÓ LEITURA.
 *
 * Não há botões de concluir, reagendar ou criar: a escrita é a Fase 2b. Esta
 * página agrega `schedule_items` de um dia e não introduz armazenamento novo.
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
    sections,
    loading,
    error,
    scope,
    refresh,
  } = useMyDay();

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

  const dayLabel = useMemo(() => format(day, "EEEE, d MMMM yyyy", { locale }), [day, locale]);

  if (scope === "NONE" && !loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t("activities.title")}</h1>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("activities.myDay.noAccess")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold">
            {t("activities.title")}
            {scope === "TEAM" && <Badge variant="secondary">{t("activities.myDay.scopeTeam")}</Badge>}
            {scope === "ORG" && <Badge variant="secondary">{t("activities.myDay.scopeOrg")}</Badge>}
          </h1>
          <p className="text-muted-foreground">{t("activities.myDay.subtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousDay} aria-label={t("activities.myDay.yesterday")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant={isToday ? "default" : "outline"} onClick={goToToday}>
            {t("activities.myDay.today")}
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextDay} aria-label={t("activities.myDay.tomorrow")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={refresh} aria-label={t("activities.myDay.refresh")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="text-sm font-medium capitalize text-muted-foreground">{dayLabel}</div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t("activities.myDay.loadError")}: {error}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <OlyviaLoader size={40} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Atrasado primeiro: é o que exige decisão hoje. */}
          <AgendaSection
            icon={AlertTriangle}
            tone="danger"
            title={t("activities.status.overdue")}
            description={t("activities.myDay.overdueHint")}
            count={sections.overdue.length}
            emptyMessage={t("activities.myDay.emptyOverdue")}
          >
            {sections.overdue.map((item) => (
              <AgendaItemCard
                key={item.id}
                item={item}
                variant="overdue"
                formatTime={formatTime}
                formatDate={formatShortDate}
              />
            ))}
          </AgendaSection>

          <AgendaSection
            icon={CalendarClock}
            title={t("activities.myDay.agendaTitle")}
            count={sections.timed.length}
            emptyMessage={t("activities.myDay.emptyAgenda")}
          >
            {sections.timed.map((item) => (
              <AgendaItemCard key={item.id} item={item} formatTime={formatTime} />
            ))}
          </AgendaSection>

          <AgendaSection
            icon={Inbox}
            title={t("activities.myDay.noTimeTitle")}
            count={sections.allDay.length}
            emptyMessage={t("activities.myDay.emptyNoTime")}
          >
            {sections.allDay.map((item) => (
              <AgendaItemCard key={item.id} item={item} variant="allDay" formatTime={formatTime} />
            ))}
          </AgendaSection>
        </div>
      )}
    </div>
  );
}
