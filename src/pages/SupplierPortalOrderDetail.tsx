import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, CheckCircle2, Download, Info, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import {
  getSpHint,
  isNoSupplierAccess,
  isSpNotFound,
  spErrorMessage,
  spGetOrder,
  spMarkOrderViewed,
  type SpOrderDetail,
  type SpOrderLine,
} from "@/lib/supplierPortal/spRpc";
import { SP_ORDERS_QUERY_KEY } from "@/components/supplier-portal/useSpOrdersToConfirm";
import { SpOrderBadges } from "@/components/supplier-portal/SpOrderBadges";
import { SpConfirmOrderDialog } from "@/components/supplier-portal/SpConfirmOrderDialog";
import { downloadSpOrderPdf } from "@/components/supplier-portal/downloadSpOrderPdf";
import {
  formatSpDate,
  formatSpDateTime,
  formatSpMoney,
  formatSpQty,
} from "@/components/supplier-portal/spOrderFormat";

function attributesText(line: SpOrderLine): string {
  const attrs = line.selected_attributes || {};
  return Object.values(attrs)
    .filter((a): a is { label?: string; value?: string; unit?: string } => !!a && typeof a === "object")
    .map((a) => {
      const value = [a.value, a.unit].filter(Boolean).join(" ");
      return a.label ? `${a.label}: ${value || "—"}` : value;
    })
    .filter(Boolean)
    .join(" · ");
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children}</dd>
    </div>
  );
}

/** Portal do Fornecedor — detalhe da encomenda (sp_get_order / sp_mark_order_viewed / sp_confirm_order). */
export default function SupplierPortalOrderDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { account, refresh } = useSupplierPortal();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const viewedRef = useRef<string | null>(null);

  const accountId = account?.id ?? null;
  const query = useQuery({
    queryKey: [SP_ORDERS_QUERY_KEY, accountId, "detail", id],
    queryFn: () => spGetOrder(id),
    enabled: !!accountId && !!id,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (count, err) => !isNoSupplierAccess(err) && !isSpNotFound(err) && count < 1,
  });

  useEffect(() => {
    if (query.error && isNoSupplierAccess(query.error)) void refresh();
  }, [query.error, refresh]);

  const order = query.data;

  // Marcar como vista depois de o detalhe abrir bem (uma vez por encomenda e
  // revisão). O erro é ignorado (contrato 2.3).
  useEffect(() => {
    if (!order) return;
    const key = `${order.purchase_order_id}:${order.publication.revision}`;
    if (viewedRef.current === key || order.publication.status !== "sent") return;
    viewedRef.current = key;
    spMarkOrderViewed(order.purchase_order_id)
      .then((res) => {
        if (res.first_view) void queryClient.invalidateQueries({ queryKey: [SP_ORDERS_QUERY_KEY, accountId] });
      })
      .catch(() => undefined);
  }, [order, queryClient, accountId]);

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: [SP_ORDERS_QUERY_KEY, accountId] });
  };

  const handleDownload = async (o: SpOrderDetail) => {
    setDownloading(true);
    try {
      await downloadSpOrderPdf(o);
    } catch (err) {
      toast({
        title: "Não foi possível gerar o PDF",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  if (query.isLoading) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground" role="status">
        A carregar encomenda…
      </p>
    );
  }

  if (query.error || !order) {
    if (query.error && isNoSupplierAccess(query.error)) return null;
    const notFound = !query.error || isSpNotFound(query.error);
    return (
      <div className="max-w-lg mx-auto py-10 space-y-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {notFound ? "Encomenda não disponível" : "Não foi possível abrir a encomenda"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {notFound
            ? "Esta encomenda não existe, foi retirada do portal pela empresa ou já não tem acesso a ela."
            : spErrorMessage(query.error)}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {!notFound && (
            <Button className="h-11 gap-2" onClick={() => void query.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar de novo
            </Button>
          )}
          <Button asChild variant="outline" className="h-11 gap-2">
            <Link to="/supplier-portal/orders">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar às encomendas
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const pub = order.publication;
  const isConfirmed = pub.status === "confirmed";
  const hasReceipts = order.lines.some((l) => Number(l.received_quantity) > 0);
  const companyAddress = order.company.address;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="h-11 -ml-2 gap-2 text-muted-foreground">
        <Link to="/supplier-portal/orders">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Encomendas
        </Link>
      </Button>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {order.company.logo_url ? (
            <img
              src={order.company.logo_url}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-md object-contain shrink-0 bg-muted"
            />
          ) : (
            <div className="h-12 w-12 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Encomenda {order.order_number}</h1>
            <p className="text-sm text-muted-foreground truncate">{order.company.name}</p>
            <SpOrderBadges orderStatus={order.order_status} publicationStatus={pub.status} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:flex gap-2 shrink-0">
          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={() => void handleDownload(order)}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {downloading ? "A gerar PDF…" : "Descarregar PDF"}
          </Button>
          {order.can_confirm && (
            <Button className="h-11 gap-2" onClick={() => setConfirmOpen(true)}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Confirmar encomenda
            </Button>
          )}
        </div>
      </div>

      {pub.revision > 1 && !isConfirmed && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            A empresa atualizou esta encomenda (versão {pub.revision}, enviada em {formatSpDateTime(pub.sent_at)}). Reveja as
            linhas antes de confirmar.
          </AlertDescription>
        </Alert>
      )}

      {isConfirmed && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/30">
          <CheckCircle2 className="h-4 w-4 !text-emerald-700 dark:!text-emerald-300" />
          <AlertTitle>
            Confirmada em {formatSpDateTime(pub.confirmed_at)}
            {pub.confirmed_by_name ? ` por ${pub.confirmed_by_name}` : ""}
            {pub.promised_date ? ` · entrega prevista ${formatSpDate(pub.promised_date)}` : ""}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            {pub.supplier_comment && <p className="whitespace-pre-wrap">Comentário: {pub.supplier_comment}</p>}
            {pub.promised_date && pub.promised_date_accepted && <p>A empresa aceitou a data de entrega prevista.</p>}
          </AlertDescription>
        </Alert>
      )}

      {!order.can_confirm && !isConfirmed && (order.order_status === "received" || order.order_status === "cancelled") && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {order.order_status === "received"
              ? "Esta encomenda já foi recebida pela empresa."
              : "Esta encomenda foi cancelada pela empresa."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Encomenda</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <Field label="Número">{order.order_number}</Field>
              <Field label="Data da encomenda">{formatSpDate(order.order_date)}</Field>
              <Field label="Entrega pedida">{formatSpDate(order.expected_delivery)}</Field>
              <Field label="Enviada em">{formatSpDateTime(pub.sent_at)}</Field>
              <Field label="Vista em">{formatSpDateTime(pub.viewed_at)}</Field>
              {order.sent_by && (
                <Field label="Responsável">
                  <span className="block">{order.sent_by.name || "—"}</span>
                  {order.sent_by.email && (
                    <a href={`mailto:${order.sent_by.email}`} className="block text-primary hover:underline break-all">
                      {order.sent_by.email}
                    </a>
                  )}
                  {order.sent_by.phone && (
                    <a href={`tel:${order.sent_by.phone}`} className="block text-primary hover:underline">
                      {order.sent_by.phone}
                    </a>
                  )}
                </Field>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field label="Nome">{order.company.name}</Field>
              {order.company.nif && <Field label="NIF">{order.company.nif}</Field>}
              {companyAddress && <Field label="Morada">{companyAddress}</Field>}
              {order.company.phone && <Field label="Telefone">{order.company.phone}</Field>}
            </dl>
          </CardContent>
        </Card>
      </div>

      {order.supplier_notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notas da empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-foreground">{order.supplier_notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Linhas ({order.lines.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço unit.</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {hasReceipts && <TableHead className="text-right">Recebido</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((l) => {
                  const units = Number(l.units_per_uom) || 1;
                  const unitCode = l.uom_code || (units === 1 ? l.base_uom_code : null) || "";
                  const attrs = attributesText(l);
                  const received = Number(l.received_quantity) || 0;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="align-top">
                        {l.supplier_sku ? (
                          <>
                            <span className="block font-semibold text-foreground">{l.supplier_sku}</span>
                            {l.sku && <span className="block text-xs text-muted-foreground">Nossa ref.: {l.sku}</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">{l.sku || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top min-w-[16ch]">
                        <span className="block">{l.description || "—"}</span>
                        {attrs && <span className="block text-xs text-muted-foreground">{attrs}</span>}
                      </TableCell>
                      <TableCell className="align-top text-right tabular-nums whitespace-nowrap">
                        <span className="block">
                          {formatSpQty(l.quantity)}
                          {unitCode ? ` ${unitCode}` : ""}
                        </span>
                        {units > 1 && (
                          <span className="block text-xs text-muted-foreground">
                            = {formatSpQty(Number(l.quantity) * units)} {l.base_uom_code || "un"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-right tabular-nums whitespace-nowrap">
                        {formatSpMoney(l.unit_price, order.currency)}
                      </TableCell>
                      <TableCell className="align-top text-right tabular-nums">{formatSpQty(l.vat_rate)}%</TableCell>
                      <TableCell className="align-top text-right tabular-nums font-medium whitespace-nowrap">
                        {formatSpMoney(l.total, order.currency)}
                      </TableCell>
                      {hasReceipts && (
                        <TableCell className="align-top text-right tabular-nums whitespace-nowrap">
                          {formatSpQty(received)}
                          {unitCode ? ` ${unitCode}` : ""}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <dl className="mt-4 ml-auto w-full sm:w-72 space-y-1 px-4 pb-4 sm:px-0 sm:pb-0 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal (sem IVA)</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.subtotal, order.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.vat_total, order.currency)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.total, order.currency)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {order.can_confirm && (
        <SpConfirmOrderDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          order={order}
          onConfirmed={(res) => {
            toast({
              title: res.already_confirmed ? "Encomenda já estava confirmada" : "Encomenda confirmada",
              description: res.promised_date
                ? `Entrega prevista: ${formatSpDate(res.promised_date)}.`
                : "A empresa foi avisada.",
            });
            void reload();
          }}
          onError={(err) => {
            const hint = getSpHint(err);
            if (isNoSupplierAccess(err)) {
              void refresh();
              return;
            }
            toast({
              title:
                hint === "stale_revision"
                  ? "Encomenda atualizada pela empresa"
                  : hint === "order_closed"
                    ? "Já não é possível confirmar"
                    : "Não foi possível confirmar",
              description: spErrorMessage(err),
              variant: hint === "stale_revision" ? "default" : "destructive",
            });
            if (hint === "stale_revision" || hint === "order_closed" || hint === "not_found") {
              setConfirmOpen(false);
              void reload();
            }
          }}
        />
      )}
    </div>
  );
}
