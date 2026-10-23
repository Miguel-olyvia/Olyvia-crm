// Os 4 KPI de "Saídas para clientes" (scrEC do mockup). Clicar aplica o filtro.
//   Prontas a expedir   → nº de encomendas com lines_ready > 0
//                         (rpc_client_order_list_readiness; mesma regra de
//                         rpc_inventory_today.ready_to_ship) → ?ready=1.
//   Parcialmente pendentes / A aguardar PO / Sem fornecedor → contagem por
//                         overall_status da RPC da lista → ?status=.
// null = desconhecido (a carregar ou sem dados) → "—".
import { KpiGrid, KpiTile } from "@/components/inventory/ui";
import type { ClientOrderOverallStatus } from "./clientOrderList";

interface ClientOrderKpisProps {
  readyToShip: number | null;
  counts: Record<ClientOrderOverallStatus, number> | null;
  truncated?: boolean;
  activeStatus: string;
  readyActive: boolean;
  onSelectStatus: (status: ClientOrderOverallStatus) => void;
  onSelectReady: () => void;
}

const fmt = (v: number | null | undefined, truncated?: boolean): string =>
  v === null || v === undefined ? "—" : `${v}${truncated ? "+" : ""}`;

export function ClientOrderKpis({
  readyToShip,
  counts,
  truncated,
  activeStatus,
  readyActive,
  onSelectStatus,
  onSelectReady,
}: ClientOrderKpisProps) {
  return (
    <KpiGrid>
      <KpiTile
        tone="ok"
        label="Prontas a expedir"
        value={fmt(readyToShip)}
        hint="com linhas prontas a sair"
        onClick={onSelectReady}
        actionLabel="Filtrar por prontas a expedir"
        active={readyActive}
      />
      <KpiTile
        tone="warn"
        label="Parcialmente pendentes"
        value={fmt(counts?.parcialmente_pendente, truncated)}
        onClick={() => onSelectStatus("parcialmente_pendente")}
        actionLabel="Filtrar por parcialmente pendente"
        active={!readyActive && activeStatus === "parcialmente_pendente"}
      />
      <KpiTile
        tone="info"
        label="A aguardar PO"
        value={fmt(counts?.a_aguardar_encomenda, truncated)}
        hint="à espera do fornecedor"
        onClick={() => onSelectStatus("a_aguardar_encomenda")}
        actionLabel="Filtrar por a aguardar encomenda"
        active={!readyActive && activeStatus === "a_aguardar_encomenda"}
      />
      <KpiTile
        tone="bad"
        label="Sem fornecedor"
        value={fmt(counts?.sem_fornecedor, truncated)}
        hint="em falta, sem pedido ao fornecedor"
        onClick={() => onSelectStatus("sem_fornecedor")}
        actionLabel="Filtrar por sem fornecedor"
        active={!readyActive && activeStatus === "sem_fornecedor"}
      />
    </KpiGrid>
  );
}
