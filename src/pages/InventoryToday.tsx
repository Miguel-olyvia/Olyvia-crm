import { useContext, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeftRight, ArrowRight, Sparkles, Truck, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import StockMovementDialog from "@/components/inventory/StockMovementDialog";
import {
  DocumentLink,
  InventoryPageHeader,
  InventoryStatusBadge,
  FlowCounterButton,
  WorkQueueCard,
  clientOrdersLink,
  movementTypeLabel,
  movementTypeTone,
  purchaseOrdersLink,
  receivingLink,
  signedMovementQty,
  stockCountsLink,
  stockMovementsLink,
  stocksLink,
  toneBorder,
  toneBorderMuted,
  toneText,
  usePermissionGate,
} from "@/components/inventory/ui";
import {
  useInventoryToday,
  getInventoryQueueItems,
  getReceiveTarget,
  getReceivingQueueItem,
  getReceivingSummary,
  inventoryTodayQueryKey,
  type InventoryQueueItem,
  type InventoryTodayPayload,
} from "@/hooks/useInventoryToday";
import { useReceivablePos } from "@/components/receiving/useReceivablePos";
import { todayIsoLocal } from "@/components/purchase-orders/poListUtils";
import { useMovementDocumentLinks, type MovementDocumentLinks } from "@/hooks/useMovementDocumentLinks";
import { cn } from "@/lib/utils";
import { TRIGGER_LABEL, normalizeStockDeductionTrigger } from "@/components/inventory/InventorySettingsCard";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";
import { botaoPrincipal } from "@/pages/inventario-novo/contasComando";
import { INVENTARIO_NOVO_ATIVO } from "@/pages/inventario-novo/separadores";

// "Hoje" do Inventário, como o Hoje do 2.0 (HojeInv.tsx): o fluxo em cinco
// passos (venda assinada → encomenda cliente → Sim/Não: stock ou PO → receção
// → stock), a fila de trabalho e os últimos movimentos.
// Os números do fluxo e da fila vêm de rpc_inventory_today; sem a RPC (ou com
// um campo a null) o elemento correspondente fica escondido. O cartão
// "Encomendas por receber no armazém" e o destino de "Receber no armazém →"
// vêm das POs da Receção (useReceivablePos). Cabeçalho e últimos movimentos
// não dependem da RPC.
// Dentro do novo Inventário (InventarioEmbebido) mostra a versão compacta do artefacto aprovado (FluxoCompacto +
// MovimentoCartao); fora dele, este ecrã fica exatamente como era.

const formatQty = (value: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(value);
const formatEur = (value: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

interface RecentMovement {
  id: string;
  movement_type: string;
  quantity: number;
  created_at: string;
  warehouse_id: string;
  document_number: string;
  document_type: string | null;
  reference_id: string | null;
  sale_source_type: string | null;
  sale_source_id: string | null;
  products?: { name: string; sku: string | null } | null;
  warehouses?: { name: string } | null;
}

interface DocumentAccess {
  po: boolean;
  clientOrder: boolean;
  proposal: boolean;
  count: boolean;
}

/**
 * Nº do documento do movimento como ligação — as mesmas regras do livro de
 * Movimentos: PO pelo nº, EC/proposta pela origem da venda, contagem pela linha
 * do ajuste, transferência → livro filtrado pelo nº (as duas pernas). Sem
 * permissão ou sem registo de origem fica em texto.
 */
function MovementDocument({ m, links, can }: { m: RecentMovement; links: MovementDocumentLinks; can: DocumentAccess }) {
  const doc = m.document_number;
  if (!doc) return null;
  const type = m.document_type;
  let to: string | undefined;
  if (type === "compra" && can.po) {
    const poId = links.poByNumber[doc];
    if (poId) to = purchaseOrdersLink({ open: poId });
  } else if (type === "venda" && m.sale_source_id) {
    if (m.sale_source_type === "contract" && can.clientOrder) to = clientOrdersLink({ open: m.sale_source_id });
    else if (m.sale_source_type === "proposal" && can.proposal) to = `/proposals?open=${encodeURIComponent(m.sale_source_id)}`;
  } else if (type === "ajuste" && m.reference_id && can.count) {
    const count = links.countByLineId[m.reference_id];
    if (count) to = stockCountsLink({ open: count.countId });
  } else if (type === "transferencia") {
    to = stockMovementsLink({ doc });
  }
  return (
    <DocumentLink to={to} title={to ? `Abrir ${doc}` : undefined} className="text-xs">
      {doc}
    </DocumentLink>
  );
}

/** Uma etapa do fluxo: número, título e conteúdo. */
function Stage({
  n,
  title,
  children,
  className,
  branch,
}: {
  n?: number;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  /** Ramo do garfo (Há stock / Falta): contorno tracejado sobre o fundo da página, como o .branch do mockup. */
  branch?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-4",
        branch ? "border-dashed bg-background" : "bg-card shadow-sm",
        className,
      )}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {n ? (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground" aria-hidden="true">
            {n}
          </span>
        ) : null}
        {title}
      </h3>
      {children}
    </div>
  );
}

/** Número de etapa dentro de um passo do ramo (3 = PO, 4 = Receção, como no 2.0). */
const StepNo = ({ n }: { n: number }) => (
  <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-primary text-[10px] text-primary-foreground" aria-hidden="true">
    {n}
  </span>
);

/** Passo do ramo (Reserva → Saída…): texto e, se houver número, ligação. */
function Step({
  n,
  label,
  value,
  suffix,
  onClick,
}: {
  n?: number;
  label: string;
  value?: number | null;
  suffix?: string;
  onClick?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs">
      {n ? <StepNo n={n} /> : null}
      {label}
      {isNum(value) ? (
        onClick ? (
          <button type="button" onClick={onClick} className="font-bold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            {formatQty(value)}{suffix ? ` ${suffix}` : ""}
          </button>
        ) : (
          <b>{formatQty(value)}{suffix ? ` ${suffix}` : ""}</b>
        )
      ) : null}
    </span>
  );
}

const StepArrow = () => <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;

function FlowSection({ data }: { data: InventoryTodayPayload }) {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEc = hasPermission("client_orders.view");
  const canPo = hasPermission("purchase_orders.view");
  const canRec = hasPermission("receiving.view");
  const canStock = hasPermission("inventory.view");
  const go = (to: string) => () => navigate(to);

  const co = data.client_orders;
  const po = data.purchases;
  const st = data.stock;
  const cnt = data.counts;
  const origin = co?.by_origin ?? null;
  const trigger = data.settings?.stock_deduction_trigger ?? null;

  const salesStage = canEc && origin && [origin.contract, origin.direct_sale, origin.manual].some(isNum);
  const ecStage = canEc && co && [co.open, co.ready_to_ship, co.without_preferred_supplier].some(isNum);
  const stockBranch = isNum(st?.reserved_units) || (canEc && isNum(co?.ready_to_ship));
  const poBranch = (canPo && po && [po.pending_approval, po.portal_unseen, po.portal_confirmed, po.late].some(isNum))
    || (canRec && isNum(po?.open_delivery_notes));
  // Cartões da etapa Stock: cada um some com o bloco/campo a null. "Valor em
  // stock" com o bloco stock presente mas value a null = sem products.view_cost
  // (única razão na RPC): mostra "—", como o 2.0 sem permissão de preços.
  const showValue = !!st;
  const stockCards = [isNum(st?.below_reorder_point), isNum(cnt?.in_progress), showValue].filter(Boolean).length;
  const stockStage = stockCards > 0;

  if (!salesStage && !ecStage && !stockBranch && !poBranch && !stockStage) return null;

  return (
    <section aria-labelledby="inv-flow" className="space-y-3">
      <h2 id="inv-flow" className="text-base font-semibold">Fluxo</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {salesStage ? (
          <Stage n={1} title="Vendas assinadas">
            {isNum(origin?.contract) ? <FlowCounterButton label="Contratos" value={origin.contract} onClick={go(clientOrdersLink({ origin: "contract" }))} /> : null}
            {isNum(origin?.direct_sale) ? <FlowCounterButton label="Vendas diretas" value={origin.direct_sale} onClick={go(clientOrdersLink({ origin: "direct_sale" }))} /> : null}
            {isNum(origin?.manual) ? <FlowCounterButton label="Encomendas manuais" value={origin.manual} onClick={go(clientOrdersLink({ origin: "manual" }))} /> : null}
            {trigger ? (
              <p className="text-xs text-muted-foreground">
                {/* 29/10: o mesmo rótulo das definições ('manual' aparecia como "contrato assinado") */}
                Baixa de stock por venda: <b>{TRIGGER_LABEL[normalizeStockDeductionTrigger(trigger)]}</b>.
              </p>
            ) : null}
          </Stage>
        ) : null}
        {ecStage ? (
          <Stage n={2} title="Encomendas Clientes">
            {isNum(co?.open) ? <FlowCounterButton label="Em aberto" value={co.open} onClick={go(clientOrdersLink())} /> : null}
            {isNum(co?.ready_to_ship) ? <FlowCounterButton label="Prontas a expedir" value={co.ready_to_ship} tone="ok" onClick={go(clientOrdersLink({ ready: true }))} /> : null}
            {isNum(co?.without_preferred_supplier) ? (
              <FlowCounterButton label="Sem fornecedor" value={co.without_preferred_supplier} tone="bad" onClick={go(clientOrdersLink({ status: "sem_fornecedor" }))} />
            ) : null}
            <p className="text-xs text-muted-foreground">Cada linha: há stock livre (stock − reservas anteriores)?</p>
          </Stage>
        ) : null}
      </div>

      {stockBranch || poBranch ? (
        <>
          <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="grid gap-3 lg:grid-cols-2">
            {stockBranch ? (
              <Stage branch title={<><InventoryStatusBadge tone="ok">Sim</InventoryStatusBadge> Há stock → serve do stock</>}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Step label="Reserva FIFO" value={st?.reserved_units} suffix="un" onClick={canStock ? go(stocksLink()) : undefined} />
                  <StepArrow />
                  <Step
                    label="Saída"
                    value={canEc ? co?.ready_to_ship : null}
                    suffix="EC"
                    onClick={canEc ? go(clientOrdersLink({ ready: true })) : undefined}
                  />
                  <StepArrow />
                  <Step label="Encomenda servida" />
                </div>
              </Stage>
            ) : null}
            {poBranch ? (
              <Stage branch title={<><InventoryStatusBadge tone="warn">Não</InventoryStatusBadge> Falta → encomenda ao fornecedor preferencial</>}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {canPo && isNum(po?.pending_approval) ? (
                    <><Step n={3} label="PO" value={po.pending_approval} suffix="por aprovar" onClick={go(purchaseOrdersLink({ status: "pending" }))} /><StepArrow /></>
                  ) : null}
                  {/* "Por ver" e "confirmou" abrem ambos ?status=portal: o filtro
                      das POs (PO_STATUS_FILTERS / parsePurchaseOrdersParams)
                      só conhece "publicada no portal", sem sub-estado. */}
                  {canPo && isNum(po?.portal_unseen) ? (
                    <><Step label="Publicada no portal" value={po.portal_unseen} suffix="por ver" onClick={go(purchaseOrdersLink({ status: "portal" }))} /><StepArrow /></>
                  ) : null}
                  {canPo && isNum(po?.portal_confirmed) ? (
                    <><Step label="Fornecedor confirma" value={po.portal_confirmed} onClick={go(purchaseOrdersLink({ status: "portal" }))} /><StepArrow /></>
                  ) : null}
                  {canRec && isNum(po?.open_delivery_notes) ? (
                    <><Step n={4} label="Receção" value={po.open_delivery_notes} suffix="guias abertas" onClick={go(receivingLink({ notes: "open" }))} /><StepArrow /></>
                  ) : null}
                  <Step label="Serve a EC" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {canPo && isNum(po?.late) && po.late > 0 ? (
                    <Button variant="outline" size="sm" onClick={go(purchaseOrdersLink({ status: "late" }))}>
                      <InventoryStatusBadge tone="bad">{po.late} atrasada{po.late === 1 ? "" : "s"}</InventoryStatusBadge>
                    </Button>
                  ) : null}
                  {canRec ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={receivingLink()}><Truck className="mr-1 h-3.5 w-3.5" /> Receber</Link>
                    </Button>
                  ) : null}
                </div>
              </Stage>
            ) : null}
          </div>
        </>
      ) : null}

      {stockStage ? (
        <Stage n={5} title="Stock">
          <div className={cn("grid gap-2 sm:grid-cols-2", stockCards >= 3 ? "lg:grid-cols-3" : null)}>
            {isNum(st?.below_reorder_point) ? (
              <FlowCounterButton label="Abaixo do ponto de encomenda" value={st.below_reorder_point} tone="warn" onClick={go(stocksLink({ status: "low" }))} />
            ) : null}
            {isNum(cnt?.in_progress) ? (
              <FlowCounterButton label="Contagens em curso" value={cnt.in_progress} onClick={go(stockCountsLink({ status: "em_contagem" }))} />
            ) : null}
            {showValue ? (
              <FlowCounterButton
                label="Valor em stock (custo médio)"
                value={isNum(st?.value) ? formatEur(st.value) : "—"}
                onClick={canStock ? go(stocksLink()) : undefined}
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            A receção fecha o ciclo: a parte “para EC” fica reservada e serve a encomenda; a parte “para stock” entra livre e atualiza o custo médio ponderado.
          </p>
        </Stage>
      ) : null}
    </section>
  );
}

/**
 * Cartão "Encomendas por receber no armazém": o WorkQueueCard com o destaque
 * das já expedidas pelo fornecedor no portal (só este cartão o tem).
 */
function ReceivingQueueCard({ item, onClick }: { item: InventoryQueueItem & { shipped: number }; onClick: () => void }) {
  const zero = item.value === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border border-l-4 bg-card p-4 text-left shadow-sm transition-colors hover:border-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        zero ? toneBorderMuted[item.tone] : toneBorder[item.tone],
      )}
    >
      <span className={cn("min-w-[2.5rem] text-2xl font-bold tabular-nums leading-none", zero ? "text-muted-foreground" : "text-foreground")}>
        {item.value}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className={cn("font-semibold leading-snug", zero && "text-muted-foreground")}>{item.title}</span>
        <span className="text-xs text-muted-foreground">{item.description}</span>
        {item.shipped > 0 ? (
          <span>
            <InventoryStatusBadge tone="violet">
              <Truck className="mr-1 inline h-3 w-3" aria-hidden="true" />
              {item.shipped === 1 ? "1 expedida pelo fornecedor" : `${item.shipped} expedidas pelo fornecedor`}
            </InventoryStatusBadge>
          </span>
        ) : null}
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
          {zero ? "Nada pendente" : "Abrir lista"}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

/* ==================================================================================================================
 * Dentro do novo Inventário (InventarioEmbebido = true): a versão compacta do artefacto aprovado
 * (vault/inventario-redesenho-completo.html, V.hoje + movCard). Os MESMOS dados, regras de permissão e ligações do
 * FlowSection e da lista de movimentos de cima; só a apresentação muda. Fora da moldura nada disto é usado.
 * ================================================================================================================== */

/** O .sect do artefacto: sobretítulo pequeno em maiúsculas, com ações à direita. */
function Seccao({ id, titulo, acoes }: { id: string; titulo: string; acoes?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
      <h2 id={id} className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{titulo}</h2>
      {acoes ? <div className="flex flex-wrap items-center gap-1">{acoes}</div> : null}
    </div>
  );
}

const SOBRE_TOM = {
  primary: "text-primary",
  ok: "text-success",
  warn: "text-amber-700 dark:text-amber-300",
} as const;

/**
 * Um cartão do "Fluxo de hoje" (o .card do artefacto, rounded-[20px]). Com `to`, o sobretítulo é a ligação e cobre o
 * cartão todo (o cartão inteiro leva à lista); os números lá dentro ficam por cima e continuam a abrir a lista filtrada.
 */
function CartaoFluxo({
  sobre,
  tom = "primary",
  to,
  marca,
  children,
}: {
  sobre: string;
  tom?: keyof typeof SOBRE_TOM;
  to?: string;
  /** Pílula antes do sobretítulo (Sim / Não do garfo). */
  marca?: ReactNode;
  children: ReactNode;
}) {
  const cls = cn("text-xs font-bold uppercase tracking-[0.16em]", SOBRE_TOM[tom]);
  return (
    <article
      aria-label={sobre}
      className={cn(
        "relative flex flex-col gap-2.5 rounded-[20px] border border-border bg-card px-4 py-[15px] shadow-sm",
        to && "transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary focus-within:border-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      <h3 className="flex flex-wrap items-center gap-1.5">
        {marca}
        {to ? (
          <Link
            to={to}
            className={cn(cls, "rounded-sm after:absolute after:inset-0 after:rounded-[20px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary")}
          >
            {sobre}
          </Link>
        ) : (
          <span className={cls}>{sobre}</span>
        )}
      </h3>
      {children}
    </article>
  );
}

/** Um número do cartão: com destino é um botão (por cima da ligação do cartão), sem destino só o número a negrito. */
function NumFluxo({
  rotulo,
  valor,
  onClick,
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const cls = cn("font-bold tabular-nums text-foreground", className);
  if (!onClick) return <b className={cls}>{valor}</b>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${rotulo}: ${typeof valor === "number" ? formatQty(valor) : valor}`}
      className={cn(
        cls,
        "relative z-10 rounded underline decoration-dotted underline-offset-[3px] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      {typeof valor === "number" ? formatQty(valor) : valor}
    </button>
  );
}

const Seta = () => <span aria-hidden="true" className="text-muted-foreground"> → </span>;
const Ponto = () => <span aria-hidden="true"> · </span>;

/** Junta as partes com " · " (só as que existem). */
function comPontos(partes: ReactNode[]): ReactNode[] {
  return partes.filter(Boolean).flatMap((p, i) => (i === 0 ? [p] : [<Ponto key={`p${i}`} />, p]));
}

/** O "Fluxo de hoje": os 5 cartões do artefacto, com os números, ligações e frases do FlowSection. */
function FluxoCompacto({ data }: { data: InventoryTodayPayload }) {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEc = hasPermission("client_orders.view");
  const canPo = hasPermission("purchase_orders.view");
  const canRec = hasPermission("receiving.view");
  const canStock = hasPermission("inventory.view");
  const go = (to: string) => () => navigate(to);

  // As mesmas condições do FlowSection (cada cartão some como a etapa correspondente).
  const co = data.client_orders;
  const po = data.purchases;
  const st = data.stock;
  const cnt = data.counts;
  const origin = co?.by_origin ?? null;
  const trigger = data.settings?.stock_deduction_trigger ?? null;
  const salesStage = canEc && origin && [origin.contract, origin.direct_sale, origin.manual].some(isNum);
  const ecStage = canEc && co && [co.open, co.ready_to_ship, co.without_preferred_supplier].some(isNum);
  const stockBranch = isNum(st?.reserved_units) || (canEc && isNum(co?.ready_to_ship));
  const poBranch = (canPo && po && [po.pending_approval, po.portal_unseen, po.portal_confirmed, po.late].some(isNum))
    || (canRec && isNum(po?.open_delivery_notes));
  const showValue = !!st;
  const stockStage = isNum(st?.below_reorder_point) || isNum(cnt?.in_progress) || showValue;
  if (!salesStage && !ecStage && !stockBranch && !poBranch && !stockStage) return null;

  const linha = "text-[13px] leading-relaxed text-muted-foreground";
  const nota = "text-xs text-muted-foreground";

  return (
    <section aria-labelledby="inv-flow-hoje">
      <Seccao id="inv-flow-hoje" titulo="Fluxo de hoje" />
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        {salesStage ? (
          <CartaoFluxo sobre="1 · Vendas assinadas">
            <p className={linha}>
              {comPontos([
                isNum(origin?.contract) ? <span key="c">Contratos <NumFluxo rotulo="Contratos" valor={origin.contract} onClick={go(clientOrdersLink({ origin: "contract" }))} /></span> : null,
                isNum(origin?.direct_sale) ? <span key="d">Vendas diretas <NumFluxo rotulo="Vendas diretas" valor={origin.direct_sale} onClick={go(clientOrdersLink({ origin: "direct_sale" }))} /></span> : null,
                isNum(origin?.manual) ? <span key="m" title="Encomendas manuais">Manuais <NumFluxo rotulo="Encomendas manuais" valor={origin.manual} onClick={go(clientOrdersLink({ origin: "manual" }))} /></span> : null,
              ])}
            </p>
            {trigger ? (
              <p className={linha}>
                Baixa de stock por venda: <b className="text-foreground">{TRIGGER_LABEL[normalizeStockDeductionTrigger(trigger)]}</b>
              </p>
            ) : null}
          </CartaoFluxo>
        ) : null}

        {ecStage ? (
          <CartaoFluxo sobre="2 · Encomendas Clientes" to={clientOrdersLink()}>
            <p className={linha}>
              {comPontos([
                isNum(co?.open) ? <span key="o">Em aberto <NumFluxo rotulo="Em aberto" valor={co.open} onClick={go(clientOrdersLink())} /></span> : null,
                isNum(co?.ready_to_ship) ? <span key="r">Prontas a expedir <NumFluxo rotulo="Prontas a expedir" valor={co.ready_to_ship} className="text-success" onClick={go(clientOrdersLink({ ready: true }))} /></span> : null,
                isNum(co?.without_preferred_supplier) ? (
                  <span key="s">Sem fornecedor <NumFluxo rotulo="Sem fornecedor" valor={co.without_preferred_supplier} className={co.without_preferred_supplier > 0 ? "text-destructive" : undefined} onClick={go(clientOrdersLink({ status: "sem_fornecedor" }))} /></span>
                ) : null,
              ])}
            </p>
            <p className={nota}>Cada linha: há stock livre (stock − reservas anteriores)?</p>
          </CartaoFluxo>
        ) : null}

        {stockBranch ? (
          <CartaoFluxo sobre="Há stock → serve do stock" tom="ok" marca={<InventoryStatusBadge tone="ok">Sim</InventoryStatusBadge>}>
            <p className={linha}>
              Reserva FIFO{" "}
              {isNum(st?.reserved_units) ? (
                <NumFluxo rotulo="Reserva FIFO (un)" valor={`${formatQty(st.reserved_units)} un`} onClick={canStock ? go(stocksLink()) : undefined} />
              ) : null}
              <Seta />
              Saída{" "}
              {canEc && isNum(co?.ready_to_ship) ? (
                <NumFluxo rotulo="Saída (EC)" valor={`${formatQty(co.ready_to_ship)} EC`} onClick={go(clientOrdersLink({ ready: true }))} />
              ) : "(EC)"}
              <Seta />
              Encomenda servida
            </p>
          </CartaoFluxo>
        ) : null}

        {poBranch ? (
          <CartaoFluxo
            sobre="Falta → encomenda ao fornecedor preferencial"
            tom="warn"
            marca={<InventoryStatusBadge tone="warn">Não</InventoryStatusBadge>}
            to={canPo ? purchaseOrdersLink() : undefined}
          >
            <p className={linha}>
              {canPo && isNum(po?.pending_approval) ? (
                <>3 PO <NumFluxo rotulo="PO por aprovar" valor={po.pending_approval} onClick={go(purchaseOrdersLink({ status: "pending" }))} /> por aprovar<Seta /></>
              ) : null}
              {/* "Por ver" e "confirmou" abrem ambos ?status=portal (o filtro das POs não tem sub-estado). */}
              {canPo && isNum(po?.portal_unseen) ? (
                <><span title="Publicada no portal">Portal</span> <NumFluxo rotulo="Publicada no portal, por ver" valor={po.portal_unseen} onClick={go(purchaseOrdersLink({ status: "portal" }))} /> por ver<Seta /></>
              ) : null}
              {canPo && isNum(po?.portal_confirmed) ? (
                <>Fornecedor confirma <NumFluxo rotulo="Fornecedor confirma" valor={po.portal_confirmed} onClick={go(purchaseOrdersLink({ status: "portal" }))} /><Seta /></>
              ) : null}
              {canRec && isNum(po?.open_delivery_notes) ? (
                <>4 Receção <NumFluxo rotulo="Receção, guias abertas" valor={po.open_delivery_notes} onClick={go(receivingLink({ notes: "open" }))} /> {po.open_delivery_notes === 1 ? "guia aberta" : "guias abertas"}<Seta /></>
              ) : null}
              Serve a EC
            </p>
            {(canPo && isNum(po?.late) && po.late > 0) || canRec ? (
              <div className="relative z-10 flex flex-wrap items-center gap-2">
                {canPo && isNum(po?.late) && po.late > 0 ? (
                  <button
                    type="button"
                    onClick={go(purchaseOrdersLink({ status: "late" }))}
                    className="inline-flex min-h-6 items-center rounded-full bg-destructive/10 px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {po.late} atrasada{po.late === 1 ? "" : "s"}
                  </button>
                ) : null}
                {canRec ? (
                  <Link
                    to={receivingLink()}
                    className="inline-flex min-h-6 items-center gap-1 rounded-full px-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Receber
                  </Link>
                ) : null}
              </div>
            ) : null}
          </CartaoFluxo>
        ) : null}

        {stockStage ? (
          <CartaoFluxo sobre="5 · Stock" to={canStock ? stocksLink() : undefined}>
            <p className={linha}>
              {comPontos([
                isNum(st?.below_reorder_point) ? (
                  <span key="b" title="Abaixo do ponto de encomenda">Abaixo do ponto <NumFluxo rotulo="Abaixo do ponto de encomenda" valor={st.below_reorder_point} className={st.below_reorder_point > 0 ? "text-amber-700 dark:text-amber-300" : undefined} onClick={go(stocksLink({ status: "low" }))} /></span>
                ) : null,
                isNum(cnt?.in_progress) ? <span key="c">Contagens em curso <NumFluxo rotulo="Contagens em curso" valor={cnt.in_progress} onClick={go(stockCountsLink({ status: "em_contagem" }))} /></span> : null,
                showValue ? (
                  <span key="v" title="Valor em stock (custo médio)">Valor (custo médio) <NumFluxo rotulo="Valor em stock (custo médio)" valor={isNum(st?.value) ? formatEur(st.value) : "—"} onClick={canStock ? go(stocksLink()) : undefined} /></span>
                ) : null,
              ])}
            </p>
            <p className={nota}>
              A receção fecha o ciclo: a parte “para EC” fica reservada e serve a encomenda; a parte “para stock” entra livre e atualiza o custo médio ponderado.
            </p>
          </CartaoFluxo>
        ) : null}
      </div>
    </section>
  );
}

/** A frase do movimento (o movSay do artefacto), só com o que a lista já lê: tipo, quantidade e produto. */
const FRASE: Record<string, [string, string]> = {
  entrada: ["Entrou", "Entraram"],
  estorno_venda: ["Voltou por estorno de venda", "Voltaram por estorno de venda"],
  transferencia_entrada: ["Chegou por transferência", "Chegaram por transferência"],
  ajuste_positivo: ["Acertou-se para mais", "Acertaram-se para mais"],
  saida: ["Saiu", "Saíram"],
  venda: ["Saiu por venda", "Saíram por venda"],
  transferencia_saida: ["Saiu por transferência", "Saíram por transferência"],
  ajuste_negativo: ["Acertou-se para menos", "Acertaram-se para menos"],
  devolucao_fornecedor: ["Devolveu-se ao fornecedor", "Devolveram-se ao fornecedor"],
  quebra: ["Partiu-se", "Partiram-se"],
};

/** Um movimento em cartão (o movCard do artefacto). */
function MovimentoCartao({
  m,
  armazem,
  links,
  can,
}: {
  m: RecentMovement;
  armazem: string;
  links: MovementDocumentLinks;
  can: DocumentAccess;
}) {
  const qty = signedMovementQty(m.movement_type, m.quantity);
  const abs = Math.abs(qty);
  const verbo = FRASE[m.movement_type]?.[abs === 1 ? 0 : 1] ?? movementTypeLabel(m.movement_type);
  return (
    <li className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-card px-4 py-[15px] shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] text-muted-foreground">{formatDateTime(m.created_at)} · {armazem}</span>
        <span className={cn("whitespace-nowrap text-[1.1rem] font-extrabold tabular-nums", qty > 0 ? "text-success" : "text-foreground")}>
          {qty > 0 ? "+" : "−"}{formatQty(abs)}
        </span>
      </div>
      <p className="text-sm">
        {verbo} <b className="tabular-nums">{formatQty(abs)}</b> de {m.products?.name ?? "—"}
      </p>
      <p className="font-mono text-[12.5px] text-muted-foreground">
        {movementTypeLabel(m.movement_type)}
        {m.document_number ? <> · <MovementDocument m={m} links={links} can={can} /></> : null}
      </p>
    </li>
  );
}

const InventoryToday = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  // Dentro do novo Inventário (src/pages/inventario-novo) não se mostra o convite para o abrir.
  const embebido = useContext(InventarioEmbebido);

  const { data: today } = useInventoryToday();
  const queue = getInventoryQueueItems(today, hasPermission);

  // POs por receber (as mesmas da Receção › Por receber; a RLS exige
  // purchase_orders.view). Sem permissão ou com erro: cartão escondido e
  // "Receber no armazém →" abre a lista.
  const canReceivable = hasPermission("purchase_orders.view") && hasPermission("receiving.view");
  const receivable = useReceivablePos(orgId, canReceivable);
  const receivingSummary = canReceivable && receivable.data ? getReceivingSummary(receivable.data, todayIsoLocal()) : null;
  const receivingItem = getReceivingQueueItem(receivingSummary, hasPermission);
  const receiveTo = getReceiveTarget(receivingSummary);

  // Armazéns da organização ativa — só para o diálogo de movimento.
  const { data: warehouses = [] } = useQuery({
    queryKey: ["inventory-today-warehouses", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", orgId as string)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // Últimos 6 movimentos da organização ativa (filtro obrigatório: a RLS
  // deixa ver outras organizações visíveis).
  const recent = useQuery({
    queryKey: ["inventory-today-recent-movements", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, movement_type, quantity, created_at, warehouse_id, document_number, document_type, reference_id, sale_source_type, sale_source_id, products(name, sku), warehouses(name)",
        )
        .eq("organization_id", orgId as string)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data || []) as unknown as RecentMovement[];
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });

  // Documento de cada movimento como ligação (mesmo hook e permissões do livro).
  const gate = usePermissionGate();
  const docAccess: DocumentAccess = {
    po: gate("purchase_orders.view").allowed,
    clientOrder: gate("client_orders.view").allowed,
    proposal: gate("proposals.view").allowed,
    count: gate("inventory.view").allowed,
  };
  const { links: docLinks } = useMovementDocumentLinks(recent.data ?? [], orgId, {
    purchaseOrders: docAccess.po,
    counts: docAccess.count,
    deliveryNotes: false,
  });

  if (companyLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <OlyviaLoader size={40} />
      </div>
    );
  }

  if (!activeCompany) {
    return (
      <div className="space-y-6 p-6">
        <InventoryPageHeader title={t("sidebar.inventoryToday")} />
        <NoOrganizationState inline />
      </div>
    );
  }

  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name;

  const movementDialog = (
    <StockMovementDialog
      open={movementDialogOpen}
      onOpenChange={setMovementDialogOpen}
      organizationId={activeCompany.id}
      warehouses={warehouses}
      onSuccess={() => {
        void recent.refetch();
        void queryClient.invalidateQueries({ queryKey: inventoryTodayQueryKey(activeCompany.id) });
        if (canReceivable) void receivable.refetch();
      }}
    />
  );

  if (embebido) {
    // Dentro da moldura do novo Inventário: sem cabeçalho (a moldura tem o título e o botão principal) e sem a Fila de
    // trabalho (é o «Precisa de ti» do Comando, com todos os itens). O «Registar movimento» só fica aqui quando o botão
    // principal da moldura não o é (a mesma conta: botaoPrincipal), para estar sempre à mão sem se repetir.
    const principalEMovimento =
      botaoPrincipal(today, canReceivable ? (receivable.data ?? null) : null, todayIsoLocal(), hasPermission).tipo === "movimento";
    const lk =
      "inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
    return (
      <>
        <div className="space-y-6">
          {today ? <FluxoCompacto data={today} /> : null}

          <section aria-labelledby="inv-recent">
            <Seccao
              id="inv-recent"
              titulo="Últimos movimentos"
              acoes={
                <>
                  <PermissionGate permission="receiving.view">
                    <Link to={receiveTo} className={lk}>
                      <Warehouse className="h-4 w-4" aria-hidden="true" /> Receber no armazém →
                    </Link>
                  </PermissionGate>
                  {!principalEMovimento ? (
                    <PermissionGate permission="inventory.edit">
                      <button type="button" className={lk} onClick={() => setMovementDialogOpen(true)}>
                        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /> Registar movimento
                      </button>
                    </PermissionGate>
                  ) : null}
                </>
              }
            />
            {recent.isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            ) : recent.error ? (
              <p className={cn("text-sm", toneText.bad)}>Não foi possível carregar os movimentos.</p>
            ) : (recent.data ?? []).length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground">Sem movimentos.</p>
            ) : (
              <ul aria-label="Últimos movimentos" className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {(recent.data ?? []).map((m) => (
                  <MovimentoCartao
                    key={m.id}
                    m={m}
                    armazem={m.warehouses?.name ?? warehouseName(m.warehouse_id) ?? "—"}
                    links={docLinks}
                    can={docAccess}
                  />
                ))}
              </ul>
            )}
            <Link to={stockMovementsLink()} className={cn(lk, "mt-2 px-0.5")}>
              Ver livro completo
            </Link>
          </section>
        </div>
        {movementDialog}
      </>
    );
  }

  return (
    <>
      <div className="space-y-8">
        <InventoryPageHeader
          title={t("sidebar.inventoryToday")}
          description={t("inventory.today.description")}
          actions={
            <>
              {/* Com o novo Inventário ligado as rotas clássicas já levam lá: o convite deixa de fazer sentido. */}
              {!embebido && !INVENTARIO_NOVO_ATIVO ? (
                <Button variant="outline" asChild>
                  <Link to="/inventory/novo"><Sparkles className="mr-2 h-4 w-4" /> Experimentar o novo Inventário</Link>
                </Button>
              ) : null}
              <PermissionGate permission="inventory.edit">
                <Button variant="outline" onClick={() => setMovementDialogOpen(true)}>
                  <ArrowLeftRight className="mr-2 h-4 w-4" /> Registar movimento
                </Button>
              </PermissionGate>
              <PermissionGate permission="receiving.view">
                <Button variant="outline" asChild>
                  <Link to={receiveTo}><Warehouse className="mr-2 h-4 w-4" /> Receber no armazém →</Link>
                </Button>
              </PermissionGate>
            </>
          }
        />

        {today ? <FlowSection data={today} /> : null}

        {receivingItem || queue.length > 0 ? (
          <section aria-labelledby="inv-queue" className="space-y-3">
            <h2 id="inv-queue" className="text-base font-semibold">Fila de trabalho</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {receivingItem ? <ReceivingQueueCard item={receivingItem} onClick={() => navigate(receivingItem.to)} /> : null}
              {queue.map((item) => (
                <WorkQueueCard
                  key={item.key}
                  value={item.value}
                  title={item.title}
                  description={item.description}
                  tone={item.tone}
                  onClick={() => navigate(item.to)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="inv-recent" className="space-y-3 rounded-lg border bg-card p-4 shadow-sm lg:max-w-3xl">
          <div className="flex items-center justify-between gap-2">
            <h2 id="inv-recent" className="text-base font-semibold">Últimos movimentos</h2>
            <Button variant="outline" size="sm" asChild>
              <Link to={stockMovementsLink()}>Ver livro completo</Link>
            </Button>
          </div>
          {recent.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : recent.error ? (
            <p className={cn("text-sm", toneText.bad)}>Não foi possível carregar os movimentos.</p>
          ) : (recent.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentos.</p>
          ) : (
            <ul className="divide-y">
              {(recent.data ?? []).map((m) => {
                const qty = signedMovementQty(m.movement_type, m.quantity);
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <InventoryStatusBadge tone={movementTypeTone(m.movement_type)}>{movementTypeLabel(m.movement_type)}</InventoryStatusBadge>
                    <span className="min-w-0 flex-1">
                      <b className="tabular-nums">
                        {qty > 0 ? "+" : "−"}{formatQty(Math.abs(qty))}
                      </b>{" "}
                      {m.products?.name ?? "—"} · {m.warehouses?.name ?? warehouseName(m.warehouse_id) ?? "—"}
                    </span>
                    <MovementDocument m={m} links={docLinks} can={docAccess} />
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <StockMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        organizationId={activeCompany.id}
        warehouses={warehouses}
        onSuccess={() => {
          void recent.refetch();
          void queryClient.invalidateQueries({ queryKey: inventoryTodayQueryKey(activeCompany.id) });
          if (canReceivable) void receivable.refetch();
        }}
      />
    </>
  );
};

export default InventoryToday;
