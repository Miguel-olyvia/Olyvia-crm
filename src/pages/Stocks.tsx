import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { z } from "zod";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { withAuditContext } from "@/utils/auditContext";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { Plus, Pencil, Trash2, Package, Download, Upload, ArrowLeftRight, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Database } from "@/integrations/supabase/types";
import { PermissionGate } from "@/components/PermissionGate";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";
import { escapeIlike } from "@/lib/clientSearch";
import StockMovementDialog from "@/components/inventory/StockMovementDialog";
import StockMovementsHistoryDialog from "@/components/inventory/StockMovementsHistoryDialog";
import CategorySubcategoryFilter, { UNCATEGORIZED_CATEGORY_VALUE } from "@/components/inventory/CategorySubcategoryFilter";
import { useProductCategories } from "@/hooks/useProductCategories";
import { captureFlowError } from "@/lib/observability/captureFlowError";

type Stock = Database["public"]["Tables"]["stocks"]["Row"] & {
  products?: { name: string; sku?: string | null; category_id?: string | null; subcategory_id?: string | null; product_categories?: { name: string } | null };
  warehouses?: { name: string };
};

const UNCATEGORIZED_LABEL = "Sem categoria";
const UNCATEGORIZED_VALUE = UNCATEGORIZED_CATEGORY_VALUE;
const PAGE_SIZE = 30;

function getStockStatusCode(stock: Stock): "low" | "overstock" | "normal" {
  // reorder_point/maximum_quantity = 0 means "never configured", not "reencomendar
  // já" — sem isto, qualquer stock nunca configurado (0/0) aparecia sempre como
  // "Stock Baixo", mesmo sem limiar nenhum definido. Alinhado com a mesma regra
  // já usada no motor de alertas (generate-notifications, stock_low).
  if (stock.reorder_point > 0 && stock.quantity <= stock.reorder_point) return "low";
  if (stock.maximum_quantity > 0 && stock.quantity >= stock.maximum_quantity) return "overstock";
  return "normal";
}

const stockSchema = z.object({
  product_id: z.string().trim().min(1, "O produto é obrigatório."),
  warehouse_id: z.string().trim().min(1, "O armazém é obrigatório."),
  quantity: z.number().min(0, "A quantidade deve ser positiva.").max(999999999, "A quantidade é demasiado elevada."),
  minimum_quantity: z.number().min(0, "A quantidade mínima deve ser positiva.").max(999999999, "A quantidade mínima é demasiado elevada."),
  maximum_quantity: z.number().min(0, "A quantidade máxima deve ser positiva.").max(999999999, "A quantidade máxima é demasiado elevada."),
  reorder_point: z.number().min(0, "O ponto de reencomenda deve ser positivo.").max(999999999, "O ponto de reencomenda é demasiado elevado."),
  location: z.string().trim().max(255, "A localização deve ter menos de 255 caracteres.").optional().or(z.literal("")),
}).refine((data) => data.maximum_quantity === 0 || data.maximum_quantity >= data.minimum_quantity, {
  message: "A quantidade máxima deve ser maior ou igual à quantidade mínima.",
  path: ["maximum_quantity"],
});

// Mesmo texto que o StockMovementDialog: o stock só regista unidades inteiras.
const STOCK_INTEGER_ONLY_MSG = "O stock só regista unidades inteiras.";
// Motivo dos ajustes gerados pela importação (como "Stock inicial" na criação).
const CSV_IMPORT_REASON = "Importação CSV";

interface ImportResult {
  created: number;
  adjustedUp: number;
  adjustedDown: number;
  unitsUp: number;
  unitsDown: number;
  settingsOnly: number;
  unchanged: number;
  errors: string[];
}

// PostgREST caps an unranged response at 1000 rows — a plain .select() silently
// truncates for catalogs bigger than that. Paginates past that cap instead of
// ever relying on a single unranged request. Same helper as PurchaseOrders.tsx.
const fetchAllRows = async (
  buildQuery: () => any
): Promise<{ data: any[] | null; error: any }> => {
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

// Reserva de stock para Encomendas Clientes assinadas (20261204310000). É por
// produto ao nível da ORGANIZAÇÃO (todos os armazéns), não por armazém — por
// isso "Livre" compara com o stock total da organização, não com a linha.
interface ProductReservation {
  qty_reserved: number;
  qty_missing: number;
  orders_count: number;
}

const toNum = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatQty = (value: number): string =>
  new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(value);

// .in() vai no URL — lotes pequenos para não passar o limite com muitos ids.
const RESERVATION_CHUNK = 150;

const STOCK_SELECT = `
  *,
  products!inner(name, sku, category_id, subcategory_id, product_categories!category_id(name)),
  warehouses(name)
`;

const Stocks = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementContext, setMovementContext] = useState<{ productId?: string; warehouseId?: string; movementType?: "ajuste" }>({});
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyContext, setHistoryContext] = useState<{ productId: string; warehouseId: string; productName?: string; warehouseName?: string } | null>(null);
  const [formData, setFormData] = useState({
    product_id: "",
    warehouse_id: "",
    quantity: 0,
    minimum_quantity: 0,
    maximum_quantity: 0,
    reorder_point: 0,
    location: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "normal" | "overstock">("all");

  // Reservado/Livre por produto (rpc_get_product_stock_reservations) e stock
  // total da organização (armazéns ativos) + nº de armazéns com o produto.
  const [reservationByProduct, setReservationByProduct] = useState<Record<string, ProductReservation>>({});
  const [orgStockByProduct, setOrgStockByProduct] = useState<Record<string, { total: number; warehouses: number }>>({});
  const requestedReservationIdsRef = useRef<Set<string>>(new Set());
  const reservationGenerationRef = useRef(0);

  // Debounce search — server-side now, a network call per keystroke would be wasteful.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Ids a comparar com products.category_id/subcategory_id (categoria + as suas
  // subcategorias, ou só a subcategoria escolhida). Recalculado quando as
  // categorias acabam de carregar — a chave entra nas dependências do reload.
  const { resolveFilterIds } = useProductCategories();
  const categoryFilterIds = useMemo(
    () => (categoryFilter === UNCATEGORIZED_VALUE ? null : resolveFilterIds(categoryFilter, subcategoryFilter)),
    [categoryFilter, subcategoryFilter, resolveFilterIds],
  );
  const categoryFilterKey = categoryFilterIds ? categoryFilterIds.join(",") : "";

  // Stable refs so loadStocks doesn't need to be recreated (and re-wired to the
  // IntersectionObserver) on every filter keystroke — same pattern as Products.tsx.
  const filtersRef = useRef({
    showDeleted,
    debouncedSearchTerm,
    categoryFilter,
    subcategoryFilter,
    categoryFilterIds,
    warehouseFilter,
    statusFilter,
    activeCompanyId: activeCompany?.id,
  });
  useEffect(() => {
    filtersRef.current = {
      showDeleted,
      debouncedSearchTerm,
      categoryFilter,
      subcategoryFilter,
      categoryFilterIds,
      warehouseFilter,
      statusFilter,
      activeCompanyId: activeCompany?.id,
    };
  }, [showDeleted, debouncedSearchTerm, categoryFilter, subcategoryFilter, categoryFilterIds, warehouseFilter, statusFilter, activeCompany?.id]);

  // status (low/normal/overstock) compares two columns of the SAME row
  // (quantity vs reorder_point / maximum_quantity) — PostgREST filters only
  // compare a column to a literal value, not to another column, so this can't
  // be pushed into the query without a DB view/generated column. While a
  // status filter is active, we fall back to looping through every stock that
  // matches the OTHER filters (still safely paginated, never a single
  // unranged request) and filter status client-side, instead of the normal
  // 30-at-a-time infinite scroll.
  //
  // Takes `status` explicitly (read from filtersRef by callers) rather than
  // closing over the `statusFilter` state directly: loadAllForStatusFilter is a
  // useCallback with a narrow dep array ([t, toast]), so a plain closure over
  // `statusFilter` would go stale after the first status change.
  const applyStatusFilter = (rows: Stock[], status: typeof statusFilter) =>
    status === "all" ? rows : rows.filter((s) => getStockStatusCode(s) === status);

  const buildStocksQuery = (filters: typeof filtersRef.current) => {
    let query = supabase
      .from("stocks")
      .select(STOCK_SELECT)
      .eq("organization_id", filters.activeCompanyId);

    query = filters.showDeleted ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

    if (filters.warehouseFilter !== "all") {
      query = query.eq("warehouse_id", filters.warehouseFilter);
    }
    if (filters.categoryFilter === UNCATEGORIZED_VALUE) {
      query = (query as any).is("products.category_id", null);
    } else if (filters.categoryFilterIds && filters.categoryFilterIds.length > 0) {
      // OR sobre o recurso embebido products!inner: com referencedTable o
      // supabase-js envia `products.or=(...)`, que o PostgREST aplica dentro do
      // embed; como o embed é !inner, as linhas de stock sem produto a
      // corresponder ficam de fora (igual ao .eq("products.category_id") de
      // antes). category_id OU subcategory_id porque há produtos com o id da
      // subcategoria guardado em category_id.
      const ids = filters.categoryFilterIds.join(",");
      query = (query as any).or(`category_id.in.(${ids}),subcategory_id.in.(${ids})`, { referencedTable: "products" });
    }
    if (filters.debouncedSearchTerm.trim()) {
      query = (query as any).ilike("products.name", `%${escapeIlike(filters.debouncedSearchTerm.trim())}%`);
    }
    return query;
  };

  const loadStocks = useCallback(async (pageNum: number, reset: boolean) => {
    const filters = filtersRef.current;
    if (!filters.activeCompanyId) return;

    if (reset) {
      setLoading(true);
      setStocks([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const query = buildStocksQuery(filters)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

      const { data, error } = await query;
      if (error) throw error;
      const newStocks = (data as Stock[]) || [];

      if (reset) {
        setStocks(newStocks);
      } else {
        setStocks((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          return [...prev, ...newStocks.filter((s) => !existingIds.has(s.id))];
        });
      }
      setHasMore(newStocks.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (error: any) {
      toast({
        title: t('stocks.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t, toast]);

  // Full loop (still batched at 1000/req, never a single unranged request) across
  // every stock matching search/category/warehouse — only used while a status
  // filter is active, since status can't be filtered server-side. See comment
  // on applyStatusFilter above.
  const loadAllForStatusFilter = useCallback(async () => {
    const filters = filtersRef.current;
    if (!filters.activeCompanyId) return;

    setLoading(true);
    setStocks([]);
    try {
      const { data, error } = await fetchAllRows(() =>
        buildStocksQuery(filters).order("created_at", { ascending: false }).order("id", { ascending: true })
      );
      if (error) throw error;
      setStocks(applyStatusFilter((data as Stock[]) || [], filters.statusFilter));
      setHasMore(false);
      setPage(0);
    } catch (error: any) {
      captureFlowError(error, "stock-lifecycle");
      toast({
        title: t('stocks.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  const refresh = useCallback(() => {
    if (statusFilter !== "all") {
      loadAllForStatusFilter();
    } else {
      setHasMore(true);
      loadStocks(0, true);
    }
  }, [statusFilter, loadAllForStatusFilter, loadStocks]);

  // Reload from scratch whenever a filter changes.
  useEffect(() => {
    if (!activeCompany?.id) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, showDeleted, debouncedSearchTerm, categoryFilter, subcategoryFilter, categoryFilterKey, warehouseFilter, statusFilter]);

  // Infinite scroll observer — inert while a status filter is active (hasMore is
  // false in that mode, since loadAllForStatusFilter already loaded everything).
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadStocks(page + 1, false);
        }
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    observerRef.current = observer;
    return () => observerRef.current?.disconnect();
  }, [loading, hasMore, loadingMore, page, loadStocks]);

  // Reservas dos produtos visíveis — só os ainda não pedidos, em lotes. Uma
  // listagem reiniciada (filtros, refresh depois de um movimento, outra
  // empresa) limpa a cache, para os valores refletirem o estado atual. Falhar
  // isto nunca parte o ecrã: as colunas mostram "-".
  useEffect(() => {
    const orgId = activeCompany?.id;
    if (!orgId) return;
    if (stocks.length === 0) {
      reservationGenerationRef.current += 1;
      requestedReservationIdsRef.current = new Set();
      setReservationByProduct({});
      setOrgStockByProduct({});
      return;
    }
    const missing = Array.from(new Set(stocks.map((s) => s.product_id)))
      .filter((id) => id && !requestedReservationIdsRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requestedReservationIdsRef.current.add(id));
    const generation = reservationGenerationRef.current;

    (async () => {
      try {
        const nextReservations: Record<string, ProductReservation> = {};
        const nextOrgStock: Record<string, { total: number; warehouses: number }> = {};
        for (let i = 0; i < missing.length; i += RESERVATION_CHUNK) {
          const chunk = missing.slice(i, i + RESERVATION_CHUNK);
          const { data, error } = await (supabase as any).rpc("rpc_get_product_stock_reservations", {
            p_organization_id: orgId,
            p_product_ids: chunk,
          });
          if (error) throw error;
          chunk.forEach((id) => { nextReservations[id] = { qty_reserved: 0, qty_missing: 0, orders_count: 0 }; });
          ((data as any[]) || []).forEach((r) => {
            if (!r?.product_id) return;
            nextReservations[r.product_id] = {
              qty_reserved: toNum(r.qty_reserved),
              qty_missing: toNum(r.qty_missing),
              orders_count: toNum(r.orders_count),
            };
          });

          const { data: stockRows, error: stockError } = await fetchAllRows(() =>
            (supabase as any)
              .from("stocks")
              .select("id, product_id, quantity, warehouses!inner(deleted_at)")
              .eq("organization_id", orgId)
              .is("deleted_at", null)
              .is("warehouses.deleted_at", null)
              .in("product_id", chunk)
              .order("id", { ascending: true })
          );
          if (stockError) throw stockError;
          chunk.forEach((id) => { nextOrgStock[id] = { total: 0, warehouses: 0 }; });
          (stockRows || []).forEach((row: any) => {
            const entry = nextOrgStock[row.product_id] || { total: 0, warehouses: 0 };
            entry.total += toNum(row.quantity);
            entry.warehouses += 1;
            nextOrgStock[row.product_id] = entry;
          });
        }
        if (generation !== reservationGenerationRef.current) return;
        setReservationByProduct((prev) => ({ ...prev, ...nextReservations }));
        setOrgStockByProduct((prev) => ({ ...prev, ...nextOrgStock }));
      } catch (error) {
        console.warn("[Stocks] não foi possível obter as reservas de stock", error);
      }
    })();
  }, [stocks, activeCompany?.id]);

  // Group the currently loaded stocks by the product's category, sorted
  // alphabetically (uncategorized last); products within a category sorted
  // alphabetically too. Purely a render grouping — grows incrementally as more
  // pages load, same as any infinite-scroll list.
  const groupedStocks = useMemo(() => {
    const groups = new Map<string, Stock[]>();
    for (const stock of stocks) {
      const categoryName = stock.products?.product_categories?.name || UNCATEGORIZED_LABEL;
      const list = groups.get(categoryName) || [];
      list.push(stock);
      groups.set(categoryName, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.products?.name || "").localeCompare(b.products?.name || ""));
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b);
    });
  }, [stocks]);

  const fetchWarehouses = async () => {
    if (!activeCompany?.id) return;

    try {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null)
        .order("name");

      if (error) throw error;
      setWarehouses(data || []);
    } catch (error: any) {
      toast({
        title: t('stocks.toast.loadWarehousesError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (activeCompany?.id) {
      fetchWarehouses();
      setProductsLoaded(false);
      setProducts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id]);

  // Products (for the create/edit dialog's <Select> and the CSV import's
  // name-matching) — only needed when a dialog that uses them is open, not on
  // every visit to the page. Paginated to avoid truncating above 1000 products.
  useEffect(() => {
    if (!activeCompany?.id || productsLoaded || !(dialogOpen || importDialogOpen)) return;

    (async () => {
      try {
        const { data, error } = await fetchAllRows(() =>
          (supabase as any)
            .from("products")
            .select("id, name")
            .eq("organization_id", activeCompany.id)
            .order("name", { ascending: true })
            .order("id", { ascending: true })
        );
        if (error) throw error;
        setProducts(data || []);
        setProductsLoaded(true);
      } catch (error: any) {
        toast({
          title: t('stocks.toast.loadProductsError'),
          description: error.message,
          variant: "destructive",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, dialogOpen, importDialogOpen, productsLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = stockSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((error) => {
        if (error.path[0]) errors[error.path[0].toString()] = error.message;
      });
      setFieldErrors(errors);
      const firstError = validation.error.errors[0];
      toast({ title: t('stocks.toast.error'), description: firstError.message, variant: "destructive" });
      return;
    }
    setFieldErrors({});

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      // A quantidade nunca é escrita diretamente em `stocks` a partir deste
      // formulário: sem stock_movement não fica rasto (09-09: 0→1 sem
      // movimento). Mudar quantidade = Registar movimento → Ajuste.
      const { quantity: _quantity, product_id, warehouse_id, ...settings } = formData;

      if (editingStock) {
        // Só definições da linha (mín./máx./ponto de encomenda/localização).
        // Produto e armazém também ficam de fora: trocá-los numa linha com
        // quantidade moveria stock sem movimento.
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase
            .from("stocks")
            .update({
              ...settings,
              updated_at: new Date().toISOString(),
            })
            .eq("id", editingStock.id);

          if (error) throw error;
        });

        toast({
          title: t('stocks.toast.updateSuccess'),
          description: t('stocks.toast.updateSuccessDesc'),
        });
      } else {
        if (!activeCompany?.id) throw new Error("No active company selected");

        // Cria a linha a 0 e, se houver quantidade inicial, regista-a como
        // ajuste positivo (rpc_adjust_stock: p_qty é o delta, positivo, com a
        // direção à parte; exige a linha de stocks já existente).
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase.from("stocks").insert([
            {
              ...settings,
              product_id,
              warehouse_id,
              quantity: 0,
              organization_id: activeCompany.id,
              created_by: businessUserId,
            },
          ]);

          if (error) throw error;
        });

        const initialQty = Math.trunc(Number(formData.quantity) || 0);
        let initialQtyError: string | null = null;
        if (initialQty > 0) {
          const { error: adjustError } = await supabase.rpc("rpc_adjust_stock", {
            p_product_id: product_id,
            p_warehouse_id: warehouse_id,
            p_qty: initialQty,
            p_direction: "positivo",
            p_reason: "Stock inicial",
            p_notes: null,
          } as any);
          if (adjustError) initialQtyError = adjustError.message;
        }

        if (initialQtyError) {
          // A linha ficou criada a 0 — não se desfaz; avisa para registar a
          // quantidade com um ajuste.
          captureFlowError(new Error(initialQtyError), "stock-lifecycle");
          toast({
            title: "Stock criado sem a quantidade inicial",
            description: `A linha foi criada com 0 un. Não foi possível registar as ${initialQty} un iniciais (${initialQtyError}). Usa Registar movimento → Ajuste.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: t('stocks.toast.createSuccess'),
            description: t('stocks.toast.createSuccessDesc'),
          });
        }
      }

      setDialogOpen(false);
      resetForm();
      refresh();
    } catch (error: any) {
      captureFlowError(error, "stock-lifecycle");
      toast({
        title: t('stocks.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('stocks.delete.confirm'))) return;

    try {
      const { error } = await supabase.rpc("rpc_delete_stock", { p_id: id });
      if (error) throw error;

      toast({
        title: t('stocks.toast.deleteSuccess'),
        description: t('stocks.toast.deleteSuccessDesc'),
      });

      refresh();
    } catch (error: any) {
      captureFlowError(error, "stock-lifecycle");
      toast({
        title: t('stocks.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const { error } = await supabase.rpc("rpc_restore_stock", { p_id: id });
      if (error) throw error;

      toast({ title: t('stocks.toast.restoreSuccess') || "Stock restaurado" });

      refresh();
    } catch (error: any) {
      captureFlowError(error, "stock-lifecycle");
      toast({
        title: t('stocks.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      product_id: "",
      warehouse_id: "",
      quantity: 0,
      minimum_quantity: 0,
      maximum_quantity: 0,
      reorder_point: 0,
      location: "",
    });
    setEditingStock(null);
    setFieldErrors({});
  };

  const openEditDialog = (stock: Stock) => {
    setEditingStock(stock);
    setFormData({
      product_id: stock.product_id,
      warehouse_id: stock.warehouse_id,
      quantity: stock.quantity,
      minimum_quantity: stock.minimum_quantity,
      maximum_quantity: stock.maximum_quantity,
      reorder_point: stock.reorder_point,
      location: stock.location || "",
    });
    setDialogOpen(true);
  };

  const getStockStatus = (stock: Stock) => {
    const code = getStockStatusCode(stock);
    if (code === "low") return <Badge variant="destructive">{t('stocks.status.lowStock')}</Badge>;
    if (code === "overstock") return <Badge variant="outline">{t('stocks.status.overstock')}</Badge>;
    return <Badge variant="default">{t('stocks.status.normal')}</Badge>;
  };

  // Exports every stock matching the current filters, not just what's been
  // paginated into the browser so far — loops in batches of 1000 (fetchAllRows),
  // same fix already applied to Products.tsx's export.
  const handleExport = async () => {
    try {
      const filters = filtersRef.current;
      const { data, error } = await fetchAllRows(() =>
        buildStocksQuery(filters).order("created_at", { ascending: false }).order("id", { ascending: true })
      );
      if (error) throw error;
      const rows = applyStatusFilter((data as Stock[]) || [], filters.statusFilter);

      if (rows.length === 0) {
        toast({
          title: t('stocks.toast.error'),
          description: "Não existem stocks para exportar com os filtros atuais",
          variant: "destructive",
        });
        return;
      }

      downloadStandardXlsx({
        sheetName: "Stocks",
        columns: [
          { key: "category", header: "Categoria", width: 22 },
          { key: "reference", header: "Referência", width: 18 },
          { key: "product", header: t('stocks.table.product'), width: 30 },
          { key: "warehouse", header: t('stocks.table.warehouse'), width: 26 },
          { key: "quantity", header: t('stocks.table.quantity'), type: "number", width: 14 },
          { key: "minimum", header: t('stocks.form.minimumQuantity'), type: "number", width: 14 },
          { key: "maximum", header: t('stocks.form.maximumQuantity'), type: "number", width: 14 },
          { key: "reorderPoint", header: t('stocks.form.reorderPoint'), type: "number", width: 16 },
          { key: "location", header: t('stocks.table.location'), width: 24 },
        ],
        rows: rows.map((stock) => ({
          category: stock.products?.product_categories?.name || UNCATEGORIZED_LABEL,
          reference: stock.products?.sku,
          product: stock.products?.name,
          warehouse: stock.warehouses?.name,
          quantity: stock.quantity,
          minimum: stock.minimum_quantity,
          maximum: stock.maximum_quantity,
          reorderPoint: stock.reorder_point,
          location: stock.location,
        })),
      }, `stocks_${new Date().toISOString().slice(0, 10)}.xlsx`);

      toast({
        title: t('stocks.toast.exportSuccess'),
        description: t('stocks.toast.exportSuccessDesc'),
      });
    } catch (error: any) {
      toast({
        title: t('stocks.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Importação CSV. A quantidade nunca é escrita diretamente em `stocks`
  // (sem stock_movement não fica rasto): linhas novas nascem a 0 e a
  // quantidade do ficheiro entra como ajuste "Importação CSV"; linhas que já
  // existem recebem um ajuste pela diferença e só as definições
  // (mín./máx./ponto de encomenda/localização) são atualizadas diretamente.
  // Cada linha é tratada à parte — uma falha não aborta as outras.
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    setImportResult(null);
    setImporting(true);
    try {
      if (!activeCompany?.id) throw new Error("No active company selected");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error(t('stocks.toast.emptyFile'));
      }

      // Linhas de stock já existentes na organização (por produto+armazém),
      // com a quantidade e definições atuais para calcular a diferença.
      // Paginado — um .select() sem range truncava acima de 1000 linhas.
      const { data: existingStockRows, error: existingStockRowsError } = await fetchAllRows(() =>
        supabase
          .from("stocks")
          .select("id, product_id, warehouse_id, quantity, minimum_quantity, maximum_quantity, reorder_point, location")
          .eq("organization_id", activeCompany.id)
          .is("deleted_at", null)
      );

      if (existingStockRowsError) throw existingStockRowsError;

      type ExistingStockRow = {
        id: string;
        product_id: string;
        warehouse_id: string;
        quantity: number;
        minimum_quantity: number;
        maximum_quantity: number;
        reorder_point: number;
        location: string | null;
      };
      const pairKey = (productId: string, warehouseId: string) => `${productId}::${warehouseId}`;
      const existingByPair = new Map<string, ExistingStockRow>(
        ((existingStockRows || []) as ExistingStockRow[]).map((s) => [pairKey(s.product_id, s.warehouse_id), s])
      );
      const seenInFile = new Set<string>();

      const dataLines = lines.slice(1);
      const rowErrors: string[] = [];

      type PlannedRow = {
        lineNumber: number;
        label: string;
        product_id: string;
        warehouse_id: string;
        quantity: number;
        settings: {
          minimum_quantity: number;
          maximum_quantity: number;
          reorder_point: number;
          location: string | null;
        };
        existing: ExistingStockRow | null;
        delta: number;
        settingsChanged: boolean;
      };
      const planned: PlannedRow[] = [];

      // Célula vazia = "não indicado" (null); valores malformados ficam NaN
      // para o stockSchema os rejeitar — nunca são convertidos em 0 em silêncio.
      const toNumberOrNull = (v: string | undefined): number | null => {
        const trimmed = (v ?? '').trim();
        if (trimmed === '') return null;
        return Number(trimmed);
      };

      dataLines.forEach((line, index) => {
        const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

        if (values.length < 3) return;

        const lineNumber = index + 2; // +2 for header row and 0-index

        const product = products.find(p => p.name === values[0]);
        const warehouse = warehouses.find(w => w.name === values[1]);

        if (!product || !warehouse) {
          rowErrors.push(`Linha ${lineNumber}: produto ou armazém não encontrado ("${values[0]}" / "${values[1]}")`);
          return;
        }

        const key = pairKey(product.id, warehouse.id);
        if (seenInFile.has(key)) {
          rowErrors.push(`Linha ${lineNumber}: "${values[0]}" no armazém "${values[1]}" aparece repetido no ficheiro`);
          return;
        }

        const existing = existingByPair.get(key) ?? null;

        // Linha existente: célula vazia mantém o valor atual (não zera stock
        // nem definições). Linha nova: célula vazia = 0, como antes.
        const rawQty = toNumberOrNull(values[2]);
        const rawMin = toNumberOrNull(values[3]);
        const rawMax = toNumberOrNull(values[4]);
        const rawReorder = toNumberOrNull(values[5]);
        const rawLocation = (values[6] ?? '').trim();

        const candidate = {
          product_id: product.id,
          warehouse_id: warehouse.id,
          quantity: rawQty ?? (existing ? toNum(existing.quantity) : 0),
          minimum_quantity: rawMin ?? (existing ? toNum(existing.minimum_quantity) : 0),
          maximum_quantity: rawMax ?? (existing ? toNum(existing.maximum_quantity) : 0),
          reorder_point: rawReorder ?? (existing ? toNum(existing.reorder_point) : 0),
          location: rawLocation !== '' ? rawLocation : (existing?.location ?? ""),
        };

        const validation = stockSchema.safeParse(candidate);
        if (!validation.success) {
          const firstError = validation.error.errors[0];
          rowErrors.push(`Linha ${lineNumber} (${values[0]}): ${firstError.message}`);
          return;
        }
        if (!Number.isInteger(candidate.quantity)) {
          rowErrors.push(`Linha ${lineNumber} (${values[0]}): ${STOCK_INTEGER_ONLY_MSG}`);
          return;
        }
        seenInFile.add(key);

        const validated = validation.data;
        const settings = {
          minimum_quantity: validated.minimum_quantity,
          maximum_quantity: validated.maximum_quantity,
          reorder_point: validated.reorder_point,
          location: validated.location || null,
        };
        const delta = existing ? validated.quantity - toNum(existing.quantity) : validated.quantity;
        const settingsChanged = existing
          ? settings.minimum_quantity !== toNum(existing.minimum_quantity)
            || settings.maximum_quantity !== toNum(existing.maximum_quantity)
            || settings.reorder_point !== toNum(existing.reorder_point)
            || (settings.location ?? null) !== (existing.location || null)
          : false;

        planned.push({
          lineNumber,
          label: `${values[0]} / ${values[1]}`,
          product_id: validated.product_id,
          warehouse_id: validated.warehouse_id,
          quantity: validated.quantity,
          settings,
          existing,
          delta,
          settingsChanged,
        });
      });

      if (planned.length === 0) {
        throw new Error(
          rowErrors.length > 0
            ? `${t('stocks.toast.noValidStocks')} ${rowErrors.slice(0, 5).join(" | ")}`
            : t('stocks.toast.noValidStocks')
        );
      }

      // Pré-visualização antes de escrever: quantas linhas novas, quantos
      // ajustes (+/-) e quantas sem alterações.
      const toCreate = planned.filter((r) => !r.existing);
      const toAdjustUp = planned.filter((r) => r.existing && r.delta > 0);
      const toAdjustDown = planned.filter((r) => r.existing && r.delta < 0);
      const toSettingsOnly = planned.filter((r) => r.existing && r.delta === 0 && r.settingsChanged);
      const toUnchanged = planned.filter((r) => r.existing && r.delta === 0 && !r.settingsChanged);
      const sumUnits = (rows: PlannedRow[]) => rows.reduce((acc, r) => acc + Math.abs(r.delta), 0);

      const previewLines = [
        `Importar ${planned.length} linha(s) do ficheiro:`,
        `• ${toCreate.length} stock(s) novo(s)${sumUnits(toCreate) > 0 ? ` (+${formatQty(sumUnits(toCreate))} un em ajustes "${CSV_IMPORT_REASON}")` : ""}`,
        `• ${toAdjustUp.length} ajuste(s) positivo(s) (+${formatQty(sumUnits(toAdjustUp))} un)`,
        `• ${toAdjustDown.length} ajuste(s) negativo(s) (−${formatQty(sumUnits(toAdjustDown))} un)`,
        `• ${toSettingsOnly.length} só com definições (mín./máx./ponto/localização)`,
        `• ${toUnchanged.length} sem alterações`,
      ];
      if (rowErrors.length > 0) {
        previewLines.push(`• ${rowErrors.length} linha(s) inválida(s) serão ignoradas`);
      }
      previewLines.push("", "As diferenças de quantidade ficam registadas como movimentos de ajuste. Continuar?");
      if (!confirm(previewLines.join("\n"))) return;

      const result: ImportResult = {
        created: 0,
        adjustedUp: 0,
        adjustedDown: 0,
        unitsUp: 0,
        unitsDown: 0,
        settingsOnly: 0,
        unchanged: toUnchanged.length,
        errors: [...rowErrors],
      };

      // 1) Escritas diretas em `stocks` (linhas novas a 0 + definições das
      //    existentes), cada uma com o seu erro — não em lote atómico.
      const rowsReadyForAdjust: PlannedRow[] = [];
      await withAuditContext(
        supabase,
        businessUserId,
        async () => {
          for (const row of planned) {
            if (!row.existing) {
              const { error } = await supabase.from("stocks").insert([
                {
                  ...row.settings,
                  product_id: row.product_id,
                  warehouse_id: row.warehouse_id,
                  quantity: 0,
                  organization_id: activeCompany.id,
                  created_by: businessUserId,
                },
              ]);
              if (error) {
                result.errors.push(`Linha ${row.lineNumber} (${row.label}): não foi possível criar o stock (${error.message})`);
                continue;
              }
              result.created += 1;
              if (row.delta > 0) rowsReadyForAdjust.push(row);
              continue;
            }

            if (row.settingsChanged) {
              const { error } = await supabase
                .from("stocks")
                .update({
                  ...row.settings,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", row.existing.id);
              if (error) {
                result.errors.push(`Linha ${row.lineNumber} (${row.label}): não foi possível atualizar as definições (${error.message})`);
              } else if (row.delta === 0) {
                result.settingsOnly += 1;
              }
            }
            if (row.delta !== 0) rowsReadyForAdjust.push(row);
          }
        },
        "csv_import"
      );

      // 2) Quantidades: sempre por rpc_adjust_stock (p_qty = diferença
      //    positiva, direção à parte), que regista o stock_movement.
      for (const row of rowsReadyForAdjust) {
        const qty = Math.abs(row.delta);
        const direction = row.delta > 0 ? "positivo" : "negativo";
        const { error: adjustError } = await supabase.rpc("rpc_adjust_stock", {
          p_product_id: row.product_id,
          p_warehouse_id: row.warehouse_id,
          p_qty: qty,
          p_direction: direction,
          p_reason: CSV_IMPORT_REASON,
          p_notes: null,
        } as any);
        if (adjustError) {
          result.errors.push(
            row.existing
              ? `Linha ${row.lineNumber} (${row.label}): ajuste de ${row.delta > 0 ? "+" : "−"}${formatQty(qty)} un não registado (${adjustError.message})`
              : `Linha ${row.lineNumber} (${row.label}): stock criado com 0 un — as ${formatQty(qty)} un não foram registadas (${adjustError.message})`
          );
          continue;
        }
        if (!row.existing) continue; // conta como "criada"
        if (row.delta > 0) {
          result.adjustedUp += 1;
          result.unitsUp += qty;
        } else {
          result.adjustedDown += 1;
          result.unitsDown += qty;
        }
      }

      setImportResult(result);

      const summary = `${result.created} criada(s), ${result.adjustedUp + result.adjustedDown} ajustada(s) (+${formatQty(result.unitsUp)} / −${formatQty(result.unitsDown)} un), ${result.settingsOnly} só definições, ${result.unchanged} sem alterações`;
      if (result.errors.length > 0) {
        captureFlowError(new Error(`CSV import: ${result.errors.length} row error(s)`), "record-export-import");
        toast({
          title: t('stocks.toast.importSuccess'),
          description: `${summary}. ${result.errors.length} linha(s) com erro — ver detalhe na janela de importação.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: t('stocks.toast.importSuccess'),
          description: summary,
        });
        setImportDialogOpen(false);
      }

      refresh();
    } catch (error: any) {
      captureFlowError(error, "record-export-import");
      toast({
        title: t('stocks.toast.importError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      input.value = '';
    }
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
          <div><h1 className="text-3xl font-bold">{t('stocks.title')}</h1><p className="text-muted-foreground">{t('stocks.description')}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('stocks.title')}</h1>
            <p className="text-muted-foreground">
              {t('stocks.description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={showDeleted ? "default" : "outline"}
              onClick={() => setShowDeleted((prev) => !prev)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {showDeleted ? (t('stocks.hideDeleted') || 'Ocultar eliminados') : (t('stocks.showDeleted') || 'Ver eliminados')}
            </Button>
            <PermissionGate permission="stocks.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> {t('stocks.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="stocks.import">
              <Dialog
                open={importDialogOpen}
                onOpenChange={(open) => {
                  if (importing) return;
                  setImportDialogOpen(open);
                  if (open) setImportResult(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" /> {t('stocks.import')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('stocks.import.title')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('stocks.import.description')}
                    </p>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleImport}
                      disabled={importing}
                    />
                    <p className="text-xs text-muted-foreground">
                      As quantidades não são escritas diretamente: stocks novos são criados a 0 e as diferenças ficam registadas como ajuste ("{CSV_IMPORT_REASON}"). Em stocks já existentes, células vazias mantêm o valor atual.
                    </p>
                    {importing && (
                      <p className="text-sm text-muted-foreground" role="status">A importar…</p>
                    )}
                    {importResult && (
                      <div className="rounded-md border p-3 text-sm space-y-2" role="status">
                        <ul className="space-y-0.5">
                          <li>{importResult.created} stock(s) criado(s)</li>
                          <li>{importResult.adjustedUp} ajuste(s) positivo(s) (+{formatQty(importResult.unitsUp)} un)</li>
                          <li>{importResult.adjustedDown} ajuste(s) negativo(s) (−{formatQty(importResult.unitsDown)} un)</li>
                          <li>{importResult.settingsOnly} só com definições atualizadas</li>
                          <li>{importResult.unchanged} sem alterações</li>
                        </ul>
                        {importResult.errors.length > 0 && (
                          <div>
                            <p className="font-medium text-destructive">{importResult.errors.length} linha(s) com erro:</p>
                            <ul className="mt-1 max-h-48 overflow-y-auto list-disc pl-5 text-destructive">
                              {importResult.errors.map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>
            <PermissionGate permission="stocks.edit">
              <Button
                variant="outline"
                onClick={() => {
                  setMovementContext({});
                  setMovementDialogOpen(true);
                }}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" /> Registar movimento
              </Button>
            </PermissionGate>
            <PermissionGate permission="stocks.create">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('stocks.addStock')}
                  </Button>
                </DialogTrigger>
              </Dialog>
            </PermissionGate>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingStock ? t('stocks.editStock') : t('stocks.addStock')}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="product_id">{t('stocks.form.product')}</Label>
                  <Select
                    value={formData.product_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, product_id: value })
                    }
                    disabled={Boolean(editingStock)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('stocks.form.selectProduct')} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.product_id && <p className="text-sm text-destructive mt-1">{fieldErrors.product_id}</p>}
                </div>
                <div>
                  <Label htmlFor="warehouse_id">{t('stocks.form.warehouse')}</Label>
                  <Select
                    value={formData.warehouse_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, warehouse_id: value })
                    }
                    disabled={Boolean(editingStock)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('stocks.form.selectWarehouse')} />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.warehouse_id && <p className="text-sm text-destructive mt-1">{fieldErrors.warehouse_id}</p>}
                </div>
                <div>
                  <Label htmlFor="quantity">
                    {editingStock ? t('stocks.form.quantity') : "Quantidade inicial"}
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={0}
                    step={1}
                    value={formData.quantity}
                    readOnly={Boolean(editingStock)}
                    aria-describedby="quantity-help"
                    onChange={(e) => {
                      if (editingStock) return;
                      setFormData({
                        ...formData,
                        quantity: parseInt(e.target.value) || 0,
                      });
                    }}
                    required
                    className={cn(
                      fieldErrors.quantity ? "border-destructive" : "",
                      editingStock ? "bg-muted cursor-not-allowed" : "",
                    )}
                  />
                  {fieldErrors.quantity && <p className="text-sm text-destructive mt-1">{fieldErrors.quantity}</p>}
                  {editingStock ? (
                    <div id="quantity-help" className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        Para alterar a quantidade usa Registar movimento → Ajuste.
                      </p>
                      <PermissionGate permission="stocks.edit">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const stock = editingStock;
                            setDialogOpen(false);
                            setMovementContext({
                              productId: stock.product_id,
                              warehouseId: stock.warehouse_id,
                              movementType: "ajuste",
                            });
                            setMovementDialogOpen(true);
                          }}
                        >
                          <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Registar ajuste
                        </Button>
                      </PermissionGate>
                    </div>
                  ) : (
                    <p id="quantity-help" className="text-xs text-muted-foreground mt-1">
                      Fica registada como movimento de ajuste ("Stock inicial"). Depois de criada, a quantidade só muda por Registar movimento.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="minimum_quantity">{t('stocks.form.minimumQuantity')}</Label>
                  <Input
                    id="minimum_quantity"
                    type="number"
                    value={formData.minimum_quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minimum_quantity: parseInt(e.target.value) || 0,
                      })
                    }
                    className={fieldErrors.minimum_quantity ? "border-destructive" : ""}
                  />
                  {fieldErrors.minimum_quantity && <p className="text-sm text-destructive mt-1">{fieldErrors.minimum_quantity}</p>}
                </div>
                <div>
                  <Label htmlFor="maximum_quantity">{t('stocks.form.maximumQuantity')}</Label>
                  <Input
                    id="maximum_quantity"
                    type="number"
                    value={formData.maximum_quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maximum_quantity: parseInt(e.target.value) || 0,
                      })
                    }
                    className={fieldErrors.maximum_quantity ? "border-destructive" : ""}
                  />
                  {fieldErrors.maximum_quantity && <p className="text-sm text-destructive mt-1">{fieldErrors.maximum_quantity}</p>}
                </div>
                <div>
                  <Label htmlFor="reorder_point">{t('stocks.form.reorderPoint')}</Label>
                  <Input
                    id="reorder_point"
                    type="number"
                    value={formData.reorder_point}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        reorder_point: parseInt(e.target.value) || 0,
                      })
                    }
                    className={fieldErrors.reorder_point ? "border-destructive" : ""}
                  />
                  {fieldErrors.reorder_point && <p className="text-sm text-destructive mt-1">{fieldErrors.reorder_point}</p>}
                </div>
                <div>
                  <Label htmlFor="location">{t('stocks.form.location')}</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    placeholder={t('stocks.form.locationPlaceholder')}
                    className={fieldErrors.location ? "border-destructive" : ""}
                  />
                  {fieldErrors.location && <p className="text-sm text-destructive mt-1">{fieldErrors.location}</p>}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    {t('stocks.form.cancel')}
                  </Button>
                  <Button type="submit">
                    {editingStock ? t('stocks.form.update') : t('stocks.form.create')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Pesquisar por produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <CategorySubcategoryFilter
            categoryId={categoryFilter}
            subcategoryId={subcategoryFilter}
            onChange={({ categoryId, subcategoryId }) => {
              setCategoryFilter(categoryId);
              setSubcategoryFilter(subcategoryId);
            }}
            includeUncategorized
          />
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('stocks.table.warehouse')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os armazéns</SelectItem>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('stocks.table.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              <SelectItem value="low">{t('stocks.status.lowStock')}</SelectItem>
              <SelectItem value="normal">{t('stocks.status.normal')}</SelectItem>
              <SelectItem value="overstock">{t('stocks.status.overstock')}</SelectItem>
            </SelectContent>
          </Select>
          {(searchTerm || categoryFilter !== "all" || subcategoryFilter !== "all" || warehouseFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setCategoryFilter("all");
                setSubcategoryFilter("all");
                setWarehouseFilter("all");
                setStatusFilter("all");
              }}
            >
              Limpar filtros
            </Button>
          )}
          <span className="text-sm text-muted-foreground ml-auto">
            {stocks.length} carregado{stocks.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('stocks.table.product')}</TableHead>
                <TableHead>{t('stocks.table.warehouse')}</TableHead>
                <TableHead>{t('stocks.table.location')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.quantity')}</TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4">{t('stocks.table.reserved')}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{t('stocks.table.reservedHint')}</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4">{t('stocks.table.free')}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{t('stocks.table.freeHint')}</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">{t('stocks.table.min')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.max')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.reorder')}</TableHead>
                <TableHead>{t('stocks.table.status')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center">
                    {t('stocks.loading')}
                  </TableCell>
                </TableRow>
              ) : stocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center">
                    {t('stocks.noStocks')}
                  </TableCell>
                </TableRow>
              ) : (
                groupedStocks.map(([categoryName, categoryStocks]) => (
                  <Fragment key={categoryName}>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={11} className="font-semibold text-sm">
                        {categoryName} <span className="font-normal text-muted-foreground">({categoryStocks.length})</span>
                      </TableCell>
                    </TableRow>
                    {categoryStocks.map((stock) => (
                      <TableRow key={stock.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 pl-4">
                            <Package className="w-4 h-4 text-muted-foreground" />
                            {stock.products?.name}
                          </div>
                        </TableCell>
                        <TableCell>{stock.warehouses?.name}</TableCell>
                        <TableCell>{stock.location || "-"}</TableCell>
                        <TableCell className="text-right">
                          {stock.quantity}
                        </TableCell>
                        {(() => {
                          // Reserva ao nível da organização: igual em todas as
                          // linhas (armazéns) do mesmo produto.
                          const res = reservationByProduct[stock.product_id];
                          const org = orgStockByProduct[stock.product_id];
                          if (showDeleted || !res || !org) {
                            return (
                              <>
                                <TableCell className="text-right text-muted-foreground">-</TableCell>
                                <TableCell className="text-right text-muted-foreground">-</TableCell>
                              </>
                            );
                          }
                          const free = Math.round((org.total - res.qty_reserved) * 1e6) / 1e6;
                          const multiWarehouse = org.warehouses > 1;
                          return (
                            <>
                              <TableCell className="text-right">
                                {res.qty_reserved > 0 ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help">{formatQty(res.qty_reserved)}</span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      {t('stocks.table.reservedTooltip', { count: res.orders_count })}
                                      {res.qty_missing > 0 && (
                                        <> {t('stocks.table.reservedMissing', { qty: formatQty(res.qty_missing) })}</>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </TableCell>
                              <TableCell className={`text-right ${free < 0 ? "text-destructive font-medium" : ""}`}>
                                {multiWarehouse ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help">
                                        {formatQty(free)}
                                        <span className="ml-1 text-xs font-normal text-muted-foreground">{t('stocks.table.orgSuffix')}</span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      {t('stocks.table.freeOrgTooltip', {
                                        total: formatQty(org.total),
                                        reserved: formatQty(res.qty_reserved),
                                        count: org.warehouses,
                                      })}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  formatQty(free)
                                )}
                              </TableCell>
                            </>
                          );
                        })()}
                        <TableCell className="text-right">
                          {stock.minimum_quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.maximum_quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.reorder_point}
                        </TableCell>
                        <TableCell>{getStockStatus(stock)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {showDeleted ? (
                              <PermissionGate permission="stocks.delete">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestore(stock.id)}
                                >
                                  {t('stocks.restore') || 'Restaurar'}
                                </Button>
                              </PermissionGate>
                            ) : (
                              <>
                                <PermissionGate permission="stocks.edit">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Registar movimento"
                                    onClick={() => {
                                      setMovementContext({ productId: stock.product_id, warehouseId: stock.warehouse_id });
                                      setMovementDialogOpen(true);
                                    }}
                                  >
                                    <ArrowLeftRight className="w-4 h-4" />
                                  </Button>
                                </PermissionGate>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Ver histórico de movimentos"
                                  onClick={() => {
                                    setHistoryContext({
                                      productId: stock.product_id,
                                      warehouseId: stock.warehouse_id,
                                      productName: stock.products?.name,
                                      warehouseName: stock.warehouses?.name,
                                    });
                                    setHistoryDialogOpen(true);
                                  }}
                                >
                                  <History className="w-4 h-4" />
                                </Button>
                                <PermissionGate permission="stocks.edit">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(stock)}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </PermissionGate>
                                <PermissionGate permission="stocks.delete">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(stock.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </PermissionGate>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
          {/* Infinite scroll loader — inert (never shows "a carregar mais") while a
              status filter is active, since hasMore is false in that mode. */}
          <div ref={loadMoreRef} className="py-4 flex justify-center">
            {loadingMore && (
              <div className="text-sm text-muted-foreground">{t('stocks.loadingMore') || 'A carregar mais...'}</div>
            )}
            {!hasMore && !loading && stocks.length > 0 && (
              <div className="text-sm text-muted-foreground">{t('stocks.allLoaded') || 'Todos carregados'}</div>
            )}
          </div>
        </div>
      </div>

      <StockMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        organizationId={activeCompany.id}
        warehouses={warehouses}
        defaultProductId={movementContext.productId}
        defaultWarehouseId={movementContext.warehouseId}
        defaultMovementType={movementContext.movementType}
        onSuccess={refresh}
      />

      {historyContext && (
        <StockMovementsHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          productId={historyContext.productId}
          warehouseId={historyContext.warehouseId}
          productName={historyContext.productName}
          warehouseName={historyContext.warehouseName}
        />
      )}
    </>
  );
};

export default Stocks;
