import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, Clock, Download, Info, Loader2, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import {
  getSpHint,
  isNoSupplierAccess,
  isSpFunctionMissing,
  isSpNotFound,
  spErrorMessage,
  spGetOrder,
  spMarkOrderViewed,
  spOrderShipments,
  spUploadDeliveryNoteFile,
  type SpOrderDetail,
  type SpOrderLine,
  type SpOrderSla,
} from "@/lib/supplierPortal/spRpc";
import { SP_ORDERS_QUERY_KEY } from "@/components/supplier-portal/useSpOrdersToConfirm";
import { SpOrderBadges } from "@/components/supplier-portal/SpOrderBadges";
import { SpConfirmOrderDialog } from "@/components/supplier-portal/SpConfirmOrderDialog";
import { downloadSpOrderPdf } from "@/components/supplier-portal/downloadSpOrderPdf";
import { SpShipOrderDialog } from "@/components/supplier-portal/SpShipOrderDialog";
import { SpShipmentsCard } from "@/components/supplier-portal/SpShipmentsCard";
import { spCanShip, spShippingState } from "@/components/supplier-portal/spShipping";
import {
  formatSpDate,
  formatSpDateTime,
  formatSpMoney,
  formatSpQty,
  spDaysText,
  spSlaSourceText,
} from "@/components/supplier-portal/spOrderFormat";
import { usePortalT } from "@/portal-i18n";

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

/**
 * Resumo do que o fornecedor vê ao confirmar: revisão + linhas + totais. Se
 * mudar com o diálogo aberto (nova leitura do detalhe), o diálogo fecha — nunca
 * se confirma uma versão diferente da que estava no ecrã.
 */
interface ConfirmSnapshot {
  purchaseOrderId: string;
  revision: number;
  contentKey: string;
}

function orderContentKey(o: SpOrderDetail): string {
  return JSON.stringify({
    lines: o.lines.map((l) => [
      l.id,
      l.sku,
      l.supplier_sku,
      l.description,
      l.selected_attributes,
      Number(l.quantity),
      l.uom_code,
      Number(l.units_per_uom),
      Number(l.unit_price),
      Number(l.vat_rate),
      Number(l.total),
    ]),
    total: Number(o.totals.total),
    expected_delivery: o.expected_delivery,
    supplier_notes: o.supplier_notes,
  });
}

function snapshotOf(o: SpOrderDetail): ConfirmSnapshot {
  return { purchaseOrderId: o.purchase_order_id, revision: o.publication.revision, contentKey: orderContentKey(o) };
}

/**
 * Aviso de prazo de entrega (SLA): em risco (âmbar) ou ultrapassado (vermelho).
 * Nada quando está dentro do prazo, fechada ou sem prazo.
 */
function SpSlaAlert({ sla }: { sla: SpOrderSla | null | undefined }) {
  const { t } = usePortalT();
  if (!sla || (sla.status !== "at_risk" && sla.status !== "overdue")) return null;
  const due = formatSpDate(sla.due_date);
  const source = spSlaSourceText(sla, t);

  if (sla.status === "overdue") {
    const late = Math.max(1, sla.days_late ?? 1);
    // Prazo vindo só da data prometida, sem contrato com prazo: não falar de contrato.
    const noContract = sla.source === "promised" && sla.contract_days == null;
    return (
      <Alert variant="destructive" className="border-2 bg-red-50 dark:bg-red-500/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t("sp.encomendaDet.sla.ultrapassado")}</AlertTitle>
        <AlertDescription className="space-y-1">
          {noContract ? (
            <p>{t("sp.encomendaDet.sla.atrasoSemContrato", { data: due, dias: spDaysText(late, t) })}</p>
          ) : (
            <p>
              {t("sp.encomendaDet.sla.atrasoComContrato", { data: due, origem: source, dias: spDaysText(late, t) })}
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const left = Math.max(0, sla.days_left ?? 0);
  return (
    <Alert
      role="status"
      className="border-2 border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/40"
    >
      <Clock className="h-4 w-4 !text-amber-700 dark:!text-amber-300" />
      <AlertTitle>{t("sp.encomendaDet.sla.risco")}</AlertTitle>
      <AlertDescription>
        {left === 0
          ? t("sp.encomendaDet.sla.riscoHoje", { data: due, origem: source })
          : t("sp.encomendaDet.sla.riscoFaltam", { data: due, dias: spDaysText(left, t), origem: source })}
      </AlertDescription>
    </Alert>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children}</dd>
    </div>
  );
}

/** Portal do Fornecedor — detalhe da encomenda (sp_get_order / sp_mark_order_viewed / sp_confirm_order / sp_ship_order). */
export default function SupplierPortalOrderDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { t, tn, idioma } = usePortalT();
  const { account, refresh } = useSupplierPortal();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Revisão + conteúdo no momento em que o diálogo abriu: é esta que vai no
  // sp_confirm_order, não a da última leitura.
  const [confirmSnapshot, setConfirmSnapshot] = useState<ConfirmSnapshot | null>(null);
  const [changedWhileConfirming, setChangedWhileConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  // Revisão da publicação quando o diálogo de expedição abriu (vai no sp_ship_order).
  const [shipRevision, setShipRevision] = useState<number | null>(null);
  const viewedRef = useRef<string | null>(null);

  const accountId = account?.id ?? null;
  const query = useQuery({
    queryKey: [SP_ORDERS_QUERY_KEY, accountId, "detail", id],
    queryFn: () => spGetOrder(id),
    enabled: !!accountId && !!id,
    staleTime: 0,
    // Com o diálogo de confirmação aberto não se relê ao voltar à janela.
    refetchOnWindowFocus: !confirmOpen && !shipOpen,
    retry: (count, err) => !isNoSupplierAccess(err) && !isSpNotFound(err) && count < 1,
  });

  // Expedições (guias de remessa) — só existem depois de confirmada.
  const orderConfirmed = query.data?.publication.status === "confirmed";
  const shipmentsQuery = useQuery({
    queryKey: [SP_ORDERS_QUERY_KEY, accountId, "shipments", id],
    queryFn: () => spOrderShipments(id),
    enabled: !!accountId && !!id && orderConfirmed,
    staleTime: 0,
    refetchOnWindowFocus: !shipOpen,
    retry: (count, err) => !isNoSupplierAccess(err) && !isSpNotFound(err) && !isSpFunctionMissing(err) && count < 1,
  });

  useEffect(() => {
    if (query.error && isNoSupplierAccess(query.error)) void refresh();
  }, [query.error, refresh]);

  const order = query.data;

  // Se uma nova leitura trouxer outra revisão ou outro conteúdo com o diálogo
  // aberto, fecha-se e avisa-se — o fornecedor tem de rever antes de confirmar.
  useEffect(() => {
    if (!confirmOpen || !confirmSnapshot || !order) return;
    if (order.purchase_order_id !== confirmSnapshot.purchaseOrderId) return;
    const now = snapshotOf(order);
    if (now.revision === confirmSnapshot.revision && now.contentKey === confirmSnapshot.contentKey) return;
    setConfirmOpen(false);
    setConfirmSnapshot(null);
    setChangedWhileConfirming(true);
    toast({
      title: t("sp.encomendaDet.alterada.titulo"),
      description: t("sp.encomendaDet.alterada.toast"),
    });
  }, [confirmOpen, confirmSnapshot, order, toast, t]);

  const openConfirm = (o: SpOrderDetail) => {
    setConfirmSnapshot(snapshotOf(o));
    setChangedWhileConfirming(false);
    setConfirmOpen(true);
  };

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
        title: t("sp.encomendaDet.pdfErro"),
        description: err instanceof Error ? err.message : t("sp.encomendaDet.tenteNovamente"),
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  if (query.isLoading) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground" role="status">
        {t("sp.encomendaDet.aCarregar")}
      </p>
    );
  }

  if (query.error || !order) {
    if (query.error && isNoSupplierAccess(query.error)) return null;
    const notFound = !query.error || isSpNotFound(query.error);
    return (
      <div className="max-w-lg mx-auto py-10 space-y-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {notFound ? t("sp.encomendaDet.naoDisponivel.titulo") : t("sp.encomendaDet.naoAbre")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {notFound ? t("sp.encomendaDet.naoDisponivel.texto") : spErrorMessage(query.error, idioma)}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {!notFound && (
            <Button className="h-11 gap-2" onClick={() => void query.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("sp.erro.tentarDeNovo")}
            </Button>
          )}
          <Button asChild variant="outline" className="h-11 gap-2">
            <Link to="/supplier-portal/orders">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("sp.encomendaDet.voltarLista")}
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
  const shipments = isConfirmed ? shipmentsQuery.data ?? null : null;
  const canShip = !!shipments && spCanShip(order, shipments);
  const shippingState = spShippingState(order.lines, shipments);
  const shipmentsError =
    isConfirmed && shipmentsQuery.error && !isSpFunctionMissing(shipmentsQuery.error) && !isNoSupplierAccess(shipmentsQuery.error)
      ? shipmentsQuery.error
      : null;

  const openShip = () => {
    setShipRevision(pub.revision);
    setShipOpen(true);
  };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="h-11 -ml-2 gap-2 text-muted-foreground">
        <Link to="/supplier-portal/orders">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("sp.encomendaDet.voltar")}
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
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{t("sp.encomendaDet.titulo", { numero: order.order_number })}</h1>
            <p className="text-sm text-muted-foreground truncate">{order.company.name}</p>
            <SpOrderBadges
              orderStatus={order.order_status}
              publicationStatus={pub.status}
              shippingState={shippingState}
              sla={order.sla}
            />
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
            {downloading ? t("sp.encomendaDet.aGerarPdf") : t("sp.encomendaDet.descarregarPdf")}
          </Button>
          {order.can_confirm && (
            <Button className="h-11 gap-2" onClick={() => openConfirm(order)}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t("sp.encomendaDet.confirmar")}
            </Button>
          )}
          {canShip && (
            <Button className="h-11 gap-2" onClick={openShip}>
              <Truck className="h-4 w-4" aria-hidden="true" />
              {t("sp.encomendaDet.expedir")}
            </Button>
          )}
        </div>
      </div>

      {/* Prazo (SLA) primeiro: é o aviso mais importante. */}
      <SpSlaAlert sla={order.sla} />

      {changedWhileConfirming && !isConfirmed && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/30">
          <Info className="h-4 w-4 !text-amber-700 dark:!text-amber-300" />
          <AlertTitle>{t("sp.encomendaDet.alterada.titulo")}</AlertTitle>
          <AlertDescription>{t("sp.encomendaDet.alterada.texto")}</AlertDescription>
        </Alert>
      )}

      {pub.revision > 1 && !isConfirmed && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t("sp.encomendaDet.versao", { n: pub.revision, data: formatSpDateTime(pub.sent_at) })}
          </AlertDescription>
        </Alert>
      )}

      {isConfirmed && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/30">
          <CheckCircle2 className="h-4 w-4 !text-emerald-700 dark:!text-emerald-300" />
          <AlertTitle>
            {t("sp.encomendaDet.confirmadaEm", { data: formatSpDateTime(pub.confirmed_at) })}
            {pub.confirmed_by_name ? t("sp.encomendaDet.confirmadaPor", { nome: pub.confirmed_by_name }) : ""}
            {pub.promised_date ? t("sp.encomendaDet.entregaPrevistaAviso", { data: formatSpDate(pub.promised_date) }) : ""}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            {pub.supplier_comment && <p className="whitespace-pre-wrap">{t("sp.encomendaDet.comentario", { texto: pub.supplier_comment })}</p>}
            {pub.promised_date && pub.promised_date_accepted && <p>{t("sp.encomendaDet.dataAceite")}</p>}
          </AlertDescription>
        </Alert>
      )}

      {!order.can_confirm && !isConfirmed && (order.order_status === "received" || order.order_status === "cancelled") && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {order.order_status === "received"
              ? t("sp.encomendaDet.jaRecebida")
              : t("sp.encomendaDet.jaCancelada")}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("sp.encomendaDet.cartao.encomenda")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <Field label={t("sp.encomendaDet.campo.numero")}>{order.order_number}</Field>
              <Field label={t("sp.encomendaDet.campo.dataEncomenda")}>{formatSpDate(order.order_date)}</Field>
              <Field label={t("sp.encomendaDet.campo.entregaPedida")}>{formatSpDate(order.expected_delivery)}</Field>
              {order.sla?.status && order.sla.due_date && (
                <Field label={t("sp.encomendas.coluna.prazoSla")}>
                  <span
                    className={
                      order.sla.status === "overdue"
                        ? "font-medium text-red-700 dark:text-red-300"
                        : order.sla.status === "at_risk"
                          ? "font-medium text-amber-800 dark:text-amber-200"
                          : undefined
                    }
                  >
                    {formatSpDate(order.sla.due_date)}
                  </span>
                </Field>
              )}
              <Field label={t("sp.encomendaDet.campo.enviadaEm")}>{formatSpDateTime(pub.sent_at)}</Field>
              <Field label={t("sp.encomendaDet.campo.vistaEm")}>{formatSpDateTime(pub.viewed_at)}</Field>
              {order.sent_by && (
                <Field label={t("sp.encomendaDet.campo.responsavel")}>
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
            <CardTitle className="text-base">{t("sp.encomendaDet.cartao.empresa")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field label={t("sp.encomendaDet.campo.nome")}>{order.company.name}</Field>
              {order.company.nif && <Field label={t("sp.encomendaDet.campo.nif")}>{order.company.nif}</Field>}
              {companyAddress && <Field label={t("sp.encomendaDet.campo.morada")}>{companyAddress}</Field>}
              {order.company.phone && <Field label={t("sp.encomendaDet.campo.telefone")}>{order.company.phone}</Field>}
            </dl>
          </CardContent>
        </Card>
      </div>

      {order.supplier_notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("sp.encomendaDet.notas")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-foreground">{order.supplier_notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("sp.encomendaDet.linhas", { n: order.lines.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sp.encomendaDet.coluna.referencia")}</TableHead>
                  <TableHead>{t("sp.encomendaDet.coluna.descricao")}</TableHead>
                  <TableHead className="text-right">{t("sp.encomendaDet.coluna.qtd")}</TableHead>
                  <TableHead className="text-right">{t("sp.encomendaDet.coluna.precoUnit")}</TableHead>
                  <TableHead className="text-right">{t("sp.encomendaDet.coluna.iva")}</TableHead>
                  <TableHead className="text-right">{t("sp.encomendaDet.coluna.total")}</TableHead>
                  {hasReceipts && <TableHead className="text-right">{t("sp.encomendaDet.coluna.recebido")}</TableHead>}
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
                            {l.sku && <span className="block text-xs text-muted-foreground">{t("sp.encomendaDet.nossaRef", { ref: l.sku })}</span>}
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
              <dt className="text-muted-foreground">{t("sp.encomendaDet.subtotal")}</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.subtotal, order.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("sp.encomendaDet.iva")}</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.vat_total, order.currency)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>{t("sp.encomendaDet.total")}</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.total, order.currency)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {shipmentsError && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>{t("sp.encomendaDet.expedicoesErro")}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{spErrorMessage(shipmentsError, idioma)}</p>
            <Button variant="outline" className="h-11 gap-2" onClick={() => void shipmentsQuery.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("sp.erro.tentarDeNovo")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {shipments && (shipments.shipments.length > 0 || canShip) && <SpShipmentsCard order={order} data={shipments} />}

      {shipments && shipRevision !== null && (
        <SpShipOrderDialog
          open={shipOpen}
          onOpenChange={setShipOpen}
          order={order}
          shipments={shipments}
          revision={shipRevision}
          allowAttachment
          onShipped={(res, file) => {
            const n = res.lines.length;
            toast({
              title: res.already_shipped ? t("sp.encomendaDet.expedida.jaRegistada") : t("sp.encomendaDet.expedida.titulo"),
              description: tn("sp.encomendaDet.expedida.guia.um", "sp.encomendaDet.expedida.guia.varios", n, {
                guia: res.note_number,
              }),
            });
            setShipRevision(null);
            if (file) {
              spUploadDeliveryNoteFile({ orgId: res.organization_id, noteId: res.delivery_note_id, file })
                .then(() => toast({ title: t("sp.encomendaDet.expedida.anexado") }))
                .catch((err: unknown) =>
                  toast({
                    title: t("sp.encomendaDet.expedida.anexoFalhou"),
                    description: err instanceof Error ? err.message : t("sp.encomendaDet.expedida.anexoTente"),
                    variant: "destructive",
                  }),
                )
                .finally(() => void reload());
            } else {
              void reload();
            }
          }}
          onError={(err) => {
            const hint = getSpHint(err);
            if (isNoSupplierAccess(err)) {
              setShipOpen(false);
              void refresh();
              return;
            }
            toast({
              title:
                hint === "stale_revision"
                  ? t("sp.encomendaDet.expedirErro.stale")
                  : hint === "duplicate_note"
                    ? t("sp.encomendaDet.expedirErro.guiaRepetida")
                    : hint === "order_closed" || hint === "not_confirmed"
                      ? t("sp.encomendaDet.expedirErro.fechada")
                      : t("sp.encomendaDet.expedirErro.geral"),
              description: spErrorMessage(err, idioma),
              variant: hint === "stale_revision" ? "default" : "destructive",
            });
            // Estes mudam o que se pode expedir: fecha e relê. Validação/guia
            // repetida ficam no diálogo (mesmo requestId) para corrigir.
            if (hint === "stale_revision" || hint === "order_closed" || hint === "not_confirmed" || hint === "not_found") {
              setShipOpen(false);
              setShipRevision(null);
              void reload();
            }
          }}
        />
      )}

      {order.can_confirm && confirmSnapshot && confirmSnapshot.purchaseOrderId === order.purchase_order_id && (
        <SpConfirmOrderDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          order={order}
          revision={confirmSnapshot.revision}
          onConfirmed={(res) => {
            toast({
              title: res.already_confirmed ? t("sp.encomendaDet.confirmada.jaEstava") : t("sp.encomendaDet.confirmada.titulo"),
              description: res.promised_date
                ? t("sp.encomendaDet.confirmada.entregaPrevista", { data: formatSpDate(res.promised_date) })
                : t("sp.encomendaDet.confirmada.empresaAvisada"),
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
                  ? t("sp.encomendaDet.confirmarErro.stale")
                  : hint === "order_closed"
                    ? t("sp.encomendaDet.confirmarErro.fechada")
                    : t("sp.encomendaDet.confirmarErro.geral"),
              description: spErrorMessage(err, idioma),
              variant: hint === "stale_revision" ? "default" : "destructive",
            });
            if (hint === "stale_revision" || hint === "order_closed" || hint === "not_found") {
              if (hint === "stale_revision") setChangedWhileConfirming(true);
              setConfirmOpen(false);
              setConfirmSnapshot(null);
              void reload();
            }
          }}
        />
      )}
    </div>
  );
}
