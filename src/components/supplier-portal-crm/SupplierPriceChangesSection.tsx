import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { formatDateTime, formatMoney } from "./types";
import {
  costEffect,
  costNotUpdatedMessages,
  decidePriceChanges,
  describeOutcome,
  formatPct,
  isNoPermission,
  listPriceChanges,
  summarizeDecision,
  unitChangeText,
  type PriceChangeItem,
  type PriceChangeList,
} from "./priceChanges";
import PriceChangeDecisionDialog, { type PriceDecisionRequest } from "./PriceChangeDecisionDialog";

interface SupplierPriceChangesSectionProps {
  supplierId: string;
  /** Aberto pelo link do sino (?prices=pending): mostra e leva até à secção. */
  focus?: boolean;
  /** Depois de aceitar: item_suppliers/custos mudaram — quem mostra preços recarrega. */
  onDecided?: () => void;
}

type View = "pending" | "decided";

const PAGE_SIZE = 100;

interface ResultLine {
  id: string;
  label: string;
  text: string;
  tone: "ok" | "info" | "warn";
}

// Portal do Fornecedor F3.4b: pedidos de alteração de preço deste fornecedor
// (rpc_price_changes_list) e aceitar/recusar (rpc_price_changes_decide), por
// linha ou em lote. Ver: suppliers.view + (suppliers.view_pricing ou
// products.view_cost). Decidir: can_decide (products.edit + manage_prices).
export default function SupplierPriceChangesSection({ supplierId, focus = false, onDecided }: SupplierPriceChangesSectionProps) {
  const { toast } = useToast();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canList =
    hasPermission("suppliers.view") && (hasPermission("suppliers.view_pricing") || hasPermission("products.view_cost"));

  const [view, setView] = useState<View>("pending");
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<PriceChangeList | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decision, setDecision] = useState<PriceDecisionRequest | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [lastResult, setLastResult] = useState<ResultLine[] | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const focusedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listPriceChanges({
      supplierId,
      status: view,
      limit: PAGE_SIZE,
      offset,
    });
    setLoading(false);
    if (error) {
      if (isNoPermission(error)) {
        setHidden(true);
        return;
      }
      setLoadError(error.message || "Não foi possível carregar os preços por aprovar.");
      return;
    }
    setLoadError(null);
    setList(data);
  }, [supplierId, view, offset]);

  useEffect(() => {
    if (permissionsLoading || !canList) return;
    void load();
  }, [load, canList, permissionsLoading]);

  // Link do sino: abre "Por aprovar" e leva até aqui (uma vez por montagem).
  useEffect(() => {
    if (!focus) {
      focusedRef.current = false;
      return;
    }
    if (focusedRef.current || !list) return;
    focusedRef.current = true;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, list]);

  useEffect(() => {
    if (focus) {
      setView("pending");
      setOffset(0);
    }
  }, [focus]);

  const items = useMemo(() => list?.items ?? [], [list]);
  const canDecide = !!list?.can_decide && view === "pending";
  const selectable = useMemo(() => items.filter((i) => i.status === "pending").map((i) => i.id), [items]);

  // Recarga/página nova: larga o que já não está na lista.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => selectable.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectable]);

  if (permissionsLoading || !canList || hidden) return null;

  const counts = list?.counts;
  const pendingCount = counts?.pending ?? 0;
  const decidedCount = (counts?.approved ?? 0) + (counts?.rejected ?? 0);
  // Sem pedidos nenhuns a secção não ocupa espaço (exceto vinda do sino).
  // O resultado da última decisão fica visível mesmo que não sobre nada.
  if (list && pendingCount === 0 && decidedCount === 0 && !focus && !lastResult) return null;
  if (!list && !focus && !loadError) return null;

  const selectedItems = items.filter((i) => selected.has(i.id));
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const changeView = (v: View) => {
    setView(v);
    setOffset(0);
    setSelected(new Set());
  };

  const labelOf = (i: PriceChangeItem | undefined) =>
    i ? `${i.catalog_item.supplier_ref}${i.product ? ` · ${i.product.name}` : ""}` : "Pedido";

  const runDecision = async (req: PriceDecisionRequest, opts: { note: string; acceptUnitChange: boolean }) => {
    setDeciding(true);
    if (req.items.length === 1) setBusyId(req.items[0].id);
    const { data, error } = await decidePriceChanges({
      ids: req.items.map((i) => i.id),
      approve: req.mode === "approve",
      note: req.mode === "reject" ? opts.note : null,
      acceptUnitChange: opts.acceptUnitChange,
    });
    setDeciding(false);
    setBusyId(null);
    if (error || !data) {
      toast({
        title: req.mode === "approve" ? "Não foi possível aceitar" : "Não foi possível recusar",
        description: error?.message || "Erro desconhecido.",
        variant: "destructive",
      });
      return;
    }
    setDecision(null);
    const byId = new Map(req.items.map((i) => [i.id, i]));
    setLastResult(
      data.results.map((o) => {
        const item = byId.get(o.id);
        return { id: o.id, label: labelOf(item), ...describeOutcome(o, item) };
      }),
    );
    const extra = costNotUpdatedMessages(data);
    toast({
      title: req.mode === "approve" ? "Preços do fornecedor decididos" : "Preços recusados",
      description: `${summarizeDecision(data)}${extra.length > 0 ? ` ${extra.slice(0, 2).join(" ")}${extra.length > 2 ? ` (+${extra.length - 2})` : ""}` : ""}`,
      variant: data.skipped > 0 && data.approved + data.rejected === 0 ? "destructive" : undefined,
    });
    setSelected(new Set());
    await load();
    if (data.approved > 0) onDecided?.();
  };

  // Aceitar uma linha sem mudança de unidade: direto. Com mudança: confirmação.
  const acceptOne = (item: PriceChangeItem) => {
    if (item.unit_changed) {
      setDecision({ mode: "approve", items: [item] });
      return;
    }
    void runDecision({ mode: "approve", items: [item] }, { note: "", acceptUnitChange: false });
  };

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold">Preços por aprovar ({pendingCount})</h3>
        <p className="text-xs text-muted-foreground">
          Preços que o fornecedor mudou no portal em artigos ligados aos nossos produtos. Nada muda até aceitar.
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading} aria-label="Atualizar preços por aprovar">
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );

  const total = list?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + items.length;

  return (
    <section ref={sectionRef} className="space-y-3 rounded-lg border p-3" aria-label="Preços por aprovar" id="supplier-price-changes">
      {header}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Preços do fornecedor">
        <Button
          type="button"
          role="tab"
          aria-selected={view === "pending"}
          variant={view === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => changeView("pending")}
        >
          Por aprovar ({pendingCount})
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={view === "decided"}
          variant={view === "decided" ? "default" : "outline"}
          size="sm"
          onClick={() => changeView("decided")}
        >
          Histórico ({decidedCount})
        </Button>
      </div>

      {lastResult && lastResult.length > 0 && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Resultado da última decisão</span>
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setLastResult(null)} aria-label="Fechar resultado">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {lastResult.map((l) => (
              <li key={l.id} className={l.tone === "warn" ? "text-amber-700 dark:text-amber-400" : l.tone === "ok" ? "" : "text-muted-foreground"}>
                <span className="font-mono text-xs">{l.label}</span>: {l.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canDecide && selected.size > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setDecision({ mode: "approve", items: selectedItems })} disabled={deciding}>
            <Check className="w-4 h-4 mr-1" /> Aceitar selecionados ({selected.size})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDecision({ mode: "reject", items: selectedItems })}
            disabled={deciding}
          >
            <X className="w-4 h-4 mr-1" /> Recusar selecionados ({selected.size})
          </Button>
        </div>
      )}

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {!list && loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4">
          {view === "pending" ? "Não há preços por aprovar." : "Ainda não há decisões."}
        </p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canDecide && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => setSelected(v === true ? new Set(selectable) : new Set())}
                      aria-label="Selecionar todos os preços por aprovar desta página"
                    />
                  </TableHead>
                )}
                <TableHead>Produto (SKU)</TableHead>
                <TableHead>Artigo do fornecedor</TableHead>
                <TableHead className="text-right">Preço atual → novo</TableHead>
                <TableHead className="text-right">Dif.</TableHead>
                {view === "pending" ? (
                  <>
                    <TableHead>Custo do produto</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                  </>
                ) : (
                  <TableHead>Decisão</TableHead>
                )}
                {canDecide && <TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const effect = costEffect(item);
                const plan = item.product_cost;
                const busy = busyId === item.id;
                const diffPct = item.diff_pct;
                return (
                  <TableRow key={item.id}>
                    {canDecide && (
                      <TableCell className="align-top">
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={(v) => toggle(item.id, v === true)}
                          aria-label={`Selecionar ${item.catalog_item.supplier_ref}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="align-top">
                      {item.product ? (
                        <>
                          <div className="font-medium">{item.product.name}</div>
                          {item.product.sku && <div className="text-xs text-muted-foreground font-mono">{item.product.sku}</div>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-mono text-xs">{item.catalog_item.supplier_ref}</div>
                      <div className="text-sm">{item.catalog_item.name}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.purchase_uom?.code && <Badge variant="outline">Compra em {item.purchase_uom.code}</Badge>}
                        {item.unit_changed && (
                          <Badge variant="destructive" title="Aceitar exige confirmação">Unidade mudou: {unitChangeText(item)}</Badge>
                        )}
                        {item.stale && <Badge variant="secondary">Ligação mudou</Badge>}
                        {item.already_applied && <Badge variant="secondary">Já aplicado</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top whitespace-nowrap">
                      {formatMoney(view === "pending" ? item.current_price : item.old_price, item.current_currency ?? item.currency)}
                      {" → "}
                      <span className="font-medium">{formatMoney(item.new_price, item.currency)}</span>
                    </TableCell>
                    <TableCell
                      className={`text-right align-top whitespace-nowrap ${diffPct != null && diffPct > 0 ? "text-destructive" : diffPct != null && diffPct < 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                    >
                      {formatPct(diffPct, true)}
                    </TableCell>
                    {view === "pending" ? (
                      <>
                        <TableCell className="align-top text-sm max-w-[18rem]">
                          <span className={effect.changes ? "font-medium" : "text-muted-foreground"}>{effect.text}</span>
                        </TableCell>
                        <TableCell className="text-right align-top whitespace-nowrap text-sm">
                          {plan?.sale_price
                            ? plan.will_update
                              ? `${formatPct(plan.margin_current_pct)} → ${formatPct(plan.margin_new_pct)}`
                              : formatPct(plan.margin_current_pct)
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell className="align-top text-sm">
                        <Badge variant={item.status === "approved" ? "default" : "secondary"}>
                          {item.status === "approved" ? "Aceite" : item.status === "rejected" ? "Recusado" : item.status}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(item.decided_at)}
                          {item.decided_by?.name ? ` · ${item.decided_by.name}` : ""}
                        </div>
                        {item.decision_note && <div className="text-xs mt-1">«{item.decision_note}»</div>}
                      </TableCell>
                    )}
                    {canDecide && (
                      <TableCell className="text-right align-top">
                        <div className="flex justify-end gap-1">
                          <Button type="button" size="sm" onClick={() => acceptOne(item)} disabled={busy || deciding}>
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
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {list && !list.can_decide && view === "pending" && pendingCount > 0 && (
        <p className="text-xs text-muted-foreground">Só quem pode gerir preços (products.manage_prices) aceita ou recusa.</p>
      )}

      {(total > PAGE_SIZE || offset > 0) && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{from}–{to} de {total}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} disabled={loading || offset === 0}>
              Anterior
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOffset((o) => o + PAGE_SIZE)} disabled={loading || to >= total}>
              Seguinte
            </Button>
          </div>
        </div>
      )}

      <PriceChangeDecisionDialog
        request={decision}
        busy={deciding}
        onClose={() => setDecision(null)}
        onConfirm={(opts) => {
          // Usa o pedido tal como foi aberto (o estado pode mudar entretanto).
          const req = decision;
          if (req) void runDecision(req, opts);
        }}
      />
    </section>
  );
}
