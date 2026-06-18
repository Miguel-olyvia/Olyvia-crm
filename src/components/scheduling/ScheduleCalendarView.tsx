import { useState, useMemo, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, addDays, setHours, setMinutes, startOfDay, isBefore, isWeekend, getDay, isWithinInterval, parseISO, isSaturday, isSunday } from 'date-fns';
import { enUS, pt, es, fr, de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import type { ScheduleItem, ScheduleBoard } from '@/types/scheduling';
import type { ScheduleSettings, ScheduleHoliday } from '@/hooks/useScheduleSettings';

interface ScheduleCalendarViewProps {
  items: ScheduleItem[];
  boards: ScheduleBoard[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onItemClick: (item: ScheduleItem) => void;
  onItemDrop?: (itemId: string, newStart: Date, newEnd: Date) => void;
  onAddClick?: (date: Date) => void;
  viewMode: 'month' | 'week' | 'day';
  settings?: ScheduleSettings | null;
  holidays?: ScheduleHoliday[];
}

export function ScheduleCalendarView({
  items,
  boards,
  currentDate,
  onDateChange,
  onItemClick,
  onItemDrop,
  onAddClick,
  viewMode,
  settings,
  holidays = [],
}: ScheduleCalendarViewProps) {
  const { t, language } = useTranslation();
  const { hasPermission } = usePermissions();
  const [draggedItem, setDraggedItem] = useState<ScheduleItem | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Reset expanded days when navigating or changing view
  const toggleDayExpand = useCallback((dayKey: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(dayKey) ? next.delete(dayKey) : next.add(dayKey);
      return next;
    });
  }, []);
  
  const canCreate = hasPermission('scheduling.items.create');

  const today = startOfDay(new Date());

  // Get locale based on current language
  const locale = useMemo(() => {
    const locales: Record<string, typeof enUS> = { en: enUS, pt, es, fr, de };
    return locales[language] || enUS;
  }, [language]);

  const isDropDisabled = (date: Date) => {
    return isBefore(startOfDay(date), today);
  };

  // Check if a day is a weekend based on settings
  const isWeekendDay = useCallback((date: Date) => {
    const workingDays = settings?.working_days || [1, 2, 3, 4, 5];
    const dayOfWeek = getDay(date); // 0 = Sunday, 1 = Monday, etc.
    return !workingDays.includes(dayOfWeek);
  }, [settings?.working_days]);

  // Check if a day is a holiday
  const getHoliday = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return holidays.find(h => h.holiday_date === dateStr);
  }, [holidays]);

  // Generate days based on view mode
  const weekStartsOn = (settings?.week_starts_on ?? 1) as 0 | 1;
  const days = useMemo(() => {
    if (viewMode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn });
      const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn });
      return eachDayOfInterval({ start, end });
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn });
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    } else {
      return [currentDate];
    }
  }, [currentDate, viewMode, weekStartsOn]);

  // Group items by day
  const itemsByDay = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    items.forEach(item => {
      const itemStart = startOfDay(parseISO(item.start_datetime));
      const itemEnd = startOfDay(parseISO(item.end_datetime));
      const includeWeekends = (item.metadata as any)?.include_weekends ?? true;
      const isTimeOff = boards.find(b => b.id === item.board_id)?.board_type === 'time_off';
      // Handle items where end_datetime is before start_datetime (bad data)
      const effectiveStart = isBefore(itemEnd, itemStart) ? itemStart : itemStart;
      const effectiveEnd = isBefore(itemEnd, itemStart) ? itemStart : itemEnd;
      // For multi-day events, add the item to each day it spans
      const spannedDays = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
      spannedDays.forEach(day => {
        // Skip weekends for time-off items unless include_weekends is true
        if (isTimeOff && !includeWeekends && (isSaturday(day) || isSunday(day))) {
          return;
        }
        const dayKey = format(day, 'yyyy-MM-dd');
        if (!map.has(dayKey)) {
          map.set(dayKey, []);
        }
        map.get(dayKey)!.push(item);
      });
    });
    return map;
  }, [items, boards]);

  const getBoardColor = (boardId: string) => {
    const board = boards.find(b => b.id === boardId);
    return board?.color || '#3b82f6';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-muted text-muted-foreground',
      scheduled: 'bg-info/20 text-info border-info/30',
      confirmed: 'bg-success/20 text-success border-success/30',
      in_progress: 'bg-warning/20 text-warning border-warning/30',
      completed: 'bg-success/20 text-success border-success/30',
      cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
      rescheduled: 'bg-warning/20 text-warning border-warning/30',
    };
    return colors[status] || colors.scheduled;
  };

  const handleDragStart = (e: React.DragEvent, item: ScheduleItem) => {
    setDraggedItem(item);
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    setDragOverDate(date);
    e.dataTransfer.dropEffect = isDropDisabled(date) ? 'none' : 'move';
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    setDragOverDate(null);
    if (!draggedItem || !onItemDrop) return;

    // Prevent dropping to a day before today
    if (isDropDisabled(targetDate)) {
      toast.error(t('scheduling.cannotSchedulePast'));
      setDraggedItem(null);
      return;
    }

    const originalStart = new Date(draggedItem.start_datetime);
    const originalEnd = new Date(draggedItem.end_datetime);
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    // Keep the same time, just change the date
    const newStart = setMinutes(
      setHours(targetDate, originalStart.getHours()),
      originalStart.getMinutes()
    );
    const newEnd = new Date(newStart.getTime() + durationMs);

    onItemDrop(draggedItem.id, newStart, newEnd);
    setDraggedItem(null);
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
      return format(currentDate, 'MMMM yyyy', { locale });
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, 'd MMM', { locale })} - ${format(end, 'd MMM yyyy', { locale })}`;
    } else {
      return format(currentDate, "EEEE, d 'de' MMMM", { locale });
    }
  };

  // Weekday headers based on language
  const weekdayHeaders = [
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
          {t('scheduling.today')}
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'month' && (
          <div className="grid grid-cols-7 h-full">
            {/* Weekday headers */}
            {weekdayHeaders.map(day => (
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
              const isWeekendStyle = isWeekendDay(day);
              const holiday = getHoliday(day);

              const isDragOverThis = dragOverDate && isSameDay(dragOverDate, day);
              const isDisabled = isDropDisabled(day);

              // Get custom colors from settings
              const weekendBg = settings?.show_weekends && isWeekendStyle ? settings.weekend_color : undefined;
              const holidayBg = settings?.show_holidays && holiday ? settings.holiday_color : undefined;

              return (
                <TooltipProvider key={dayKey}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'min-h-[120px] border-b border-r p-1 transition-colors cursor-pointer group hover:bg-accent/30',
                          !isCurrentMonth && 'bg-muted/30',
                          isToday && 'bg-primary/5',
                          isDragOverThis && !isDisabled && 'bg-primary/20 ring-2 ring-primary',
                          isDragOverThis && isDisabled && 'bg-destructive/20 ring-2 ring-destructive'
                        )}
                        style={{
                          backgroundColor: isDragOverThis 
                            ? undefined 
                            : holidayBg || weekendBg || undefined,
                        }}
                        onClick={() => canCreate && onAddClick?.(day)}
                        onDragOver={(e) => handleDragOver(e, day)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, day)}
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
                    {onAddClick && canCreate && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddClick(day);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className={cn("space-y-1", expandedDays.has(dayKey) ? "max-h-[200px] overflow-y-auto" : "overflow-hidden")}>
                    {(expandedDays.has(dayKey) ? dayItems : dayItems.slice(0, 3)).map(item => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onItemClick(item);
                        }}
                        className={cn(
                          'text-xs p-1.5 rounded cursor-pointer border transition-all hover:shadow-md',
                          getStatusColor(item.status)
                        )}
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftColor: item.color || getBoardColor(item.board_id),
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <GripVertical className="h-3 w-3 opacity-50 shrink-0" />
                          <span className="truncate font-medium">{item.title}</span>
                        </div>
                        <span className="text-[10px] opacity-70">
                          {format(new Date(item.start_datetime), 'HH:mm')}
                        </span>
                      </div>
                    ))}
                    {dayItems.length > 3 && !expandedDays.has(dayKey) && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground pl-1 hover:text-primary cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDayExpand(dayKey);
                        }}
                      >
                        +{dayItems.length - 3} {t('scheduling.more')}
                      </button>
                    )}
                    {dayItems.length > 3 && expandedDays.has(dayKey) && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground pl-1 hover:text-primary cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDayExpand(dayKey);
                        }}
                      >
                        {t('scheduling.showLess')}
                      </button>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              {holiday && (
                <TooltipContent>
                  <p className="font-medium">{holiday.name}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
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
                  {format(day, 'EEE', { locale })}
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
              const isWeekendStyle = isWeekendDay(day);
              const holiday = getHoliday(day);

              const isDragOverThis = dragOverDate && isSameDay(dragOverDate, day);
              const isDisabled = isDropDisabled(day);

              // Get custom colors from settings
              const weekendBg = settings?.show_weekends && isWeekendStyle ? settings.weekend_color : undefined;
              const holidayBg = settings?.show_holidays && holiday ? settings.holiday_color : undefined;

              return (
                <TooltipProvider key={dayKey}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'border-r p-2 min-h-[400px] cursor-pointer hover:bg-accent/30 transition-colors',
                          isDragOverThis && !isDisabled && 'bg-primary/20 ring-2 ring-primary',
                          isDragOverThis && isDisabled && 'bg-destructive/20 ring-2 ring-destructive'
                        )}
                        style={{
                          backgroundColor: isDragOverThis 
                            ? undefined 
                            : holidayBg || weekendBg || undefined,
                        }}
                        onClick={() => canCreate && onAddClick?.(day)}
                        onDragOver={(e) => handleDragOver(e, day)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, day)}
                      >
                  <div className="space-y-2">
                    {dayItems.map(item => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onItemClick(item);
                        }}
                        className={cn(
                          'p-2 rounded cursor-pointer border transition-all hover:shadow-md',
                          getStatusColor(item.status)
                        )}
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftColor: item.color || getBoardColor(item.board_id),
                        }}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <GripVertical className="h-3 w-3 opacity-50 shrink-0" />
                          <span className="text-sm font-medium truncate">{item.title}</span>
                        </div>
                        <div className="text-xs opacity-70">
                          {format(new Date(item.start_datetime), 'HH:mm')} - {format(new Date(item.end_datetime), 'HH:mm')}
                        </div>
                        {item.assignees && item.assignees.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {item.assignees.map(a => (
                              <Badge key={a.id} variant="secondary" className="text-[10px] px-1 py-0">
                                {a.resource?.name}
                              </Badge>
                            ))
                            }
                          </div>
                        )}
                      </div>
                    ))
                    }
                  </div>
                </div>
              </TooltipTrigger>
              {holiday && (
                <TooltipContent>
                  <p className="font-medium">{holiday.name}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
              );
            })}
          </div>
        )}

        {viewMode === 'day' && (
          <div className="p-4">
            {/* Time slots */}
            <div className="space-y-1">
              {Array.from({ length: 24 }, (_, hour) => {
                // Get items from itemsByDay map for consistency
                const dayKey = format(currentDate, 'yyyy-MM-dd');
                const dayItems = itemsByDay.get(dayKey) || [];
                const hourItems = dayItems.filter(item => {
                  const itemHour = new Date(item.start_datetime).getHours();
                  return itemHour === hour;
                });

                const hourDate = setHours(currentDate, hour);
                const isDragOverThis = dragOverDate && isSameDay(dragOverDate, hourDate) && dragOverDate.getHours() === hour;
                const isDisabled = isDropDisabled(hourDate);

                  return (
                    <div key={hour} className="flex border-b min-h-[60px] cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => canCreate && onAddClick?.(hourDate)}
                    >
                      <div className="w-16 text-sm text-muted-foreground pr-2 pt-1 text-right shrink-0">
                        {String(hour).padStart(2, '0')}:00
                      </div>
                      <div
                        className={cn(
                          'flex-1 pl-2',
                          isDragOverThis && !isDisabled && 'bg-primary/20 ring-2 ring-primary',
                          isDragOverThis && isDisabled && 'bg-destructive/20 ring-2 ring-destructive'
                        )}
                        onDragOver={(e) => handleDragOver(e, hourDate)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, hourDate)}
                      >
                      {hourItems.map(item => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, item)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onItemClick(item);
                          }}
                          className={cn(
                            'p-2 rounded cursor-pointer border mb-1 transition-all hover:shadow-md',
                            getStatusColor(item.status)
                          )}
                          style={{
                            borderLeftWidth: '3px',
                            borderLeftColor: item.color || getBoardColor(item.board_id),
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 opacity-50 shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium">{item.title}</div>
                              <div className="text-xs opacity-70">
                                {format(new Date(item.start_datetime), 'HH:mm')} - {format(new Date(item.end_datetime), 'HH:mm')}
                                {item.duration_minutes && ` (${item.duration_minutes}min)`}
                              </div>
                            </div>
                            {item.assignees && item.assignees.length > 0 && (
                              <div className="flex gap-1">
                                {item.assignees.map(a => (
                                  <Badge key={a.id} variant="secondary" className="text-xs">
                                    {a.resource?.name}
                                  </Badge>
                                ))
                                }
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                      }
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
}
