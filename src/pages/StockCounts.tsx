import { useState, useEffect, useCallback, useRef } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Plus, Eye } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { PermissionGate } from "@/components/PermissionGate";
import { escapeIlike } from "@/lib/clientSearch";
import InventoryCountDetailDialog from "@/components/inventory/InventoryCountDetailDialog";

// Fase 5.4 do plano de inventário: "Contagem de Inventário" (Stocktake) —
// listagem de sessões de public.inventory_counts. Mesmo padrão de paginação
// de servidor de Stocks.tsx (PAGE_SIZE + .range()) combinado com o padrão de
// listagem+dialog de detalhe de ClientOrders.tsx. Leitura direta via
// .from() (sem RPC de listagem dedicada — só as 4 RPCs de escrita existem,
// ver migration 20261116020000) já que inventory_counts/inventory_count_lines/
// warehouses/product_categories têm SELECT liberado por organização (sem
// permissão extra), suficiente com inventory.view já verificado na rota.

const PAGE_SIZE = 30;

interface InventoryCountListRow {
  id: string;
  document_number: string;
  status: string;
  started_at: string;
  finalized_at: string | null;
  warehouse_id: string;
  category_id: string | null;
  warehouses?: { name: string } | null;
  product_categories?: { name: string } | null;
  // Agregados calculados client-side a partir de inventory_count_lines
  // (ver loadLineAggregates) — não vêm da query de cabeçalho.
  total_lines?: number;
  counted_lines?: number;
  pending_discrepancies?: number;
}

interface WarehouseOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

// PostgREST caps an unranged response at 1000 rows — paginado por segurança,
// mesmo padrão já usado em Stocks.tsx.
const fetchAllRows = async (buildQuery: () => any): Promise<{ data: any[] | null; error: any }> => {
  const PAGE = 1000;
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return { data: rows, error: null };
};

const StockCounts = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();

  const [counts, setCounts] = useState<InventoryCountListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createWarehouseId, setCreateWarehouseId] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState("all");
  const [creating, setCreating] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCountId, setDetailCountId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filtros num ref (não recria loadCounts a cada keystroke) — mesmo padrão
  // já usado em Stocks.tsx/ClientOrders.tsx para manter a identidade do
  // IntersectionObserver estável.
  const filtersRef = useRef({
    activeCompanyId: activeCompany?.id,
    debouncedSearchTerm,
    statusFilter,
    warehouseFilter,
  });
  useEffect(() => {
    filtersRef.current = { activeCompanyId: activeCompany?.id, debouncedSearchTerm, statusFilter, warehouseFilter };
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter, warehouseFilter]);

  const fetchWarehouses = useCallback(async () => {
    if (!activeCompany?.id) return;
    try {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      setWarehouses((data || []) as WarehouseOption[]);
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.loadWarehousesError'), description: error.message, variant: "destructive" });
    }
  }, [activeCompany?.id, t, toast]);

  const fetchCategories = useCallback(async () => {
    if (!activeCompany?.id) return;
    try {
      const { data, error } = await fetchAllRows(() =>
        supabase
          .from("product_categories")
          .select("id, name")
          .or(`organization_id.eq.${activeCompany.id},organization_id.is.null`)
          .order("id", { ascending: true })
      );
      if (error) throw error;
      setCategories((data || []) as CategoryOption[]);
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.loadCategoriesError'), description: error.message, variant: "destructive" });
    }
  }, [activeCompany?.id, t, toast]);

  useEffect(() => {
    if (activeCompany?.id) {
      fetchWarehouses();
      fetchCategories();
    }
  }, [activeCompany?.id, fetchWarehouses, fetchCategories]);

  // Agregados por sessão (total de linhas, linhas contadas, discrepâncias por
  // resolver) — calculados a partir de inventory_count_lines, filtrados às
  // sessões da página atual (não há RPC de leitura agregada, ver cabeçalho).
  // Mesma condição de "por resolver" usada por rpc_finalize_inventory_count.
  const loadLineAggregates = async (rows: InventoryCountListRow[]): Promise<InventoryCountListRow[]> => {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const { data, error } = await fetchAllRows(() =>
      supabase
        .from("inventory_count_lines")
        .select("inventory_count_id, counted_quantity, system_quantity_at_start, discrepancy_resolution")
        .in("inventory_count_id", ids)
    );
    if (error) {
      console.error("Error loading inventory count line aggregates:", error);
      return rows;
    }

    const agg = new Map<string, { total: number; counted: number; pending: number }>();
    for (const line of (data || []) as any[]) {
      const entry = agg.get(line.inventory_count_id) || { total: 0, counted: 0, pending: 0 };
      entry.total += 1;
      if (line.counted_quantity !== null) entry.counted += 1;
      if (
        line.counted_quantity !== null &&
        line.counted_quantity !== line.system_quantity_at_start &&
        !line.discrepancy_resolution
      ) {
        entry.pending += 1;
      }
      agg.set(line.inventory_count_id, entry);
    }

    return rows.map((r) => {
      const entry = agg.get(r.id) || { total: 0, counted: 0, pending: 0 };
      return { ...r, total_lines: entry.total, counted_lines: entry.counted, pending_discrepancies: entry.pending };
    });
  };

  const buildCountsQuery = (filters: typeof filtersRef.current) => {
    let query = supabase
      .from("inventory_counts")
      .select("id, document_number, status, started_at, finalized_at, warehouse_id, category_id, warehouses(name), product_categories(name)")
      .eq("organization_id", filters.activeCompanyId);

    if (filters.statusFilter !== "all") {
      query = query.eq("status", filters.statusFilter);
    }
    if (filters.warehouseFilter !== "all") {
      query = query.eq("warehouse_id", filters.warehouseFilter);
    }
    if (filters.debouncedSearchTerm.trim()) {
      query = query.ilike("document_number", `%${escapeIlike(filters.debouncedSearchTerm.trim())}%`);
    }
    return query;
  };

  const loadCounts = useCallback(async (pageNum: number, reset: boolean) => {
    const filters = filtersRef.current;
    if (!filters.activeCompanyId) return;

    if (reset) {
      setLoading(true);
      setCounts([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await buildCountsQuery(filters)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw error;
      const newRows = await loadLineAggregates((data || []) as unknown as InventoryCountListRow[]);

      if (reset) {
        setCounts(newRows);
      } else {
        setCounts((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          return [...prev, ...newRows.filter((c) => !existingIds.has(c.id))];
        });
      }
      setHasMore(newRows.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.loadError'), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t, toast]);

  const refresh = useCallback(() => {
    setHasMore(true);
    loadCounts(0, true);
  }, [loadCounts]);

  useEffect(() => {
    if (!activeCompany?.id) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter, warehouseFilter]);

  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadCounts(page + 1, false);
        }
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    observerRef.current = observer;
    return () => observerRef.current?.disconnect();
  }, [loading, hasMore, loadingMore, page, loadCounts]);

  const resetCreateForm = () => {
    setCreateWarehouseId("");
    setCreateCategoryId("all");
  };

  const handleCreate = async () => {
    if (!activeCompany?.id || !createWarehouseId) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('rpc_create_inventory_count', {
        p_organization_id: activeCompany.id,
        p_warehouse_id: createWarehouseId,
        p_category_id: createCategoryId === "all" ? null : createCategoryId,
      } as any);
      if (error) throw error;

      const result = data as any;
      toast({
        title: t('stockCounts.toast.createSuccess'),
        description: t('stockCounts.toast.createSuccessDesc', { document: result.document_number, count: result.lines_seeded }),
      });
      setCreateOpen(false);
      resetCreateForm();
      refresh();
      setDetailCountId(result.id);
      setDetailOpen(true);
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.createError'), description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openDetail = (id: string) => {
    setDetailCountId(id);
    setDetailOpen(true);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "em_contagem": return t('stockCounts.status.emContagem');
      case "finalizada": return t('stockCounts.status.finalizada');
      case "cancelada": return t('stockCounts.status.cancelada');
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      em_contagem: "bg-info/10 text-info",
      finalizada: "bg-success/10 text-success",
      cancelada: "bg-muted text-muted-foreground",
    };
    return colors[status] || colors.em_contagem;
  };

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6 p-6">
          <div>
            <h1 className="text-3xl font-bold">{t('stockCounts.title')}</h1>
            <p className="text-muted-foreground">{t('stockCounts.description')}</p>
          </div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ListChecks className="w-7 h-7 text-muted-foreground" />
            <div>
              <h1 className="text-3xl font-bold mb-1">{t('stockCounts.title')}</h1>
              <p className="text-muted-foreground">{t('stockCounts.description')}</p>
            </div>
          </div>
          <PermissionGate permissions={["inventory.count", "inventory.edit"]}>
            <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {t('stockCounts.newCount')}
            </Button>
          </PermissionGate>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder={t('stockCounts.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('stockCounts.table.warehouse')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('stockCounts.filterWarehouseAll')}</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('stockCounts.table.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('stockCounts.filterStatusAll')}</SelectItem>
              <SelectItem value="em_contagem">{t('stockCounts.status.emContagem')}</SelectItem>
              <SelectItem value="finalizada">{t('stockCounts.status.finalizada')}</SelectItem>
              <SelectItem value="cancelada">{t('stockCounts.status.cancelada')}</SelectItem>
            </SelectContent>
          </Select>
          {(searchTerm || statusFilter !== "all" || warehouseFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setWarehouseFilter("all");
              }}
            >
              {t('stockCounts.clearFilters')}
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('stockCounts.table.document')}</TableHead>
              <TableHead>{t('stockCounts.table.warehouse')}</TableHead>
              <TableHead>{t('stockCounts.table.category')}</TableHead>
              <TableHead>{t('stockCounts.table.status')}</TableHead>
              <TableHead>{t('stockCounts.table.startedAt')}</TableHead>
              <TableHead className="text-right">{t('stockCounts.table.lines')}</TableHead>
              <TableHead>{t('stockCounts.table.discrepancies')}</TableHead>
              <TableHead className="text-right">{t('stockCounts.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">{t('stockCounts.loading')}</TableCell>
              </TableRow>
            ) : counts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">{t('stockCounts.noCounts')}</TableCell>
              </TableRow>
            ) : (
              counts.map((count) => (
                <TableRow key={count.id}>
                  <TableCell className="font-medium font-mono text-xs">{count.document_number}</TableCell>
                  <TableCell>{count.warehouses?.name || '-'}</TableCell>
                  <TableCell>{count.product_categories?.name || t('stockCounts.allCategories')}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(count.status)}>{getStatusLabel(count.status)}</Badge>
                  </TableCell>
                  <TableCell>{new Date(count.started_at).toLocaleDateString('pt-PT')}</TableCell>
                  <TableCell className="text-right">
                    {count.counted_lines ?? 0}/{count.total_lines ?? 0}
                  </TableCell>
                  <TableCell>
                    {/* Badge destacado — é o propósito central do ecrã, não uma
                        informação secundária. */}
                    {(count.pending_discrepancies ?? 0) > 0 ? (
                      <Badge variant="destructive">
                        {t('stockCounts.discrepanciesBadge', { count: count.pending_discrepancies ?? 0 })}
                      </Badge>
                    ) : (
                      <Badge className="bg-success/10 text-success">{t('stockCounts.discrepanciesNone')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDetail(count.id)}
                      title={t('stockCounts.viewDetail')}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div ref={loadMoreRef} className="py-4 flex justify-center">
          {loadingMore && (
            <div className="text-sm text-muted-foreground">{t('stockCounts.loadingMore')}</div>
          )}
          {!hasMore && !loading && counts.length > 0 && (
            <div className="text-sm text-muted-foreground">{t('stockCounts.allLoaded')}</div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('stockCounts.create.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('stockCounts.create.description')}</p>
            <div>
              <Select value={createWarehouseId} onValueChange={setCreateWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('stockCounts.create.selectWarehouse')} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={createCategoryId} onValueChange={setCreateCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('stockCounts.create.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('stockCounts.create.allCategoriesOption')}</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              {t('stockCounts.create.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createWarehouseId}>
              {creating ? t('stockCounts.create.submitting') : t('stockCounts.create.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InventoryCountDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        countId={detailCountId}
        onChanged={refresh}
      />
    </>
  );
};

export default StockCounts;
