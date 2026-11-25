// O comando de hoje do novo Inventário (como o ComandoHoje do Estúdio da obra): três colunas — Hoje no armazém, Precisa
// de ti e A seguir. Nenhuma consulta nova: rpc_inventory_today (useInventoryToday) e as POs da Receção
// (useReceivablePos, a mesma query key e a mesma regra de permissão do Hoje clássico). As contas estão em
// contasComando.ts.
// "Precisa de ti" é a fila de trabalho do Hoje clássico (que dentro da moldura já não aparece): nada se perde — passado o
// MAX há "Ver mais (N)", e os cartões a 0 ("Nada pendente") ficam numa linha "Em dia".
import { forwardRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDownToLine, CalendarClock, Check, Clock, PackageCheck, Truck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { getReceivingSummary, INVENTORY_TODAY_PERMISSIONS, useInventoryToday } from "@/hooks/useInventoryToday";
import { useReceivablePos } from "@/components/receiving/useReceivablePos";
import { todayIsoLocal } from "@/components/purchase-orders/poListUtils";
import { useReduzir } from "@/emylia/movimento";
import { cn } from "@/lib/utils";
import { aSeguir, emDia, hojeNoArmazem, precisaDeTi, type ItemComando, type TomComando } from "./contasComando";

// As cores do .it do artefacto (bad / amb / ok / blue / pri), com as variantes do modo escuro.
const TOM: Record<TomComando, { ic: string; I: typeof Clock }> = {
  bad: { ic: "text-destructive", I: AlertTriangle },
  warn: { ic: "text-amber-700 dark:text-amber-300", I: Clock },
  ok: { ic: "text-success", I: PackageCheck },
  info: { ic: "text-blue-600 dark:text-blue-300", I: Truck },
  neutral: { ic: "text-muted-foreground", I: CalendarClock },
};

function Item({ x, primario, ir, i }: { x: ItemComando; primario?: boolean; ir: (to: string) => void; i: number }) {
  const reduzir = useReduzir();
  const { ic, I } = TOM[x.tom];
  return (
    <motion.li initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduzir ? 0 : 0.04 * Math.min(i, 5) }}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-2xl bg-muted px-3 py-[11px]">
      <span aria-hidden="true" className={cn("grid h-8 w-8 place-items-center rounded-[10px] bg-card", ic)}>
        {typeof x.valor === "number" ? <span className="text-sm font-bold tabular-nums">{x.valor}</span> : <I className="h-[18px] w-[18px]" />}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold leading-snug">
          {typeof x.valor === "number" && <span className="sr-only">{x.valor} </span>}{x.titulo}
        </span>
        {x.detalhe && <span className="block text-[13px] text-muted-foreground">{x.detalhe}</span>}
        {x.destaque && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 text-xs font-semibold leading-5 text-primary">
            <Truck className="h-3 w-3" aria-hidden="true" />{x.destaque}
          </span>
        )}
        <span className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={primario ? "default" : "outline"}
            className={cn("min-h-9 rounded-[11px] px-3 text-[13.5px] font-semibold",
              primario ? "shadow-[0_6px_18px_-6px_rgba(124,58,237,0.55)]" : "bg-card shadow-sm hover:bg-muted")}
            aria-label={`${x.acao}: ${x.titulo}`} onClick={() => ir(x.to)}>
            {x.acao}
          </Button>
        </span>
      </span>
    </motion.li>
  );
}

function Coluna({ titulo, icone, n, children }: { titulo: string; icone: ReactNode; n?: number; children: ReactNode }) {
  return (
    <div className="relative min-w-0">
      <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {icone}{titulo}
        {!!n && <span className="rounded-full bg-amber-100 px-2 text-xs normal-case tracking-normal text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{n}</span>}
      </h3>
      {children}
    </div>
  );
}

/** O .calm do artefacto: tracejado, visto, texto discreto. */
const Calmo = ({ children }: { children: ReactNode }) => (
  <p className="flex items-center gap-2.5 rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground">
    <Check className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />{children}
  </p>
);

/** Quantos itens se mostram por coluna antes do "Ver mais (N)". */
export const MAX = 5;

/** "Ver mais (N)" / "Ver menos": nada fica escondido sem forma de o ver. */
function VerMais({ resto, aberto, alternar, controla }: { resto: number; aberto: boolean; alternar: () => void; controla: string }) {
  return (
    <button type="button" aria-expanded={aberto} aria-controls={controla} onClick={alternar}
      className="mt-1 min-h-8 rounded-md px-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {aberto ? "Ver menos" : `Ver mais (${resto})`}
    </button>
  );
}

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
  const [todosAgora, setTodosAgora] = useState(false);
  const [todosPedidos, setTodosPedidos] = useState(false);

  const agora = hojeNoArmazem(pos, today, hoje, hasPermission);
  const pedidos = precisaDeTi(today, resumo, hasPermission);
  const tranquilos = emDia(today, resumo, hasPermission);
  const seguir = aSeguir(pos, hoje);
  const ir = (to: string) => navigate(to);
  const verAgora = todosAgora ? agora : agora.slice(0, MAX);
  const verPedidos = todosPedidos ? pedidos : pedidos.slice(0, MAX);

  return (
    <section ref={ref} id="inv-comando" aria-label="Comando de hoje"
      className="relative scroll-mt-20 overflow-hidden rounded-3xl border border-border bg-card p-[18px] shadow-sm">
      <div aria-hidden="true" className="pointer-events-none absolute -top-[120px] left-[30%] h-[260px] w-[260px] rounded-full bg-primary opacity-[0.07] blur-[60px]" />
      <div className="relative grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-3">
        <Coluna titulo="Hoje no armazém" icone={<ArrowDownToLine className="h-4 w-4 text-primary" aria-hidden="true" />}>
          {agora.length ? (
            <ul id="inv-comando-agora" className="space-y-2">{verAgora.map((x, i) => <Item key={x.chave} x={x} ir={ir} i={i} />)}</ul>
          ) : (
            <Calmo>{canReceivable ? "Nada a chegar hoje nem amanhã." : "Sem acesso às encomendas a fornecedor."}</Calmo>
          )}
          {agora.length > MAX && (
            <VerMais controla="inv-comando-agora" resto={agora.length - MAX} aberto={todosAgora} alternar={() => setTodosAgora((v) => !v)} />
          )}
        </Coluna>
        <Coluna titulo="Precisa de ti" n={pedidos.length} icone={<Zap className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />}>
          <AnimatePresence initial={false} mode="popLayout">
            {!pedidos.length ? (
              <motion.div key="ok" initial={reduzir ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                <Calmo>Nada à espera de ti. O armazém anda sozinho.</Calmo>
              </motion.div>
            ) : (
              <motion.ul key="lista" id="inv-comando-pedidos" className="space-y-2">
                {verPedidos.map((x, i) => <Item key={x.chave} x={x} ir={ir} i={i} primario={i === 0} />)}
              </motion.ul>
            )}
          </AnimatePresence>
          {pedidos.length > MAX && (
            <VerMais controla="inv-comando-pedidos" resto={pedidos.length - MAX} aberto={todosPedidos} alternar={() => setTodosPedidos((v) => !v)} />
          )}
          {tranquilos.length > 0 && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              <span className="font-semibold">Em dia (nada pendente):</span>{" "}
              {tranquilos.map((x, i) => (
                <span key={x.chave}>
                  {i > 0 && " · "}
                  <button type="button" onClick={() => ir(x.to)}
                    className="rounded underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {x.titulo}
                  </button>
                </span>
              ))}
            </p>
          )}
        </Coluna>
        <Coluna titulo="A seguir" icone={<Truck className="h-4 w-4 text-primary" aria-hidden="true" />}>
          {seguir.length ? (
            <ul className="space-y-2">{seguir.map((x, i) => <Item key={x.chave} x={x} ir={ir} i={i} />)}</ul>
          ) : (
            <Calmo>{canReceivable ? "Nenhuma encomenda a fornecedor prevista." : "Sem acesso às encomendas a fornecedor."}</Calmo>
          )}
        </Coluna>
      </div>
    </section>
  );
});
