import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, addDays, setHours, setMinutes, type Locale } from 'date-fns';
import { enUS, pt, es, fr, de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CalendarVisit } from '@/hooks/useCalendarScheduling';
import { useTranslation } from '@/hooks/useTranslation';

interface CalendarViewProps {
  items: CalendarVisit[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onItemClick?: (item: CalendarVisit) => void;
  viewMode: 'month' | 'week' | 'day';
}

export function CalendarView({
  items,
  currentDate,
  onDateChange,
  onItemClick,
  viewMode,
}: CalendarViewProps) {
  const { t, language } = useTranslation();
  
  const dateLocale = useMemo(() => {
    const locales: Record<string, Locale> = { en: enUS, pt, es, fr, de };
    return locales[language] || enUS;
  }, [language]);
  // Generate days based on view mode
  const days = useMemo(() => {
    if (viewMode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    } else {
      return [currentDate];
    }
  }, [currentDate, viewMode]);

  // Group items by day
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarVisit[]>();
    items.forEach(item => {
      const dayKey = format(new Date(item.start_time), 'yyyy-MM-dd');
      if (!map.has(dayKey)) {
        map.set(dayKey, []);
      }
      map.get(dayKey)!.push(item);
    });
    return map;
  }, [items]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'bg-info/20 text-info border-info/30',
      completed: 'bg-success/20 text-success border-success/30',
      cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
      rescheduled: 'bg-warning/20 text-warning border-warning/30',
    };
    return colors[status] || colors.scheduled;
  };

  const navigatePrev = () => {
    if (viewMode === 'month') {
      onDateChange(subMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      onDateChange(addDays(currentDate, -7));
    } else {
      onDateChange(addDays(currentDate, -1));
    }
  };

  const navigateNext = () => {
    if (viewMode === 'month') {
      onDateChange(addMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      onDateChange(addDays(currentDate, 7));
    } else {
      onDateChange(addDays(currentDate, 1));
    }
  };

  const getTitle = () => {
    if (viewMode === 'month') {
      return format(currentDate, 'MMMM yyyy', { locale: dateLocale });
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, 'd MMM', { locale: dateLocale })} - ${format(end, 'd MMM yyyy', { locale: dateLocale })}`;
    } else {
      return format(currentDate, "EEEE, d MMMM", { locale: dateLocale });
    }
  };
  
  const weekdayNames = [
    t('scheduling.weekdays.mon'),
    t('scheduling.weekdays.tue'),
    t('scheduling.weekdays.wed'),
    t('scheduling.weekdays.thu'),
    t('scheduling.weekdays.fri'),
    t('scheduling.weekdays.sat'),
    t('scheduling.weekdays.sun'),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between py-4 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold capitalize ml-2">{getTitle()}</h2>
        </div>
        <Button variant="outline" onClick={() => onDateChange(new Date())}>
          {t('calendar.today')}
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'month' && (
          <div className="grid grid-cols-7 h-full">
            {/* Weekday headers */}
            {weekdayNames.map(day => (
              <div key={day} className="py-2 text-center text-sm font-medium text-muted-foreground border-b">
                {day}
              </div>
            ))}

            {/* Days */}
            {days.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayItems = itemsByDay.get(dayKey) || [];
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);

              return (
                <div
                  key={dayKey}
                  className={cn(
                    'min-h-[120px] border-b border-r p-1 transition-colors',
                    !isCurrentMonth && 'bg-muted/30',
                    isToday && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
                        isToday && 'bg-primary text-primary-foreground',
                        !isCurrentMonth && 'text-muted-foreground'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="space-y-1 overflow-hidden">
                    {dayItems.slice(0, 3).map(item => (
                      <div
                        key={item.id}
                        onClick={() => onItemClick?.(item)}
                        className={cn(
                          'text-xs p-1.5 rounded cursor-pointer border transition-all hover:shadow-md',
                          getStatusColor(item.status)
                        )}
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftColor: item.board_color || '#3b82f6',
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate font-medium">{item.title}</span>
                        </div>
                        <span className="text-[10px] opacity-70">
                          {format(new Date(item.start_time), 'HH:mm')}
                        </span>
                        {item.source === 'activity' && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 ml-1">
                            {t('calendar.activity')}
                          </Badge>
                        )}
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <div className="text-xs text-muted-foreground pl-1">
                        +{dayItems.length - 3} {t('scheduling.more')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'week' && (
          <div className="grid grid-cols-7 h-full">
            {/* Weekday headers */}
            {days.map(day => (
              <div key={day.toISOString()} className="py-2 text-center border-b border-r">
                <div className="text-sm font-medium text-muted-foreground">
                  {format(day, 'EEE', { locale: dateLocale })}
                </div>
                <div className={cn(
                  'text-lg font-semibold w-8 h-8 mx-auto flex items-center justify-center rounded-full',
                  isSameDay(day, new Date()) && 'bg-primary text-primary-foreground'
                )}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}

            {/* Day columns */}
            {days.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayItems = itemsByDay.get(dayKey) || [];

              return (
                <div
                  key={dayKey}
                  className="border-r p-2 min-h-[400px]"
                >
                  <div className="space-y-2">
                    {dayItems.map(item => (
                      <div
                        key={item.id}
                        onClick={() => onItemClick?.(item)}
                        className={cn(
                          'p-2 rounded cursor-pointer border transition-all hover:shadow-md',
                          getStatusColor(item.status)
                        )}
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftColor: item.board_color || '#3b82f6',
                        }}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-sm font-medium truncate">{item.title}</span>
                          {item.source === 'activity' && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {t('calendar.activity')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs opacity-70">
                          {format(new Date(item.start_time), 'HH:mm')} - {format(new Date(item.end_time), 'HH:mm')}
                        </div>
                        {item.contact && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.contact.first_name} {item.contact.last_name}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'day' && (
          <div className="p-4">
            {/* Time slots */}
            <div className="space-y-1">
              {Array.from({ length: 24 }, (_, hour) => {
                const dayKey = format(currentDate, 'yyyy-MM-dd');
                const dayItems = itemsByDay.get(dayKey) || [];
                const hourItems = dayItems.filter(item => {
                  const itemHour = new Date(item.start_time).getHours();
                  return itemHour === hour;
                });

                return (
                  <div key={hour} className="flex border-b min-h-[60px]">
                    <div className="w-16 text-sm text-muted-foreground pr-2 pt-1 text-right shrink-0">
                      {String(hour).padStart(2, '0')}:00
                    </div>
                    <div className="flex-1 pl-2">
                      {hourItems.map(item => (
                        <div
                          key={item.id}
                          onClick={() => onItemClick?.(item)}
                          className={cn(
                            'p-2 rounded cursor-pointer border mb-1 transition-all hover:shadow-md',
                            getStatusColor(item.status)
                          )}
                          style={{
                            borderLeftWidth: '3px',
                            borderLeftColor: item.board_color || '#3b82f6',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="font-medium flex items-center gap-2">
                                {item.title}
                                {item.source === 'activity' && (
                                  <Badge variant="outline" className="text-xs">
                                    {t('calendar.activity')}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs opacity-70">
                                {format(new Date(item.start_time), 'HH:mm')} - {format(new Date(item.end_time), 'HH:mm')}
                              </div>
                              {item.contact && (
                                <div className="text-xs text-muted-foreground">
                                  {item.contact.first_name} {item.contact.last_name}
                                </div>
                              )}
                            </div>
                            {item.assigned_user && (
                              <Badge variant="secondary" className="text-xs">
                                {item.assigned_user.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
<<<<<<< ours
<<<<<<< ours
}
=======
}
>>>>>>> theirs
=======
}
>>>>>>> theirs
