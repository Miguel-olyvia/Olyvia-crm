// Distintivo do estado do contrato de fornecedor (lista de Fornecedores e
// cabeçalho da ficha). Só apresentação — os dados vêm de
// useSupplierContractOrgStatuses.
import { InventoryStatusBadge } from "@/components/inventory/ui";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/supplierContracts/tipos";
import type { SupplierContractListState } from "./useSupplierContracts";

/** undefined = ainda a carregar / sem permissão ("—"); null = sem contrato. */
export function SupplierContractBadge({
  state,
  compact = false,
}: {
  state: SupplierContractListState | null | undefined;
  compact?: boolean;
}) {
  if (state === undefined) return <span className="text-muted-foreground">—</span>;
  if (state === null) return <InventoryStatusBadge tone="neutral">Sem contrato</InventoryStatusBadge>;

  const expiring = state.status === "signed" && state.daysLeft !== null;
  const label = expiring
    ? state.daysLeft! < 0
      ? "Fora de prazo"
      : state.daysLeft === 0
        ? "Expira hoje"
        : `Expira em ${state.daysLeft} ${state.daysLeft === 1 ? "dia" : "dias"}`
    : STATUS_LABEL[state.status];
  const tone = expiring ? (state.daysLeft! <= 7 ? "bad" : "warn") : STATUS_TONE[state.status];

  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight">
      <InventoryStatusBadge tone={tone}>{label}</InventoryStatusBadge>
      {!compact && (
        <small className="font-mono text-[11px] text-muted-foreground">
          {state.contractNumber} · v{state.version}
        </small>
      )}
      {!compact && state.openVersion && (
        <small className="text-[11px] text-muted-foreground">
          v{state.openVersion.version}: {STATUS_LABEL[state.openVersion.status].toLowerCase()}
        </small>
      )}
    </div>
  );
}
