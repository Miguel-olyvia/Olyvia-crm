// O comando de hoje do novo Inventário (como o ComandoHoje do Estúdio da obra): três colunas — Hoje no armazém, Precisa
// de ti e A seguir. Nenhuma consulta nova: rpc_inventory_today (useInventoryToday) e as POs da Receção
// (useReceivablePos, a mesma query key e a mesma regra de permissão do Hoje clássico). As contas estão em
// contasComando.ts.
import { forwardRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDownToLine, CalendarClock, Clock, PackageCheck, Sparkles, Truck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { getReceivingSummary, INVENTORY_TODAY_PERMISSIONS, useInventoryToday } from "@/hooks/useInventoryToday";
import { useReceivablePos } from "@/components/receiving/useReceivablePos";
import { todayIsoLocal } from "@/components/purchase-orders/poListUtils";
import { useReduzir } from "@/emylia/movimento";
import { cn } from "@/lib/utils";
import { aSeguir, hojeNoArmazem, precisaDeTi, type ItemComando, type TomComando } from "./contasComando";

const TOM: Record<TomComando, { ic: string; I: typeof Clock }> = {
  bad: { ic: "text-destructive", I: AlertTriangle },
  warn: { ic: "text-amber-700 dark:text-amber-300", I: Clock },
  ok: { ic: "text-success", I: PackageCheck },
  info: { ic: "text-primary", I: Truck },
  neutral: { ic: "text-muted-foreground", I: CalendarClock },
};

function Item({ x, primario, ir, i }: { x: ItemComando; primario?: boolean; ir: (to: string) => void; i: number }) {
  const reduzir = useReduzir();
  const { ic, I } = TOM[x.tom];
  return (
    <motion.li initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduzir ? 0 : 0.04 * i }}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
      <span aria-hidden="true" className={cn("grid h-8 w-8 place-items-center rounded-xl bg-card", ic)}>
        {typeof x.valor === "number" ? <span className="text-sm font-bold tabular-nums">{x.valor}</span> : <I className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug">
          {typeof x.valor === "number" && <span className="sr-only">{x.valor} </span>}{x.titulo}
        </span>
        {x.detalhe && <span className="block text-[13px] text-muted-foreground">{x.detalhe}</span>}
        <Button type="button" size="sm" variant={primario ? "default" : "outline"} className="mt-2 min-h-9 rounded-xl"
          aria-label={`${x.acao}: ${x.titulo}`} onClick={() => ir(x.to)}>
          {x.acao}
        </Button>
      </span>
    </motion.li>
  );
}

function Coluna({ titulo, icone, n, children, ultima }: { titulo: string; icone: ReactNode; n?: number; children: ReactNode; ultima?: boolean }) {
  return (
    <div className={cn("relative min-w-0 space-y-2.5 border-b border-border p-4 lg:border-b-0", !ultima && "lg:border-r")}>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {icone}{titulo}
        {!!n && <span className="rounded-full bg-amber-100 px-2 text-xs normal-case tracking-normal text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">{n}</span>}
      </h3>
      {children}
    </div>
  );
}

const Vazio = ({ children }: { children: ReactNode }) => (
  <p className="rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{children}</p>
);

const MAX = 5;

export const ComandoInventario = forwardRef<HTMLElement>(function ComandoInventario(_props, ref) {
  const navigate = useNavigate();
  const reduzir = useReduzir();
  const { activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const { data: today } = useInventoryToday({ enabled: INVENTORY_TODAY_PERMISSIONS.some((p) => hasPermission(p)) });
  // As mesmas POs (e a mesma regra) do Hoje clássico: a RLS de purchase_orders exige purchase_orders.view.
  const canReceivable = hasPermission("purchase_orders.view") && hasPermission("receiving.view");
  const receivable = useReceivablePos(activeCompany?.id ?? null, canReceivable);
  const pos = canReceivable ? (receivable.data ?? null) : null;
  const hoje = todayIsoLocal();
  const resumo = pos ? getReceivingSummary(pos, hoje) : null;

  const agora = hojeNoArmazem(pos, today, hoje, hasPermission);
  const pedidos = precisaDeTi(today, resumo, hasPermission);
  const seguir = aSeguir(pos, hoje);
  const ir = (to: string) => navigate(to);

  return (
    <section ref={ref} id="inv-comando" aria-label="Comando de hoje" className="scroll-mt-20 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="relative grid grid-cols-1 lg:grid-cols-3">
        <div aria-hidden="true" className="pointer-events-none absolute -top-28 left-1/3 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <Coluna titulo="Hoje no armazém" icone={<ArrowDownToLine className="h-4 w-4 text-primary" aria-hidden="true" />}>
          {agora.length ? (
            <ul className="space-y-2">{agora.slice(0, MAX).map((x, i) => <Item key={x.chave} x={x} ir={ir} i={i} />)}</ul>
          ) : (
            <Vazio>{canReceivable ? "Nada a chegar hoje nem amanhã." : "Sem acesso às encomendas a fornecedor."}</Vazio>
          )}
          {agora.length > MAX && <p className="text-xs text-muted-foreground">e mais {agora.length - MAX}</p>}
        </Coluna>
        <Coluna titulo="Precisa de ti" n={pedidos.length} icone={<Zap className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />}>
          <AnimatePresence initial={false} mode="popLayout">
            {!pedidos.length ? (
              <motion.p key="ok" initial={reduzir ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 rounded-2xl bg-success/10 px-3 py-3 text-sm text-success">
                <Sparkles className="h-4 w-4" aria-hidden="true" />Nada à espera de ti. O armazém anda sozinho.
              </motion.p>
            ) : (
              <motion.ul key="lista" className="space-y-2">
                {pedidos.slice(0, MAX).map((x, i) => <Item key={x.chave} x={x} ir={ir} i={i} primario={i === 0} />)}
              </motion.ul>
            )}
          </AnimatePresence>
          {pedidos.length > MAX && <p className="text-xs text-muted-foreground">e mais {pedidos.length - MAX}</p>}
        </Coluna>
        <Coluna ultima titulo="A seguir" icone={<Truck className="h-4 w-4 text-primary" aria-hidden="true" />}>
          {seguir.length ? (
            <ul className="space-y-2">{seguir.map((x, i) => <Item key={x.chave} x={x} ir={ir} i={i} />)}</ul>
          ) : (
            <Vazio>{canReceivable ? "Nenhuma encomenda a fornecedor prevista." : "Sem acesso às encomendas a fornecedor."}</Vazio>
          )}
        </Coluna>
      </div>
    </section>
  );
});
