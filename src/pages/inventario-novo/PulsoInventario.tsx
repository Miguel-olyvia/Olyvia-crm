// O pulso do novo Inventário (como o Pulso do Estúdio da obra, ComandoObra.tsx): o número herói — o total da fila de
// trabalho, o mesmo do contador "Hoje" do menu (getInventoryQueueTotal) — e os números que se tocam e abrem o separador
// já filtrado. Tudo vem de rpc_inventory_today (useInventoryToday, a mesma cache do Hoje e do menu).
// Regras do Hoje: um campo a null não aparece (nunca um 0 falso); cada número só aparece com a permissão do cartão
// correspondente no Hoje (FlowSection / getInventoryQueueItems).
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  getInventoryQueueTotal,
  INVENTORY_TODAY_PERMISSIONS,
  useInventoryToday,
  type InventoryTodayPayload,
} from "@/hooks/useInventoryToday";
import { clientOrdersLink, purchaseOrdersLink, receivingLink, stocksLink } from "@/components/inventory/ui/inventoryLinks";
import { Contagem, useReduzir } from "@/emylia/movimento";
import { cn } from "@/lib/utils";
import { paraSeparador } from "./navegadorInventario";

const fmt = (n: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(Math.round(n));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export interface NumeroPulso {
  chave: "atrasadas" | "por-aprovar" | "prontas" | "a-acabar" | "guias" | "sem-fornecedor";
  rotulo: string;
  valor: number;
  tom: "bad" | "warn" | "ok" | "neutral";
  /** Destino já traduzido para o separador. */
  to: string;
}

/** Os números tocáveis: só os que têm valor e a permissão do cartão do Hoje. */
export function numerosDoPulso(today: InventoryTodayPayload | null | undefined, hasPermission: (p: string) => boolean): NumeroPulso[] {
  if (!today) return [];
  const po = today.purchases, co = today.client_orders, st = today.stock;
  const defs: Array<Omit<NumeroPulso, "valor"> & { valor: number | null | undefined; permissao: string }> = [
    { chave: "atrasadas", rotulo: "Entregas atrasadas", valor: po?.late, tom: "bad", permissao: "purchase_orders.view",
      to: purchaseOrdersLink({ status: "late" }) },
    { chave: "por-aprovar", rotulo: "POs por aprovar", valor: po?.pending_approval, tom: "neutral", permissao: "purchase_orders.view",
      to: purchaseOrdersLink({ status: "pending" }) },
    { chave: "prontas", rotulo: "Prontas a sair", valor: co?.ready_to_ship, tom: "ok", permissao: "client_orders.view",
      to: clientOrdersLink({ ready: true }) },
    { chave: "a-acabar", rotulo: "Produtos a acabar", valor: st?.below_reorder_point, tom: "warn", permissao: "inventory.view",
      to: stocksLink({ status: "low" }) },
    { chave: "guias", rotulo: "Guias abertas", valor: po?.open_delivery_notes, tom: "neutral", permissao: "receiving.view",
      to: receivingLink({ notes: "open" }) },
    { chave: "sem-fornecedor", rotulo: "Sem fornecedor", valor: co?.without_preferred_supplier, tom: "bad", permissao: "client_orders.view",
      to: clientOrdersLink({ status: "sem_fornecedor" }) },
  ];
  return defs
    .filter((d) => isNum(d.valor) && hasPermission(d.permissao))
    .map(({ permissao: _p, ...d }) => ({ ...d, valor: d.valor as number, to: paraSeparador(d.to) }));
}

const TOM_VALOR: Record<NumeroPulso["tom"], string> = {
  bad: "text-destructive",
  warn: "text-amber-700 dark:text-amber-300",
  ok: "text-success",
  neutral: "text-foreground",
};

/** O pulso: o herói (o total da fila) e os números tocáveis. Sem nenhum número (RPC por aplicar, sem permissões): nada. */
export function PulsoInventario({ verFila }: { verFila?: () => void }) {
  const navigate = useNavigate();
  const reduzir = useReduzir();
  const { hasPermission } = usePermissions();
  const { data: today } = useInventoryToday({ enabled: INVENTORY_TODAY_PERMISSIONS.some((p) => hasPermission(p)) });
  const total = getInventoryQueueTotal(today, hasPermission);
  const numeros = numerosDoPulso(today, hasPermission);
  if (total === null && numeros.length === 0) return null;

  const late = numeros.find((n) => n.chave === "atrasadas")?.valor ?? 0;
  const prontas = numeros.find((n) => n.chave === "prontas")?.valor ?? 0;
  const resumo = [late > 0 ? `${late} ${late === 1 ? "entrega atrasada" : "entregas atrasadas"}` : null,
    prontas > 0 ? `${prontas} ${prontas === 1 ? "encomenda pronta" : "encomendas prontas"} a sair` : null].filter(Boolean).join(" e ");

  return (
    <section aria-label="O pulso do inventário" className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,2.75fr)]">
      {total !== null && (
        <motion.button type="button" onClick={verFila} whileTap={reduzir ? undefined : { scale: 0.99 }}
          aria-label={`Precisam de ti hoje: ${total} ${total === 1 ? "coisa" : "coisas"}. Ver o que é`}
          className="relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-[#432791] p-5 text-left text-white shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
          <span className="relative block text-xs font-semibold uppercase tracking-[0.14em] text-white/80">Precisam de ti hoje</span>
          <span className="relative flex items-baseline gap-2">
            <span className="text-5xl font-extrabold leading-none tracking-tight"><Contagem valor={total} fmt={fmt} de={0} realce={false} /></span>
            <span className="text-lg font-semibold text-white/85" aria-hidden="true">{total === 1 ? "coisa" : "coisas"}</span>
          </span>
          <span className="relative block text-sm text-white/90">{resumo ? `${resumo}. ` : ""}Começa pelo botão no topo.</span>
        </motion.button>
      )}
      {numeros.length > 0 && (
        <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", total === null && "lg:col-span-2")}>
          {numeros.map((n) => (
            <motion.button key={n.chave} type="button" onClick={() => navigate(n.to)} whileTap={reduzir ? undefined : { scale: 0.98 }}
              aria-label={`${n.rotulo}: ${n.valor}`}
              className="flex min-h-[88px] flex-col justify-between gap-1 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <span className={cn("text-3xl font-extrabold leading-none tracking-tight", TOM_VALOR[n.tom], n.valor === 0 && "text-muted-foreground")}>
                <Contagem valor={n.valor} fmt={fmt} de={0} realce={false} />
              </span>
              <span className="text-sm font-medium text-muted-foreground">{n.rotulo}</span>
            </motion.button>
          ))}
        </div>
      )}
    </section>
  );
}
