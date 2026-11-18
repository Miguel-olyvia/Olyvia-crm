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
  const { t, idioma } = usePortalT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Revisão + conteúdo no momento em que o diálogo abriu: é esta que vai no
  // sp_confirm_order, não a da última leitura.
  const [confirmSnapshot, setConfirmSnapshot] = useState<ConfirmSnapshot | null>(null);
  const [changedWhileConfirming, setChangedWhileConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const viewedRef = useRef<string | null>(null);

  const accountId = account?.id ?? null;
  const query = useQuery({
    queryKey: [SP_ORDERS_QUERY_KEY, accountId, "detail", id],
    queryFn: () => spGetOrder(id),
    enabled: !!accountId && !!id,
    staleTime: 0,
    // Com o diálogo de confirmação aberto não se relê ao voltar à janela.
    refetchOnWindowFocus: !confirmOpen,
    retry: (count, err) => !isNoSupplierAccess(err) && !isSpNotFound(err) && count < 1,
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
          {notFound ? t("sp.encomendaDet.indisponivel.titulo") : t("sp.encomendaDet.erroAbrir")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {notFound ? t("sp.encomendaDet.indisponivel.texto") : spErrorMessage(query.error, idioma)}
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
              {t("sp.encomendaDet.voltar")}
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
  const confirmedTitle =
    [t("sp.encomendaDet.confirmada.em", { data: formatSpDateTime(pub.confirmed_at, idioma) }),
      pub.confirmed_by_name ? t("sp.encomendaDet.confirmada.por", { nome: pub.confirmed_by_name }) : ""]
      .filter(Boolean)
      .join(" ") +
    (pub.promised_date
      ? ` · ${t("sp.encomendaDet.confirmada.entrega", { data: formatSpDate(pub.promised_date, idioma) })}`
      : "");

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="h-11 -ml-2 gap-2 text-muted-foreground">
        <Link to="/supplier-portal/orders">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("sp.encomendas.titulo")}
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
            {downloading ? t("sp.encomendaDet.aGerarPdf") : t("sp.encomendaDet.descarregarPdf")}
          </Button>
          {order.can_confirm && (
            <Button className="h-11 gap-2" onClick={() => openConfirm(order)}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t("sp.encomendaDet.confirmar")}
            </Button>
          )}
        </div>
      </div>

      {changedWhileConfirming && !isConfirmed && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/30">
          <Info className="h-4 w-4 !text-amber-700 dark:!text-amber-300" />
          <AlertTitle>{t("sp.encomendaDet.alterada.titulo")}</AlertTitle>
          <AlertDescription>{t("sp.encomendaDet.alterada.aviso")}</AlertDescription>
        </Alert>
      )}

      {pub.revision > 1 && !isConfirmed && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t("sp.encomendaDet.atualizada", { versao: pub.revision, data: formatSpDateTime(pub.sent_at, idioma) })}
          </AlertDescription>
        </Alert>
      )}

      {isConfirmed && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/30">
          <CheckCircle2 className="h-4 w-4 !text-emerald-700 dark:!text-emerald-300" />
          <AlertTitle>
            {confirmedTitle}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            {pub.supplier_comment && (
              <p className="whitespace-pre-wrap">{t("sp.encomendaDet.confirmada.comentario", { texto: pub.supplier_comment })}</p>
            )}
            {pub.promised_date && pub.promised_date_accepted && <p>{t("sp.encomendaDet.confirmada.dataAceite")}</p>}
          </AlertDescription>
        </Alert>
      )}

      {!order.can_confirm && !isConfirmed && (order.order_status === "received" || order.order_status === "cancelled") && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {order.order_status === "received"
              ? t("sp.encomendaDet.jaRecebida")
              : t("sp.encomendaDet.cancelada")}
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
              <Field label={t("sp.encomendaDet.campo.dataEncomenda")}>{formatSpDate(order.order_date, idioma)}</Field>
              <Field label={t("sp.encomendaDet.campo.entregaPedida")}>{formatSpDate(order.expected_delivery, idioma)}</Field>
              <Field label={t("sp.encomendaDet.campo.enviadaEm")}>{formatSpDateTime(pub.sent_at, idioma)}</Field>
              <Field label={t("sp.encomendaDet.campo.vistaEm")}>{formatSpDateTime(pub.viewed_at, idioma)}</Field>
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
            <CardTitle className="text-base">{t("sp.encomendaDet.cartao.notas")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-foreground">{order.supplier_notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("sp.encomendaDet.linhas.titulo", { n: order.lines.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sp.encomendaDet.linhas.referencia")}</TableHead>
                  <TableHead>{t("sp.encomendaDet.linhas.descricao")}</TableHead>
                  <TableHead className="text-right">{t("sp.encomendaDet.linhas.qtd")}</TableHead>
                  <TableHead className="text-right">{t("sp.encomendaDet.linhas.precoUnit")}</TableHead>
                  <TableHead className="text-right">{t("sp.encomendaDet.linhas.iva")}</TableHead>
                  <TableHead className="text-right">{t("sp.encomendaDet.linhas.total")}</TableHead>
                  {hasReceipts && <TableHead className="text-right">{t("sp.encomendaDet.linhas.recebido")}</TableHead>}
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
                            {l.sku && (
                              <span className="block text-xs text-muted-foreground">
                                {t("sp.encomendaDet.linhas.nossaRef", { ref: l.sku })}
                              </span>
                            )}
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
                            = {formatSpQty(Number(l.quantity) * units)}{" "}
                            {l.base_uom_code || t("sp.encomendaDet.linhas.unidadeBase")}
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
              <dt className="text-muted-foreground">{t("sp.encomendaDet.totais.subtotal")}</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.subtotal, order.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("sp.encomendaDet.totais.iva")}</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.vat_total, order.currency)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>{t("sp.encomendaDet.totais.total")}</dt>
              <dd className="tabular-nums">{formatSpMoney(order.totals.total, order.currency)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {order.can_confirm && confirmSnapshot && confirmSnapshot.purchaseOrderId === order.purchase_order_id && (
        <SpConfirmOrderDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          order={order}
          revision={confirmSnapshot.revision}
          onConfirmed={(res) => {
            toast({
              title: res.already_confirmed ? t("sp.encomendaDet.resultado.jaConfirmada") : t("sp.encomendaDet.resultado.confirmada"),
              description: res.promised_date
                ? t("sp.encomendaDet.resultado.entrega", { data: formatSpDate(res.promised_date, idioma) })
                : t("sp.encomendaDet.resultado.avisada"),
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
                  ? t("sp.encomendaDet.erro.atualizadaPelaEmpresa")
                  : hint === "order_closed"
                    ? t("sp.encomendaDet.erro.fechada")
                    : t("sp.encomendaDet.erro.falhou"),
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
