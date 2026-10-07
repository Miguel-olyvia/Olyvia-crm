import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { formatMoney } from "@/components/supplier-portal-crm/types";
import {
  costEffect,
  decidePriceChanges,
  describeOutcome,
  isNoPermission,
  listPriceChanges,
  unitChangeText,
  type PriceChangeItem,
  type PriceChangeList,
} from "@/components/supplier-portal-crm/priceChanges";
import PriceChangeDecisionDialog, {
  type PriceDecisionRequest,
} from "@/components/supplier-portal-crm/PriceChangeDecisionDialog";
import type { AcceptedPriceInfo } from "./pendingSupplierPrice";

interface PendingSupplierPriceNoticeProps {
  productId: string;
  /**
   * Chamado logo que a RPC aceita (antes de qualquer outra espera): a ficha
   * passa a refletir o custo gravado, para "Atualizar Produto" não o desfazer
   * (ver pendingSupplierPrice.ts). isCurrent() = este aviso ainda está aberto
   * para este produto. Pode devolver um aviso a mostrar.
   */
  onAccepted?: (accepted: AcceptedPriceInfo[], isCurrent: () => boolean) => Promise<string | null> | string | null | void;
}

const MAX_SHOWN = 3;

// Ficha do produto (F3.4b): "Preço do fornecedor X mudou para Y — aceitar?"
// quando há pedidos pendentes para este produto (rpc_price_changes_list com
// p_product_id). Aceitar/recusar com rpc_price_changes_decide. Sem permissão
// para ver (ou produto não visível) não mostra nada.
export default function PendingSupplierPriceNotice({ productId, onAccepted }: PendingSupplierPriceNoticeProps) {
  const { toast } = useToast();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canList =
    hasPermission("suppliers.view") && (hasPermission("suppliers.view_pricing") || hasPermission("products.view_cost"));

  const [list, setList] = useState<PriceChangeList | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decision, setDecision] = useState<PriceDecisionRequest | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // A ficha fechou/mudou de produto enquanto se esperava pela BD?
  const currentRef = useRef(true);
  useEffect(() => {
    currentRef.current = true;
    return () => {
      currentRef.current = false;
    };
  }, [productId]);

  const load = useCallback(async () => {
    const { data, error } = await listPriceChanges({ productId, status: "pending", limit: 20 });
    if (error) {
      // Sem permissão / produto não visível / erro: o aviso não aparece.
      if (!isNoPermission(error)) console.warn("Preços do fornecedor por aprovar:", error.message);
      setList(null);
      return;
    }
    setList(data);
  }, [productId]);

  useEffect(() => {
    setList(null);
    setNotice(null);
    if (permissionsLoading || !canList || !productId) return;
    void load();
  }, [load, canList, permissionsLoading, productId]);

  const runDecision = async (req: PriceDecisionRequest, opts: { note: string; acceptUnitChange: boolean }) => {
    setDeciding(true);
    if (req.items.length === 1) setBusyId(req.items[0].id);
    const { data, error } = await decidePriceChanges({
      ids: req.items.map((i) => i.id),
      approve: req.mode === "approve",
      note: req.mode === "reject" ? opts.note : null,
      acceptUnitChange: opts.acceptUnitChange,
    });
    if (error || !data) {
      setDeciding(false);
      setBusyId(null);
      toast({
        title: req.mode === "approve" ? "Não foi possível aceitar" : "Não foi possível recusar",
        description: error?.message || "Erro desconhecido.",
        variant: "destructive",
      });
      return;
    }
    setDecision(null);
    const byId = new Map(req.items.map((i) => [i.id, i]));
    // Primeiro a ficha (sem outra espera pelo meio): o custo do formulário e o
    // "custo com que abriu" passam ao valor gravado.
    let warning: string | null = null;
    if (data.approved > 0 && onAccepted) {
      const accepted: AcceptedPriceInfo[] = [];
      data.results.forEach((o) => {
        const item = byId.get(o.id);
        if (o.outcome !== "approved" || !item) return;
        accepted.push({
          productCostUpdated: !!o.product_cost_updated,
          newUnitCost: o.new_unit_cost ?? null,
          newPrice: item.new_price,
          itemSupplierUpdated: !!o.item_supplier_updated,
          isPreferred: item.is_preferred,
        });
      });
      warning = (await onAccepted(accepted, () => currentRef.current)) || null;
    }
    setDeciding(false);
    setBusyId(null);
    const lines = data.results.map((o) => describeOutcome(o, byId.get(o.id)).text);
    toast({
      title: req.mode === "approve" ? "Preço do fornecedor aceite" : "Preço do fornecedor recusado",
      description: lines.join(" "),
      variant: data.approved + data.rejected === 0 ? "destructive" : undefined,
    });
    setNotice(warning);
    await load();
  };

  const accept = (item: PriceChangeItem) => {
    if (item.unit_changed) {
      setDecision({ mode: "approve", items: [item] });
      return;
    }
    void runDecision({ mode: "approve", items: [item] }, { note: "", acceptUnitChange: false });
  };

  const items = list?.items ?? [];
  if (items.length === 0 && !notice) return null;
  const canDecide = !!list?.can_decide;

  return (
    <div className="space-y-2" aria-live="polite">
      {items.slice(0, MAX_SHOWN).map((item) => {
        const effect = costEffect(item);
        const busy = busyId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-2"
            role="status"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 hidden sm:block" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p>
                Preço do fornecedor <strong>{item.supplier.name}</strong> mudou para{" "}
                <strong>{formatMoney(item.new_price, item.currency)}</strong>
                {item.current_price != null ? ` (era ${formatMoney(item.current_price, item.current_currency ?? item.currency)})` : ""}
                {item.purchase_uom?.code ? ` por ${item.purchase_uom.code}` : ""}
                {canDecide ? " — aceitar?" : "."}
              </p>
              <p className="text-xs text-muted-foreground">
                Custo do produto: {effect.text}
                {item.unit_changed ? ` · Unidade mudou: ${unitChangeText(item)}` : ""}
              </p>
            </div>
            {canDecide && (
              <div className="flex gap-1 shrink-0">
                <Button type="button" size="sm" onClick={() => accept(item)} disabled={busy || deciding}>
                  {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  Aceitar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDecision({ mode: "reject", items: [item] })}
                  disabled={busy || deciding}
                >
                  <X className="w-4 h-4 mr-1" /> Recusar
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {items.length > MAX_SHOWN && (
        <p className="text-xs text-muted-foreground">
          +{items.length - MAX_SHOWN} preço(s) de fornecedor por aprovar para este produto (ver na ficha do fornecedor → Catálogo).
        </p>
      )}
      {notice && (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1" role="alert">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}
      <PriceChangeDecisionDialog
        request={decision}
        busy={deciding}
        onClose={() => setDecision(null)}
        onConfirm={(opts) => {
          const req = decision;
          if (req) void runDecision(req, opts);
        }}
      />
    </div>
  );
}
