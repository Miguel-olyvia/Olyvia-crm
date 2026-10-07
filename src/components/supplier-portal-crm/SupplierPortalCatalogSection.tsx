import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCheck, EyeOff, Link2, Loader2, RefreshCw, RotateCcw, Search, Unlink } from "lucide-react";
import CatalogLinkDialog, { type LinkChoice } from "./CatalogLinkDialog";
import {
  REASON_LABEL,
  callRpc,
  confidenceOf,
  formatMoney,
  type CatalogFilter,
  type CatalogLinkResult,
  type CrmCatalogItem,
  type CrmCatalogList,
  type LinkSuggestion,
  type LinkSuggestionsResult,
} from "./types";

interface SupplierPortalCatalogSectionProps {
  supplierId: string;
  organizationId: string | null;
  /** Ligar/desligar mexe em item_suppliers: o painel recarrega a tabela dele. */
  onLinksChanged?: () => void;
  /** Atalho para o separador Portal (quando o fornecedor ainda não tem acesso). */
  onOpenPortalTab?: () => void;
}

const PAGE_SIZE = 50;

const FILTERS: { value: CatalogFilter; label: string }[] = [
  { value: "unlinked", label: "Por ligar" },
  { value: "linked", label: "Ligados" },
  { value: "dismissed", label: "Dispensados" },
  { value: "all", label: "Todos" },
];

const formatUnit = (item: CrmCatalogItem) => {
  if (!item.unit_label && !item.units_per_pack) return "-";
  return [item.unit_label, item.units_per_pack ? `× ${item.units_per_pack}` : null].filter(Boolean).join(" ");
};

type LinkOutcome = { ok: boolean; result?: CatalogLinkResult; message?: string };

// Catálogo gerido pelo fornecedor no portal (F3.1), visto do CRM: filtro
// Por ligar / Ligados / Dispensados / Todos (rpc_supplier_catalog_list),
// sugestões de produto para a página visível (rpc_catalog_link_suggestions)
// e as ações ligar / desligar / dispensar. Toda a escrita passa pelas RPCs;
// item_suppliers.catalog_item_id nunca se escreve diretamente.
export default function SupplierPortalCatalogSection({
  supplierId,
  organizationId,
  onLinksChanged,
  onOpenPortalTab,
}: SupplierPortalCatalogSectionProps) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canSuggest = hasPermission("products.view");

  const [filter, setFilter] = useState<CatalogFilter>("unlinked");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<CrmCatalogList | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<Record<string, LinkSuggestion[]>>({});
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [linkItem, setLinkItem] = useState<CrmCatalogItem | null>(null);
  const [linking, setLinking] = useState(false);

  const [unlinkItem, setUnlinkItem] = useState<CrmCatalogItem | null>(null);
  const [removeItemSupplier, setRemoveItemSupplier] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  // Pesquisa com atraso; volta à primeira página.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await callRpc<CrmCatalogList>("rpc_supplier_catalog_list", {
      p_supplier_id: supplierId,
      p_filter: filter,
      p_search: search || null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_include_inactive: false,
    });
    setLoading(false);
    if (error) {
      setLoadError(error.message || "Não foi possível carregar o catálogo do fornecedor.");
      return;
    }
    setLoadError(null);
    setList(data);
  }, [supplierId, filter, search, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // Sugestões em lote para os artigos visíveis que estão por ligar.
  const pendingIds = useMemo(
    () => (list?.items ?? []).filter((i) => !i.is_linked && !i.is_dismissed && i.is_active).map((i) => i.id),
    [list],
  );

  useEffect(() => {
    if (!list?.linked_account || !canSuggest || pendingIds.length === 0) {
      setSuggestions({});
      setSuggestionsError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setSuggestionsLoading(true);
      const { data, error } = await callRpc<LinkSuggestionsResult>("rpc_catalog_link_suggestions", {
        p_supplier_id: supplierId,
        p_catalog_item_ids: pendingIds,
      });
      if (cancelled) return;
      setSuggestionsLoading(false);
      if (error) {
        setSuggestionsError(error.message || "Não foi possível calcular as sugestões.");
        setSuggestions({});
        return;
      }
      setSuggestionsError(null);
      const map: Record<string, LinkSuggestion[]> = {};
      (data?.items ?? []).forEach((r) => { map[r.catalog_item_id] = r.suggestions ?? []; });
      setSuggestions(map);
    })();
    return () => { cancelled = true; };
  }, [list, pendingIds, canSuggest, supplierId]);

  const exactCandidates = useMemo(
    () => (list?.items ?? []).filter((i) => pendingIds.includes(i.id) && suggestions[i.id]?.[0]?.exact),
    [list, pendingIds, suggestions],
  );

  const changeFilter = (f: CatalogFilter) => {
    setFilter(f);
    setOffset(0);
    setRowErrors({});
  };

  // A sugestão "supplier_sku" reaproveita uma linha item_suppliers existente;
  // a RPC procura-a por (produto, fornecedor, unidade), por isso a unidade
  // tem de ser a dessa linha.
  const linkOne = async (item: CrmCatalogItem, choice: LinkChoice): Promise<LinkOutcome> => {
    let uomId: string | null = null;
    if (choice.itemSupplierId) {
      const { data, error } = await supabase
        .from("item_suppliers")
        .select("uom_id")
        .eq("id", choice.itemSupplierId)
        .maybeSingle();
      if (error) return { ok: false, message: error.message };
      uomId = data?.uom_id ?? null;
    }
    const { data, error } = await callRpc<CatalogLinkResult>("rpc_catalog_link", {
      p_supplier_id: supplierId,
      p_catalog_item_id: item.id,
      p_product_id: choice.productId,
      p_uom_id: uomId,
      p_apply_catalog_price: choice.applyCatalogPrice,
    });
    if (error || !data) return { ok: false, message: error?.message || "Não foi possível ligar o artigo." };
    return { ok: true, result: data };
  };

  const clearRowError = (id: string) =>
    setRowErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const handleLink = async (choice: LinkChoice) => {
    if (!linkItem) return;
    const item = linkItem;
    setLinking(true);
    const outcome = await linkOne(item, choice);
    setLinking(false);
    if (!outcome.ok) {
      setRowErrors((prev) => ({ ...prev, [item.id]: outcome.message }));
      toast({ title: "Não foi possível ligar", description: outcome.message, variant: "destructive" });
      return;
    }
    clearRowError(item.id);
    setLinkItem(null);
    const { result } = outcome;
    toast({
      title: result.already_linked ? "O artigo já estava ligado" : "Artigo ligado",
      description: [
        `${item.supplier_ref} → ${choice.productName}${result.created ? " (nova associação ao fornecedor)" : ""}.`,
        ...(result.warnings ?? []),
      ].join(" "),
    });
    await load();
    onLinksChanged?.();
  };

  const handleBulkExact = async () => {
    const targets = exactCandidates;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: targets.length });
    const errors: Record<string, string> = {};
    const warnings: string[] = [];
    let ok = 0;
    // Em sequência, para os erros ficarem na linha certa (contrato 3.4).
    for (const item of targets) {
      const top = suggestions[item.id]?.[0];
      if (!top?.exact) continue;
      const outcome = await linkOne(item, {
        productId: top.product_id,
        productName: top.product_name,
        itemSupplierId: top.item_supplier_id,
        applyCatalogPrice: true,
      });
      if (outcome.ok) {
        ok += 1;
        warnings.push(...(outcome.result?.warnings ?? []).map((w) => `${item.supplier_ref}: ${w}`));
      } else {
        errors[item.id] = outcome.message ?? "Erro ao ligar.";
      }
      setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setBulkRunning(false);
    setBulkOpen(false);
    setRowErrors((prev) => {
      const next = { ...prev };
      targets.forEach((t) => { delete next[t.id]; });
      return { ...next, ...errors };
    });
    const failed = Object.keys(errors).length;
    toast({
      title: "Sugestões exatas aceites",
      description: `${ok} ligado(s)${failed > 0 ? `, ${failed} com erro (ver na linha)` : ""}.${warnings.length > 0 ? ` Avisos: ${warnings.slice(0, 3).join(" | ")}${warnings.length > 3 ? ` (+${warnings.length - 3})` : ""}` : ""}`,
      variant: failed > 0 ? "destructive" : undefined,
    });
    if (ok > 0) {
      await load();
      onLinksChanged?.();
    }
  };

  const handleDismiss = async (item: CrmCatalogItem, dismissed: boolean) => {
    setBusyId(item.id);
    const { error } = await callRpc<{ changed: number }>("rpc_catalog_dismiss", {
      p_supplier_id: supplierId,
      p_catalog_item_ids: [item.id],
      p_dismissed: dismissed,
      p_reason: null,
    });
    setBusyId(null);
    if (error) {
      setRowErrors((prev) => ({ ...prev, [item.id]: error.message || "Erro." }));
      toast({ title: "Não foi possível alterar", description: error.message, variant: "destructive" });
      return;
    }
    clearRowError(item.id);
    toast({
      title: dismissed ? "Artigo dispensado" : "Artigo reposto",
      description: dismissed
        ? `${item.supplier_ref} sai da lista "Por ligar".`
        : `${item.supplier_ref} volta à lista "Por ligar".`,
    });
    await load();
  };

  const handleUnlink = async () => {
    if (!unlinkItem) return;
    const item = unlinkItem;
    setUnlinking(true);
    const { data, error } = await callRpc<{ unlinked: number; codes_removed: number; item_supplier_removed: boolean }>(
      "rpc_catalog_unlink",
      { p_supplier_id: supplierId, p_catalog_item_id: item.id, p_remove_item_supplier: removeItemSupplier },
    );
    setUnlinking(false);
    if (error) {
      toast({ title: "Não foi possível desligar", description: error.message, variant: "destructive" });
      return;
    }
    setUnlinkItem(null);
    toast({
      title: "Artigo desligado",
      description: data?.item_supplier_removed
        ? `${item.supplier_ref} desligado e a associação ao produto foi removida.`
        : `${item.supplier_ref} desligado. A associação ao produto mantém-se, sem ligação ao catálogo.`,
    });
    await load();
    onLinksChanged?.();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold">Catálogo do fornecedor</h3>
        <p className="text-xs text-muted-foreground">Artigos que o fornecedor gere no Portal do Fornecedor.</p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => load()} disabled={loading} aria-label="Atualizar catálogo do fornecedor">
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );

  if (!list) {
    return (
      <section className="space-y-3 border-t pt-4">
        {header}
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
        )}
      </section>
    );
  }

  if (!list.linked_account) {
    return (
      <section className="space-y-3 border-t pt-4">
        {header}
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>Este fornecedor ainda não tem acesso ao portal. O catálogo dele aparece aqui depois de ser convidado.</span>
          {onOpenPortalTab && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenPortalTab}>
              Ir para o separador Portal
            </Button>
          )}
        </div>
      </section>
    );
  }

  const canLink = list.can_link;
  const showPrice = list.can_view_pricing;
  const items = list.items;
  const from = list.total === 0 ? 0 : list.offset + 1;
  const to = list.offset + items.length;

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Catálogo do fornecedor">
      {header}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar catálogo do fornecedor">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => changeFilter(f.value)}
          >
            {f.label} ({list.counts?.[f.value] ?? 0})
          </Button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por ref., nome, código de barras ou marca"
            className="pl-10"
            aria-label="Pesquisar no catálogo do fornecedor"
          />
        </div>
        {canLink && canSuggest && exactCandidates.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(true)} disabled={bulkRunning}>
            <CheckCheck className="w-4 h-4 mr-1" /> Aceitar sugestões exatas ({exactCandidates.length})
          </Button>
        )}
      </div>

      {!canSuggest && pendingIds.length > 0 && (
        <p className="text-xs text-muted-foreground">Sem permissão para ver produtos: as sugestões não estão disponíveis.</p>
      )}
      {suggestionsError && <p className="text-xs text-destructive">{suggestionsError}</p>}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          {search ? "Nenhum resultado." : filter === "unlinked" ? "Não há artigos por ligar." : "Nenhum artigo."}
        </p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref. fornecedor</TableHead>
                <TableHead>Artigo</TableHead>
                <TableHead>Unidade</TableHead>
                {showPrice && <TableHead className="text-right">Preço catálogo</TableHead>}
                <TableHead>Produto / sugestão</TableHead>
                {canLink && <TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const sugg = suggestions[item.id] ?? [];
                const top = sugg[0];
                const pending = !item.is_linked && !item.is_dismissed;
                const busy = busyId === item.id;
                return (
                  <TableRow key={item.id} className={item.is_active ? "" : "opacity-60"}>
                    <TableCell className="font-mono text-xs align-top">{item.supplier_ref}</TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[item.brand, item.barcode ? `EAN ${item.barcode}` : null].filter(Boolean).join(" · ") || null}
                      </div>
                      {!item.is_active && <Badge variant="secondary" className="mt-1">Inativo</Badge>}
                      {rowErrors[item.id] && <p className="text-xs text-destructive mt-1">{rowErrors[item.id]}</p>}
                    </TableCell>
                    <TableCell className="align-top whitespace-nowrap">{formatUnit(item)}</TableCell>
                    {showPrice && (
                      <TableCell className="text-right align-top whitespace-nowrap">{formatMoney(item.base_price, item.currency)}</TableCell>
                    )}
                    <TableCell className="align-top">
                      {item.is_linked ? (
                        <div className="space-y-1">
                          {item.links.map((l) => (
                            <div key={l.item_supplier_id} className="text-sm">
                              <Badge variant="default" className="mr-1">Ligado</Badge>
                              {l.product_name}
                              {l.product_sku && <span className="text-xs text-muted-foreground"> · {l.product_sku}</span>}
                              {showPrice && l.purchase_price != null && (
                                <span className="text-xs text-muted-foreground"> · {formatMoney(l.purchase_price, l.currency)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : item.is_dismissed ? (
                        <Badge variant="outline">Dispensado</Badge>
                      ) : top ? (
                        <div className="space-y-1">
                          <div className="text-sm">{top.product_name}{top.product_sku && <span className="text-xs text-muted-foreground"> · {top.product_sku}</span>}</div>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline">{REASON_LABEL[top.reason]}</Badge>
                            <Badge variant={confidenceOf(top).variant}>{confidenceOf(top).label}</Badge>
                            {sugg.length > 1 && <span className="text-xs text-muted-foreground self-center">+{sugg.length - 1} sugestão(ões)</span>}
                          </div>
                        </div>
                      ) : pending && item.is_active && canSuggest ? (
                        <span className="text-xs text-muted-foreground">
                          {suggestionsLoading ? "A procurar sugestões..." : "Sem sugestões"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {canLink && (
                      <TableCell className="text-right align-top">
                        <div className="flex justify-end gap-1">
                          {pending && (
                            <>
                              <Button type="button" size="sm" onClick={() => setLinkItem(item)} disabled={busy || bulkRunning}>
                                <Link2 className="w-4 h-4 mr-1" /> Ligar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDismiss(item, true)}
                                disabled={busy || bulkRunning}
                                title="Não vendemos isto: sai da lista Por ligar"
                              >
                                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <EyeOff className="w-4 h-4 mr-1" />}
                                Dispensar
                              </Button>
                            </>
                          )}
                          {item.is_dismissed && !item.is_linked && (
                            <Button type="button" variant="outline" size="sm" onClick={() => handleDismiss(item, false)} disabled={busy}>
                              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                              Repor
                            </Button>
                          )}
                          {item.is_linked && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => { setRemoveItemSupplier(false); setUnlinkItem(item); }}
                            >
                              <Unlink className="w-4 h-4 mr-1" /> Desligar
                            </Button>
                          )}
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

      {list.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{from}–{to} de {list.total}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={loading || list.offset === 0}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              disabled={loading || to >= list.total}
            >
              Seguinte
            </Button>
          </div>
        </div>
      )}

      <CatalogLinkDialog
        item={linkItem}
        suggestions={linkItem ? suggestions[linkItem.id] ?? [] : []}
        organizationId={organizationId}
        canViewPricing={showPrice}
        linking={linking}
        onClose={() => setLinkItem(null)}
        onConfirm={handleLink}
      />

      <AlertDialog open={!!unlinkItem} onOpenChange={(v) => { if (!v && !unlinking) setUnlinkItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar «{unlinkItem?.supplier_ref}»?</AlertDialogTitle>
            <AlertDialogDescription>
              O artigo do catálogo deixa de estar ligado a {unlinkItem?.links.map((l) => l.product_name).join(", ") || "o produto"}.
              Os códigos criados pela ligação são anulados e o artigo volta à lista "Por ligar".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2">
            <Checkbox
              id="catalog-unlink-remove"
              checked={removeItemSupplier}
              onCheckedChange={(v) => setRemoveItemSupplier(!!v)}
            />
            <Label htmlFor="catalog-unlink-remove" className="text-sm font-normal leading-snug cursor-pointer">
              Remover também a associação do produto a este fornecedor
              <span className="block text-xs text-muted-foreground">
                Por omissão mantém-se (com o preço e a ref.), apenas sem ligação ao catálogo.
              </span>
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleUnlink(); }}
              disabled={unlinking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinking && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Desligar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen} onOpenChange={(v) => { if (!bulkRunning) setBulkOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aceitar {exactCandidates.length} sugestão(ões) exata(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Cada artigo desta página com uma sugestão exata (ref. igual ou código de barras) é ligado ao produto
              sugerido, com o preço do catálogo. Os erros ficam indicados na linha do artigo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkRunning && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {bulkProgress.done} de {bulkProgress.total}...
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleBulkExact(); }} disabled={bulkRunning}>
              Aceitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
