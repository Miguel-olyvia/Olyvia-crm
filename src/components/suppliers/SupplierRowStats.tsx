// Células da tabela de Fornecedores (Compras › Fornecedores), como no protótipo
// (FornColunas/useColunasForn): distintivo do portal, POs abertas, SLA % e
// preços por aprovar. Só apresentação — os dados vêm de useSupplierListStats.
import { Link } from "react-router-dom";
import { InventoryStatusBadge, purchaseOrdersLink, toneText, type InventoryTone } from "@/components/inventory/ui";
import { cn } from "@/lib/utils";
import type { SupplierPortalState } from "./useSupplierListStats";

const PORTAL_LABEL: Record<SupplierPortalState, string> = {
  awaiting: "Convidado · à espera da ficha",
  active: "Ativo",
  suspended: "Suspenso",
  revoked: "Revogado",
  none: "Sem acesso",
};

const PORTAL_TONE: Record<SupplierPortalState, InventoryTone> = {
  awaiting: "info",
  active: "ok",
  suspended: "warn",
  revoked: "bad",
  none: "neutral",
};

export function SupplierPortalBadge({ state }: { state: SupplierPortalState | null }) {
  if (state === null) return <span className="text-muted-foreground">—</span>;
  return <InventoryStatusBadge tone={PORTAL_TONE[state]}>{PORTAL_LABEL[state]}</InventoryStatusBadge>;
}

/** POs abertas: número com ligação às encomendas do fornecedor (0 sem ligação; null = "—"). */
export function SupplierOpenPos({ supplierId, count }: { supplierId: string; count: number | null }) {
  if (count === null) return <span className="text-muted-foreground">—</span>;
  if (count === 0) return <span className="tabular-nums">0</span>;
  return (
    <Link
      to={purchaseOrdersLink({ supplier: supplierId })}
      onClick={(e) => e.stopPropagation()}
      className="font-semibold tabular-nums text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      aria-label={`${count} encomenda(s) em aberto`}
    >
      {count}
    </Link>
  );
}

/** SLA %: verde ≥ 90, âmbar ≥ 75, vermelho abaixo; "prazo N d" por baixo. */
export function SupplierSla({ pct, slaDays }: { pct: number | null | undefined; slaDays: number | null }) {
  const tone: InventoryTone | null = pct == null ? null : pct >= 90 ? "ok" : pct >= 75 ? "warn" : "bad";
  return (
    <div className="leading-tight">
      {pct == null || tone === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className={cn("font-[650] tabular-nums", toneText[tone])}>{Math.round(pct)}%</span>
      )}
      <br />
      <small className="text-xs text-muted-foreground">{slaDays != null ? `prazo ${slaDays} d` : "sem prazo"}</small>
    </div>
  );
}

/** "N por aprovar" (distintivo âmbar clicável) ou "—". */
export function SupplierPricesPending({ count, onOpen }: { count: number | null | undefined; onOpen: () => void }) {
  if (!count) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <InventoryStatusBadge tone="warn" className="cursor-pointer">
        {count} por aprovar
      </InventoryStatusBadge>
    </button>
  );
}
