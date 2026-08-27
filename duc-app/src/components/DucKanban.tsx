import { useRef, useState } from "react";
import type { DucRecord, DucStatus } from "../lib/types";
import { STATUS_LABELS, VARIANT_LABELS } from "../lib/ducSchema";
import { Badge, Card, cx } from "./ui";

/**
 * Quadro Kanban presentacional de DUCs.
 * Uma coluna por etapa; cada cartão fica na coluna do seu `current_stage`.
 * Arrastar (HTML5 nativo) e largar noutra coluna dispara `onDropCard`.
 * A persistência/cascata é responsabilidade do pai.
 */

// Cores do badge de estado por status (coerentes com o resto da app).
const STATUS_BADGE: Record<DucStatus, string> = {
  draft: "bg-slate-50 text-slate-600 ring-slate-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  delivered: "bg-sky-50 text-sky-700 ring-sky-200",
  closed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

// Conta etapas concluídas no tracking de um DUC.
function progressOf(d: DucRecord): { done: number; total: number } {
  const total = d.tracking.length;
  const done = d.tracking.filter((t) => t.state === "done").length;
  return { done, total };
}

export function DucKanban({
  ducs,
  clientNames,
  stages,
  onDropCard,
  onOpen,
}: {
  ducs: DucRecord[];
  clientNames: Map<string, string>;
  stages: Array<{ no: number; title: string }>;
  onDropCard: (ducId: string, targetStageNo: number) => void;
  onOpen: (id: string) => void;
}) {
  // Cartão a ser arrastado (para o levantar visualmente).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Etapa atualmente sob o cursor durante um arrasto (para realce visual).
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);
  // Suprime o click de abrir logo a seguir a um arrasto (evita abrir sem querer).
  const didDrag = useRef(false);

  // Nº da primeira etapa: fallback para DUCs com current_stage fora do fluxo.
  const firstStageNo = stages.length > 0 ? stages[0].no : 0;

  // Distribui os DUCs por etapa (chave = stage.no).
  const byStage = new Map<number, DucRecord[]>();
  for (const s of stages) byStage.set(s.no, []);
  for (const d of ducs) {
    const key = byStage.has(d.current_stage) ? d.current_stage : firstStageNo;
    const bucket = byStage.get(key);
    if (bucket) bucket.push(d);
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetStageNo: number) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    // Não faz nada se o DUC já estiver nesta etapa.
    const duc = ducs.find((d) => d.id === id);
    if (duc && duc.current_stage === targetStageNo) return;
    onDropCard(id, targetStageNo);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const cards = byStage.get(stage.no) ?? [];
        const isOver = dragOverStage === stage.no;
        // Título curto: parte antes do separador " — ".
        const shortTitle = stage.title.split(" — ")[0];
        return (
          <div
            key={stage.no}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverStage !== stage.no) setDragOverStage(stage.no);
            }}
            onDragLeave={() => setDragOverStage((s) => (s === stage.no ? null : s))}
            onDrop={(e) => handleDrop(e, stage.no)}
            className={cx(
              "flex w-72 shrink-0 flex-col rounded-xl bg-slate-50/60 p-2 transition-all",
              isOver && "bg-brand-50 ring-2 ring-brand/50"
            )}
          >
            {/* Cabeçalho: badge do nº, título curto e contador de cartões. */}
            <div className="mb-2 flex items-center justify-between gap-2 px-1 pt-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-200/80 px-1 text-[11px] font-bold text-slate-600">
                  {stage.no}
                </span>
                <h3 className="truncate text-sm font-semibold text-slate-700">{shortTitle}</h3>
              </div>
              <Badge>{cards.length}</Badge>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {cards.length === 0 ? (
                // Placeholder subtil + zona de largar em coluna vazia.
                <div
                  className={cx(
                    "flex flex-1 items-center justify-center rounded-lg border border-dashed py-8 text-xs transition-colors",
                    isOver
                      ? "border-brand/50 text-brand-700"
                      : "border-slate-200 text-slate-400"
                  )}
                >
                  {isOver ? "Largar aqui" : "Sem DUCs"}
                </div>
              ) : (
                cards.map((d) => {
                  const clientName = clientNames.get(d.client_id ?? "") ?? d.title ?? "—";
                  const isDragging = draggingId === d.id;
                  const { done, total } = progressOf(d);
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <Card
                      key={d.id}
                      onClick={() => {
                        // Ignora o click sintético que segue um arrasto.
                        if (didDrag.current) {
                          didDrag.current = false;
                          return;
                        }
                        onOpen(d.id);
                      }}
                      className={cx(
                        "p-3 transition-all",
                        isDragging
                          ? "scale-[0.98] opacity-50 shadow-elevated"
                          : "hover:shadow-elevated"
                      )}
                    >
                      {/* Wrapper arrastável: Card em `ui` não encaminha props de DnD. */}
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", d.id);
                          e.dataTransfer.effectAllowed = "move";
                          didDrag.current = true;
                          setDraggingId(d.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStage(null);
                        }}
                        className={isDragging ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"}
                      >
                        <p className="truncate text-sm font-medium text-slate-800">{clientName}</p>
                        {d.duc_number && (
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{d.duc_number}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge className={STATUS_BADGE[d.status]}>
                            {STATUS_LABELS[d.status] ?? d.status}
                          </Badge>
                          <Badge>{VARIANT_LABELS[d.variant]}</Badge>
                        </div>
                        {/* Mini-barra de progresso do tracking (etapas done/total). */}
                        {total > 0 && (
                          <div className="mt-2.5">
                            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                              <span>Progresso</span>
                              <span className="font-medium tabular-nums">
                                {done}/{total}
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={cx(
                                  "h-full rounded-full transition-all",
                                  pct === 100 ? "bg-emerald-500" : "bg-brand"
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
