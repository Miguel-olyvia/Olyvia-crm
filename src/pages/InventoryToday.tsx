import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeftRight, ArrowRight, Truck } from "lucide-react";
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
  InventoryPageHeader,
  InventoryStatusBadge,
  FlowCounterButton,
  WorkQueueCard,
  movementTypeLabel,
  movementTypeTone,
  signedMovementQty,
  toneText,
} from "@/components/inventory/ui";
import {
  useInventoryToday,
  getInventoryQueueItems,
  inventoryTodayQueryKey,
  type InventoryTodayPayload,
} from "@/hooks/useInventoryToday";
import { cn } from "@/lib/utils";

// "Hoje" do Inventário: o que precisa de ação, pela ordem do fluxo
// (venda assinada → encomenda cliente → stock ou PO → receção → stock).
// Os números vêm todos de rpc_inventory_today; sem a RPC (ou com um campo a
// null) o elemento correspondente fica escondido. Cabeçalho, ações e os
// últimos movimentos não dependem dela.

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
  products?: { name: string; sku: string | null } | null;
  warehouses?: { name: string } | null;
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
  title: string;
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

/** Passo do ramo (Reserva → Saída…): texto e, se houver número, ligação. */
function Step({ label, value, suffix, onClick }: { label: string; value?: number | null; suffix?: string; onClick?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs">
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
  // Cartões da etapa Stock: cada um some com o valor a null (ex.: "Valor em
  // stock" sem permissão de custo) — a etapa só aparece se houver algum.
  const stockCards = [isNum(st?.below_reorder_point), isNum(cnt?.in_progress), isNum(st?.value)].filter(Boolean).length;
  const stockStage = stockCards > 0;

  if (!salesStage && !ecStage && !stockBranch && !poBranch && !stockStage) return null;

  return (
    <section aria-labelledby="inv-flow" className="space-y-3">
      <h2 id="inv-flow" className="text-base font-semibold">Fluxo</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {salesStage ? (
          <Stage n={1} title="Vendas assinadas">
            {isNum(origin?.contract) ? <FlowCounterButton label="Contratos" value={origin.contract} onClick={go("/client-orders")} /> : null}
            {isNum(origin?.direct_sale) ? <FlowCounterButton label="Vendas diretas" value={origin.direct_sale} onClick={go("/client-orders")} /> : null}
            {isNum(origin?.manual) ? <FlowCounterButton label="Encomendas manuais" value={origin.manual} onClick={go("/client-orders")} /> : null}
            {trigger ? (
              <p className="text-xs text-muted-foreground">
                Baixa de stock no momento definido:{" "}
                <b>{trigger === "proposal_accepted" ? "proposta aceite" : "contrato assinado"}</b> (nunca os dois).
              </p>
            ) : null}
          </Stage>
        ) : null}
        {ecStage ? (
          <Stage n={2} title="Encomendas Clientes">
            {isNum(co?.open) ? <FlowCounterButton label="Em aberto" value={co.open} onClick={go("/client-orders")} /> : null}
            {isNum(co?.ready_to_ship) ? <FlowCounterButton label="Prontas a expedir" value={co.ready_to_ship} tone="ok" onClick={go("/client-orders")} /> : null}
            {isNum(co?.without_preferred_supplier) ? (
              <FlowCounterButton label="Sem fornecedor" value={co.without_preferred_supplier} tone="bad" onClick={go("/client-orders")} />
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
              <Stage branch title="Há stock → serve do stock">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Step label="Reserva FIFO" value={st?.reserved_units} suffix="un" />
                  <StepArrow />
                  <Step
                    label="Saída"
                    value={canEc ? co?.ready_to_ship : null}
                    suffix="EC"
                    onClick={canEc ? go("/client-orders") : undefined}
                  />
                  <StepArrow />
                  <Step label="Encomenda servida" />
                </div>
              </Stage>
            ) : null}
            {poBranch ? (
              <Stage branch n={3} title="Falta → encomenda ao fornecedor">
                <div className="flex flex-wrap items-center gap-1.5">
                  {canPo && isNum(po?.pending_approval) ? (
                    <><Step label="PO por aprovar" value={po.pending_approval} onClick={go("/purchase-orders")} /><StepArrow /></>
                  ) : null}
                  {canPo && isNum(po?.portal_unseen) ? (
                    <><Step label="No portal, por ver" value={po.portal_unseen} onClick={go("/purchase-orders")} /><StepArrow /></>
                  ) : null}
                  {canPo && isNum(po?.portal_confirmed) ? (
                    <><Step label="Fornecedor confirmou" value={po.portal_confirmed} onClick={go("/purchase-orders")} /><StepArrow /></>
                  ) : null}
                  {canRec && isNum(po?.open_delivery_notes) ? (
                    <><Step label="Receção: guias abertas" value={po.open_delivery_notes} onClick={go("/receiving")} /><StepArrow /></>
                  ) : null}
                  <Step label="Serve a EC" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {canPo && isNum(po?.late) && po.late > 0 ? (
                    <Button variant="outline" size="sm" onClick={go("/purchase-orders")}>
                      <InventoryStatusBadge tone="bad">{po.late} atrasada{po.late === 1 ? "" : "s"}</InventoryStatusBadge>
                    </Button>
                  ) : null}
                  {canRec ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/receiving"><Truck className="mr-1 h-3.5 w-3.5" /> Receber</Link>
                    </Button>
                  ) : null}
                </div>
              </Stage>
            ) : null}
          </div>
        </>
      ) : null}

      {stockStage ? (
        <Stage n={4} title="Stock">
          <div className={cn("grid gap-2 sm:grid-cols-2", stockCards >= 3 ? "lg:grid-cols-3" : null)}>
            {isNum(st?.below_reorder_point) ? (
              <FlowCounterButton label="Abaixo do ponto de encomenda" value={st.below_reorder_point} tone="warn" onClick={go("/stocks?status=low")} />
            ) : null}
            {isNum(cnt?.in_progress) ? (
              <FlowCounterButton label="Contagens em curso" value={cnt.in_progress} onClick={go("/stock-counts")} />
            ) : null}
            {isNum(st?.value) ? (
              <FlowCounterButton
                label="Valor em stock (custo médio)"
                value={formatEur(st.value)}
                onClick={go("/stocks")}
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            A receção fecha o ciclo: a parte para Encomendas Clientes fica reservada e serve a encomenda; a parte para stock entra livre e atualiza o custo médio.
          </p>
        </Stage>
      ) : null}
    </section>
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

  const { data: today } = useInventoryToday();
  const queue = getInventoryQueueItems(today, hasPermission);

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
        .select("id, movement_type, quantity, created_at, warehouse_id, products(name, sku), warehouses(name)")
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

  return (
    <>
      <div className="space-y-8">
        <InventoryPageHeader
          title={t("sidebar.inventoryToday")}
          description={t("inventory.today.description")}
          actions={
            <>
              <PermissionGate permission="stocks.edit">
                <Button variant="outline" onClick={() => setMovementDialogOpen(true)}>
                  <ArrowLeftRight className="mr-2 h-4 w-4" /> Registar movimento
                </Button>
              </PermissionGate>
              <PermissionGate permission="receiving.view">
                <Button variant="outline" asChild>
                  <Link to="/receiving"><Truck className="mr-2 h-4 w-4" /> Receber</Link>
                </Button>
              </PermissionGate>
            </>
          }
        />

        {today ? <FlowSection data={today} /> : null}

        {queue.length > 0 ? (
          <section aria-labelledby="inv-queue" className="space-y-3">
            <h2 id="inv-queue" className="text-base font-semibold">Fila de trabalho</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
              <Link to="/stock-movements">Ver livro completo</Link>
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
        }}
      />
    </>
  );
};

export default InventoryToday;
