// Pílula de contador do Inventário (.pill do mockup), partilhada pelo menu
// lateral (AppSidebar) e pelos separadores da área (InventoryAreaTabs).
//
// API:
//   <CounterPill value={n} counterKey="purchaseOrders" />            // menu: cor por urgência
//   <CounterPill value={n} counterKey="stocks" variant="subtle" />   // separador: .tab .pill (neutra)
// value null/0 = não desenha nada; > 99 mostra "99+". O texto da dica
// (title + aria-label) vem de COUNTER_PILL_HINT, como o pilulas() do mockup.
import { cn } from "@/lib/utils";
import type { InventoryCounterKey } from "@/hooks/useInventoryToday";

// Cor da pílula por urgência, como o renderSidebar() do mockup: Hoje e
// Existências (abaixo do ponto de encomenda) = bad (accent); POs por aprovar,
// fornecedores e contagens paradas = warn; ECs prontas e guias abertas = neutra
// (violeta). warn usa texto escuro: branco sobre o âmbar fica abaixo de AA.
export const COUNTER_PILL_TONE: Partial<Record<InventoryCounterKey, "bad" | "warn">> = {
  today: "bad",
  stocks: "bad",
  purchaseOrders: "warn",
  suppliers: "warn",
  stockCounts: "warn",
};

/** O que o número conta (a "dica" de cada pílula no mockup). */
export const COUNTER_PILL_HINT: Record<InventoryCounterKey, string> = {
  today: "Itens na fila de trabalho",
  purchaseOrders: "Por aprovar",
  suppliers: "Preços por aprovar e fornecedores à espera da ficha",
  stocks: "Abaixo do ponto de encomenda",
  clientOrders: "Prontas a expedir",
  receiving: "Guias abertas",
  stockCounts: "Contagem parada",
};

const TONE_CLASS = {
  bad: "bg-accent text-accent-foreground",
  warn: "bg-warning text-amber-950",
  default: "bg-primary text-primary-foreground",
} as const;

export type CounterPillVariant = "toned" | "subtle";

interface CounterPillProps {
  value: number | null | undefined;
  counterKey?: InventoryCounterKey;
  /** toned (menu, cor por urgência) · subtle (separadores: fundo muted, como .tab .pill). */
  variant?: CounterPillVariant;
  className?: string;
}

export function CounterPill({ value, counterKey, variant = "toned", className }: CounterPillProps) {
  if (!value || value <= 0) return null;
  const tone = (counterKey && COUNTER_PILL_TONE[counterKey]) || "default";
  const hint = counterKey ? COUNTER_PILL_HINT[counterKey] : undefined;
  return (
    <span
      className={cn(
        "ml-auto inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-semibold leading-none tabular-nums",
        variant === "subtle" ? "bg-muted text-foreground" : TONE_CLASS[tone],
        className,
      )}
      title={hint}
      aria-label={hint ? `${value}: ${hint}` : `${value} pendente${value === 1 ? "" : "s"}`}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}
