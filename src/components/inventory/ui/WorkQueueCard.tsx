import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneBorder, toneText, type InventoryTone } from "./tones";

interface WorkQueueCardProps {
  value: number;
  title: string;
  description: string;
  tone: InventoryTone;
  onClick: () => void;
}

/** Cartão da "Fila de trabalho" (qcard do mockup): número, título, texto e destino. */
export function WorkQueueCard({ value, title, description, tone, onClick }: WorkQueueCardProps) {
  const zero = value === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border border-l-4 bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        zero ? "border-l-border opacity-70" : toneBorder[tone],
      )}
    >
      <span
        className={cn(
          "min-w-[2.5rem] text-2xl font-semibold tabular-nums leading-none",
          zero ? "text-muted-foreground" : toneText[tone],
        )}
      >
        {value}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-medium leading-snug">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
          {zero ? "Nada pendente" : "Abrir lista"}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
