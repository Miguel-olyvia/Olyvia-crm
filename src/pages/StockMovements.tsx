import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Download, Lock, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import StockMovementDialog from "@/components/inventory/StockMovementDialog";
import {
  InventoryPageHeader,
  InventoryStatusBadge,
  InventoryEmptyState,
  MOVEMENT_TYPES,
  movementTypeLabel,
  movementTypeTone,
  signedMovementQty,
} from "@/components/inventory/ui";
import { inventoryTodayQueryKey } from "@/hooks/useInventoryToday";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";
import { escapeIlike, escapePostgrestOrTerm } from "@/lib/clientSearch";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { cn } from "@/lib/utils";

// Movimentos: o livro completo de stock_movements da organização ativa.
// O livro é imutável (RLS RESTRICTIVE bloqueia UPDATE/DELETE): este ecrã é só
// de leitura — correções fazem-se com novos movimentos.
//
// Todas as consultas filtram organization_id = empresa ativa: a RLS deixa ver
// também outras organizações visíveis (descendentes/associadas).

const PAGE_SIZE = 40;
const EXPORT_BATCH = 1000;
// Pesquisa por produto: ids resolvidos no catálogo e enviados num .in() (vai
// no URL) — limite para não passar o tamanho máximo do pedido.
const PRODUCT_SEARCH_LIMIT = 200;
// Permissão de custo já usada no resto da app (ItemSuppliersTable, avisos de
// preço do fornecedor). Sem ela, unit_cost_at_time nem é pedido.
const COST_PERMISSION = "products.view_cost";

interface MovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  document_number: string;
  counterparty: string | null;
  notes: string | null;
  created_at: string;
  product_id: string;
  warehouse_id: string;
  unit_cost_at_time?: number | null;
  products?: { name: string; sku: string | null } | null;
  warehouses?: { name: string } | null;
  created_by_user?: { name: string | null } | null;
}

interface Filters {
  productId: string;
  productIds: string[] | null; // resultado da pesquisa de texto (null = sem pesquisa)
  type: string;
  warehouse: string;
  doc: string;
  from: string;
  to: string;
}

const formatQty = (value: number): string =>
  new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(value);
const formatEur = (value: number): string =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 4 }).format(value);
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

// Datas do filtro em hora local: De = início do dia, Até = início do dia seguinte (exclusivo).
const startOfLocalDay = (date: string) => new Date(`${date}T00:00:00`).toISOString();
const startOfNextLocalDay = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

const StockMovements = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();
  const canViewCost = hasPermission(COST_PERMISSION);
  const [searchParams, setSearchParams] = useSearchParams();

  // Filtros iniciais do URL (?product=<uuid>&warehouse=<uuid>, ex.: "Histórico" em Existências).
  const [productId, setProductId] = useState(() => searchParams.get("product") || "");
  const [warehouseFilter, setWarehouseFilter] = useState(() => searchParams.get("warehouse") || "all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [docFilter, setDocFilter] = useState("");
  const [debouncedDoc, setDebouncedDoc] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDoc(docFilter.trim()), 300);
    return () => clearTimeout(timer);
  }, [docFilter]);

  // Filtros de produto/armazém ↔ URL, nos dois sentidos.
  // O setSearchParams do react-router 6 muda de identidade a cada navegação;
  // se fosse dependência do efeito estado→URL, uma navegação externa (ex.:
  // "Movimentos" no menu → /stock-movements) voltaria a escrever os filtros
  // antigos por cima do URL novo. Por isso o efeito lê-o de uma ref e só corre
  // quando o estado muda; os efeitos URL→estado só correm quando o URL muda.
  const productParam = searchParams.get("product") || "";
  const warehouseParam = searchParams.get("warehouse") || "all";
  const searchParamsRef = useRef({ searchParams, setSearchParams });
  searchParamsRef.current = { searchParams, setSearchParams };

  // URL → estado (navegação externa, voltar/avançar do browser).
  useEffect(() => {
    setProductId((prev) => (prev === productParam ? prev : productParam));
  }, [productParam]);
  useEffect(() => {
    setWarehouseFilter((prev) => (prev === warehouseParam ? prev : warehouseParam));
  }, [warehouseParam]);

  // Estado → URL (partilhável, e o "voltar" do browser não reabre filtros
  // antigos — replace).
  useEffect(() => {
    const { searchParams: currentParams, setSearchParams: writeParams } = searchParamsRef.current;
    const wantedProduct = productId || null;
    const wantedWarehouse = warehouseFilter !== "all" ? warehouseFilter : null;
    if (currentParams.get("product") === wantedProduct && currentParams.get("warehouse") === wantedWarehouse) return;
    writeParams((prev) => {
      const next = new URLSearchParams(prev);
      if (wantedProduct) next.set("product", wantedProduct); else next.delete("product");
      if (wantedWarehouse) next.set("warehouse", wantedWarehouse); else next.delete("warehouse");
      return next;
    }, { replace: true });
  }, [productId, warehouseFilter]);

  // Armazéns da organização ativa (filtro + nomes + diálogo de movimento).
  const { data: warehouses = [] } = useQuery({
    queryKey: ["stock-movements-warehouses", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", orgId as string)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
  const warehouseNameById = useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, w.name])) as Record<string, string>,
    [warehouses],
  );

  // Produto vindo do URL: nome lido do catálogo da organização ativa.
  const { data: urlProduct } = useQuery({
    queryKey: ["stock-movements-product", orgId, productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("organization_id", orgId as string)
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; sku: string | null } | null;
    },
    enabled: !!orgId && !!productId,
    staleTime: 5 * 60 * 1000,
  });

  // Pesquisa Produto/SKU/EAN: resolvida no catálogo de produtos da organização
  // (mesmos filtros do diálogo de movimento: ativo, não eliminado) e aplicada
  // ao livro por product_id.
  const productSearch = useQuery({
    queryKey: ["stock-movements-product-search", orgId, debouncedSearch],
    queryFn: async () => {
      const term = escapePostgrestOrTerm(debouncedSearch);
      if (!term) return { ids: [] as string[], truncated: false };
      const { data, error } = await supabase
        .from("products")
        .select("id")
        .eq("organization_id", orgId as string)
        .eq("is_active", true)
        .is("deleted_at", null)
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
        .order("name", { ascending: true })
        .limit(PRODUCT_SEARCH_LIMIT);
      if (error) throw error;
      const ids = (data || []).map((p: { id: string }) => p.id);
      return { ids, truncated: ids.length >= PRODUCT_SEARCH_LIMIT };
    },
    enabled: !!orgId && !!debouncedSearch,
    staleTime: 60 * 1000,
    retry: 1,
  });

  const filters: Filters = {
    productId,
    productIds: debouncedSearch ? (productSearch.data?.ids ?? null) : null,
    type: typeFilter,
    warehouse: warehouseFilter,
    doc: debouncedDoc,
    from: fromDate,
    to: toDate,
  };
  // À espera dos ids da pesquisa: só enquanto o pedido está mesmo a correr
  // (isLoading = sem dados e a buscar). Se falhar, não fica pendurado em
  // "A carregar…": mostra o erro — e nunca o livro sem filtro, que seria
  // um resultado errado para o termo pesquisado.
  const searchPending = !!debouncedSearch && productSearch.isLoading;
  const searchFailed = !!debouncedSearch && !productSearch.data && !!productSearch.error && !productSearch.isFetching;

  const selectColumns = [
    "id, movement_type, quantity, balance_after, document_number, counterparty, notes, created_at, product_id, warehouse_id",
    canViewCost ? "unit_cost_at_time" : null,
    "products(name, sku)",
    "warehouses(name)",
    "created_by_user:anew_users!stock_movements_created_by_fkey(name)",
  ].filter(Boolean).join(", ");

  const buildQuery = (f: Filters, withCount: boolean) => {
    let query = (supabase as any)
      .from("stock_movements")
      .select(selectColumns, withCount ? { count: "exact" } : undefined)
      .eq("organization_id", orgId);
    if (f.productId) query = query.eq("product_id", f.productId);
    if (f.productIds) query = query.in("product_id", f.productIds);
    if (f.type !== "all") query = query.eq("movement_type", f.type);
    if (f.warehouse !== "all") query = query.eq("warehouse_id", f.warehouse);
    if (f.doc) query = query.ilike("document_number", `%${escapeIlike(f.doc)}%`);
    if (f.from) query = query.gte("created_at", startOfLocalDay(f.from));
    if (f.to) query = query.lt("created_at", startOfNextLocalDay(f.to));
    return query.order("created_at", { ascending: false }).order("id", { ascending: false });
  };

  const movements = useInfiniteQuery({
    queryKey: ["stock-movements", orgId, filters, canViewCost],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      // Pesquisa sem nenhum produto no catálogo = nada a mostrar.
      if (filters.productIds && filters.productIds.length === 0) {
        return { rows: [] as MovementRow[], count: 0 };
      }
      const from = (pageParam as number) * PAGE_SIZE;
      // Total exato só na primeira página (filtrado por org, com índice).
      const { data, error, count } = await buildQuery(filters, pageParam === 0).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data || []) as MovementRow[], count: count ?? null };
    },
    getNextPageParam: (lastPage, pages) => (lastPage.rows.length === PAGE_SIZE ? pages.length : undefined),
    enabled: !!orgId && !searchPending && !searchFailed,
  });

  useEffect(() => {
    if (movements.error) {
      toast({
        title: "Erro ao carregar movimentos",
        description: (movements.error as Error).message,
        variant: "destructive",
      });
    }
  }, [movements.error, toast]);

  const rows = useMemo(() => movements.data?.pages.flatMap((p) => p.rows) ?? [], [movements.data]);
  const total = movements.data?.pages[0]?.count ?? null;

  const hasActiveFilters =
    !!productId || !!searchTerm || typeFilter !== "all" || warehouseFilter !== "all" || !!docFilter || !!fromDate || !!toDate;

  const clearFilters = () => {
    setProductId("");
    setSearchTerm("");
    setTypeFilter("all");
    setWarehouseFilter("all");
    setDocFilter("");
    setFromDate("");
    setToDate("");
  };

  // Exporta todas as linhas com os filtros atuais, em lotes de 1000 (nunca um
  // pedido sem range — o PostgREST corta nas 1000).
  const handleExport = async () => {
    if (!orgId) return;
    // Sem os ids da pesquisa o filtro cairia e exportaria o livro inteiro.
    if (searchPending || searchFailed) {
      toast({
        title: "Pesquisa por concluir",
        description: "Aguarde o resultado da pesquisa de produto (ou limpe-a) antes de exportar.",
        variant: "destructive",
      });
      return;
    }
    setExporting(true);
    try {
      const all: MovementRow[] = [];
      if (!(filters.productIds && filters.productIds.length === 0)) {
        let from = 0;
        while (true) {
          const { data, error } = await buildQuery(filters, false).range(from, from + EXPORT_BATCH - 1);
          if (error) throw error;
          all.push(...((data || []) as MovementRow[]));
          if (!data || data.length < EXPORT_BATCH) break;
          from += EXPORT_BATCH;
        }
      }
      if (all.length === 0) {
        toast({ title: "Nada para exportar", description: "Sem movimentos com estes filtros.", variant: "destructive" });
        return;
      }
      downloadStandardXlsx({
        sheetName: "Movimentos",
        columns: [
          { key: "date", header: "Data", type: "date", width: 20 },
          { key: "type", header: "Tipo", width: 24 },
          { key: "sku", header: "Referência", width: 18 },
          { key: "product", header: "Produto", width: 30 },
          { key: "warehouse", header: "Armazém", width: 24 },
          { key: "quantity", header: "Quantidade", type: "number", width: 12 },
          { key: "balance", header: "Saldo depois", type: "number", width: 14 },
          { key: "document", header: "Documento", width: 20 },
          { key: "counterparty", header: "Contraparte", width: 24 },
          { key: "notes", header: "Notas", width: 30 },
          ...(canViewCost ? [{ key: "cost", header: "Custo unitário", type: "number" as const, width: 14 }] : []),
          { key: "user", header: "Utilizador", width: 22 },
        ],
        rows: all.map((m) => ({
          date: new Date(m.created_at),
          type: movementTypeLabel(m.movement_type),
          sku: m.products?.sku,
          product: m.products?.name,
          warehouse: m.warehouses?.name ?? warehouseNameById[m.warehouse_id],
          quantity: signedMovementQty(m.movement_type, m.quantity),
          balance: m.balance_after,
          document: m.document_number,
          counterparty: m.counterparty,
          notes: m.notes,
          ...(canViewCost ? { cost: m.unit_cost_at_time } : {}),
          user: m.created_by_user?.name,
        })),
      }, `movimentos_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "Exportação concluída", description: `${all.length} movimento(s) exportado(s).` });
    } catch (error: any) {
      captureFlowError(error, "record-export-import");
      toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (companyLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <OlyviaLoader size={40} />
      </div>
    );
  }

  if (!activeCompany) {
    return (
      <div className="space-y-6 p-6">
        <InventoryPageHeader title={t("sidebar.stockMovements")} area="warehouse" />
        <NoOrganizationState inline />
      </div>
    );
  }

  const loading = movements.isLoading || searchPending;
  const columnCount = canViewCost ? 10 : 9;

  return (
    <>
      <div className="space-y-6">
        <InventoryPageHeader
          area="warehouse"
          title={t("sidebar.stockMovements")}
          description={t("inventory.movements.description")}
          actions={
            <>
              <PermissionGate permission="stocks.export">
                <Button variant="outline" onClick={handleExport} disabled={exporting}>
                  <Download className="mr-2 h-4 w-4" /> {exporting ? "A exportar…" : "Exportar"}
                </Button>
              </PermissionGate>
              <PermissionGate permission="stocks.edit">
                <Button onClick={() => setMovementDialogOpen(true)}>
                  <ArrowLeftRight className="mr-2 h-4 w-4" /> Registar movimento
                </Button>
              </PermissionGate>
            </>
          }
        />

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                placeholder="Produto, SKU ou EAN"
                aria-label="Pesquisar por produto, SKU ou EAN"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[210px]" aria-label="Tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(MOVEMENT_TYPES).map(([value, def]) => (
                  <SelectItem key={value} value={value}>{def.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger className="w-[200px]" aria-label="Armazém">
                <SelectValue placeholder="Armazém" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os armazéns</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
                {/* Armazém do URL que já não está na lista (ex.: eliminado). */}
                {warehouseFilter !== "all" && !warehouseNameById[warehouseFilter] ? (
                  <SelectItem value={warehouseFilter}>Armazém selecionado</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <Input
              type="search"
              placeholder="Documento (PO, EC, INV, NE…)"
              aria-label="Documento"
              value={docFilter}
              onChange={(e) => setDocFilter(e.target.value)}
              className="w-[220px]"
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="mov-from" className="text-sm text-muted-foreground">De</Label>
              <Input id="mov-from" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="w-[150px]" />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="mov-to" className="text-sm text-muted-foreground">Até</Label>
              <Input id="mov-to" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="w-[150px]" />
            </div>
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
            ) : null}
          </div>
          {productId ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Produto:</span>
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5">
                {urlProduct ? `${urlProduct.name}${urlProduct.sku ? ` (${urlProduct.sku})` : ""}` : "Produto selecionado"}
                <button
                  type="button"
                  onClick={() => setProductId("")}
                  className="rounded-full p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Remover filtro de produto"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ) : null}
          {productSearch.data?.truncated ? (
            <p className="text-xs text-muted-foreground">
              A pesquisa corresponde a muitos produtos — só os primeiros {PRODUCT_SEARCH_LIMIT} entram no filtro. Refine o termo.
            </p>
          ) : null}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              O livro nunca se edita nem apaga: correções fazem-se com novos movimentos (ajuste, estorno, reversão).
              Uma saída que deixaria o stock abaixo de zero falha por inteiro.
            </span>
          </p>
        </div>

        {searchFailed ? (
          <div role="alert">
            <InventoryEmptyState
              title="Não foi possível pesquisar produtos"
              description="A pesquisa por produto, SKU ou EAN falhou. Tente novamente ou limpe a pesquisa."
            >
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void productSearch.refetch()}>Tentar novamente</Button>
                <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")}>Limpar pesquisa</Button>
              </div>
            </InventoryEmptyState>
          </div>
        ) : !loading && rows.length === 0 ? (
          <InventoryEmptyState
            title="Sem movimentos com estes filtros"
            description={hasActiveFilters ? "Experimente alargar as datas ou limpar os filtros." : undefined}
          >
            {hasActiveFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button> : null}
          </InventoryEmptyState>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Armazém</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Saldo depois</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Notas / contraparte</TableHead>
                  {canViewCost ? <TableHead className="text-right">Custo unit.</TableHead> : null}
                  <TableHead>Utilizador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="text-center text-muted-foreground">A carregar…</TableCell>
                  </TableRow>
                ) : (
                  rows.map((m) => {
                    const qty = signedMovementQty(m.movement_type, m.quantity);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(m.created_at)}</TableCell>
                        <TableCell>
                          <InventoryStatusBadge tone={movementTypeTone(m.movement_type)}>
                            {movementTypeLabel(m.movement_type)}
                          </InventoryStatusBadge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{m.products?.name ?? "—"}</div>
                          {m.products?.sku ? <div className="font-mono text-xs text-muted-foreground">{m.products.sku}</div> : null}
                        </TableCell>
                        <TableCell>{m.warehouses?.name ?? warehouseNameById[m.warehouse_id] ?? "—"}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            qty > 0 ? "text-green-700 dark:text-success" : "text-destructive",
                          )}
                        >
                          {qty > 0 ? "+" : "−"}{formatQty(Math.abs(qty))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(m.balance_after)}</TableCell>
                        <TableCell className="font-mono text-xs">{m.document_number}</TableCell>
                        <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                          {[m.counterparty, m.notes].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        {canViewCost ? (
                          <TableCell className="text-right text-xs tabular-nums">
                            {m.unit_cost_at_time != null ? formatEur(Number(m.unit_cost_at_time)) : "—"}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-sm">{m.created_by_user?.name ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
              <span role="status">
                A mostrar {rows.length}{total !== null ? ` de ${total}` : ""} movimento{(total ?? rows.length) === 1 ? "" : "s"}
              </span>
              {movements.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => movements.fetchNextPage()}
                  disabled={movements.isFetchingNextPage}
                >
                  {movements.isFetchingNextPage ? "A carregar…" : "Carregar mais"}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <StockMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        organizationId={activeCompany.id}
        warehouses={warehouses}
        onSuccess={() => {
          void movements.refetch();
          void queryClient.invalidateQueries({ queryKey: inventoryTodayQueryKey(activeCompany.id) });
        }}
      />
    </>
  );
};

export default StockMovements;
