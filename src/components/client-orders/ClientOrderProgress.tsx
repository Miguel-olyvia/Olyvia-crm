// Progresso de uma Encomenda Cliente na lista (Progresso/segBar do protótipo)
// e a legenda das cores. Em UNIDADES (unidades base de stock), com a
// prontidão de rpc_client_order_list_readiness:
//   servido   = units_served (saída de stock + recebido do fornecedor)
//   em stock  = units_in_stock_reserved (reservado, pronto a sair)
//   PO        = units_on_po (encomendado ao fornecedor, por receber)
//   falta     = units_missing (sem stock nem PO)
// Linhas de serviço ficam de fora (não têm stock).
// Sem prontidão (RPC falhou) cai nos contadores por LINHA que a lista já
// recebe de rpc_list_client_order_documents (servidas · a aguardar · em falta).
import { cn } from "@/lib/utils";
import type { ClientOrderReadiness } from "./clientOrderList";

export interface ClientOrderProgressCounts {
  total_lines: number;
  lines_from_stock: number;
  lines_received: number;
  lines_awaiting_order: number;
  lines_no_supplier: number;
  lines_service?: number | null;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export const fmtUnits = (v: number): string => v.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

/** Por linha (fallback e exportação). */
export function clientOrderProgressParts(c: ClientOrderProgressCounts) {
  const served = n(c.lines_from_stock) + n(c.lines_received);
  const waiting = n(c.lines_awaiting_order);
  const missing = n(c.lines_no_supplier);
  return { served, waiting, missing, total: served + waiting + missing };
}

/** Em unidades (barra de 4 segmentos do protótipo). */
export function clientOrderUnitParts(r: ClientOrderReadiness) {
  const served = n(r.units_served);
  const stock = n(r.units_in_stock_reserved);
  const po = n(r.units_on_po);
  const missing = n(r.units_missing);
  return { served, stock, po, missing, total: served + stock + po + missing };
}

const SEG = {
  served: "bg-success",
  stock: "bg-primary",
  po: "bg-info",
  missing: "bg-destructive",
} as const;

function Bar({ label, parts }: { label: string; parts: Array<[keyof typeof SEG, number]> }) {
  const total = parts.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="flex h-[9px] min-w-[120px] overflow-hidden rounded-[5px] bg-muted" role="img" aria-label={label}>
      {parts.map(([k, v]) => (
        <span key={k} className={cn("block h-full", SEG[k])} style={{ width: `${(v / total) * 100}%` }} />
      ))}
    </div>
  );
}

export function ClientOrderProgress({
  counts,
  readiness,
}: {
  counts: ClientOrderProgressCounts;
  readiness?: ClientOrderReadiness | null;
}) {
  if (readiness) {
    const { served, stock, po, missing, total } = clientOrderUnitParts(readiness);
    if (!total) {
      return <span className="text-xs text-muted-foreground">{n(counts.total_lines) > 0 ? "Só serviços" : "Sem linhas"}</span>;
    }
    return (
      <div className="flex min-w-[150px] flex-col gap-1">
        <Bar
          label={`Unidades: servido ${fmtUnits(served)}, em stock ${fmtUnits(stock)}, a aguardar PO ${fmtUnits(po)}, em falta ${fmtUnits(missing)}`}
          parts={[["served", served], ["stock", stock], ["po", po], ["missing", missing]]}
        />
        <small className="text-xs text-muted-foreground">
          {fmtUnits(served)} servido · {fmtUnits(stock)} em stock · {fmtUnits(po)} PO · {fmtUnits(missing)} falta
        </small>
      </div>
    );
  }

  const { served, waiting, missing, total } = clientOrderProgressParts(counts);
  if (!total) {
    return <span className="text-xs text-muted-foreground">{n(counts.total_lines) > 0 ? "Só serviços" : "Sem linhas"}</span>;
  }
  return (
    <div className="flex min-w-[150px] flex-col gap-1">
      <Bar
        label={`Linhas: servidas ${served}, a aguardar ${waiting}, em falta ${missing}`}
        parts={[["served", served], ["po", waiting], ["missing", missing]]}
      />
      <small className="text-xs text-muted-foreground">
        {served} linha(s) servida(s) · {waiting} a aguardar · {missing} em falta
      </small>
    </div>
  );
}

export function ClientOrderProgressLegend({ className }: { className?: string }) {
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center">
      <i className={cn("mr-1 inline-block h-2.5 w-2.5 rounded-[3px]", cls)} aria-hidden="true" />
      {label}
    </span>
  );
  return (
    <div className={cn("flex flex-wrap gap-3 text-xs text-muted-foreground", className)}>
      {item(SEG.served, "Servido")}
      {item(SEG.stock, "Em stock (reservado, pronto)")}
      {item(SEG.po, "A aguardar PO")}
      {item(SEG.missing, "Em falta / sem fornecedor")}
    </div>
  );
}
