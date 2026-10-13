import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { menuSections, type MenuItem } from "@/components/sidebar/menuConfig";
import { cn } from "@/lib/utils";

export type InventoryArea = "purchases" | "warehouse";

// Os separadores da área vêm do próprio menu (menuConfig, secção inventory),
// para menu e separadores nunca divergirem nas entradas nem nas permissões.
const AREA_SUBSECTION: Record<InventoryArea, string> = {
  purchases: "inventory-purchases",
  warehouse: "inventory-warehouse",
};
const AREA_LABEL: Record<InventoryArea, string> = {
  purchases: "Compras",
  warehouse: "Armazém",
};

interface InventoryPageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Sem área = "Inventário" sozinho na migalha e sem separadores (ex.: Hoje). */
  area?: InventoryArea;
  actions?: ReactNode;
}

/**
 * Cabeçalho dos ecrãs do Inventário (função head() do mockup): separadores da
 * área filtrados por permissão, migalha "Inventário › Área", título, texto e
 * ações à direita.
 */
export function InventoryPageHeader({ title, description, area, actions }: InventoryPageHeaderProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { hasPermission, hasAnyPermission, loading } = usePermissions();

  const canView = (item: MenuItem) => {
    if (loading) return false;
    if (item.permissions && item.permissions.length > 0) {
      return item.requireAll ? item.permissions.every((p) => hasPermission(p)) : hasAnyPermission(item.permissions);
    }
    return item.permission ? hasPermission(item.permission) : true;
  };

  const tabs = area
    ? (menuSections
        .find((s) => s.id === "inventory")
        ?.subSections?.find((s) => s.key === AREA_SUBSECTION[area])
        ?.items.filter(canView) ?? [])
    : [];

  return (
    <div className="space-y-3">
      {tabs.length > 1 ? (
        <nav aria-label={`Inventário › ${AREA_LABEL[area as InventoryArea]}`} className="-mb-px flex gap-1 overflow-x-auto border-b">
          {tabs.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Inventário{area ? ` › ${AREA_LABEL[area]}` : ""}
          </p>
          <h1 className="text-3xl font-bold">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
