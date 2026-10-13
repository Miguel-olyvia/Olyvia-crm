import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneText, type InventoryTone } from "./tones";

/**
 * Contador do fluxo (cnt-btn do mockup): rótulo à esquerda, número à direita.
 * O tom só se aplica quando o valor é diferente de zero.
 */
export function FlowCounterButton({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: ReactNode;
  tone?: InventoryTone;
  onClick?: () => void;
}) {
  const highlighted = tone && typeof value === "number" && value > 0;
  const content = (
    <>
      <span className="truncate text-sm">{label}</span>
      <b className={cn("text-[15px] font-bold tabular-nums", highlighted ? toneText[tone] : "text-foreground")}>{value}</b>
    </>
  );
  // Fundo muted sem contorno, como o .cnt-btn do mockup.
  const base = "flex min-h-8 w-full items-center justify-between gap-3 rounded-md bg-muted px-3 py-1.5 text-left";
  if (!onClick) return <div className={base}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {content}
    </button>
  );
}
