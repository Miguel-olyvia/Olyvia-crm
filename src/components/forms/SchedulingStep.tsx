import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Loader2, MapPin, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isBefore, startOfDay, addMonths, getDay } from "date-fns";
import { pt } from "date-fns/locale";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface SchedulingStepProps {
  formId: string;
  stepNumber: number;
  boardId: string | null;
  durationMinutes: number;
  postalCode?: string;
  primaryColor: string;
  textColor?: string;
  buttonTextColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  onSlotSelected: (slot: { start: string; end: string } | null) => void;
  selectedSlot: { start: string; end: string } | null;
}

interface TimeSlot {
  start: string;
  end: string;
  available_count: number;
}

interface ScheduleConfig {
  working_days: number[];
  working_hours_start: string;
  working_hours_end: string;
  timezone: string;
  week_starts_on: number;
  holidays: string[];
}

const DEFAULT_CONFIG: ScheduleConfig = {
  working_days: [1, 2, 3, 4, 5],
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  timezone: 'Europe/Lisbon',
  week_starts_on: 1,
  holidays: [],
};

export function SchedulingStep({
  formId,
  stepNumber,
  boardId,
  durationMinutes,
  postalCode,
  primaryColor,
  textColor,
  buttonTextColor,
  fontFamily,
  borderRadius = "12px",
  onSlotSelected,
  selectedSlot,
}: SchedulingStepProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [daysWithSlots, setDaysWithSlots] = useState<Set<string>>(new Set());
  const [loadingDays, setLoadingDays] = useState(false);
  const [noCoverage, setNoCoverage] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG);

  const today = startOfDay(new Date());
  const holidaySet = useMemo(() => new Set(scheduleConfig.holidays), [scheduleConfig.holidays]);

  const isNonWorkingDay = (date: Date, config?: ScheduleConfig) => {
    const cfg = config || scheduleConfig;
    const dayOfWeek = getDay(date); // 0=Sun, 1=Mon, ...
    if (!cfg.working_days.includes(dayOfWeek)) return true;
    const holidays = config ? new Set(config.holidays) : holidaySet;
    if (holidays.has(format(date, "yyyy-MM-dd"))) return true;
    return false;
  };

  // Prefetch which days have availability for the visible month (P3: single range call)
  useEffect(() => {
    prefetchMonth(currentMonth);
  }, [currentMonth, formId, boardId, postalCode]);

  const prefetchMonth = async (month: Date) => {
    setLoadingDays(true);
    const start = startOfMonth(month);
    const end = endOfMonth(month);

    // Use effective start (skip past days)
    const effectiveStart = isBefore(start, today) ? today : start;
    if (isBefore(end, today)) {
      setDaysWithSlots(new Set());
      setLoadingDays(false);
      return;
    }

    const startStr = format(effectiveStart, "yyyy-MM-dd");
    const endStr = format(end, "yyyy-MM-dd");

    try {
      // P3: Single range call instead of ~11 individual calls
      const res = await fetch(`${SUPABASE_URL}/functions/v1/public-availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: formId,
          step_number: stepNumber,
          start_date: startStr,
          end_date: endStr,
          postal_code: postalCode || undefined,
          board_id: boardId || undefined,
          duration_minutes: durationMinutes,
        }),
      });
      const data = await res.json();

      // P4: Use config directly from response (no race condition)
      if (data.schedule_config) {
        const cfg = data.schedule_config as ScheduleConfig;
        setScheduleConfig(cfg);
      }

      const available = new Set<string>(data.available_dates || []);
      setDaysWithSlots(available);
      setNoCoverage(available.size === 0);
    } catch {
      setDaysWithSlots(new Set());
      setNoCoverage(true);
    } finally {
      setLoadingDays(false);
    }
  };

  // Load slots for selected date
  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }
    loadSlots(selectedDate);
  }, [selectedDate]);

  const loadSlots = async (date: Date) => {
    setLoadingSlots(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/public-availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: formId,
          step_number: stepNumber,
          date: format(date, "yyyy-MM-dd"),
          postal_code: postalCode || undefined,
          board_id: boardId || undefined,
          duration_minutes: durationMinutes,
        }),
      });
      const data = await res.json();
      setSlots(data.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Calendar rendering
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    // Pad start to align with weekday (Monday = 0)
    const startDay = (getDay(start) + 6) % 7;
    const padding = Array.from({ length: startDay }, () => null);

    return [...padding, ...days];
  }, [currentMonth]);

  const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  const handleDateClick = (date: Date) => {
    if (isBefore(date, today) || isNonWorkingDay(date)) return;
    const dateStr = format(date, "yyyy-MM-dd");
    if (!daysWithSlots.has(dateStr) && !loadingDays) return;

    setSelectedDate(date);
    onSlotSelected(null);
  };

  const handleSlotClick = (slot: TimeSlot) => {
    if (selectedSlot?.start === slot.start && selectedSlot?.end === slot.end) {
      onSlotSelected(null);
    } else {
      onSlotSelected({ start: slot.start, end: slot.end });
    }
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: scheduleConfig.timezone });
  };

  if (noCoverage && !loadingDays) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${primaryColor}15` }}>
          <MapPin className="h-7 w-7" style={{ color: primaryColor }} />
        </div>
        <div>
          <h3 className="font-semibold text-lg" style={{ color: textColor }}>Sem disponibilidade na sua zona</h3>
          <p className="text-sm text-muted-foreground mt-1">
            De momento não temos horários disponíveis para o seu código postal. 
            Continue o formulário e entraremos em contacto consigo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex items-center gap-3 mb-2">
        <Calendar className="h-5 w-5" style={{ color: primaryColor }} />
        <h3 className="font-semibold text-lg" style={{ color: textColor, fontFamily }}>
          Escolha a data e hora
        </h3>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
          disabled={isBefore(endOfMonth(addMonths(currentMonth, -1)), today)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium capitalize" style={{ color: textColor }}>
          {format(currentMonth, "MMMM yyyy", { locale: pt })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}

        {calendarDays.map((day, idx) => {
          if (!day) return <div key={`pad-${idx}`} />;

          const dateStr = format(day, "yyyy-MM-dd");
          const isPast = isBefore(day, today);
          const hasAvailability = daysWithSlots.has(dateStr);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isUnavailableDay = isPast || isNonWorkingDay(day);

          return (
            <button
              key={dateStr}
              disabled={isUnavailableDay || (!hasAvailability && !loadingDays)}
              onClick={() => handleDateClick(day)}
              className="relative aspect-square flex items-center justify-center text-sm transition-all"
              style={{
                borderRadius: borderRadius,
                backgroundColor: isSelected ? primaryColor : hasAvailability ? `${primaryColor}10` : "transparent",
                color: isSelected ? (buttonTextColor || "#fff") : isUnavailableDay ? "#d1d5db" : !hasAvailability && !loadingDays ? "#d1d5db" : (textColor || "#111"),
                fontWeight: isSelected ? 600 : 400,
                cursor: isUnavailableDay || (!hasAvailability && !loadingDays) ? "default" : "pointer",
              }}
            >
              {day.getDate()}
              {hasAvailability && !isSelected && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: primaryColor }}
                />
              )}
            </button>
          );
        })}
      </div>

      {loadingDays && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: primaryColor }} />
          A verificar disponibilidade...
        </div>
      )}

      {/* Time Slots */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div
            key={format(selectedDate, "yyyy-MM-dd")}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" style={{ color: primaryColor }} />
              <span className="font-medium text-sm" style={{ color: textColor }}>
                Horários para {format(selectedDate, "d 'de' MMMM", { locale: pt })}
              </span>
            </div>

            {loadingSlots ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: primaryColor }} />
                A carregar horários...
              </div>
            ) : slots.length === 0 ? (
              <div className="flex items-center gap-2 py-4 px-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Sem horários disponíveis para este dia. Selecione outra data.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((slot) => {
                  const isSlotSelected = selectedSlot?.start === slot.start && selectedSlot?.end === slot.end;

                  return (
                    <button
                      key={slot.start}
                      onClick={() => handleSlotClick(slot)}
                      className="py-3 px-2 text-sm font-medium transition-all border-2"
                      style={{
                        borderRadius: borderRadius,
                        borderColor: isSlotSelected ? primaryColor : "#e5e7eb",
                        backgroundColor: isSlotSelected ? primaryColor : "transparent",
                        color: isSlotSelected ? (buttonTextColor || "#fff") : (textColor || "#111"),
                      }}
                    >
                      {formatTime(slot.start)}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected slot confirmation */}
      {selectedSlot && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 border-2 rounded-lg"
          style={{ borderColor: primaryColor, backgroundColor: `${primaryColor}08`, borderRadius }}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${primaryColor}15` }}>
            <Calendar className="h-5 w-5" style={{ color: primaryColor }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: textColor }}>
              {selectedDate && format(selectedDate, "EEEE, d 'de' MMMM", { locale: pt })}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatTime(selectedSlot.start)} - {formatTime(selectedSlot.end)} ({durationMinutes} min)
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
