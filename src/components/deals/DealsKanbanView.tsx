import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Eye, AlertTriangle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO, format } from "date-fns";
import { pt } from "date-fns/locale";
import { useTranslation } from "@/hooks/useTranslation";
import {
  getDealStageKey,
  getDealStageLabel,
  isWonStage,
  type StageLike,
} from "@/lib/dealStageUtils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Deal {
  id: string;
  title: string;
  value: number;
  entity_name?: string | null;
  entity_phone?: string | null;
  entity_email?: string | null;
  assigned_to_name?: string | null;
  created_at: string;
  deal_stages: {
    id: string;
    name: string;
    color: string;
    stage_key?: string | null;
    is_won?: boolean | null;
    is_lost?: boolean | null;
    is_final?: boolean | null;
  } | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  order_index: number;
  stage_key?: string | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  is_final?: boolean | null;
}

interface DealsKanbanViewProps {
  deals: Deal[];
  stages: Stage[];
  onStageDrop: (dealId: string, newStageId: string, oldStageId: string) => Promise<void>;
  onViewDetails: (deal: Deal) => void;
  formatCurrency: (value: number) => string;
}

export function DealsKanbanView({ deals, stages, onStageDrop, onViewDetails, formatCurrency }: DealsKanbanViewProps) {
  const { t } = useTranslation();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    dealId: string;
    dealTitle: string;
    newStageId: string;
    oldStageId: string;
    newStageName: string;
    message: string;
  } | null>(null);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    stages.forEach(s => { map[s.id] = []; });
    deals.forEach(d => {
      const stageId = d.deal_stages?.id;
      if (stageId && map[stageId]) {
        map[stageId].push(d);
      }
    });
    return map;
  }, [deals, stages]);

  const stageValues = useMemo(() => {
    const map: Record<string, number> = {};
    stages.forEach(s => {
      map[s.id] = (dealsByStage[s.id] || []).reduce((sum, d) => sum + (d.value || 0), 0);
    });
    return map;
  }, [dealsByStage, stages]);

  // Known automation stages (by canonical key / flags, not name)
  const getAutomationWarning = (stage: StageLike): string | null => {
    if (!stage) return null;
    if (getDealStageKey(stage) === "qualification") {
      return "Ao mover para esta fase, poderá ser criado um orçamento automaticamente.";
    }
    if (isWonStage(stage)) {
      return "Ao fechar como Ganho, poderá ser gerado um contrato automaticamente.";
    }
    return null;
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;

    const newStage = stages.find(s => s.id === destination.droppableId);
    const warning = newStage ? getAutomationWarning(newStage) : null;

    if (warning) {
      const deal = deals.find(d => d.id === draggableId);
      setConfirmDialog({
        open: true,
        dealId: draggableId,
        dealTitle: deal?.title || "",
        newStageId: destination.droppableId,
        oldStageId: source.droppableId,
        newStageName: newStage ? getDealStageLabel(newStage, t) : "",
        message: warning,
      });
    } else {
      onStageDrop(draggableId, destination.droppableId, source.droppableId);
    }
  };

  const handleConfirm = async () => {
    if (!confirmDialog) return;
    await onStageDrop(confirmDialog.dealId, confirmDialog.newStageId, confirmDialog.oldStageId);
    setConfirmDialog(null);
  };

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 h-full px-4 md:px-6">
          {stages.map(stage => (
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
                  {/* Column header */}
                  <div className="p-3 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="font-semibold text-sm">{getDealStageLabel(stage, t)}</span>
                      <Badge variant="secondary" className="text-xs h-5 px-1.5">
                        {(dealsByStage[stage.id] || []).length}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium tabular-nums">
                      {formatCurrency(stageValues[stage.id] || 0)}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
                    {(dealsByStage[stage.id] || []).map((deal, index) => {
                      const daysOpen = differenceInDays(new Date(), parseISO(deal.created_at));
                      const isStalled = daysOpen > 30;

                      return (
                        <Draggable key={deal.id} draggableId={deal.id} index={index}>
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={cn(
                                "p-3 cursor-grab active:cursor-grabbing transition-shadow",
                                snapshot.isDragging && "shadow-lg ring-2 ring-primary/20",
                                isStalled && "border-l-4 border-l-amber-500",
                                deal.value === 0 && "border-l-4 border-l-destructive"
                              )}
                              onClick={() => onViewDetails(deal)}
                            >
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-medium text-sm leading-tight line-clamp-2">{deal.title}</span>
                                </div>
                                
                                {deal.entity_name && (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <User className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{deal.entity_name}</span>
                                  </div>
                                )}

                                <div className="flex items-center justify-between">
                                  <span className={cn(
                                    "font-semibold text-sm tabular-nums",
                                    deal.value === 0 && "text-destructive"
                                  )}>
                                    {formatCurrency(deal.value)}
                                    {deal.value === 0 && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                                  </span>
                                  <span className={cn(
                                    "text-xs tabular-nums",
                                    isStalled ? "text-amber-600 font-semibold" : "text-muted-foreground"
                                  )}>
                                    {daysOpen}d
                                  </span>
                                </div>

                                {deal.assigned_to_name && (
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {deal.assigned_to_name}
                                  </div>
                                )}

                                {/* Quick actions */}
                                <div className="flex gap-1 pt-1 border-t border-border/50">
                                  {deal.entity_phone && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" asChild onClick={e => e.stopPropagation()}>
                                      <a href={`tel:${deal.entity_phone}`}><Phone className="h-3 w-3 text-emerald-600" /></a>
                                    </Button>
                                  )}
                                  {deal.entity_email && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" asChild onClick={e => e.stopPropagation()}>
                                      <a href={`mailto:${deal.entity_email}`}><Mail className="h-3 w-3 text-primary" /></a>
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={e => { e.stopPropagation(); onViewDetails(deal); }}>
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

      {/* Workflow confirmation dialog */}
      <AlertDialog open={!!confirmDialog?.open} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para {confirmDialog?.newStageName}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Está a mover <strong>"{confirmDialog?.dealTitle}"</strong> para a fase <strong>{confirmDialog?.newStageName}</strong>.</p>
              <p className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {confirmDialog?.message}
              </p>
              <p>Deseja continuar?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
