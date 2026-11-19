import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SpOrderSla, SpOrderStatus, SpPublicationStatus } from "@/lib/supplierPortal/spRpc";
import { SP_TONE_CLASS, spOrderStatusBadge, spPublicationBadge, spSlaBadge } from "@/components/supplier-portal/spOrderFormat";
import type { SpShippingState } from "@/components/supplier-portal/spShipping";

/**
 * Etiquetas de estado de uma encomenda no portal (resposta + estado na empresa
 * + expedição). A expedição só aparece enquanto a empresa não tiver recebido
 * nada: "Recebida"/"Parcialmente recebida"/"Cancelada" têm prioridade.
 * O alerta de prazo (SLA) aparece primeiro, só quando está em risco/ultrapassado.
 */
export function SpOrderBadges({
  orderStatus,
  publicationStatus,
  shippingState = null,
  sla = null,
  className,
}: {
  orderStatus: SpOrderStatus;
  publicationStatus: SpPublicationStatus;
  /** Derivado de sp_order_shipments (spShippingState). */
  shippingState?: SpShippingState | null;
  /** sla de sp_list_orders/sp_get_order (opcional). */
  sla?: SpOrderSla | null;
  className?: string;
}) {
  const pub = spPublicationBadge(publicationStatus);
  const po = spOrderStatusBadge(orderStatus);
  const ship = !po && shippingState
    ? shippingState === "shipped"
      ? { label: "Expedida", tone: "viewed" as const }
      : { label: "Parcialmente expedida", tone: "partial" as const }
    : null;
  const slaBadge = spSlaBadge(sla);
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {slaBadge && (
        <Badge variant="outline" className={cn("font-semibold", SP_TONE_CLASS[slaBadge.tone])} title={slaBadge.title}>
          {slaBadge.label}
          <span className="sr-only">: {slaBadge.title}</span>
        </Badge>
      )}
      <Badge variant="outline" className={cn("font-medium", SP_TONE_CLASS[pub.tone])}>
        {pub.label}
      </Badge>
      {po && (
        <Badge variant="outline" className={cn("font-medium", SP_TONE_CLASS[po.tone])}>
          {po.label}
        </Badge>
      )}
      {ship && (
        <Badge variant="outline" className={cn("font-medium", SP_TONE_CLASS[ship.tone])}>
          {ship.label}
        </Badge>
      )}
    </span>
  );
}
