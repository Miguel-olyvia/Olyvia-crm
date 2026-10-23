// Os itens da Frota na Agenda (só de leitura): o selo "Frota" e o diálogo de consulta com "Abrir na Frota".
// A regra (o que é item da Frota e para onde liga) está em src/lib/agenda/fleet.ts.
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { ExternalLink, Lock, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FLEET_READ_ONLY_MESSAGE, fleetItemLink } from "@/lib/agenda/fleet";
import type { ScheduleBoard, ScheduleItem } from "@/types/scheduling";

/** Selo "Frota" num item do calendário (o cadeado diz que é só de leitura). */
export function FleetItemBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 px-1 py-0 text-[10px] font-medium", className)} title="Gerido na Frota (só leitura na Agenda)">
      <Truck className="h-3 w-3 shrink-0" aria-hidden="true" />
      Frota
      <Lock className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden="true" />
      <span className="sr-only">(só leitura)</span>
    </Badge>
  );
}

const STATUS: Record<string, string> = {
  draft: "Rascunho", scheduled: "Agendado", confirmed: "Confirmado", in_progress: "Em curso", completed: "Concluído", cancelled: "Cancelado", rescheduled: "Reagendado",
};

/** A consulta de um item da Frota: sem gravar nem apagar, com a ligação para a viatura/reserva na Frota. */
export function FleetScheduleItemDialog({ item, boards, onOpenChange }: { item: ScheduleItem | null; boards: ScheduleBoard[]; onOpenChange: (open: boolean) => void }) {
  if (!item) return null;
  const board = boards.find((b) => b.id === item.board_id);
  const inicio = new Date(item.start_datetime), fim = new Date(item.end_datetime);
  // dia inteiro: o fim é o início do dia seguinte (exclusivo)
  const ultimo = item.all_day ? new Date(fim.getTime() - 1) : fim;
  const quando = item.all_day
    ? (format(inicio, "dd/MM/yyyy") === format(ultimo, "dd/MM/yyyy") ? format(inicio, "dd/MM/yyyy") : `${format(inicio, "dd/MM/yyyy")} a ${format(ultimo, "dd/MM/yyyy")}`)
    : `${format(inicio, "dd/MM/yyyy HH:mm")} a ${format(fim, "dd/MM/yyyy HH:mm")}`;
  const tipo = item.metadata?.fleet_kind === "reservation" ? "Reserva da viatura" : item.metadata?.fleet_kind === "maintenance" ? "Manutenção da viatura" : "Viatura";
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="fleet-schedule-item">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">{item.title}<FleetItemBadge /></DialogTitle>
          <DialogDescription>{FLEET_READ_ONLY_MESSAGE}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Tipo</dt><dd>{tipo}</dd>
          <dt className="text-muted-foreground">Quando</dt><dd>{quando}</dd>
          <dt className="text-muted-foreground">Estado</dt><dd>{STATUS[item.status] ?? item.status}</dd>
          {board ? <><dt className="text-muted-foreground">Quadro</dt><dd>{board.name}</dd></> : null}
          {item.assignees?.length ? <><dt className="text-muted-foreground">Recursos</dt><dd>{item.assignees.map((a) => a.resource?.name).filter(Boolean).join(", ")}</dd></> : null}
        </dl>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button asChild className="gap-1.5">
            <Link to={fleetItemLink(item)}><ExternalLink className="h-4 w-4" aria-hidden="true" />Abrir na Frota</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
