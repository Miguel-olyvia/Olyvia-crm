import { useMemo } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Eye, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";

export interface LeadKanbanCard {
  id: string;
  created_at: string;
  campaigns?: { id: string; name: string } | null;
  assigned_user?: { id: string; name: string | null } | null;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface LeadKanbanStage {
  id: string;
  name: string;
  label: string;
  color: string;
  stage_order: number;
  is_conversion: boolean;
  is_rejection: boolean;
  is_final: boolean;
}

interface LeadsKanbanViewProps {
  leads: LeadKanbanCard[];
  stages: LeadKanbanStage[];
  getStageIdForLead: (leadId: string) => string | undefined;
  onStageDrop: (leadId: string, newStageId: string) => void | Promise<void>;
  onViewDetails: (leadId: string) => void;
}

export function LeadsKanbanView({ leads, stages, getStageIdForLead, onStageDrop, onViewDetails }: LeadsKanbanViewProps) {
  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.stage_order - b.stage_order),
    [stages],
  );

  const leadsByStage = useMemo(() => {
    const map: Record<string, LeadKanbanCard[]> = {};
    orderedStages.forEach(s => { map[s.id] = []; });
    leads.forEach(lead => {
      const stageId = getStageIdForLead(lead.id);
      if (stageId && map[stageId]) {
        map[stageId].push(lead);
      }
    });
    return map;
  }, [leads, orderedStages, getStageIdForLead]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;
    onStageDrop(draggableId, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {orderedStages.map(stage => (
          <Droppable key={stage.id} droppableId={stage.id}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  "flex-shrink-0 w-[280px] flex flex-col rounded-lg border bg-muted/30 transition-colors",
                  snapshot.isDraggingOver && "bg-primary/5 border-primary/30"
                )}
              >
                <div className="p-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="font-semibold text-sm">{stage.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs h-5 px-1.5">
                    {(leadsByStage[stage.id] || []).length}
                  </Badge>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
                  {(leadsByStage[stage.id] || []).map((lead, index) => {
                    const daysOpen = differenceInDays(new Date(), parseISO(lead.created_at));
                    const isStalled = daysOpen > 14;

                    return (
                      <Draggable key={lead.id} draggableId={lead.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <Card
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={cn(
                              "p-3 cursor-grab active:cursor-grabbing transition-shadow",
                              dragSnapshot.isDragging && "shadow-lg ring-2 ring-primary/20",
                              isStalled && "border-l-4 border-l-amber-500"
                            )}
                            onClick={() => onViewDetails(lead.id)}
                          >
                            <div className="space-y-2">
                              <span className="font-medium text-sm leading-tight line-clamp-2 block">
                                {lead.name || "Sem nome"}
                              </span>

                              {lead.campaigns?.name && (
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {lead.campaigns.name}
                                </div>
                              )}

                              <div className="flex items-center justify-between">
                                {lead.assigned_user?.name && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                    <User className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{lead.assigned_user.name}</span>
                                  </div>
                                )}
                                <span className={cn(
                                  "text-xs tabular-nums ml-auto",
                                  isStalled ? "text-amber-600 font-semibold" : "text-muted-foreground"
                                )}>
                                  {daysOpen}d
                                </span>
                              </div>

                              <div className="flex gap-1 pt-1 border-t border-border/50">
                                {lead.phone && (
                                  <Button variant="ghost" size="icon" className="h-6 w-6" asChild onClick={e => e.stopPropagation()}>
                                    <a href={`tel:${lead.phone}`}><Phone className="h-3 w-3 text-emerald-600" /></a>
                                  </Button>
                                )}
                                {lead.email && (
                                  <Button variant="ghost" size="icon" className="h-6 w-6" asChild onClick={e => e.stopPropagation()}>
                                    <a href={`mailto:${lead.email}`}><Mail className="h-3 w-3 text-primary" /></a>
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={e => { e.stopPropagation(); onViewDetails(lead.id); }}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
