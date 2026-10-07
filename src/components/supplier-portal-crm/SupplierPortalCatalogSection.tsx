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
import { CheckCheck, EyeOff, Link2, Loader2, PackagePlus, RefreshCw, RotateCcw, Search, Unlink } from "lucide-react";
import CatalogLinkDialog, { type LinkChoice } from "./CatalogLinkDialog";
import CreateProductFromCatalogDialog, { type CreatedProductInfo } from "./CreateProductFromCatalogDialog";
import BulkCreateProductsDialog, { type BulkCreateRow } from "./BulkCreateProductsDialog";
import SupplierPriceChangesSection from "./SupplierPriceChangesSection";
import { BULK_CREATE_LIMIT, type CreateOutcome } from "./catalogProductCreate";
import {
  REASON_LABEL,
  callRpc,
  confidenceOf,
  describeLinkPriceOutcome,
  fetchFreeSupplierRows,
  formatMoney,
  isNoPricePermission,
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
  /** Link do sino (F3.4b): abrir já em "Preços por aprovar". */
  focusPriceChanges?: boolean;
}

const PAGE_SIZE = 50;
// Referência estável: um [] novo a cada render reiniciava a escolha no diálogo.
const NO_SUGGESTIONS: LinkSuggestion[] = [];

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

type LinkOutcome = {
  ok: boolean;
  result?: CatalogLinkResult;
  message?: string;
  ambiguous?: boolean;
  /** rpc_catalog_link recusou usar o preço do catálogo (falta products.manage_prices). */
  noPricePermission?: boolean;
};

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
  focusPriceChanges = false,
}: SupplierPortalCatalogSectionProps) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canSuggest = hasPermission("products.view");
  // Criar produto a partir do artigo: products.create (como o botão de
  // Products.tsx e o controlo em rpc_create_product) + can_link (products.edit).
  const canCreateProduct = hasPermission("products.create");

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

  const [createItem, setCreateItem] = useState<CrmCatalogItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkCreateItems, setBulkCreateItems] = useState<CrmCatalogItem[] | null>(null);
  // Produtos criados aqui cuja ligação falhou: ficam como 1.ª sugestão do artigo.
  const [createdPending, setCreatedPending] = useState<Record<string, LinkSuggestion>>({});

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

  // Ligar/dispensar o último artigo de uma página > 1 deixa-a vazia: recua.
  useEffect(() => {
    // Só sobre a resposta da página pedida (list.offset === offset), senão
    // recuava outra vez antes de a página anterior chegar.
    if (list && list.items.length === 0 && list.offset > 0 && list.offset === offset) {
      setOffset(Math.max(0, offset - PAGE_SIZE));
    }
  }, [list, offset]);

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

  // Sugestões da RPC + o produto criado aqui (se a ligação falhou), à frente.
  const effectiveSuggestions = useMemo(() => {
    const keys = Object.keys(createdPending);
    if (keys.length === 0) return suggestions;
    const merged: Record<string, LinkSuggestion[]> = { ...suggestions };
    keys.forEach((id) => {
      const created = createdPending[id];
      merged[id] = [created, ...(suggestions[id] ?? []).filter((s) => s.product_id !== created.product_id)];
    });
    return merged;
  }, [suggestions, createdPending]);

  // Seleção para criar em lote: só artigos ativos por ligar da página visível.
  // Os que já têm um produto criado aqui (ligação falhada) ficam de fora, para
  // não se criar um segundo produto para o mesmo artigo.
  const selectableIds = useMemo(
    () =>
      (list?.items ?? [])
        .filter((i) => !i.is_linked && !i.is_dismissed && i.is_active && !createdPending[i.id])
        .map((i) => i.id),
    [list, createdPending],
  );

  useEffect(() => {
    // Nova página/filtro/recarga: larga o que já não está visível por ligar.
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => selectableIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  const toggleSelected = (id: string, on: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on && next.size < BULK_CREATE_LIMIT) next.add(id);
      else if (!on) next.delete(id);
      return next;
    });

  const toggleAllSelected = (on: boolean) =>
    setSelectedIds(on ? new Set(selectableIds.slice(0, BULK_CREATE_LIMIT)) : new Set());

  const exactCandidates = useMemo(
    () => (list?.items ?? []).filter((i) => pendingIds.includes(i.id) && suggestions[i.id]?.[0]?.exact),
    [list, pendingIds, suggestions],
  );

  const changeFilter = (f: CatalogFilter) => {
    setFilter(f);
    setOffset(0);
    setRowErrors({});
  };

  // A RPC procura a linha item_suppliers a reaproveitar por (produto,
  // fornecedor, unidade), por isso a unidade tem de ser a dessa linha:
  // - sugestão "supplier_sku": a linha vem na sugestão;
  // - escolha no diálogo entre várias linhas: vem em choice.uomId;
  // - restantes (barcode/nome, pesquisa, lote): uma só linha livre → a unidade
  //   dela; várias → ambíguo (o diálogo pede para escolher, o lote salta).
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
    } else if (choice.uomId !== undefined) {
      uomId = choice.uomId;
    } else {
      const { rows, error } = await fetchFreeSupplierRows(choice.productId, supplierId);
      if (error) return { ok: false, message: error };
      if (rows.length > 1) {
        return { ok: false, ambiguous: true, message: "Várias ligações deste produto a este fornecedor — liga manualmente." };
      }
      uomId = rows[0]?.uom_id ?? null;
    }
    const { data, error } = await callRpc<CatalogLinkResult>("rpc_catalog_link", {
      p_supplier_id: supplierId,
      p_catalog_item_id: item.id,
      p_product_id: choice.productId,
      p_uom_id: uomId,
      p_apply_catalog_price: choice.applyCatalogPrice,
    });
    if (error || !data) {
      return {
        ok: false,
        message: error?.message || "Não foi possível ligar o artigo.",
        noPricePermission: isNoPricePermission(error),
      };
    }
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
      // As permissões mudaram desde que a lista carregou: recarrega
      // can_manage_prices (o diálogo esconde a opção do preço).
      if (outcome.noPricePermission) void load();
      return;
    }
    clearRowError(item.id);
    forgetCreated([item.id]);
    setLinkItem(null);
    const { result } = outcome;
    toast({
      title: result.already_linked ? "O artigo já estava ligado" : "Artigo ligado",
      description: [
        `${item.supplier_ref} → ${choice.productName}${result.created ? " (nova associação ao fornecedor)" : ""}.`,
        describeLinkPriceOutcome(result, item.currency),
        ...(result.warnings ?? []),
      ]
        .filter(Boolean)
        .join(" "),
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
    let skipped = 0;
    let costsUpdated = 0;
    let pricesOnly = 0;
    // Usar o preço do catálogo exige ver preços E products.manage_prices
    // (senão rpc_catalog_link recusa com no_price_permission).
    const applyPrice = !!list?.can_view_pricing && !!list?.can_manage_prices;
    // Em sequência, para os erros ficarem na linha certa (contrato 3.4).
    for (const item of targets) {
      const top = suggestions[item.id]?.[0];
      if (!top?.exact) continue;
      const outcome = await linkOne(item, {
        productId: top.product_id,
        productName: top.product_name,
        itemSupplierId: top.item_supplier_id,
        applyCatalogPrice: applyPrice,
      });
      if (outcome.ok) {
        ok += 1;
        if (outcome.result?.product_cost_updated) costsUpdated += 1;
        else if (outcome.result?.item_supplier_price_updated) pricesOnly += 1;
        warnings.push(...(outcome.result?.warnings ?? []).map((w) => `${item.supplier_ref}: ${w}`));
      } else if (outcome.ambiguous) {
        // Várias linhas do produto para este fornecedor: não se adivinha qual.
        skipped += 1;
        errors[item.id] = outcome.message ?? "Várias ligações — liga manualmente.";
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
    const failed = Object.keys(errors).length - skipped;
    toast({
      title: "Sugestões exatas aceites",
      description: `${ok} ligado(s)${applyPrice && ok > 0 ? ` (custo do produto atualizado em ${costsUpdated}${pricesOnly > 0 ? `; só o preço do fornecedor em ${pricesOnly}` : ""})` : ""}${skipped > 0 ? `, ${skipped} saltado(s) por terem várias ligações (ligar manualmente)` : ""}${failed > 0 ? `, ${failed} com erro (ver na linha)` : ""}.${warnings.length > 0 ? ` Avisos: ${warnings.slice(0, 3).join(" | ")}${warnings.length > 3 ? ` (+${warnings.length - 3})` : ""}` : ""}`,
      variant: failed > 0 ? "destructive" : undefined,
    });
    if (ok > 0) {
      await load();
      onLinksChanged?.();
    }
  };

  const createdSuggestion = (product: CreatedProductInfo): LinkSuggestion => ({
    product_id: product.productId,
    product_name: product.name,
    product_sku: product.sku,
    product_barcode: product.barcode,
    reason: "created",
    score: 1,
    exact: false,
    item_supplier_id: null,
  });

  const forgetCreated = (ids: string[]) =>
    setCreatedPending((prev) => {
      if (!ids.some((id) => id in prev)) return prev;
      const next = { ...prev };
      ids.forEach((id) => { delete next[id]; });
      return next;
    });

  const handleProductCreated = async (
    item: CrmCatalogItem,
    outcome: Exclude<CreateOutcome, { status: "error" }>,
    product: CreatedProductInfo,
  ) => {
    setCreateItem(null);
    if (outcome.status === "created_not_linked") {
      setCreatedPending((prev) => ({ ...prev, [item.id]: createdSuggestion(product) }));
      setRowErrors((prev) => ({ ...prev, [item.id]: outcome.message }));
      toast({
        title: "Produto criado mas não ficou ligado",
        description: `«${product.name}» (${product.sku}) foi criado. Liga-o manualmente: está como sugestão no artigo ${item.supplier_ref}.`,
        variant: "destructive",
      });
      return;
    }
    clearRowError(item.id);
    forgetCreated([item.id]);
    toast({
      title: "Produto criado e ligado",
      description: [
        `${item.supplier_ref} → ${product.name} (${product.sku}).`,
        outcome.priceNotApplied ?? describeLinkPriceOutcome(outcome.result, item.currency),
        ...(outcome.result.warnings ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    });
    await load();
    onLinksChanged?.();
  };

  const handleBulkCreated = async (rows: BulkCreateRow[]) => {
    const linkedIds: string[] = [];
    const errors: Record<string, string> = {};
    const pending: Record<string, LinkSuggestion> = {};
    rows.forEach((r) => {
      if (r.status === "linked") {
        linkedIds.push(r.item.id);
      } else if (r.status === "not_linked" && r.productId) {
        errors[r.item.id] = r.message ?? "Produto criado mas não ficou ligado — liga-o manualmente.";
        pending[r.item.id] = createdSuggestion({
          productId: r.productId,
          name: r.item.name,
          sku: r.sku.trim(),
          barcode: r.item.barcode,
        });
      } else if (r.status === "error") {
        errors[r.item.id] = r.message ?? "Não foi possível criar o produto.";
      }
    });
    forgetCreated(linkedIds);
    if (Object.keys(pending).length > 0) setCreatedPending((prev) => ({ ...prev, ...pending }));
    setRowErrors((prev) => {
      const next = { ...prev };
      rows.forEach((r) => { delete next[r.item.id]; });
      return { ...next, ...errors };
    });
    setSelectedIds(new Set());
    if (linkedIds.length > 0) {
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

  // Preços por aprovar (F3.4b): também sem conta ativa (pedidos de antes de
  // revogar o acesso continuam por decidir).
  const priceChanges = (
    <SupplierPriceChangesSection
      supplierId={supplierId}
      focus={focusPriceChanges}
      onDecided={() => {
        void load();
        onLinksChanged?.();
      }}
    />
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
        {priceChanges}
      </section>
    );
  }

  const canLink = list.can_link;
  const showPrice = list.can_view_pricing;
  const canManagePrices = !!list.can_manage_prices;
  const items = list.items;
  const canCreate = canLink && canCreateProduct && !!organizationId;
  const showSelection = canCreate && selectableIds.length > 0;
  const allSelected = showSelection && selectableIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const from =list.total === 0 ? 0 : list.offset + 1;
  const to = list.offset + items.length;

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Catálogo do fornecedor">
      {header}

      {priceChanges}

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
        <div className="flex flex-wrap gap-2">
          {canCreate && selectedIds.size > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBulkCreateItems(items.filter((i) => selectedIds.has(i.id)))}
              disabled={bulkRunning}
            >
              <PackagePlus className="w-4 h-4 mr-1" /> Criar produtos selecionados ({selectedIds.size})
            </Button>
          )}
          {canLink && canSuggest && exactCandidates.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(true)} disabled={bulkRunning}>
              <CheckCheck className="w-4 h-4 mr-1" /> Aceitar sugestões exatas ({exactCandidates.length})
            </Button>
          )}
        </div>
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
                {showSelection && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAllSelected(v === true)}
                      aria-label="Selecionar todos os artigos por ligar desta página"
                    />
                  </TableHead>
                )}
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
                const sugg = effectiveSuggestions[item.id] ?? [];
                const top = sugg[0];
                const pending = !item.is_linked && !item.is_dismissed;
                const busy = busyId === item.id;
                return (
                  <TableRow key={item.id} className={item.is_active ? "" : "opacity-60"}>
                    {showSelection && (
                      <TableCell className="align-top">
                        {selectableIds.includes(item.id) && (
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={(v) => toggleSelected(item.id, v === true)}
                            aria-label={`Selecionar ${item.supplier_ref} para criar produto`}
                          />
                        )}
                      </TableCell>
                    )}
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
                              {canCreate && !createdPending[item.id] && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCreateItem(item)}
                                  disabled={busy || bulkRunning}
                                  title="O artigo não existe nos nossos produtos: criar o produto já ligado"
                                >
                                  <PackagePlus className="w-4 h-4 mr-1" /> Criar produto
                                </Button>
                              )}
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

      {(list.total > PAGE_SIZE || list.offset > 0) && (
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
        suggestions={linkItem ? effectiveSuggestions[linkItem.id] ?? NO_SUGGESTIONS : NO_SUGGESTIONS}
        supplierId={supplierId}
        organizationId={organizationId}
        canViewPricing={showPrice}
        canManagePrices={canManagePrices}
        linking={linking}
        onClose={() => setLinkItem(null)}
        onConfirm={handleLink}
        onCreateProduct={
          canCreate && linkItem && !linkItem.is_linked && !createdPending[linkItem.id]
            ? () => {
                const it = linkItem;
                setLinkItem(null);
                setCreateItem(it);
              }
            : undefined
        }
      />

      <CreateProductFromCatalogDialog
        item={createItem}
        supplierId={supplierId}
        organizationId={organizationId}
        canViewPricing={showPrice}
        canManagePrices={canManagePrices}
        onClose={() => setCreateItem(null)}
        onDone={(it, outcome, product) => { void handleProductCreated(it, outcome, product); }}
      />

      <BulkCreateProductsDialog
        items={bulkCreateItems}
        supplierId={supplierId}
        organizationId={organizationId}
        canViewPricing={showPrice}
        canManagePrices={canManagePrices}
        onClose={() => setBulkCreateItems(null)}
        onFinished={(rows) => { void handleBulkCreated(rows); }}
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
              sugerido{showPrice && canManagePrices ? ", com o preço do catálogo como preço deste fornecedor (e custo do produto, quando é o fornecedor preferencial)" : ""}. Os erros ficam indicados na linha do artigo;
              os produtos com várias associações a este fornecedor são saltados.
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
