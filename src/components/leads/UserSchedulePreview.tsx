import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Clock, Calendar, Loader2, Ban } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { cn } from "@/lib/utils";

interface ScheduleItem {
  id: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
}

interface TimeOff {
  start_date: string;
  end_date: string;
  title: string;
}

interface UserSchedulePreviewProps {
  userId: string;
  companyId: string;
  selectedDate: string;
  selectedTime: string;
  duration: number;
  onSelectSlot: (date: string, time: string) => void;
}

export function UserSchedulePreview({
  userId,
  companyId,
  selectedDate,
  selectedTime,
  duration,
  onSelectSlot,
}: UserSchedulePreviewProps) {
  const GRID_SLOT_MINUTES = 30;

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [timeOffs, setTimeOffs] = useState<TimeOff[]>([]);
  const [weekStart, setWeekStart] = useState(() => {
    const date = selectedDate ? new Date(selectedDate) : new Date();
    return startOfWeek(date, { weekStartsOn: 1 }); // Monday
  });
  const [userName, setUserName] = useState<string>("");

  // Generate week days
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Clear data when user changes
  useEffect(() => {
    setItems([]);
    setTimeOffs([]);
    setUserName("");
  }, [userId]);

  // Load user schedule when userId or week changes
  useEffect(() => {
    if (!userId || !companyId) return;
    loadUserSchedule();
  }, [userId, companyId, weekStart]);

  const loadUserSchedule = async () => {
    setLoading(true);
    // Clear previous data before loading new
    setItems([]);
    setTimeOffs([]);
    
    try {
      // Get user name from anew_users
      const { data: anewUser } = await supabase
        .from("anew_users")
        .select("name")
        .eq("id", userId)
        .maybeSingle();
      
      if (anewUser?.name) {
        setUserName(anewUser.name);
      }

      // schedule_resources.user_id now references anew_users.id directly
      // Get resource ID for this user (using anew internal id + organization_id)
      const { data: resource } = await supabase
        .from("schedule_resources")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", companyId)
        .maybeSingle();

      const weekEndDate = addDays(weekStart, 7);
      
      let scheduleItems: ScheduleItem[] = [];

      if (resource) {
        console.log("[UserSchedulePreview] Found resource for user:", userId, "resource_id:", resource.id);
        
        // Get schedule items for this week - only items assigned to THIS resource
        const { data: assignees, error } = await supabase
          .from("schedule_item_assignees")
          .select(`
            schedule_items!inner(
              id, title, start_datetime, end_datetime, status
            )
          `)
          .eq("resource_id", resource.id);

        if (error) {
          console.error("[UserSchedulePreview] Error fetching schedule items:", error);
        }

        if (assignees) {
          console.log("[UserSchedulePreview] Raw assignees data:", assignees);
          
          const filteredItems = assignees
            .map((a: any) => a.schedule_items)
            .filter((item: any) => {
              if (!item || item.status === "cancelled") return false;
              const itemDate = new Date(item.start_datetime);
              return itemDate >= weekStart && itemDate < weekEndDate;
            });
          
          // Remove duplicates by id
          scheduleItems = filteredItems.filter(
            (item: any, index: number, self: any[]) =>
              index === self.findIndex((t) => t.id === item.id)
          );
          
          console.log("[UserSchedulePreview] Filtered unique items for week:", scheduleItems);
        }
      } else {
        console.log("[UserSchedulePreview] No resource found for user:", userId);
      }
      
      setItems(scheduleItems);

      // Get time-offs for resource
      if (resource) {
        const { data: resourceTimeOffs } = await supabase
          .from("resource_time_off")
          .select("start_date, end_date, title, reason")
          .eq("resource_id", resource.id)
          .eq("approved", true);

        if (resourceTimeOffs) {
          setTimeOffs(resourceTimeOffs.map(t => ({
            start_date: t.start_date,
            end_date: t.end_date,
            title: t.title || t.reason || "Indisponível"
          })));
        }
      }

      // Time-off is already fetched via resource_time_off above — no employees fallback
    } catch (error) {
      console.error("Error loading user schedule:", error);
    } finally {
      setLoading(false);
    }
  };

  // Check if a date is on time-off
  const isDateTimeOff = (date: Date): TimeOff | undefined => {
    const dateStr = format(date, "yyyy-MM-dd");
    return timeOffs.find(
      (t) => dateStr >= t.start_date && dateStr <= t.end_date
    );
  };

  // Get items for a specific date
  const getItemsForDate = (date: Date): ScheduleItem[] => {
    return items.filter((item) =>
      isSameDay(new Date(item.start_datetime), date)
    ).sort((a, b) => 
      new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    );
  };

  // Generate time slots for a day (8:00 - 19:00)
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 8; h <= 18; h++) {
      slots.push(`${h.toString().padStart(2, "0")}:00`);
      slots.push(`${h.toString().padStart(2, "0")}:30`);
    }
    return slots;
  }, []);

  // A célula representa sempre 30min. Isto garante que alterar a DURAÇÃO
  // (do que vais marcar) NÃO muda a renderização das visitas existentes.
  const getCellOccupiedBy = (date: Date, time: string): ScheduleItem | undefined => {
    const cellStart = new Date(`${format(date, "yyyy-MM-dd")}T${time}:00`);
    const cellEnd = new Date(cellStart.getTime() + GRID_SLOT_MINUTES * 60000);

    return items.find((item) => {
      const itemStart = new Date(item.start_datetime);
      const itemEnd = new Date(item.end_datetime);
      return cellStart < itemEnd && cellEnd > itemStart;
    });
  };

  // Verifica se marcar uma visita com a duração selecionada colide com algo existente
  const hasBookingOverlap = (date: Date, time: string): boolean => {
    const slotStart = new Date(`${format(date, "yyyy-MM-dd")}T${time}:00`);
    const slotEnd = new Date(slotStart.getTime() + duration * 60000);
    return items.some((item) => {
      const itemStart = new Date(item.start_datetime);
      const itemEnd = new Date(item.end_datetime);
      return slotStart < itemEnd && slotEnd > itemStart;
    });
  };

  const handlePreviousWeek = () => {
    setWeekStart((prev) => addDays(prev, -7));
  };

  const handleNextWeek = () => {
    setWeekStart((prev) => addDays(prev, 7));
  };

  const isToday = (date: Date) => isSameDay(date, new Date());
  const isPast = (date: Date) => date < new Date(new Date().toDateString());
  const isSelected = (date: Date, time: string) =>
    selectedDate === format(date, "yyyy-MM-dd") && selectedTime === time;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            Agenda de {userName || "Utilizador"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handlePreviousWeek}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[120px] text-center">
            {format(weekStart, "d MMM", { locale: pt })} -{" "}
            {format(addDays(weekStart, 6), "d MMM", { locale: pt })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleNextWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <OlyviaLoader size={24} />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Header row with days */}
          <div className="grid grid-cols-8 border-b bg-muted/50">
            {/* Empty cell for time column */}
            <div className="p-1.5 text-center border-r text-[10px] text-muted-foreground">
              Hora
            </div>
            {weekDays.map((day) => {
              const timeOff = isDateTimeOff(day);
              const past = isPast(day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "p-1.5 text-center border-r last:border-r-0",
                    isToday(day) && "bg-primary/10",
                    past && "opacity-50"
                  )}
                >
                  <div className="text-[10px] text-muted-foreground uppercase">
                    {format(day, "EEE", { locale: pt })}
                  </div>
                  <div
                    className={cn(
                      "text-sm font-medium",
                      isToday(day) && "text-primary"
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  {timeOff && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="destructive"
                          className="text-[9px] px-1 py-0 mt-0.5"
                        >
                          <Ban className="w-2 h-2 mr-0.5" />
                          Off
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{timeOff.title}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="max-h-[400px] overflow-y-auto">
            {timeSlots.map((time) => {
              const isHourStart = time.endsWith(":00");
              return (
                <div key={time} className={cn(
                  "grid grid-cols-8 border-b last:border-b-0",
                  isHourStart && "border-t border-t-muted"
                )}>
                  {/* Time label column */}
                  <div className={cn(
                    "h-8 border-r flex items-center justify-center text-[11px] text-muted-foreground bg-muted/30",
                    isHourStart ? "font-medium" : "text-[9px]"
                  )}>
                    {time}
                  </div>
                  
                  {weekDays.map((day) => {
                    const past = isPast(day);
                    const timeOff = isDateTimeOff(day);
                    const occupiedBy = getCellOccupiedBy(day, time);
                    const selected = isSelected(day, time);
                    const clickable = !past && !timeOff && !hasBookingOverlap(day, time);

                    return (
                      <div
                        key={`${day.toISOString()}-${time}`}
                        className={cn(
                          "h-8 border-r last:border-r-0 text-[10px] flex items-center justify-center cursor-pointer transition-colors",
                          past && "bg-muted/30 cursor-not-allowed",
                          timeOff && "bg-red-50 cursor-not-allowed",
                          occupiedBy && "bg-amber-50",
                          selected && "bg-primary text-primary-foreground",
                          clickable && !selected && "hover:bg-primary/10"
                        )}
                        onClick={() => {
                          if (clickable) {
                            onSelectSlot(format(day, "yyyy-MM-dd"), time);
                          }
                        }}
                      >
                        {occupiedBy && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="w-full h-full bg-amber-200/60 flex items-center justify-center">
                                <Clock className="w-3 h-3 text-amber-600" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">{occupiedBy.title}</p>
                              <p className="text-xs">
                                {format(new Date(occupiedBy.start_datetime), "HH:mm")} -{" "}
                                {format(new Date(occupiedBy.end_datetime), "HH:mm")}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {selected && (
                          <div className="w-2 h-2 bg-primary-foreground rounded-full" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-200" />
          <span>Ocupado</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-100" />
          <span>Indisponível</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-primary" />
          <span>Selecionado</span>
        </div>
      </div>
    </div>
  );
}
