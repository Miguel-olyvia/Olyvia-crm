import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneBadge, type InventoryTone } from "./tones";

/** Distintivo de estado com tom (função B() do mockup), sobre os tokens do tema. */
export function InventoryStatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: InventoryTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        toneBadge[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
