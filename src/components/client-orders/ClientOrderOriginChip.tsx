// Distintivo de origem da Encomenda Cliente na lista (ecOriginChip do mockup):
// "Contrato CT-…", "Venda direta VD-…" (destacado) ou "Manual". O texto vem já
// resolvido pela página (mesma regra de renderOrigin: origin_number ou, para
// vendas diretas, o número lido de direct_sales).
import { cn } from "@/lib/utils";

export type ClientOrderOriginKind = "contract" | "direct_sale" | "manual";

export function ClientOrderOriginChip({ kind, label }: { kind: ClientOrderOriginKind; label: string }) {
  return (
    <span
      title={label}
      className={cn(
        "inline-flex max-w-[260px] items-center gap-1 truncate whitespace-nowrap rounded-[7px] border px-[7px] py-px text-xs font-[550]",
        kind === "direct_sale"
          ? "border-transparent bg-accent/10 text-pink-700 dark:text-pink-300"
          : "border-border bg-muted text-foreground",
      )}
    >
      {label}
    </span>
  );
}
