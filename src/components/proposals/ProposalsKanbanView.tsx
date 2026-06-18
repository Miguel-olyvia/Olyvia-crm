import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Eye, AlertTriangle, User } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { differenceInDays } from "date-fns";
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

interface WorkflowStage {
  id: string;
  name: string;
  label: string;
  color: string;
  stage_order: number;
  is_won?: boolean;
  is_lost?: boolean;
}

interface Proposal {
  id: string;
  title: string;
  value: number;
  status: string;
  stage_id: string | null;
  created_at: string;
  valid_until: string | null;
  deal_id: string | null;
  deals: { id: string; title: string } | null;
  entity_id?: string | null;
  entity_name?: string | null;
  entity_phone?: string | null;
  entity_email?: string | null;
  assigned_to_name?: string | null;
}

interface ProposalsKanbanViewProps {
  proposals: Proposal[];
  workflowStages: WorkflowStage[];
  getProposalStage: (p: Proposal) => WorkflowStage | null;
  onMoveStage: (proposalId: string, newStageId: string) => void;
  onViewProposal: (p: Proposal) => void;
}

export function ProposalsKanbanView({
  proposals,
  workflowStages,
  getProposalStage,
  onMoveStage,
  onViewProposal,
}: ProposalsKanbanViewProps) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    proposalId: string;
    proposalTitle: string;
    stageId: string;
    oldStageId: string;
    stageName: string;
  } | null>(null);

  const columns = useMemo(() => {
    const ordered = [...workflowStages].sort((a, b) => a.stage_order - b.stage_order);
    return ordered.map((stage) => {
      const stageProposals = proposals.filter((p) => getProposalStage(p)?.id === stage.id);
      const totalValue = stageProposals.reduce((s, p) => s + Number(p.value), 0);
      return { stage, proposals: stageProposals, totalValue };
    });
  }, [proposals, workflowStages, getProposalStage]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;

    const targetStage = workflowStages.find((s) => s.id === destination.droppableId);
    if (!targetStage) return;

    if (targetStage.is_won) {
      const proposal = proposals.find((p) => p.id === draggableId);
      setConfirmDialog({
        open: true,
        proposalId: draggableId,
        proposalTitle: proposal?.title || "",
        stageId: destination.droppableId,
        oldStageId: source.droppableId,
        stageName: targetStage.label,
      });
    } else {
      onMoveStage(draggableId, destination.droppableId);
    }
  };

  const handleConfirm = () => {
    if (!confirmDialog) return;
    onMoveStage(confirmDialog.proposalId, confirmDialog.stageId);
    setConfirmDialog(null);
  };

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 h-full px-4 md:px-6 mt-3">
          {columns.map(({ stage, proposals: colProposals, totalValue }) => (
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
                      <span className="font-semibold text-sm">{stage.label}</span>
                      <Badge variant="secondary" className="text-xs h-5 px-1.5">
                        {colProposals.length}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium tabular-nums">
                      {formatCurrency(totalValue)}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
                    {colProposals.map((proposal, index) => {
                      const daysOpen = differenceInDays(new Date(), new Date(proposal.created_at));
                      const isStalled = daysOpen > 30;

                      return (
                        <Draggable key={proposal.id} draggableId={proposal.id} index={index}>
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={cn(
                                "p-3 cursor-grab active:cursor-grabbing transition-shadow",
                                snapshot.isDragging && "shadow-lg ring-2 ring-primary/20",
                                isStalled && "border-l-4 border-l-amber-500",
                                proposal.value === 0 && "border-l-4 border-l-destructive"
                              )}
                              onClick={() => onViewProposal(proposal)}
                            >
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-medium text-sm leading-tight line-clamp-2">{proposal.title}</span>
                                </div>

                                {proposal.entity_name && (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <User className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{proposal.entity_name}</span>
                                  </div>
                                )}

                                <div className="flex items-center justify-between">
                                  <span className={cn(
                                    "font-semibold text-sm tabular-nums",
                                    proposal.value === 0 && "text-destructive"
                                  )}>
                                    {formatCurrency(proposal.value)}
                                    {proposal.value === 0 && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                                  </span>
                                  <span className={cn(
                                    "text-xs tabular-nums",
                                    isStalled ? "text-amber-600 font-semibold" : "text-muted-foreground"
                                  )}>
                                    {daysOpen}d
                                  </span>
                                </div>

                                {proposal.assigned_to_name && (
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {proposal.assigned_to_name}
                                  </div>
                                )}

                                {/* Quick actions */}
                                <div className="flex gap-1 pt-1 border-t border-border/50">
                                  {proposal.entity_phone && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" asChild onClick={e => e.stopPropagation()}>
                                      <a href={`tel:${proposal.entity_phone}`}><Phone className="h-3 w-3 text-emerald-600" /></a>
                                    </Button>
                                  )}
                                  {proposal.entity_email && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" asChild onClick={e => e.stopPropagation()}>
                                      <a href={`mailto:${proposal.entity_email}`}><Mail className="h-3 w-3 text-primary" /></a>
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={e => { e.stopPropagation(); onViewProposal(proposal); }}>
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
                    {colProposals.length === 0 && (
                      <div className="text-center text-xs text-muted-foreground py-8 px-2">
                        Arrastar propostas para aqui
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <AlertDialog open={!!confirmDialog?.open} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aceitar Proposta?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Está a mover <strong>"{confirmDialog?.proposalTitle}"</strong> para <strong>{confirmDialog?.stageName}</strong>.</p>
              <p className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Aceitar esta proposta cria um contrato automaticamente pelo workflow. Deseja continuar?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Aceitar e criar contrato</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
