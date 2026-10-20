// Os selos de uma encomenda no Portal do Fornecedor simulado (como SpOrderBadges do portal real; "Expedida" é só do protótipo).
import { cn } from "@/lib/utils";
import type { Po } from "../inventario/tipos";
import { CLASSE_TOM, selosPortal } from "./dadosPortal";

export function SelosPortal({ p, className }: { p: Po; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {selosPortal(p).map((x) => (
        <span key={x.label} className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium", CLASSE_TOM[x.tom])}>{x.label}</span>
      ))}
    </div>
  );
}
