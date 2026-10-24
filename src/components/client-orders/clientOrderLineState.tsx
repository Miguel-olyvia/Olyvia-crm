// Estados de uma linha da Encomenda Cliente com o vocabulário do protótipo
// (EC_LINHA_ESTADOS: Servido, Recebido PO, A aguardar PO, Pronto a sair,
// Parcial, Em falta, Sem fornecedor, Serviço, Anulado) sobre o line_status
// real de rpc_get_client_order_document. O rótulo detalhado (com POs,
// quantidades e motivos) continua a ser calculado pela página.
import { InventoryStatusBadge, type InventoryTone } from "@/components/inventory/ui";

export type ClientOrderLineState =
  | "served"
  | "recvpo"
  | "waitpo"
  | "ready"
  | "partial"
  | "missing"
  | "nosup"
  | "service"
  | "void";

export const CLIENT_ORDER_LINE_STATES: ReadonlyArray<{ key: ClientOrderLineState; label: string; tone: InventoryTone }> = [
  { key: "served", label: "Servido", tone: "ok" },
  { key: "recvpo", label: "Recebido PO", tone: "info" },
  { key: "waitpo", label: "A aguardar PO", tone: "info" },
  { key: "ready", label: "Pronto a sair", tone: "violet" },
  { key: "partial", label: "Parcial", tone: "warn" },
  { key: "missing", label: "Em falta", tone: "bad" },
  { key: "nosup", label: "Sem fornecedor", tone: "bad" },
  { key: "service", label: "Serviço", tone: "neutral" },
  { key: "void", label: "Anulado", tone: "neutral" },
];

const BY_KEY = new Map(CLIENT_ORDER_LINE_STATES.map((s) => [s.key, s]));

/**
 * line_status → estado do protótipo. 'sem_fornecedor' divide-se pela causa:
 * sem fornecedor preferencial (has_preferred_supplier = false) → "Sem
 * fornecedor"; com preferencial ou desconhecido → "Em falta" (por pedir).
 */
export function clientOrderLineState(
  lineStatus: string,
  hasPreferredSupplier: boolean | null | undefined,
): ClientOrderLineState {
  switch (lineStatus) {
    case "servido_por_stock":
      return "served";
    case "recebido":
      return "recvpo";
    case "a_aguardar_encomenda":
      return "waitpo";
    case "stock_disponivel_confirmar":
      return "ready";
    case "parcial":
      return "partial";
    case "sem_fornecedor":
      return hasPreferredSupplier === false ? "nosup" : "missing";
    case "servico":
      return "service";
    case "nao_recebido_anulado":
      return "void";
    default:
      return "partial";
  }
}

export function ClientOrderLineStateBadge({ state, title }: { state: ClientOrderLineState; title?: string }) {
  const s = BY_KEY.get(state) ?? BY_KEY.get("partial")!;
  return (
    <span title={title} className="inline-flex">
      <InventoryStatusBadge tone={s.tone}>{s.label}</InventoryStatusBadge>
    </span>
  );
}

/** A legenda (.legend do protótipo) com todos os distintivos. */
export function ClientOrderLineStateLegend() {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Legenda dos estados das linhas">
      {CLIENT_ORDER_LINE_STATES.map((s) => (
        <InventoryStatusBadge key={s.key} tone={s.tone}>
          {s.label}
        </InventoryStatusBadge>
      ))}
    </div>
  );
}
