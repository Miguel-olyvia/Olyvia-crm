// Pílulas de estado das Encomendas a fornecedor (chips do PoFiltros do protótipo)
// e os distintivos de estado / portal das linhas (SeloEstadoPo / SeloPortal).
// Valores = PO_STATUS_FILTERS de inventoryLinks (o mesmo contrato do ?status=).
import {
  FilterPills,
  InventoryStatusBadge,
  type FilterPillOption,
  type InventoryTone,
  type PoStatusFilter,
} from "@/components/inventory/ui";
import { Truck } from "lucide-react";
import { formatPoShortDate, type PoPublicationRow } from "./poSupplierPortalApi";
import { poShipmentLabel, type PoShipment } from "./poPortalShipments";

export const PO_STATUS_PILL_LABELS: Record<PoStatusFilter, string> = {
  all: "Todas",
  pending: "Pendente",
  ordered: "Encomendado",
  partially_received: "Parcialmente recebida",
  received: "Recebida",
  cancelled: "Cancelada",
  late: "Atrasadas",
  portal: "No portal",
};

const PILL_ORDER: PoStatusFilter[] = [
  "all",
  "pending",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
  "late",
  "portal",
];

const PILL_HINT: Partial<Record<PoStatusFilter, string>> = {
  late: "Em aberto com a entrega prevista ultrapassada",
  portal: "Publicadas no portal do fornecedor",
};

interface PoStatusPillsProps {
  value: PoStatusFilter;
  onChange: (value: PoStatusFilter) => void;
  counts: Record<PoStatusFilter, number>;
}

export function PoStatusPills({ value, onChange, counts }: PoStatusPillsProps) {
  const options: FilterPillOption<PoStatusFilter>[] = PILL_ORDER.map((k) => ({
    value: k,
    label: PO_STATUS_PILL_LABELS[k],
    count: counts[k],
    hint: PILL_HINT[k],
  }));
  return <FilterPills ariaLabel="Estado" value={value} onChange={onChange} options={options} />;
}

const STATUS_TONE: Record<string, InventoryTone> = {
  pending: "warn",
  ordered: "info",
  partially_received: "violet",
  received: "ok",
  cancelled: "neutral",
};

/** Distintivo do estado da PO (o texto vem da página — traduções atuais). */
export function PoStatusBadge({ status, label }: { status: string; label: string }) {
  return <InventoryStatusBadge tone={STATUS_TONE[status] ?? "neutral"}>{label}</InventoryStatusBadge>;
}

/** "YYYY-MM-DD" → "dd/mm". */
function shortDay(value: string | null): string {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return m ? `${m[3]}/${m[2]}` : "";
}

/** Sub-estado do portal (SeloPortal do protótipo) a partir da publicação real; nada se não houver. */
export function PoPortalPill({ publication }: { publication: PoPublicationRow | undefined }) {
  if (!publication || publication.status === "withdrawn") return null;
  if (publication.status === "confirmed") {
    const promised = shortDay(publication.promised_date);
    const when = formatPoShortDate(publication.confirmed_at);
    return (
      <InventoryStatusBadge tone="ok" className="mt-1">
        <span title={when ? `Confirmada pelo fornecedor em ${when}` : undefined}>
          Confirmada{promised ? ` · entrega ${promised}` : ""}
        </span>
      </InventoryStatusBadge>
    );
  }
  if (publication.status === "viewed") {
    const when = formatPoShortDate(publication.viewed_at);
    return (
      <InventoryStatusBadge tone="info" className="mt-1">
        No portal · vista{when ? ` ${when}` : ""}
      </InventoryStatusBadge>
    );
  }
  return (
    <InventoryStatusBadge tone="neutral" className="mt-1">
      No portal · por ver
    </InventoryStatusBadge>
  );
}

/**
 * "Expedida · GR …" / "Parcialmente expedida · GR …": o fornecedor expediu no portal e a guia está aberta
 * (selarPortal do Olyvia 2.0 — no lugar do "Confirmada · entrega …"). Use com activeShipment().
 */
export function PoShippedPill({ shipment }: { shipment: PoShipment }) {
  const when = formatPoShortDate(shipment.shippedAt);
  return (
    <InventoryStatusBadge tone="violet" className="mt-1">
      <Truck className="h-3 w-3" aria-hidden="true" />
      <span title={when ? `Expedida pelo fornecedor em ${when} — receba na Receção com a guia` : "Expedida pelo fornecedor — receba na Receção com a guia"}>
        {poShipmentLabel(shipment)}
      </span>
    </InventoryStatusBadge>
  );
}
