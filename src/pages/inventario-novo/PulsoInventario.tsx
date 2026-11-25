// O pulso do novo Inventário (como o Pulso do Estúdio da obra, ComandoObra.tsx): o número herói — o total da fila de
// trabalho, o mesmo do contador "Hoje" do menu (getInventoryQueueTotal) — e os números que se tocam e abrem o separador
// já filtrado. Tudo vem de rpc_inventory_today (useInventoryToday, a mesma cache do Hoje e do menu).
// Regras do Hoje: um campo a null não aparece (nunca um 0 falso); cada número só aparece com a permissão do cartão
// correspondente no Hoje (FlowSection / getInventoryQueueItems).
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  getInventoryQueueTotal,
  INVENTORY_TODAY_PERMISSIONS,
  useInventoryToday,
  type InventoryTodayPayload,
} from "@/hooks/useInventoryToday";
import { clientOrdersLink, purchaseOrdersLink, receivingLink, stocksLink } from "@/components/inventory/ui/inventoryLinks";
import { Contagem } from "@/emylia/movimento";
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

/**
 * O pulso (o .pulse do artefacto): o herói em gradiente violeta, que ocupa 2 linhas, ao lado dos números tocáveis em 3
 * colunas. Sem nenhum número (RPC por aplicar, sem permissões): nada.
 */
export function PulsoInventario({ verFila }: { verFila?: () => void }) {
  const navigate = useNavigate();
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
    <section aria-label="O pulso do inventário"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(0,1fr))]">
      {total !== null && (
        <div className="relative col-span-2 flex min-h-[170px] flex-col justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-[#432791] p-[22px] text-white shadow-[0_18px_40px_-18px_rgba(76,29,149,0.7)] md:col-span-3 lg:col-span-1 lg:row-span-2 lg:min-h-[210px]">
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-10 h-[220px] w-[220px] rounded-full bg-white opacity-[0.14] blur-[50px]" />
          <span className="relative block text-xs font-bold uppercase tracking-[0.14em] text-white/85">Precisam de ti hoje</span>
          <span className="relative flex items-baseline gap-2">
            <span className="text-[3.2rem] font-extrabold leading-none tracking-[-0.04em]"><Contagem valor={total} fmt={fmt} de={0} realce={false} /></span>
            <span className="text-lg font-semibold text-white/85" aria-hidden="true">{total === 1 ? "coisa" : "coisas"}</span>
          </span>
          <span className="relative block text-sm text-white/90">{resumo ? `${resumo}. ` : ""}Começa pelo botão no topo.</span>
          <button type="button" onClick={verFila}
            aria-label={`Precisam de ti hoje: ${total} ${total === 1 ? "coisa" : "coisas"}. Ver o que é`}
            className="relative inline-flex min-h-11 items-center self-start rounded-[14px] border border-white/25 bg-white/15 px-4 text-[14.5px] font-semibold text-white transition-colors hover:bg-white/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transform-none">
            Ver o que é
          </button>
        </div>
      )}
      {numeros.map((n) => (
        <button key={n.chave} type="button" onClick={() => navigate(n.to)} aria-label={`${n.rotulo}: ${n.valor}`}
          className="flex min-h-[88px] flex-col justify-between gap-1 rounded-[20px] border border-border bg-card px-4 py-3.5 text-left shadow-sm transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <span className={cn("text-[2rem] font-extrabold leading-[1.05] tracking-[-0.03em] tabular-nums", TOM_VALOR[n.tom], n.valor === 0 && "text-muted-foreground")}>
            <Contagem valor={n.valor} fmt={fmt} de={0} realce={false} />
          </span>
          <span className="text-[13px] font-medium text-muted-foreground">{n.rotulo}</span>
        </button>
      ))}
    </section>
  );
}
