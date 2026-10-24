import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneText, type InventoryTone } from "./tones";

interface KpiTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: InventoryTone;
  /** Com onClick o cartão é um botão (ex.: aplica um filtro). */
  onClick?: () => void;
  /** Texto extra só para leitores de ecrã (ex.: "Filtrar por baixo"). */
  actionLabel?: string;
  active?: boolean;
}

/** Cartão de métrica do Inventário (função kpi() do mockup). */
export function KpiTile({ label, value, hint, tone, onClick, actionLabel, active }: KpiTileProps) {
  const body = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-bold tabular-nums leading-tight", tone ? toneText[tone] : "text-foreground")}>
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {actionLabel ? <span className="sr-only">. {actionLabel}</span> : null}
    </>
  );
  const base = "flex flex-col gap-1 rounded-lg border bg-card p-4 text-left shadow-sm";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          base,
          "transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          active && "ring-2 ring-primary",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

/** Grelha dos cartões (classe .kpis do mockup). */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>;
}
