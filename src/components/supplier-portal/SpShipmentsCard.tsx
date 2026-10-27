import { FileText, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SpOrderDetail, SpOrderShipments } from "@/lib/supplierPortal/spRpc";
import { formatSpDate, formatSpQty } from "@/components/supplier-portal/spOrderFormat";
import {
  spLineUnitCode,
  spProductLines,
  spShipmentStatusLabel,
  spShippedByLine,
  spToShipByLine,
} from "@/components/supplier-portal/spShipping";

/** Cartão "Expedições": resumo por linha (expedido / por expedir) e cada guia de remessa. */
export function SpShipmentsCard({ order, data }: { order: SpOrderDetail; data: SpOrderShipments }) {
  const shipped = spShippedByLine(data);
  const toShip = spToShipByLine(data);
  const products = spProductLines(order.lines);
  const lineById = new Map(order.lines.map((l) => [l.id, l]));
  const shipments = [...data.shipments].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" aria-hidden="true" />
          Expedições ({shipments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-0 sm:p-6 sm:pt-0">
        <div className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Quantidades expedidas e por expedir por linha</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Artigo</TableHead>
                <TableHead className="text-right">Encomendado</TableHead>
                <TableHead className="text-right">Expedido</TableHead>
                <TableHead className="text-right">Por expedir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((l) => {
                const unit = spLineUnitCode(l);
                const suffix = unit ? ` ${unit}` : "";
                return (
                  <TableRow key={l.id}>
                    <TableCell className="align-top">
                      <span className="block font-medium">{l.supplier_sku || l.sku || "—"}</span>
                      <span className="block text-xs text-muted-foreground">{l.description || "—"}</span>
                    </TableCell>
                    <TableCell className="align-top text-right tabular-nums whitespace-nowrap">
                      {formatSpQty(l.quantity)}
                      {suffix}
                    </TableCell>
                    <TableCell className="align-top text-right tabular-nums whitespace-nowrap">
                      {formatSpQty(shipped.get(l.id) ?? 0)}
                      {suffix}
                    </TableCell>
                    <TableCell className="align-top text-right tabular-nums whitespace-nowrap">
                      {formatSpQty(toShip.get(l.id) ?? 0)}
                      {suffix}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {shipments.length === 0 ? (
          <p className="px-4 pb-4 sm:px-0 sm:pb-0 text-sm text-muted-foreground">Ainda não expediu esta encomenda.</p>
        ) : (
          <ul className="space-y-3 px-4 pb-4 sm:px-0 sm:pb-0" aria-label="Guias de remessa">
            {shipments.map((s) => (
              <li key={s.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono font-semibold text-foreground">Guia {s.note_number}</p>
                  <Badge variant="outline" className="font-medium">
                    {spShipmentStatusLabel(s.status)}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Data</dt>
                    <dd>{formatSpDate(s.date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Transportador</dt>
                    <dd className="break-words">{s.carrier || "—"}</dd>
                  </div>
                </dl>
                {s.has_file && s.file && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="truncate">{s.file.name}</span>
                  </p>
                )}
                <ul className="text-sm divide-y" aria-label={`Linhas da guia ${s.note_number}`}>
                  {s.lines.map((sl) => {
                    const l = lineById.get(sl.purchase_order_item_id);
                    const unit = l ? spLineUnitCode(l) : "";
                    return (
                      <li key={sl.purchase_order_item_id} className="flex justify-between gap-3 py-1">
                        <span className="min-w-0 truncate">
                          {l ? l.supplier_sku || l.sku || l.description || "Artigo" : "Artigo"}
                          {l?.description && (l.supplier_sku || l.sku) ? (
                            <span className="text-muted-foreground"> · {l.description}</span>
                          ) : null}
                        </span>
                        <span className="tabular-nums whitespace-nowrap">
                          {formatSpQty(sl.quantity)}
                          {unit ? ` ${unit}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
