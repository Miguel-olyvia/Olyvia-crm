// Separadores da área do Inventário (.tabs/.tab do mockup, função head()).
//
// API: <InventoryAreaTabs area="purchases" | "warehouse" />
// Entradas e permissões vêm do menu (menuConfig, secção inventory) para menu e
// separadores nunca divergirem; cada separador mostra o mesmo contador do menu
// (counterKey → useInventoryCounters), em pílula neutra como .tab .pill.
// Com menos de dois separadores visíveis não desenha nada. São ligações de rota
// (nav + aria-current), não um tablist.
import { Link, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { menuSections, type MenuItem } from "@/components/sidebar/menuConfig";
import { cn } from "@/lib/utils";
import { CounterPill } from "./CounterPill";
import { useInventoryCounters } from "./useInventoryCounters";

export type InventoryArea = "purchases" | "warehouse";

const AREA_SUBSECTION: Record<InventoryArea, string> = {
  purchases: "inventory-purchases",
  warehouse: "inventory-warehouse",
};

/** Nome da área na migalha ("Inventário › Compras"). */
export const INVENTORY_AREA_LABEL: Record<InventoryArea, string> = {
  purchases: "Compras",
  warehouse: "Armazém",
};

// Distintivo "Novo" do mockup (NAV: Movimentos).
const NEW_TABS = new Set(["/stock-movements"]);

/** Itens da área visíveis com as permissões reais (vazio enquanto carregam). */
export function useInventoryAreaItems(area: InventoryArea | undefined): MenuItem[] {
  const { hasPermission, hasAnyPermission, loading } = usePermissions();
  if (!area || loading) return [];
  const canView = (item: MenuItem) => {
    if (item.permissions && item.permissions.length > 0) {
      return item.requireAll ? item.permissions.every((p) => hasPermission(p)) : hasAnyPermission(item.permissions);
    }
    return item.permission ? hasPermission(item.permission) : true;
  };
  return (
    menuSections
      .find((s) => s.id === "inventory")
      ?.subSections?.find((s) => s.key === AREA_SUBSECTION[area])
      ?.items.filter(canView) ?? []
  );
}

export function InventoryAreaTabs({ area }: { area: InventoryArea }) {
  const { t } = useTranslation();
  const location = useLocation();
  const tabs = useInventoryAreaItems(area);
  const counterFor = useInventoryCounters(tabs.some((i) => i.counterKey));

  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label={`Inventário › ${INVENTORY_AREA_LABEL[area]}`}
      className="flex gap-0.5 overflow-x-auto border-b [scrollbar-width:thin]"
    >
      {tabs.map((item) => {
        const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-10 items-center whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-[550] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(item.labelKey)}
            {NEW_TABS.has(item.to) ? (
              <span className="ml-1 rounded-md bg-accent/10 px-1.5 py-px align-middle text-[10.5px] font-bold text-accent">
                Novo
              </span>
            ) : null}
            <CounterPill value={counterFor(item.counterKey)} counterKey={item.counterKey} variant="subtle" className="ml-1" />
          </Link>
        );
      })}
    </nav>
  );
}
