import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { GripVertical } from "lucide-react";
import { normalizeColumnOrder, type QuoteItemsColumnKey } from "./DataTableConfigForm";

const COLUMN_LABELS: Record<QuoteItemsColumnKey, string> = {
  description: "Descrição",
  quantity: "Qtd",
  unit: "Un.",
  price: "Preço Unit.",
  total: "Total",
};

interface Props {
  order: QuoteItemsColumnKey[] | undefined;
  isShown: (k: QuoteItemsColumnKey) => boolean;
  onReorder: (next: QuoteItemsColumnKey[]) => void;
  onToggle: (k: QuoteItemsColumnKey, v: boolean) => void;
}

/**
 * Reusable column order + visibility list with drag-and-drop (native HTML5)
 * and ↑/↓ arrows for accessibility. "description" is always shown and cannot
 * be hidden, but can be reordered.
 */
export function ColumnOrderList({ order, isShown, onReorder, onToggle }: Props) {
  const normalized = normalizeColumnOrder(order);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const reorderTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= normalized.length || to >= normalized.length) return;
    const next = [...normalized];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  const move = (idx: number, dir: -1 | 1) => reorderTo(idx, idx + dir);

  return (
    <div className="rounded border divide-y bg-background">
      {normalized.map((k, idx) => {
        const isDragging = dragIdx === idx;
        const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
        return (
          <div
            key={k}
            draggable
            onDragStart={(e) => {
              setDragIdx(idx);
              e.dataTransfer.effectAllowed = "move";
              // Required for Firefox
              try { e.dataTransfer.setData("text/plain", String(idx)); } catch { /* noop */ }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overIdx !== idx) setOverIdx(idx);
            }}
            onDragLeave={() => {
              if (overIdx === idx) setOverIdx(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx !== null) reorderTo(dragIdx, idx);
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            className={`flex items-center gap-2 p-1.5 text-xs select-none transition-colors ${
              isDragging ? "opacity-50" : ""
            } ${isOver ? "bg-primary/10 border-t-2 border-t-primary" : ""}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />

            <span className="flex-1">
              {COLUMN_LABELS[k]}
              {k === "description" && <span className="text-muted-foreground"> (obrigatória)</span>}
            </span>
            <Switch
              checked={isShown(k)}
              disabled={k === "description"}
              onCheckedChange={(v) => onToggle(k, v)}
            />
          </div>
        );
      })}
    </div>
  );
}
