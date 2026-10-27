// Portal do Fornecedor — expedição com guia de remessa: regras puras (sem React).
import type { SpOrderDetail, SpOrderLine, SpOrderShipments } from "@/lib/supplierPortal/spRpc";
import { requiresIntegerQty } from "@/utils/quotes/integerQty";

export type SpShippingState = "partially_shipped" | "shipped";

/** Linhas de produto da encomenda (só estas se expedem). */
export function spProductLines(lines: SpOrderLine[]): SpOrderLine[] {
  return lines.filter((l) => l.item_type === "product");
}

/** Quanto falta expedir por linha (da RPC sp_order_shipments). */
export function spToShipByLine(shipments: SpOrderShipments | null | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of shipments?.lines ?? []) map.set(l.id, Math.max(0, Number(l.to_ship) || 0));
  return map;
}

/** Quanto já foi expedido por linha. */
export function spShippedByLine(shipments: SpOrderShipments | null | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of shipments?.lines ?? []) map.set(l.id, Math.max(0, Number(l.shipped) || 0));
  return map;
}

/**
 * Estado da expedição: soma do expedido vs soma das quantidades das linhas de
 * produto. null = nada expedido (ou sem dados).
 */
export function spShippingState(
  lines: SpOrderLine[],
  shipments: SpOrderShipments | null | undefined,
): SpShippingState | null {
  if (!shipments) return null;
  const shipped = spShippedByLine(shipments);
  const products = spProductLines(lines);
  const totalQty = products.reduce((a, l) => a + Math.max(0, Number(l.quantity) || 0), 0);
  const totalShipped = products.reduce((a, l) => a + (shipped.get(l.id) ?? 0), 0);
  if (totalShipped <= 0) return null;
  return totalShipped >= totalQty ? "shipped" : "partially_shipped";
}

/**
 * "Expedir encomenda" só com a publicação confirmada, a PO encomendada ou
 * parcialmente recebida e alguma linha ainda por expedir.
 */
export function spCanShip(order: SpOrderDetail, shipments: SpOrderShipments | null | undefined): boolean {
  if (order.publication.status !== "confirmed") return false;
  if (order.order_status !== "ordered" && order.order_status !== "partially_received") return false;
  const toShip = spToShipByLine(shipments);
  return spProductLines(order.lines).some((l) => (toShip.get(l.id) ?? 0) > 0);
}

/**
 * Inteiros quando a unidade é contável (mesma regra das encomendas/propostas):
 * linha numa embalagem ou unidade base contável (un, pcs, caixa…).
 */
export function spLineRequiresIntegerQty(line: SpOrderLine): boolean {
  const units = Number(line.units_per_uom) || 1;
  return requiresIntegerQty({
    hasProduct: line.item_type === "product",
    lineUomId: units > 1 ? line.uom_code : null,
    baseUomCode: units > 1 ? line.base_uom_code : line.uom_code || line.base_uom_code,
  });
}

/** Unidade a mostrar junto à quantidade da linha (igual à tabela do detalhe). */
export function spLineUnitCode(line: SpOrderLine): string {
  const units = Number(line.units_per_uom) || 1;
  return line.uom_code || (units === 1 ? line.base_uom_code : null) || "";
}

/** Estado de cada guia de remessa, em português. */
export function spShipmentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "open":
    case "pending":
    case "shipped":
    case "in_transit":
      return "A caminho";
    case "partially_received":
    case "partial":
      return "Parcialmente recebida";
    case "received":
    case "closed":
      return "Recebida";
    case "cancelled":
    case "void":
      return "Anulada";
    default:
      return status || "—";
  }
}
