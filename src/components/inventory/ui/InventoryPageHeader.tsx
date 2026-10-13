// Cabeçalho dos ecrãs do Inventário (função head() / .ph do mockup).
//
// API: <InventoryPageHeader title description? area? actions? />
//   area: "purchases" | "warehouse" → separadores da área (InventoryAreaTabs) e
//         migalha "Inventário › Compras/Armazém"; sem área = só "Inventário" e
//         sem separadores (ex.: Hoje).
//   actions: botões à direita (.ph-actions).
import type { ReactNode } from "react";
import { InventoryAreaTabs, INVENTORY_AREA_LABEL, type InventoryArea } from "./InventoryAreaTabs";

export type { InventoryArea } from "./InventoryAreaTabs";

interface InventoryPageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Sem área = "Inventário" sozinho na migalha e sem separadores (ex.: Hoje). */
  area?: InventoryArea;
  actions?: ReactNode;
}

export function InventoryPageHeader({ title, description, area, actions }: InventoryPageHeaderProps) {
  return (
    <div>
      {area ? <InventoryAreaTabs area={area} /> : null}
      {/* .ph: alinhado em baixo, margem 14px/16px; .crumbs 12.5px; h1 22px. */}
      <div className="mb-4 mt-3.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-[12.5px] text-muted-foreground">
            Inventário{area ? ` › ${INVENTORY_AREA_LABEL[area]}` : ""}
          </p>
          <h1 className="text-[22px] font-bold leading-tight">{title}</h1>
          {description ? <p className="mt-1 max-w-[760px] text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
