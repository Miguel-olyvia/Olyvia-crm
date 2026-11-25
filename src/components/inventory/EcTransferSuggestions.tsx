// Transferências sugeridas para as Encomendas de Cliente (EC): o motor reservou stock da EC
// num armazém que não é o mais próximo da morada da EC. Só sugestão — «Transferir» abre o
// diálogo de movimento já preenchido (transferência, origem, destino, produto, quantidade e
// notas) e o utilizador confirma; a transferência é a de sempre (rpc_register_stock_transfer).
// Sem sugestões a secção não aparece. «Transferir» só aparece a quem pode registar
// movimentos (inventory.edit — a mesma permissão que o servidor exige à transferência).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowRight, Info } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import StockMovementDialog from "@/components/inventory/StockMovementDialog";
import { usePermissionGate } from "@/components/inventory/ui/RowActions";
import { clientOrdersLink } from "@/components/inventory/ui/inventoryLinks";
import {
  groupEcTransferSuggestions,
  useEcTransferSuggestions,
  type EcTransferSuggestion,
} from "@/hooks/useEcTransferSuggestions";
import { cn } from "@/lib/utils";

interface WarehouseOption {
  id: string;
  name: string;
}

const formatQty = (value: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 3 }).format(value);
const formatKm = (value: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(value);

const BTN =
  "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-primary bg-primary px-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Linha({
  s,
  canTransfer,
  onTransfer,
}: {
  s: EcTransferSuggestion;
  canTransfer: boolean;
  onTransfer: (s: EcTransferSuggestion) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium [overflow-wrap:anywhere]">
          {s.product_name}
          {s.product_sku ? <span className="font-mono text-[12.5px] text-muted-foreground"> · {s.product_sku}</span> : null}
        </p>
        <p className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
          <b className="tabular-nums text-foreground">{formatQty(s.qty)}</b>
          <span aria-hidden="true">·</span>
          <span>{s.from_warehouse_name}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">para</span>
          <span>{s.to_warehouse_name}</span>
          {s.distance_km !== null ? <span>({formatKm(s.distance_km)} km da obra)</span> : null}
        </p>
      </div>
      {canTransfer ? (
        <button
          type="button"
          className={BTN}
          onClick={() => onTransfer(s)}
          aria-label={`Transferir ${formatQty(s.qty)} de ${s.product_name} de ${s.from_warehouse_name} para ${s.to_warehouse_name}`}
        >
          <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /> Transferir
        </button>
      ) : null}
    </li>
  );
}

export interface EcTransferSuggestionsProps {
  organizationId: string;
  /** Só as sugestões desta EC (aviso na folha da EC); sem ele, todas agrupadas por EC (Hoje). */
  contractId?: string;
  /** Armazéns para o diálogo; os das sugestões juntam-se sempre. */
  warehouses?: readonly WarehouseOption[];
  /** Depois de uma transferência registada (a lista de sugestões já é invalidada aqui). */
  onTransferred?: () => void;
  className?: string;
}

export function EcTransferSuggestions({
  organizationId,
  contractId,
  warehouses,
  onTransferred,
  className,
}: EcTransferSuggestionsProps) {
  const { hasPermission } = usePermissions();
  const gate = usePermissionGate();
  const canTransfer = gate("inventory.edit").allowed;
  const canOpenEc = hasPermission("client_orders.view");
  const { data, invalidate } = useEcTransferSuggestions({ enabled: hasPermission("inventory.view") });

  const rows = useMemo(
    () => (contractId ? data.filter((r) => r.contract_id === contractId) : data),
    [data, contractId],
  );
  const groups = useMemo(() => groupEcTransferSuggestions(rows), [rows]);

  const [selected, setSelected] = useState<EcTransferSuggestion | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const dialogWarehouses = useMemo(() => {
    const byId = new Map<string, WarehouseOption>();
    for (const w of warehouses ?? []) byId.set(w.id, { id: w.id, name: w.name });
    if (selected) {
      if (!byId.has(selected.from_warehouse_id)) byId.set(selected.from_warehouse_id, { id: selected.from_warehouse_id, name: selected.from_warehouse_name });
      if (!byId.has(selected.to_warehouse_id)) byId.set(selected.to_warehouse_id, { id: selected.to_warehouse_id, name: selected.to_warehouse_name });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [warehouses, selected]);

  if (rows.length === 0) return null;

  const openTransfer = (s: EcTransferSuggestion) => {
    setSelected(s);
    setDialogOpen(true);
  };

  const dialog = selected ? (
    <StockMovementDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      organizationId={organizationId}
      warehouses={dialogWarehouses}
      defaultMovementType="transferencia"
      defaultProductId={selected.product_id}
      defaultWarehouseId={selected.from_warehouse_id}
      defaultToWarehouseId={selected.to_warehouse_id}
      defaultQuantity={selected.qty}
      defaultNotes={`Transferência sugerida para ${selected.order_number}`}
      onSuccess={() => {
        void invalidate();
        onTransferred?.();
      }}
    />
  ) : null;

  // Folha da EC: um aviso com as linhas desta EC.
  if (contractId) {
    return (
      <>
        <section
          aria-labelledby={`ec-transf-${contractId}`}
          className={cn("rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5", className)}
        >
          <h3 id={`ec-transf-${contractId}`} className="flex items-start gap-1.5 text-sm font-semibold">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Transferências sugeridas
          </h3>
          <p className="ml-[22px] text-[12.5px] text-muted-foreground">
            Há stock reservado para esta encomenda num armazém que não é o mais próximo da obra. A transferência é
            manual: confirma no diálogo.
          </p>
          <ul aria-label="Transferências sugeridas para esta encomenda" className="ml-[22px] divide-y">
            {rows.map((s) => (
              <Linha key={`${s.product_id}-${s.from_warehouse_id}-${s.to_warehouse_id}`} s={s} canTransfer={canTransfer} onTransfer={openTransfer} />
            ))}
          </ul>
        </section>
        {dialog}
      </>
    );
  }

  // Hoje: um cartão por EC.
  return (
    <>
      <section aria-labelledby="inv-ec-transf" className={className}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
          <h2 id="inv-ec-transf" className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Transferências sugeridas
          </h2>
        </div>
        <p className="mb-2 px-0.5 text-[13px] text-muted-foreground">
          Stock reservado para encomendas de cliente num armazém que não é o mais próximo da obra.
        </p>
        <ul aria-label="Transferências sugeridas" className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {groups.map((g) => (
            <li
              key={g.contract_id}
              aria-label={`${g.order_number}${g.client_name ? ` · ${g.client_name}` : ""}`}
              className="flex flex-col rounded-[20px] border border-border bg-card px-4 py-[15px] shadow-sm"
            >
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                {canOpenEc ? (
                  <Link
                    to={clientOrdersLink({ open: g.contract_id })}
                    className="rounded-sm font-mono font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {g.order_number}
                  </Link>
                ) : (
                  <b className="font-mono">{g.order_number}</b>
                )}
                {g.client_name ? <span className="text-muted-foreground">· {g.client_name}</span> : null}
              </p>
              <ul className="divide-y">
                {g.rows.map((s) => (
                  <Linha key={`${s.product_id}-${s.from_warehouse_id}-${s.to_warehouse_id}`} s={s} canTransfer={canTransfer} onTransfer={openTransfer} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      {dialog}
    </>
  );
}

export default EcTransferSuggestions;
