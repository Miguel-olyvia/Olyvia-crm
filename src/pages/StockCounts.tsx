import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { Plus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { escapeIlike } from "@/lib/clientSearch";
import InventoryCountDetailDialog from "@/components/inventory/InventoryCountDetailDialog";
import { useProductCategories } from "@/hooks/useProductCategories";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FilterPills,
  InventoryPageHeader,
  parseStockCountsParams,
  usePermissionGate,
  type FilterPillOption,
  type StockCountStatusFilter,
} from "@/components/inventory/ui";
import { StockCountsTable, STALLED_AFTER_DAYS, stalledDays, type StockCountRow } from "@/components/inventory/counts/StockCountsTable";

// Título e descrição palavra por palavra de TITULOS.cont (menuInv.ts do protótipo).
const PAGE_TITLE = "Contagens";
const PAGE_DESCRIPTION =
  "Contagens físicas por armazém e categoria. Só fecham sem diferenças por resolver; as diferenças ajustadas geram movimentos de ajuste no livro.";

const STATUS_PILLS: readonly { value: StockCountStatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "em_contagem", label: "Em contagem" },
  { value: "finalizada", label: "Finalizadas" },
  { value: "cancelada", label: "Canceladas" },
];

// Mesma permissão que o antigo PermissionGate do botão (qualquer uma das duas).
const CREATE_PERMISSIONS = ["inventory.count", "inventory.edit"] as const;

// Fase 5.4 do plano de inventário: "Contagem de Inventário" (Stocktake) —
// listagem de sessões de public.inventory_counts. Mesmo padrão de paginação
// de servidor de Stocks.tsx (PAGE_SIZE + .range()) combinado com o padrão de
// listagem+dialog de detalhe de ClientOrders.tsx. Leitura direta via
// .from() (sem RPC de listagem dedicada — só as 4 RPCs de escrita existem,
// ver migration 20261116020000) já que inventory_counts/inventory_count_lines/
// warehouses/product_categories têm SELECT liberado por organização (sem
// permissão extra), suficiente com inventory.view já verificado na rota.

const PAGE_SIZE = 30;

// Acima disto a folha de contagem deixa de ser trabalhável de uma assentada
// (e o diálogo de detalhe, que abre logo a seguir a criar, passa a ter de
// paginar as linhas) — o aviso muda de tom e sugere filtrar por categoria.
const LARGE_INITIAL_COUNT = 500;

// Linha da lista: cabeçalho de inventory_counts + agregados calculados
// client-side a partir de inventory_count_lines (ver loadLineAggregates).
// uncounted_with_stock = linhas nunca contadas mas com stock no sistema — não
// são "discrepâncias" (nada a comparar), mas não podem passar por verificadas.
type InventoryCountListRow = StockCountRow;

interface WarehouseOption {
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

/** Maior de várias datas ISO (ignora vazias/inválidas). */
const maxIso = (...values: (string | null | undefined)[]): string | null => {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const ms = Date.parse(v);
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      best = v;
    }
  }
  return best;
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

  // Estado, "paradas" e o detalhe aberto vivem no URL (?status=&stalled=1&open=)
  // — contrato de inventoryLinks.ts, usado pelos links INV- de Movimentos/Hoje.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlParams = parseStockCountsParams(searchParams);
  const statusFilter: StockCountStatusFilter = urlParams.stalled ? "em_contagem" : urlParams.status;
  const stalledFilter = urlParams.stalled;
  const urlOpen = urlParams.open;

  const updateParams = useCallback(
    (patch: { status?: StockCountStatusFilter; stalled?: boolean; open?: string | null }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (patch.status !== undefined) {
            if (patch.status === "all") next.delete("status");
            else next.set("status", patch.status);
          }
          if (patch.stalled !== undefined) {
            if (patch.stalled) next.set("stalled", "1");
            else next.delete("stalled");
          }
          if (patch.open !== undefined) {
            if (patch.open) next.set("open", patch.open);
            else next.delete("open");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setStatusFilter = (value: StockCountStatusFilter) => updateParams({ status: value, stalled: false });

  const [statusCounts, setStatusCounts] = useState<Partial<Record<StockCountStatusFilter, number>>>({});
  const gate = usePermissionGate();
  const createPermission = gate(CREATE_PERMISSIONS);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  // Filtra por inventory_counts.category_id (a categoria com que a contagem
  // foi criada) — só categorias de topo, como no diálogo de criação.
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  // Só categorias de topo (sem parent_id), por ordem alfabética — lista e
  // diálogo de criação. Cache partilhada com Stocks/folha de contagem.
  const { topLevelCategories: categories, resolveFilterIds, error: categoriesError } = useProductCategories();

  const [createOpen, setCreateOpen] = useState(false);
  const [createWarehouseId, setCreateWarehouseId] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState("all");
  // "Contagem inicial": semeia TODOS os produtos do catálogo (filtrados pela
  // categoria, se houver), incluindo os que ainda não têm linha de stock neste
  // armazém — é o arranque de um armazém novo, em que o sistema ainda não sabe
  // nada. Fora deste caso, a contagem só semeia o que já tem stock registado.
  const [createInitial, setCreateInitial] = useState(false);
  const [creating, setCreating] = useState(false);
  // O armazém escolhido tem linhas em public.stocks? null = ainda não sabemos
  // (ou a consulta falhou). Um armazém sem stock nenhum faz com que a contagem
  // de rotina semeie ZERO linhas em silêncio — foi assim que se criaram
  // documentos vazios — por isso é este facto que decide o interruptor.
  const [warehouseHasNoStock, setWarehouseHasNoStock] = useState<boolean | null>(null);
  // Assim que o utilizador mexe no interruptor, a escolha dele manda: a
  // decisão automática deixa de se sobrepor até ele trocar de armazém (ou
  // reabrir o diálogo). Num ref porque não afeta a renderização.
  const initialTouchedByUser = useRef(false);
  // Pré-visualização da dimensão da contagem inicial (nº de linhas que vão ser
  // semeadas). Sem isto o utilizador liga o interruptor, cria, e só descobre
  // que semeou o catálogo inteiro quando o diálogo de detalhe abre com
  // milhares de linhas.
  const [initialLineCount, setInitialLineCount] = useState<number | null>(null);
  const [initialCountLoading, setInitialCountLoading] = useState(false);
  const [initialCountError, setInitialCountError] = useState(false);

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
    statusFilter: statusFilter as string,
    stalledFilter,
    warehouseFilter,
    categoryFilter,
  });
  // Atualizado já no render (não num efeito): o efeito de refresh abaixo corre
  // na mesma passagem e tem de ver os filtros novos vindos do URL.
  filtersRef.current = { activeCompanyId: activeCompany?.id, debouncedSearchTerm, statusFilter, stalledFilter, warehouseFilter, categoryFilter };

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

  useEffect(() => {
    if (!categoriesError) return;
    toast({ title: t('stockCounts.toast.loadCategoriesError'), description: (categoriesError as any)?.message, variant: "destructive" });
  }, [categoriesError, t, toast]);

  useEffect(() => {
    if (activeCompany?.id) {
      fetchWarehouses();
    }
  }, [activeCompany?.id, fetchWarehouses]);

  // Agregados por sessão (total de linhas, linhas contadas, discrepâncias por
  // resolver) — calculados a partir de inventory_count_lines, filtrados às
  // sessões da página atual (não há RPC de leitura agregada, ver cabeçalho).
  // Mesma condição de "por resolver" usada por rpc_finalize_inventory_count.
  // Uma só consulta em lote para as sessões da página, filtrada pela
  // organização ativa através do cabeçalho (inventory_counts!inner) — as
  // linhas não têm organization_id próprio.
  const loadLineAggregates = async (rows: InventoryCountListRow[], organizationId: string): Promise<InventoryCountListRow[]> => {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const { data, error } = await fetchAllRows(() =>
      supabase
        .from("inventory_count_lines")
        .select("inventory_count_id, counted_quantity, system_quantity_at_start, discrepancy_resolution, updated_at, counted_at, inventory_counts!inner(organization_id)")
        .eq("inventory_counts.organization_id", organizationId)
        .in("inventory_count_id", ids)
    );
    if (error) {
      console.error("Error loading inventory count line aggregates:", error);
      return rows.map((r) => ({ ...r, last_activity_at: maxIso(r.started_at, r.updated_at) }));
    }

    type Agg = { total: number; counted: number; diff: number; pending: number; uncountedWithStock: number; lastAt: string | null };
    const empty = (): Agg => ({ total: 0, counted: 0, diff: 0, pending: 0, uncountedWithStock: 0, lastAt: null });
    const agg = new Map<string, Agg>();
    for (const line of (data || []) as any[]) {
      const entry = agg.get(line.inventory_count_id) || empty();
      entry.total += 1;
      if (line.counted_quantity !== null) {
        entry.counted += 1;
        if (line.counted_quantity !== line.system_quantity_at_start) {
          entry.diff += 1;
          // Mesma condição de "por resolver" usada por rpc_finalize_inventory_count.
          if (!line.discrepancy_resolution) entry.pending += 1;
        }
      } else if ((line.system_quantity_at_start ?? 0) > 0) {
        // Nunca contada, mas o sistema diz que há stock — ninguém foi
        // verificar fisicamente esta linha antes de a contagem terminar.
        entry.uncountedWithStock += 1;
      }
      entry.lastAt = maxIso(entry.lastAt, line.updated_at, line.counted_at);
      agg.set(line.inventory_count_id, entry);
    }

    return rows.map((r) => {
      const entry = agg.get(r.id) || empty();
      return {
        ...r,
        total_lines: entry.total,
        counted_lines: entry.counted,
        discrepancies: entry.diff,
        pending_discrepancies: entry.pending,
        uncounted_with_stock: entry.uncountedWithStock,
        // GREATEST(started_at, updated_at, linhas) — regra de rpc_inventory_today.
        last_activity_at: maxIso(r.started_at, r.updated_at, entry.lastAt),
      };
    });
  };

  // Filtros comuns (organização, armazém, categoria, pesquisa) — partilhados
  // pela lista e pelos contadores das pílulas de estado.
  const applyBaseFilters = (query: any, filters: typeof filtersRef.current) => {
    let q = query.eq("organization_id", filters.activeCompanyId);
    if (filters.warehouseFilter !== "all") q = q.eq("warehouse_id", filters.warehouseFilter);
    if (filters.categoryFilter !== "all") q = q.eq("category_id", filters.categoryFilter);
    if (filters.debouncedSearchTerm.trim()) {
      q = q.ilike("document_number", `%${escapeIlike(filters.debouncedSearchTerm.trim())}%`);
    }
    return q;
  };

  const buildCountsQuery = (filters: typeof filtersRef.current) => {
    let query = applyBaseFilters(
      supabase
        .from("inventory_counts")
        .select("id, document_number, status, started_at, updated_at, finalized_at, warehouse_id, category_id, warehouses(name), product_categories(name)"),
      filters,
    );

    if (filters.statusFilter !== "all") {
      query = query.eq("status", filters.statusFilter);
    }
    if (filters.stalledFilter) {
      // Condição necessária no servidor (cabeçalho sem atividade há > 7 dias);
      // a atividade nas linhas é verificada depois, com os agregados.
      const cutoff = new Date(Date.now() - STALLED_AFTER_DAYS * 86_400_000).toISOString();
      query = query.eq("status", "em_contagem").lt("started_at", cutoff).lt("updated_at", cutoff);
    }
    return query;
  };

  const fetchStatusCounts = useCallback(async () => {
    const filters = filtersRef.current;
    if (!filters.activeCompanyId) return;
    try {
      const results = await Promise.all(
        STATUS_PILLS.map(async ({ value }) => {
          let q = applyBaseFilters(supabase.from("inventory_counts").select("id", { count: "exact", head: true }), filters);
          if (value !== "all") q = q.eq("status", value);
          const { count, error } = await q;
          if (error) throw error;
          return [value, count ?? 0] as const;
        }),
      );
      setStatusCounts(Object.fromEntries(results));
    } catch (error) {
      // Só informativo — as pílulas ficam sem número.
      console.error("Error loading inventory count status counters:", error);
      setStatusCounts({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const pageRows = (data || []) as unknown as InventoryCountListRow[];
      const withAggregates = await loadLineAggregates(pageRows, filters.activeCompanyId);
      // ?stalled=1: a atividade recente nas linhas também conta (mesma regra
      // de rpc_inventory_today) — só fica o que está mesmo parado.
      const newRows = filters.stalledFilter
        ? withAggregates.filter((r) => stalledDays(r) !== null)
        : withAggregates;

      if (reset) {
        setCounts(newRows);
      } else {
        setCounts((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          return [...prev, ...newRows.filter((c) => !existingIds.has(c.id))];
        });
      }
      // Pela página do servidor (antes do filtro de paradas no cliente).
      setHasMore(pageRows.length === PAGE_SIZE);
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
    fetchStatusCounts();
  }, [loadCounts, fetchStatusCounts]);

  useEffect(() => {
    if (!activeCompany?.id) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter, stalledFilter, warehouseFilter, categoryFilter]);

  // ?open=<id> abre o detalhe (links INV- de Movimentos/Hoje e a própria lista).
  // Só abre depois de confirmar que a contagem é da organização ativa (um link
  // guardado noutra organização não pode abrir aqui).
  const activeCompanyId = activeCompany?.id;
  useEffect(() => {
    if (!urlOpen || !activeCompanyId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("id, organization_id")
        .eq("id", urlOpen)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data || data.organization_id !== activeCompanyId) {
        setDetailOpen(false);
        updateParams({ open: null });
        toast({
          title: "Contagem não disponível",
          description: "Esta contagem não pertence à organização ativa.",
          variant: "destructive",
        });
        return;
      }
      setDetailCountId(urlOpen);
      setDetailOpen(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOpen, activeCompanyId]);

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

  // Conta as linhas que rpc_create_inventory_count(p_initial => true) vai
  // semear. Tem de espelhar EXATAMENTE os filtros da migration
  // 20261204000000: universo = product_organizations (products.organization_id
  // não é fiável, facto F2 da migration), produtos não apagados
  // (is_deleted = false E deleted_at IS NULL) e status <> 'draft'
  // ('discontinued' entra de propósito), mais a categoria escolhida — com as
  // suas subcategorias, em category_id OU subcategory_id (migration
  // 20261204430000). O armazém não entra: no modo inicial o universo é o
  // catálogo, não o stock.
  useEffect(() => {
    if (!createOpen || !createInitial || !activeCompany?.id) {
      setInitialLineCount(null);
      setInitialCountError(false);
      setInitialCountLoading(false);
      return;
    }
    let cancelled = false;
    setInitialCountLoading(true);
    setInitialCountError(false);
    (async () => {
      try {
        let query = supabase
          .from("product_organizations")
          .select("product_id, products!inner(id)", { count: "exact", head: true })
          .eq("organization_id", activeCompany.id)
          .eq("products.is_deleted", false)
          .is("products.deleted_at", null)
          .neq("products.status", "draft");
        const categoryIds = resolveFilterIds(createCategoryId, "all");
        if (categoryIds && categoryIds.length > 0) {
          const ids = categoryIds.join(",");
          query = (query as any).or(`category_id.in.(${ids}),subcategory_id.in.(${ids})`, { referencedTable: "products" });
        }
        const { count, error } = await query;
        if (error) throw error;
        if (cancelled) return;
        setInitialLineCount(count ?? 0);
      } catch (error) {
        if (cancelled) return;
        // Só informativo — não bloqueia a criação nem merece um toast.
        console.error("Error previewing initial count size:", error);
        setInitialLineCount(null);
        setInitialCountError(true);
      } finally {
        if (!cancelled) setInitialCountLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [createOpen, createInitial, createCategoryId, activeCompany?.id, resolveFilterIds]);

  // Decide o interruptor "Contagem inicial" a partir do armazém escolhido: sem
  // linhas em stocks, a contagem de rotina não teria nada para semear, logo o
  // modo inicial (catálogo) é o único que produz uma folha utilizável. Nunca
  // se sobrepõe a uma escolha manual (initialTouchedByUser) e, se a consulta
  // falhar, deixa tudo como está — isto informa, não bloqueia.
  useEffect(() => {
    if (!createOpen || !createWarehouseId) {
      setWarehouseHasNoStock(null);
      return;
    }
    let cancelled = false;
    setWarehouseHasNoStock(null);
    (async () => {
      try {
        const { count, error } = await supabase
          .from("stocks")
          .select("id", { count: "exact", head: true })
          .eq("warehouse_id", createWarehouseId)
          .is("deleted_at", null);
        if (error) throw error;
        // Guarda de corrida: troca rápida de armazém não pode deixar a
        // resposta antiga aterrar por cima da nova.
        if (cancelled) return;
        const empty = (count ?? 0) === 0;
        setWarehouseHasNoStock(empty);
        if (!initialTouchedByUser.current) setCreateInitial(empty);
      } catch (error) {
        if (cancelled) return;
        console.error("Error checking warehouse stock coverage:", error);
        setWarehouseHasNoStock(null);
      }
    })();
    return () => { cancelled = true; };
  }, [createOpen, createWarehouseId]);

  const resetCreateForm = () => {
    setCreateWarehouseId("");
    setCreateCategoryId("all");
    setCreateInitial(false);
    setWarehouseHasNoStock(null);
    initialTouchedByUser.current = false;
  };

  const handleCreate = async () => {
    if (!activeCompany?.id || !createWarehouseId) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('rpc_create_inventory_count', {
        p_organization_id: activeCompany.id,
        p_warehouse_id: createWarehouseId,
        p_category_id: createCategoryId === "all" ? null : createCategoryId,
        p_initial: createInitial,
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
      openDetail(result.id);
    } catch (error: any) {
      // A RPC recusa criar uma contagem que ficaria com 0 linhas e explica
      // porquê (ERRCODE no_data_found). Essa mensagem do servidor é a parte
      // útil — mostra-se tal e qual, sem a substituir por texto genérico; o
      // fallback só entra se vier mesmo vazia.
      const serverMessage =
        (typeof error?.message === "string" && error.message.trim()) ||
        (typeof error?.hint === "string" && error.hint.trim()) ||
        (typeof error?.details === "string" && error.details.trim()) ||
        t('stockCounts.toast.createErrorUnknown');
      toast({ title: t('stockCounts.toast.createError'), description: serverMessage, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // Abre já e espelha no URL (?open=) para o detalhe ser partilhável/recarregável.
  function openDetail(id: string) {
    setDetailCountId(id);
    setDetailOpen(true);
    updateParams({ open: id });
  }

  const handleDetailOpenChange = (open: boolean) => {
    setDetailOpen(open);
    if (!open) updateParams({ open: null });
  };

  const hasExtraFilters = !!searchTerm || warehouseFilter !== "all" || categoryFilter !== "all";
  const statusPillOptions: FilterPillOption<StockCountStatusFilter>[] = [
    ...STATUS_PILLS.map((p) => ({
      value: p.value,
      label: p.label,
      count: statusCounts[p.value] ?? null,
      // Com ?stalled=1 nenhuma pílula de estado fica ativa — manda a das paradas.
      pressed: !stalledFilter && urlParams.status === p.value,
    })),
  ];

  const createButton = (
    <Button
      onClick={() => { resetCreateForm(); setCreateOpen(true); }}
      disabled={!createPermission.allowed}
    >
      <Plus className="w-4 h-4 mr-2" />
      Nova contagem
    </Button>
  );

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
        <div className="space-y-4">
          <InventoryPageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} area="warehouse" />
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <InventoryPageHeader
          title={PAGE_TITLE}
          description={PAGE_DESCRIPTION}
          area="warehouse"
          actions={
            createPermission.allowed ? (
              createButton
            ) : (
              // Desativado com o porquê (como no protótipo), mesma permissão de antes.
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {createButton}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{createPermission.reason}</TooltipContent>
              </Tooltip>
            )
          }
        />

        <FilterPills
          ariaLabel="Estado das contagens"
          value={urlParams.status}
          onChange={setStatusFilter}
          options={statusPillOptions}
        />
        {stalledFilter ? (
          <FilterPills
            ariaLabel="Contagens paradas"
            value="stalled"
            onChange={() => updateParams({ stalled: false })}
            options={[
              {
                value: "stalled",
                label: `Paradas há mais de ${STALLED_AFTER_DAYS} dias`,
                hint: "Em contagem sem atividade há mais de 7 dias. Clique para remover o filtro.",
                pressed: true,
              },
            ]}
          />
        ) : null}

        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder={t('stockCounts.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
            aria-label={t('stockCounts.searchPlaceholder')}
          />
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[200px]" aria-label="Armazém">
              <SelectValue placeholder="Armazém" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('stockCounts.filterWarehouseAll')}</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]" aria-label="Categoria">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('stockCounts.allCategories')}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(hasExtraFilters || urlParams.status !== "all" || stalledFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setWarehouseFilter("all");
                setCategoryFilter("all");
                updateParams({ status: "all", stalled: false });
              }}
            >
              {t('stockCounts.clearFilters')}
            </Button>
          )}
        </div>

        <StockCountsTable
          rows={counts}
          loading={loading}
          allCategoriesLabel="Todas"
          uncountedWithStockLabel={(count) => t('stockCounts.uncountedWithStockBadge', { count })}
          onOpen={openDetail}
        />

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
              <Select
                value={createWarehouseId}
                onValueChange={(value) => {
                  // Armazém novo, decisão nova: a automática volta a mandar.
                  initialTouchedByUser.current = false;
                  setCreateWarehouseId(value);
                }}
              >
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
            <div className="rounded-md border p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="stock-count-initial" className="cursor-pointer">
                  {t('stockCounts.create.initialLabel')}
                </Label>
                <Switch
                  id="stock-count-initial"
                  checked={createInitial}
                  onCheckedChange={(checked) => {
                    initialTouchedByUser.current = true;
                    setCreateInitial(checked);
                  }}
                  disabled={creating}
                />
              </div>
              {/* Uma só linha explicativa: quando o armazém não tem stock, a
                  razão concreta substitui a ajuda genérica (que passaria a ser
                  ruído) — evita empilhar três parágrafos dentro da caixa. */}
              <p
                className={
                  warehouseHasNoStock === true && !createInitial
                    ? "text-xs font-medium text-warning"
                    : "text-xs text-muted-foreground"
                }
              >
                {warehouseHasNoStock === true
                  ? createInitial
                    ? t('stockCounts.create.initialAutoReason')
                    : t('stockCounts.create.initialEmptyWarehouseWarning')
                  : t('stockCounts.create.initialHelp')}
              </p>
              {createInitial && (initialCountLoading || initialCountError || initialLineCount !== null) && (
                <p
                  className={
                    !initialCountLoading && initialLineCount !== null && initialLineCount > LARGE_INITIAL_COUNT
                      ? "text-xs font-medium text-warning"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {initialCountLoading
                    ? t('stockCounts.create.initialPreviewLoading')
                    : initialCountError
                      ? t('stockCounts.create.initialPreviewError')
                      : initialLineCount! > LARGE_INITIAL_COUNT
                        ? t('stockCounts.create.initialPreviewLarge', { count: initialLineCount! })
                        : t('stockCounts.create.initialPreviewCount', { count: initialLineCount! })}
                </p>
              )}
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
        onOpenChange={handleDetailOpenChange}
        countId={detailCountId}
        onChanged={refresh}
      />
    </>
  );
};

export default StockCounts;
