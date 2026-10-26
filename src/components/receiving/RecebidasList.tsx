// Receção › "Recebidas" (protótipo RecebidasInv.tsx, dados reais: purchase_order_receipts kind='receipt', as mais
// recentes): quando, a PO, o fornecedor, o cliente/origem, o que entrou (e quanto ficou reservado para a EC), quem, a
// guia e o estado. "Reverter" abre a encomenda (purchaseOrdersLink) com o diálogo de reversão que já existe — que
// reverte a LINHA INTEIRA (não há reversão de uma receção individual: precisaria de BD).
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InventoryEmptyState, InventoryStatusBadge, clientOrdersLink, purchaseOrdersLink } from "@/components/inventory/ui";
import { fmtUn } from "./porReceber";
import { RECEIPTS_LIMIT, filtrarRecebidas, type ReceiptItem } from "./useReceivablePos";
import { noteLabel } from "./deliveryNotes";

const dtFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtWhen = (ts: string) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : dtFmt.format(d);
};

export interface RecebidasListProps {
  items: readonly ReceiptItem[];
  loading: boolean;
  error: string | null;
  noPermission: boolean;
  /** purchase_orders.view: abrir a encomenda para reverter. */
  canOpenPo: boolean;
  openPoReason?: string;
  onRetry?: () => void;
}

export function RecebidasList({ items, loading, error, noPermission, canOpenPo, openPoReason, onRetry }: RecebidasListProps) {
  const [q, setQ] = useState("");
  if (noPermission) {
    return (
      <InventoryEmptyState
        title="Sem permissão para ver encomendas"
        description="O histórico de receções requer a permissão purchase_orders.view."
      />
    );
  }
  const L = filtrarRecebidas(items, q);
  const origem = (x: ReceiptItem) =>
    !x.contractId ? (
      <span className="text-muted-foreground">Stock</span>
    ) : (
      <Link to={clientOrdersLink({ open: x.contractId })} className="text-primary hover:underline">
        {x.origin ? `${x.origin.number}${x.origin.clientName ? ` · ${x.origin.clientName}` : ""}` : "Encomenda de cliente"}
      </Link>
    );
  return (
    <section aria-label="Receções feitas" className="space-y-3">
      <div className="max-w-md space-y-1">
        <Label htmlFor="rec-recebidas-q">Pesquisar</Label>
        <Input
          id="rec-recebidas-q"
          type="search"
          value={q}
          placeholder="Nº da PO, fornecedor, cliente ou produto"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <InventoryEmptyState icon={AlertTriangle} title="Não foi possível carregar as receções" description={error}>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar de novo
            </Button>
          ) : null}
        </InventoryEmptyState>
      ) : L.length === 0 ? (
        <InventoryEmptyState
          title="Sem receções"
          description={q ? "Nenhuma receção com esta pesquisa." : "As entradas no armazém aparecem aqui."}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label="Receções feitas" className="min-w-[1000px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Cliente/origem</TableHead>
                  <TableHead>Entrou</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Guia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {L.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="whitespace-nowrap">{fmtWhen(x.receivedAt)}</TableCell>
                    <TableCell className="font-mono font-semibold">{x.orderNumber}</TableCell>
                    <TableCell>{x.supplierName}</TableCell>
                    <TableCell>{origem(x)}</TableCell>
                    <TableCell>
                      {fmtUn(x.units)} un · {x.productName}
                      {x.unitsToOrder > 0 ? (
                        <>
                          <br />
                          <small className="text-muted-foreground">
                            {fmtUn(x.unitsToOrder)} reservadas para {x.origin?.number ?? "a encomenda de cliente"}
                          </small>
                        </>
                      ) : null}
                      {x.warehouseName ? (
                        <>
                          <br />
                          <small className="text-muted-foreground">{x.warehouseName}</small>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell>{x.receivedByName ?? "—"}</TableCell>
                    <TableCell>{x.noteNumber ? noteLabel(x.noteNumber) : "—"}</TableCell>
                    <TableCell>
                      {x.reverted ? (
                        <InventoryStatusBadge tone="neutral">Revertida</InventoryStatusBadge>
                      ) : (
                        <InventoryStatusBadge tone="ok">Entrou</InventoryStatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!x.reverted ? (
                        canOpenPo ? (
                          <Button asChild variant="outline" size="sm">
                            <Link
                              to={purchaseOrdersLink({ open: x.poId })}
                              aria-label={`Reverter a receção de ${x.orderNumber} (${x.productName})`}
                              title="Abre a encomenda: a reversão é feita lá e reverte a linha inteira, não só esta receção."
                            >
                              Reverter
                            </Link>
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" aria-disabled title={openPoReason} className="cursor-not-allowed opacity-50">
                            Reverter
                          </Button>
                        )
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Mostra as últimas {RECEIPTS_LIMIT} receções. "Reverter" abre a encomenda: a reversão que existe é da linha inteira.
          </p>
        </>
      )}
    </section>
  );
}
