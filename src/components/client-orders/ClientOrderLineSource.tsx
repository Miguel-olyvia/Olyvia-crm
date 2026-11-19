// Coluna "De onde vem" de uma linha da Encomenda Cliente (DeOnde do
// protótipo), com os dados reais de rpc_get_client_order_document:
// servido do stock, reservado no stock (armazéns com stock), pedido ao
// fornecedor (PO com ligação + estado no portal), em falta (com ou sem
// fornecedor preferencial). Quantidades qty_* em unidades de stock.
import type { ReactNode } from "react";
import { DocumentLink } from "@/components/inventory/ui";

export interface ClientOrderLineSourceData {
  item_type: "product" | "service";
  line_status: string;
  quantity: number;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  available_warehouses: Array<{ warehouse_id: string; warehouse_name: string; quantity: number }> | null;
  qty_needed?: number | null;
  qty_reserved?: number | null;
  qty_ordered?: number | null;
  qty_received?: number | null;
  qty_missing?: number | null;
  qty_served?: number | null;
  has_preferred_supplier?: boolean | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (v: number): string => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(v);

interface Props {
  line: ClientOrderLineSourceData;
  /** Estado da PO (useClientOrderPoStates); ausente = só o número. */
  poState?: string | null;
  onOpenPo?: (() => void) | null;
  /** Notas extra da página (anulações na PO, etc.). */
  extra?: ReactNode;
}

export function ClientOrderLineSource({ line, poState, onOpenPo, extra }: Props) {
  if (line.item_type === "service" || line.line_status === "servico") {
    return <span className="text-muted-foreground">Serviço (sem stock)</span>;
  }
  const parts: ReactNode[] = [];
  const served = num(line.qty_served);
  const reserved = num(line.qty_reserved);
  const ordered = num(line.qty_ordered);
  const received = num(line.qty_received);
  const missing = num(line.qty_missing);
  // Encomendas antigas/não assinadas não trazem a reserva (qty_needed null):
  // cai-se para a quantidade da linha conforme o estado.
  const legacy = line.qty_needed === null || line.qty_needed === undefined;

  // A ligação vale pelo id: sem número (null) mostra-se "PO" + id curto.
  const poLabel = line.purchase_order_number
    || (line.purchase_order_id ? `PO ${line.purchase_order_id.slice(0, 8)}` : null);
  const poLink = poLabel ? (
    onOpenPo ? (
      <DocumentLink onClick={onOpenPo} title="Abrir a encomenda ao fornecedor">
        {poLabel}
      </DocumentLink>
    ) : (
      <DocumentLink>{poLabel}</DocumentLink>
    )
  ) : null;

  const warehouses = (line.available_warehouses || []).filter((w) => num(w.quantity) > 0).map((w) => w.warehouse_name);

  if (served > 0 || (legacy && line.line_status === "servido_por_stock")) {
    parts.push(
      <div key="served">
        <b>{fmt(served > 0 ? served : num(line.quantity))}</b> servido do stock
      </div>,
    );
  }
  if (reserved > 0 || (legacy && line.line_status === "stock_disponivel_confirmar")) {
    parts.push(
      <div key="stock">
        <b>{fmt(reserved > 0 ? reserved : num(line.quantity))}</b> do stock
        {warehouses.length > 0 ? ` · ${warehouses.join(", ")}` : ""}
        {warehouses.length === 0 && line.line_status === "stock_disponivel_confirmar" ? (
          <span className="text-amber-700 dark:text-warning"> · sem armazém com stock físico</span>
        ) : null}
      </div>,
    );
  }
  if (ordered > 0 || (poLabel && (legacy || ordered === 0))) {
    parts.push(
      <div key="po">
        {ordered > 0 ? (
          <>
            <b>{fmt(ordered)}</b> do fornecedor
          </>
        ) : (
          "Do fornecedor"
        )}
        {poLink ? <> · {poLink}</> : null}
        {poState ? ` · ${poState}` : ""}
        {received > 0 ? ` · ${fmt(received)} recebidas` : ""}
      </div>,
    );
  }
  if (missing > 0 || (legacy && line.line_status === "sem_fornecedor")) {
    parts.push(
      <div key="missing" className="text-red-700 dark:text-red-400">
        <b>{fmt(missing > 0 ? missing : num(line.quantity))}</b>{" "}
        {line.has_preferred_supplier === false ? "sem fornecedor preferencial" : "em falta, por pedir ao fornecedor"}
      </div>,
    );
  }

  if (parts.length === 0 && !extra) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5">
      {parts}
      {extra}
    </div>
  );
}
