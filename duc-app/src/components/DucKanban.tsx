import { useState } from "react";
import type { DucRecord } from "../lib/types";
import { STATUS_LABELS, VARIANT_LABELS } from "../lib/ducSchema";
import { Badge, Card, cx } from "./ui";

/**
 * Quadro Kanban presentacional de DUCs.
 * Uma coluna por etapa; cada cartão fica na coluna do seu `current_stage`.
 * Arrastar (HTML5 nativo) e largar noutra coluna dispara `onDropCard`.
 * A persistência/cascata é responsabilidade do pai.
 */
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
  // Etapa atualmente sob o cursor durante um arrasto (para realce visual).
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);

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
              "flex w-72 shrink-0 flex-col rounded-xl bg-slate-50/60 p-2 transition-colors",
              isOver && "bg-brand-50 ring-2 ring-brand/40"
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1 pt-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-400">{stage.no}</span>
                <h3 className="truncate text-sm font-semibold text-slate-700">{shortTitle}</h3>
              </div>
              <Badge>{cards.length}</Badge>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {cards.map((d) => {
                const clientName = clientNames.get(d.client_id ?? "") ?? d.title ?? "—";
                return (
                  <Card
                    key={d.id}
                    onClick={() => onOpen(d.id)}
                    className="cursor-pointer p-3 transition-shadow hover:shadow-elevated"
                  >
                    <div
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
                    >
                      <p className="truncate text-sm font-medium text-slate-800">{clientName}</p>
                      {d.duc_number && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">{d.duc_number}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                          {STATUS_LABELS[d.status] ?? d.status}
                        </Badge>
                        <Badge>{VARIANT_LABELS[d.variant]}</Badge>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
