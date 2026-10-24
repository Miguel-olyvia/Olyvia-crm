import { useEffect, useState, useRef, useCallback } from "react";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Building, Pencil, Trash2, Globe, Download, Upload, Search, X, Truck, BarChart3 } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { Database } from "@/integrations/supabase/types";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import type { OrganizationSelection } from "@/components/OrganizationFormSection";
import SupplierCatalogDialog from "@/components/SupplierCatalogDialog";
import SupplierSlaReportDialog from "@/components/SupplierSlaReportDialog";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import {
  InventoryEmptyState,
  InventoryPageHeader,
  InventoryStatusBadge,
  RowActions,
  parseSuppliersParams,
  purchaseOrdersLink,
  type RowActionEntry,
} from "@/components/inventory/ui";
import { useSupplierOrgStats, useSupplierRowStats } from "@/components/suppliers/useSupplierListStats";
import {
  SupplierOpenPos,
  SupplierPortalBadge,
  SupplierPricesPending,
  SupplierSla,
} from "@/components/suppliers/SupplierRowStats";
import { Clock, Eye, ShoppingCart, Undo2, Users } from "lucide-react";
import { SupplierSheet, supplierSheetTabFromParams, type SupplierSheetTab } from "@/components/suppliers/SupplierSheet";
import { SupplierDataForm, type SupplierFormData } from "@/components/suppliers/SupplierDataForm";

const SUPPLIER_FORM_ID = "supplier-sheet-form";

// Título e descrição do ecrã (tom do TITULOS.sup do protótipo, ajustado ao que
// a app faz: a tabela não se edita inline e o convite ao portal é um passo à
// parte, no separador Portal da ficha).
const PAGE_TITLE = "Fornecedores";
const PAGE_DESCRIPTION =
  "Dados, artigos, preços e portal ficam na ficha do fornecedor. No separador Portal convida-o: ele preenche a ficha e o catálogo.";

/** Tira os caracteres que partem o filtro .or() do PostgREST. */
const sanitizeSearch = (q: string): string => q.replace(/[,()*%\\]/g, " ").trim();

type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

interface FilterOrganization {
  id: string;
  name: string;
}

const supplierSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório.").max(200, "O nome deve ter menos de 200 caracteres."),
  contact_person: z.string().trim().max(200, "O contacto deve ter menos de 200 caracteres.").optional().or(z.literal("")),
  email: z.string().trim().email("Formato de email inválido.").max(255, "O email deve ter menos de 255 caracteres.").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "O telefone deve ter menos de 20 caracteres.").optional().or(z.literal("")),
  address: z.string().trim().max(255, "A morada deve ter menos de 255 caracteres.").optional().or(z.literal("")),
  city: z.string().trim().max(100, "A cidade deve ter menos de 100 caracteres.").optional().or(z.literal("")),
  postal_code: z.string().trim().max(20, "O código postal deve ter menos de 20 caracteres.").optional().or(z.literal("")),
  country: z.string().trim().max(100, "O país deve ter menos de 100 caracteres.").optional().or(z.literal("")),
  tax_id: z.string().trim().max(50, "O NIF deve ter menos de 50 caracteres.").optional().or(z.literal("")),
  delivery_sla_days: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.coerce.number().int().positive().optional()
  ),
  website: z.string().trim().url("URL do website inválido.").max(255, "O website deve ter menos de 255 caracteres.").optional().or(z.literal("")),
  notes: z.string().trim().max(2000, "As notas devem ter menos de 2000 caracteres.").optional().or(z.literal("")),
  is_active: z.boolean(),
});

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Ficha em edição: o separador Portal usa a empresa/nome gravados.
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  // Separador da folha do fornecedor (Resumo · Dados · Artigos e preços ·
  // Preços por aprovar · Portal).
  const [formTab, setFormTab] = useState<SupplierSheetTab>("dados");
  // Link do sino "Preços do fornecedor por aprovar" (F3.4b): a ficha abre no
  // separador "Preços por aprovar".
  const [focusPriceChanges, setFocusPriceChanges] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const handledDeepLinkRef = useRef<string | null>(null);
  const { toast } = useToast();
  const { activeCompany, userType, companies, isLoading: companyLoading } = useCompany();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Portal do Fornecedor (F3.1): gerir acessos só com esta permissão.
  const canManagePortal = hasPermission("suppliers.portal_manage");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  // Caixas do protótipo: à espera do fornecedor, catálogo por ligar, preços por aprovar.
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [catalogOnly, setCatalogOnly] = useState(false);
  const [pricesOnly, setPricesOnly] = useState(false);

  // /suppliers?filter=… (inventoryLinks): aplicado quando o valor muda; qualquer
  // mudança feita à mão nos filtros tira-o do URL para não voltar a aplicar.
  const urlFilter = parseSuppliersParams(searchParams).filter;
  useEffect(() => {
    if (urlFilter === "all") return;
    setStatusFilter(urlFilter === "active" || urlFilter === "inactive" ? urlFilter : "all");
    setAwaitingOnly(urlFilter === "awaiting");
    setCatalogOnly(urlFilter === "catalog");
    setPricesOnly(urlFilter === "prices");
    setShowDeleted(false);
  }, [urlFilter]);
  const dropUrlFilter = () => {
    if (!searchParams.has("filter")) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("filter");
      return next;
    }, { replace: true });
  };

  // Estatísticas por fornecedor: sempre da organização filtrada (ou da ativa).
  const statsOrgId = companyFilter && companyFilter !== "all" ? companyFilter : activeCompany?.id ?? null;
  const canPricing =
    hasPermission("suppliers.view") && (hasPermission("suppliers.view_pricing") || hasPermission("products.view_cost"));
  // Portal, à espera da ficha e catálogo por ligar: uma chamada por organização.
  const orgStatsQuery = useSupplierOrgStats(statsOrgId);
  const orgStats = orgStatsQuery.data ?? null;

  // Caixas ativas → restrição por ids (intersecção). null = sem restrição;
  // "pending" = à espera das estatísticas.
  let restrictIds: string[] | null | "pending" = null;
  if (awaitingOnly || catalogOnly || pricesOnly) {
    if (!orgStats) {
      restrictIds = orgStatsQuery.isError ? [] : "pending";
    } else {
      let set: Set<string> | null = null;
      const narrow = (ids: Iterable<string>) => {
        const next = new Set(ids);
        set = set === null ? next : new Set([...set].filter((id) => next.has(id)));
      };
      if (awaitingOnly) narrow(orgStats.awaiting.map((s) => s.id));
      if (catalogOnly) narrow([...(orgStats.catalogUnlinked ?? new Map<string, number>())].filter(([, n]) => n > 0).map(([id]) => id));
      if (pricesOnly) narrow([...(orgStats.pricesPending ?? new Map<string, number>())].filter(([, n]) => n > 0).map(([id]) => id));
      restrictIds = [...(set ?? new Set<string>())].sort();
    }
  }
  const restrictKey = restrictIds === null ? "" : restrictIds === "pending" ? "pending" : `ids:${restrictIds.join(",")}`;

  // Filter data
  const [filterOrganizations, setFilterOrganizations] = useState<FilterOrganization[]>([]);


  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogSupplier, setCatalogSupplier] = useState<Supplier | null>(null);
  const [slaReportDialogOpen, setSlaReportDialogOpen] = useState(false);
  const [slaReportSupplier, setSlaReportSupplier] = useState<Supplier | null>(null);
  
  // New bulk action states
  const [bulkCompanyDialogOpen, setBulkCompanyDialogOpen] = useState(false);
  const [bulkCompanyId, setBulkCompanyId] = useState("");

  const [formData, setFormData] = useState<SupplierFormData>({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    country: "",
    tax_id: "",
    delivery_sla_days: "" as string | number,
    website: "",
    notes: "",
    is_active: true,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [organizationSelection, setOrganizationSelection] = useState<OrganizationSelection>({
    tenantId: "",
    companyId: activeCompany?.id || "",
    businessUnitId: "",
    departmentId: "",
    secondaryCompanyIds: [],
  });

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("suppliers.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, navigate, activeCompany]);

  // Pre-select activeCompany in companyFilter on page load
  // Non-system_admin users are never allowed to use "all" (cross-tenant data leak)
  useEffect(() => {
    if (companyFilter === null && activeCompany?.id) {
      setCompanyFilter(activeCompany.id);
    } else if (companyFilter === null && !activeCompany) {
      setCompanyFilter(userType === "system_admin" ? "all" : "");
    }
  }, [activeCompany?.id, companyFilter, userType]);

  // Load filter data from anew_organizations
  useEffect(() => {
    if (activeCompany?.id || userType === 'system_admin') {
      loadFilterData();
    }
  }, [activeCompany?.id, userType]);

  const loadFilterData = async () => {
    try {
      // Use companies from CompanyContext (already filtered by user visibility)
      setFilterOrganizations(companies.map(c => ({ id: c.id, name: c.name })));
    } catch (error: any) {
      console.error("Error loading filter data:", error);
    }
  };

  // Load suppliers with filters
  const loadSuppliers = useCallback(async (offset = 0, reset = false) => {
    if (offset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    // Caixas "à espera / catálogo / preços": à espera das estatísticas, ou sem
    // nenhum fornecedor que cumpra → lista vazia sem ir à BD.
    if (restrictKey === "pending") return;
    const onlyIds = restrictKey.startsWith("ids:") ? restrictKey.slice(4).split(",").filter(Boolean) : null;
    if (onlyIds && onlyIds.length === 0) {
      setSuppliers([]);
      setTotalCount(0);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const search = sanitizeSearch(searchQuery);
    const searchOr = `name.ilike.%${search}%,code.ilike.%${search}%,tax_id.ilike.%${search}%,city.ilike.%${search}%,contact_person.ilike.%${search}%,email.ilike.%${search}%`;

    try {
      // Caixas ativas (à espera / catálogo / preços): o conjunto de ids pode ter
      // centenas de entradas e um único .in("id", …) estoura o URL. Lê-se em
      // blocos de 100 com os mesmos filtros, junta-se, ordena-se como a lista
      // normal (created_at desc, id desc) e mostra-se tudo de uma vez.
      if (onlyIds) {
        const ID_CHUNK = 100;
        const parts: string[][] = [];
        for (let i = 0; i < onlyIds.length; i += ID_CHUNK) parts.push(onlyIds.slice(i, i + ID_CHUNK));
        const results = await Promise.all(
          parts.map((part) => {
            let q = supabase
              .from("suppliers")
              .select("*, anew_organizations:suppliers_organization_id_fkey(id, name)")
              .in("id", part);
            if (companyFilter && companyFilter !== "all") {
              q = q.eq("organization_id", companyFilter);
            } else if (userType !== "system_admin" && activeCompany?.id) {
              q = q.eq("organization_id", activeCompany.id);
            }
            q = showDeleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
            if (statusFilter !== "all") q = q.eq("is_active", statusFilter === "active");
            if (search) q = q.or(searchOr);
            return q;
          }),
        );
        const byId = new Map<string, Supplier>();
        for (const r of results) {
          if (r.error) throw r.error;
          for (const s of (r.data as Supplier[]) ?? []) byId.set(s.id, s);
        }
        const all = [...byId.values()].sort((a, b) => {
          const ca = a.created_at ?? "";
          const cb = b.created_at ?? "";
          if (ca !== cb) return ca < cb ? 1 : -1;
          return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
        });
        setSuppliers(all);
        setTotalCount(all.length);
        setHasMore(false);
        return;
      }

      // Build count query
      let countQuery = supabase
        .from("suppliers")
        .select("*", { count: "exact", head: true });

      // Apply company filter — non-system_admin always scoped
      if (companyFilter && companyFilter !== "all") {
        countQuery = countQuery.eq("organization_id", companyFilter);
      } else if (userType !== "system_admin" && activeCompany?.id) {
        countQuery = countQuery.eq("organization_id", activeCompany.id);
      }

      // Soft-deleted suppliers are hidden from the normal list by default.
      countQuery = showDeleted
        ? countQuery.not("deleted_at", "is", null)
        : countQuery.is("deleted_at", null);

      // Apply status filter
      if (statusFilter !== "all") {
        countQuery = countQuery.eq("is_active", statusFilter === "active");
      }

      // Apply search filter (nome, código, NIF, cidade, contacto, email)
      if (search) {
        countQuery = countQuery.or(searchOr);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Build data query
      // Tiebreaker por "id": sem ele, fornecedores com o mesmo created_at podiam
      // reaparecer em páginas seguintes e travar o scroll infinito.
      let dataQuery = supabase
        .from("suppliers")
        .select("*, anew_organizations:suppliers_organization_id_fkey(id, name)")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      // Apply company filter — non-system_admin always scoped
      if (companyFilter && companyFilter !== "all") {
        dataQuery = dataQuery.eq("organization_id", companyFilter);
      } else if (userType !== "system_admin" && activeCompany?.id) {
        dataQuery = dataQuery.eq("organization_id", activeCompany.id);
      }

      // Soft-deleted suppliers are hidden from the normal list by default.
      dataQuery = showDeleted
        ? dataQuery.not("deleted_at", "is", null)
        : dataQuery.is("deleted_at", null);

      // Apply status filter
      if (statusFilter !== "all") {
        dataQuery = dataQuery.eq("is_active", statusFilter === "active");
      }

      // Apply search filter (nome, código, NIF, cidade, contacto, email)
      if (search) {
        dataQuery = dataQuery.or(searchOr);
      }

      const { data, error } = await dataQuery;

      if (error) throw error;

      const newSuppliers = (data as Supplier[]) || [];
      let uniqueNewCount = newSuppliers.length;
      if (reset || offset === 0) {
        setSuppliers(newSuppliers);
      } else {
        setSuppliers(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNew = newSuppliers.filter(s => !existingIds.has(s.id));
          uniqueNewCount = uniqueNew.length;
          return [...prev, ...uniqueNew];
        });
      }

      // Rede de segurança: página cheia sem nenhum registo novo = paginação a repetir-se — parar.
      const madeNoProgress = !reset && offset !== 0 && newSuppliers.length >= PAGE_SIZE && uniqueNewCount === 0;
      setHasMore(!madeNoProgress && newSuppliers.length >= PAGE_SIZE);
    } catch (error: any) {
      toast({
        title: t("suppliers.toast.loadError"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [companyFilter, statusFilter, searchQuery, showDeleted, restrictKey, userType, t, toast]);

  // Debounce search
  useEffect(() => {
    if (!activeCompany?.id && userType !== 'system_admin') return;

    const timer = setTimeout(() => {
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, companyFilter, showDeleted, restrictKey]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current || loading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadSuppliers(suppliers.length);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [suppliers.length, hasMore, loadingMore, loading, loadSuppliers]);

  const handleEdit = async (supplier: Supplier) => {
    setEditingId(supplier.id);
    setEditingSupplier(supplier);
    setFormTab("resumo");
    setFocusPriceChanges(false);
    setFormData({
      name: supplier.name,
      contact_person: (supplier as any).contact_person || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      city: supplier.city || "",
      postal_code: supplier.postal_code || "",
      country: supplier.country || "",
      tax_id: (supplier as any).tax_id || "",
      delivery_sla_days: supplier.delivery_sla_days ?? "",
      website: supplier.website || "",
      notes: supplier.notes || "",
      is_active: supplier.is_active ?? true,
    });
    
    // Load organization data from supplier via anew_hierarchy
    const companyId = (supplier as any).organization_id || "";
    let tenantId = "";
    if (companyId) {
      const { data: hierarchyData } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id")
        .eq("child_org_id", companyId)
        .maybeSingle();
      tenantId = hierarchyData?.parent_org_id || "";
    }
    
    setOrganizationSelection({
      tenantId: tenantId,
      companyId: companyId,
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
    });
    
    setOpen(true);
  };

  // /suppliers?open=<id>&tab=…&prices=pending (link do sino): abre a ficha do
  // fornecedor no separador certo (supplierSheetTabFromParams): prices=pending
  // → Preços por aprovar; tab=catalogo → Artigos e preços; tab=portal → Portal;
  // tab=dados → Dados; também aceita resumo/artigos/precos; sem tab → Resumo.
  // Os parâmetros são limpos para fechar a ficha não a voltar a abrir.
  const deepLinkSupplierId = searchParams.get("open");
  const deepLinkTab = searchParams.get("tab");
  const deepLinkPrices = searchParams.get("prices");
  const deepLinkStamp = searchParams.get("_t");
  useEffect(() => {
    if (!deepLinkSupplierId || permissionsLoading) return;
    const key = `${deepLinkSupplierId}|${deepLinkTab ?? ""}|${deepLinkPrices ?? ""}|${deepLinkStamp ?? ""}`;
    if (handledDeepLinkRef.current === key) return;
    handledDeepLinkRef.current = key;
    void (async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", deepLinkSupplierId)
        .maybeSingle();
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        ["open", "tab", "prices", "_t"].forEach((k) => next.delete(k));
        return next;
      }, { replace: true });
      handledDeepLinkRef.current = null;
      if (error || !data) {
        toast({
          title: "Fornecedor não encontrado",
          description: error?.message || "O fornecedor do aviso não existe ou não está visível.",
          variant: "destructive",
        });
        return;
      }
      await handleEdit(data as Supplier);
      const wantsPrices = deepLinkPrices === "pending";
      setFormTab(supplierSheetTabFromParams(deepLinkTab, deepLinkPrices));
      setFocusPriceChanges(wantsPrices);
    })();
    // handleEdit/toast: lidos no momento do link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkSupplierId, deepLinkTab, deepLinkPrices, deepLinkStamp, permissionsLoading, setSearchParams]);

  const handleDelete = async () => {
    if (!supplierToDelete) return;

    try {
      const { error } = await supabase.rpc("rpc_delete_supplier", { p_id: supplierToDelete.id });

      if (error) throw error;

      toast({
        title: t("suppliers.toast.deleteSuccess"),
      });

      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t("suppliers.toast.deleteError"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (supplier: Supplier) => {
    try {
      const { error } = await supabase.rpc("rpc_restore_supplier", { p_id: supplier.id });

      if (error) throw error;

      toast({ title: t("suppliers.toast.restoreSuccess") || "Fornecedor restaurado" });

      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t("suppliers.toast.restoreError") || "Erro ao restaurar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = supplierSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((error) => {
        if (error.path[0]) errors[error.path[0].toString()] = error.message;
      });
      setFieldErrors(errors);
      const firstError = validation.error.errors[0];
      toast({ title: t("common.error") || "Erro", description: firstError.message, variant: "destructive" });
      return;
    }
    setFieldErrors({});

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
        return;
      }

      const supplierData: any = {
        name: formData.name,
        contact_person: formData.contact_person || null,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        city: formData.city || null,
        postal_code: formData.postal_code || null,
        country: formData.country || null,
        tax_id: formData.tax_id || null,
        delivery_sla_days:
          formData.delivery_sla_days === "" || formData.delivery_sla_days === null
            ? null
            : Number(formData.delivery_sla_days),
        website: formData.website || null,
        notes: formData.notes || null,
        is_active: formData.is_active,
        organization_id: organizationSelection.companyId || null,
      };

      if (editingId) {
        const { error } = await withAuditContext(supabase, businessUserId, () =>
          supabase
            .from("suppliers")
            .update(supplierData)
            .eq("id", editingId)
        );

        if (error) throw error;

        toast({
          title: t("suppliers.toast.updateSuccess"),
        });
      } else {
        const { error } = await withAuditContext(supabase, businessUserId, () =>
          supabase.from("suppliers").insert({
            ...supplierData,
            created_by: businessUserId,
          })
        );

        if (error) throw error;

        toast({
          title: t("suppliers.toast.createSuccess"),
        });
      }

      setOpen(false);
      setEditingId(null);
      resetForm();
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      // Gatilho do portal do fornecedor: com o portal ativo não se muda o NIF
      // nem a empresa. A mensagem da BD já vem em português.
      const portalLinkActive = error?.hint === "portal_link_active";
      const portalMessage = error?.message || "Este fornecedor tem acesso ao portal ativo: desligue o portal antes de mudar o NIF";
      if (portalLinkActive) {
        // A BD tem duas mensagens com o mesmo hint: mudança de empresa ou de NIF.
        const aboutCompany = /empresa/i.test(String(error?.message || ""));
        setFieldErrors((prev) => ({ ...prev, [aboutCompany ? "organization_id" : "tax_id"]: portalMessage }));
      }
      toast({
        title: editingId ? t("suppliers.toast.updateError") : t("suppliers.toast.createError"),
        description: portalLinkActive ? portalMessage : error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setEditingSupplier(null);
    setFormTab("dados");
    setFocusPriceChanges(false);
    setFormData({
      name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      postal_code: "",
      country: "",
      tax_id: "",
      delivery_sla_days: "",
      website: "",
      notes: "",
      is_active: true,
    });
    setFieldErrors({});
    setOrganizationSelection({
      tenantId: "",
      companyId: activeCompany?.id || "",
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
    });
  };

  // Multi-select handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === suppliers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suppliers.map(s => s.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0) return;

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
        return;
      }

      const { error } = await withAuditContext(supabase, businessUserId, () =>
        supabase
          .from("suppliers")
          .update({ is_active: bulkNewStatus })
          .in("id", Array.from(selectedIds))
      );

      if (error) throw error;

      toast({ 
        title: t('suppliers.toast.statusUpdated'),
        description: t('suppliers.toast.statusUpdatedDesc').replace("{count}", String(selectedIds.size))
      });
      setSelectedIds(new Set());
      setBulkStatusDialogOpen(false);
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t('suppliers.toast.statusUpdateError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      const { error } = await supabase.rpc("rpc_bulk_delete_supplier", {
        p_ids: Array.from(selectedIds),
      });

      if (error) throw error;

      toast({ 
        title: t('suppliers.toast.bulkDeleteSuccess'),
        description: t('suppliers.toast.bulkDeleteSuccessDesc').replace("{count}", String(selectedIds.size))
      });
      setSelectedIds(new Set());
      setBulkDeleteDialogOpen(false);
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t('suppliers.toast.bulkDeleteError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };


  const handleBulkCompanyUpdate = async () => {
    if (!bulkCompanyId || selectedIds.size === 0) return;
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
        return;
      }

      const { error } = await withAuditContext(supabase, businessUserId, () =>
        supabase
          .from("suppliers")
          .update({ organization_id: bulkCompanyId })
          .in("id", Array.from(selectedIds))
      );

      if (error) throw error;

      toast({
        title: t('suppliers.toast.companyUpdated') || "Empresa atualizada",
        description: (t('suppliers.toast.companyUpdatedDesc') || "{count} fornecedor(es) atualizado(s)").replace("{count}", String(selectedIds.size))
      });
      setSelectedIds(new Set());
      setBulkCompanyDialogOpen(false);
      setBulkCompanyId("");
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t('suppliers.toast.updateError') || "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    }
  };




  const handleExport = () => {
    downloadStandardXlsx({
      sheetName: "Fornecedores",
      columns: [
        { key: "name", header: t("suppliers.form.name"), width: 30 },
        { key: "contact", header: t("suppliers.form.contactPerson"), width: 26 },
        { key: "email", header: t("suppliers.form.email"), width: 30 },
        { key: "phone", header: t("suppliers.form.phone"), width: 18 },
        { key: "address", header: t("suppliers.form.address"), width: 36 },
        { key: "city", header: t("suppliers.form.city"), width: 20 },
        { key: "postalCode", header: t("suppliers.form.postalCode"), width: 16 },
        { key: "country", header: t("suppliers.form.country"), width: 16 },
        { key: "taxId", header: t("suppliers.form.taxId"), width: 16 },
        { key: "website", header: t("suppliers.form.website"), width: 28 },
        { key: "notes", header: t("suppliers.form.notes"), width: 36 },
        { key: "active", header: t("suppliers.form.active"), type: "boolean", width: 10 },
      ],
      rows: suppliers.map((supplier) => ({
        name: supplier.name,
        contact: (supplier as any).contact_person,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        city: supplier.city,
        postalCode: supplier.postal_code,
        country: supplier.country,
        taxId: (supplier as any).tax_id,
        website: supplier.website,
        notes: supplier.notes,
        active: supplier.is_active,
      })),
    }, `fornecedores_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    toast({
      title: t("suppliers.export.success"),
      description: t("suppliers.export.successDesc"),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error(t("suppliers.toast.emptyFile"));
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      if (!activeCompany?.id) throw new Error("No active company selected");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        throw new Error("Perfil de utilizador não encontrado.");
      }

      const dataLines = lines.slice(1);
      const suppliersToInsert = [];
      const rowErrors: string[] = [];

      dataLines.forEach((line, index) => {
        const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

        if (values.length < 1 || !values[0]) return;

        const lineNumber = index + 2; // +2 for header row and 0-index

        // Build the candidate row in the SAME shape as the manual form's formData
        // (empty-string fallbacks, not null) so it can be validated through the
        // exact same Zod schema the manual form already enforces.
        const candidate = {
          name: values[0],
          contact_person: values[1] || "",
          email: values[2] || "",
          phone: values[3] || "",
          address: values[4] || "",
          city: values[5] || "",
          postal_code: values[6] || "",
          country: values[7] || "",
          tax_id: values[8] || "",
          website: values[9] || "",
          notes: values[10] || "",
          is_active: values[11]?.toLowerCase() === 'yes' || values[11]?.toLowerCase() === 'sim' || values[11]?.toLowerCase() === 'sí' || values[11]?.toLowerCase() === 'oui' || values[11]?.toLowerCase() === 'ja',
        };

        const validation = supplierSchema.safeParse(candidate);
        if (!validation.success) {
          const firstError = validation.error.errors[0];
          rowErrors.push(`Linha ${lineNumber} (${candidate.name || 's/nome'}): ${firstError.message}`);
          return;
        }

        const validated = validation.data;
        suppliersToInsert.push({
          name: validated.name,
          contact_person: validated.contact_person || null,
          email: validated.email || null,
          phone: validated.phone || null,
          address: validated.address || null,
          city: validated.city || null,
          postal_code: validated.postal_code || null,
          country: validated.country || null,
          tax_id: validated.tax_id || null,
          website: validated.website || null,
          notes: validated.notes || null,
          is_active: validated.is_active,
          created_by: businessUserId,
          organization_id: activeCompany?.id,
        });
      });

      if (suppliersToInsert.length === 0) {
        throw new Error(
          rowErrors.length > 0
            ? `${t("suppliers.toast.noValidSuppliers")} ${rowErrors.slice(0, 5).join(" | ")}`
            : t("suppliers.toast.noValidSuppliers")
        );
      }

      // Set audit context once for all writes in this import.
      // source='csv_import' must be set manually — withAuditContext hardcodes 'web_app'.
      const { error: setCtxError } = await supabase.rpc('set_audit_context', {
        p_user_id: businessUserId,
        p_source: 'csv_import',
      });
      if (setCtxError) throw setCtxError;

      try {
        const { error } = await supabase.from("suppliers").insert(suppliersToInsert);

        if (error) throw error;

        const skippedSuffix = rowErrors.length > 0
          ? ` ${rowErrors.length} linha(s) inválida(s) foram ignoradas: ${rowErrors.slice(0, 5).join(" | ")}${rowErrors.length > 5 ? ` (+${rowErrors.length - 5} mais)` : ""}`
          : "";

        toast({
          title: t("suppliers.toast.importSuccess"),
          description: `${t("suppliers.toast.importSuccessDesc").replace("{count}", String(suppliersToInsert.length))}${skippedSuffix}`,
          variant: rowErrors.length > 0 ? "default" : undefined,
        });

        setImportDialogOpen(false);
        setSuppliers([]);
        setHasMore(true);
        loadSuppliers(0, true);
      } finally {
        // Clear audit context — swallow errors so they never mask the original failure.
        try { await supabase.rpc('clear_audit_context'); } catch { /* intentional */ }
      }
    } catch (error: any) {
      captureFlowError(error, "record-export-import");
      toast({
        title: t("suppliers.toast.importError"),
        description: error.message,
        variant: "destructive",
      });
    }

    e.target.value = '';
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setCompanyFilter("all");
    setAwaitingOnly(false);
    setCatalogOnly(false);
    setPricesOnly(false);
    dropUrlFilter();
  };

  const hasActiveFilters =
    searchQuery || statusFilter !== "all" || (companyFilter && companyFilter !== "all") || awaitingOnly || catalogOnly || pricesOnly;

  // Estatísticas das linhas carregadas (só as da organização das estatísticas).
  const rowStatsQuery = useSupplierRowStats(
    statsOrgId,
    suppliers.filter((s) => s.organization_id === statsOrgId).map((s) => s.id),
  );
  const rowStats = rowStatsQuery.data ?? null;
  const canEditSupplier = hasPermission("suppliers.edit");

  /** Abre a ficha pelo mesmo caminho do link do sino (?open=&tab=&prices=). */
  const openSupplierVia = (supplierId: string, extra: { tab?: "portal"; prices?: "pending" } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("open", supplierId);
      if (extra.tab) next.set("tab", extra.tab);
      else next.delete("tab");
      if (extra.prices) next.set("prices", extra.prices);
      else next.delete("prices");
      next.set("_t", String(Date.now()));
      return next;
    }, { replace: true });
  };

  const rowMenu = (supplier: Supplier): RowActionEntry[] => [
    { label: "Abrir ficha", icon: Eye, onSelect: () => void handleEdit(supplier), permission: "suppliers.edit" },
    {
      label: "Ver encomendas",
      icon: ShoppingCart,
      onSelect: () => navigate(purchaseOrdersLink({ supplier: supplier.id })),
      permission: "purchase_orders.view",
    },
    {
      label: "Portal do fornecedor",
      icon: Users,
      onSelect: () => openSupplierVia(supplier.id, { tab: "portal" }),
      permission: "suppliers.edit",
    },
    {
      label: "Catálogo",
      icon: Truck,
      onSelect: () => {
        setCatalogSupplier(supplier);
        setCatalogDialogOpen(true);
      },
      permission: "suppliers.edit",
    },
    {
      label: t("suppliers.actions.slaReport"),
      icon: BarChart3,
      onSelect: () => {
        setSlaReportSupplier(supplier);
        setSlaReportDialogOpen(true);
      },
      permission: ["suppliers.view", "suppliers.view_sla_report"],
      requireAllPermissions: true,
    },
    {
      label: t("suppliers.form.website"),
      icon: Globe,
      onSelect: () => window.open(supplier.website ?? "", "_blank"),
      hidden: !supplier.website,
    },
    "separator",
    {
      label: t("common.delete"),
      icon: Trash2,
      destructive: true,
      onSelect: () => {
        setSupplierToDelete(supplier);
        setDeleteDialogOpen(true);
      },
      permission: "suppliers.delete",
    },
  ];

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany?.id && userType !== 'system_admin') {
    return (
      <>
        <div className="text-center py-12">
          <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {t("suppliers.selectCompany")}
          </p>
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6 p-6">
          <div><h1 className="text-3xl font-bold">{t("suppliers.title")}</h1><p className="text-muted-foreground">{t("suppliers.description")}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  const awaitingList = !showDeleted ? orgStats?.awaiting ?? [] : [];
  // Portal ligado no fornecedor em edição: a BD recusa mudar NIF/empresa (aviso em Dados).
  const editingPortalState =
    editingSupplier && editingSupplier.organization_id === statsOrgId && orgStats
      ? orgStats.portal.get(editingSupplier.id) ?? "none"
      : "none";
  const editingPortalLinked =
    !!editingId && (editingPortalState === "active" || editingPortalState === "awaiting" || editingPortalState === "suspended");
  const priceGateReason = "Sem permissão: requer suppliers.view_pricing ou products.view_cost. Peça acesso a um administrador.";

  return (
    <>
      <div className="space-y-4">
        <InventoryPageHeader
          area="purchases"
          title={PAGE_TITLE}
          description={PAGE_DESCRIPTION}
          actions={
            <>
              <PageFAQSheet pageKey="operations.suppliers" />
              <PermissionGate permission="suppliers.export">
                <Button variant="outline" onClick={handleExport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Exportar
                </Button>
              </PermissionGate>
              <PermissionGate permission="suppliers.import">
                <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Importar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("suppliers.import.title")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {t("suppliers.import.description")}
                      </p>
                      <Input
                        type="file"
                        accept=".csv"
                        onChange={handleImport}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              </PermissionGate>
              <PermissionGate permission="suppliers.create">
                <Button
                  onClick={() => {
                    setEditingId(null);
                    resetForm();
                    setOpen(true);
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Novo fornecedor
                </Button>
              </PermissionGate>
            </>
          }
        />

        {/* Aviso: convidados que ainda não preencheram a ficha no portal */}
        {awaitingList.length > 0 && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/10 px-3.5 py-3 text-sm text-sky-900 dark:text-info"
          >
            <Clock className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <div>
              <b>{awaitingList.length} fornecedor(es) à espera de preencher a ficha no portal:</b>{" "}
              {awaitingList.map((s, i) => (
                <span key={s.id}>
                  {i ? ", " : ""}
                  {canEditSupplier ? (
                    <button
                      type="button"
                      className="rounded-sm font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openSupplierVia(s.id, { tab: "portal" })}
                    >
                      {s.name}
                    </button>
                  ) : (
                    s.name
                  )}
                </span>
              ))}
              .{" "}
              <button
                type="button"
                className="rounded-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  dropUrlFilter();
                  setSelectedIds(new Set());
                  setAwaitingOnly(true);
                }}
              >
                Filtrar
              </button>
            </div>
          </div>
        )}

        {/* Filtros */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  aria-label="Pesquisar fornecedores"
                  title="Nome, código, NIF, cidade, contacto"
                  placeholder="Nome, código, NIF, cidade, contacto"
                  value={searchQuery}
                  onChange={(e) => {
                    dropUrlFilter();
                    setSearchQuery(e.target.value);
                  }}
                  className="pl-10"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  dropUrlFilter();
                  setStatusFilter(v);
                }}
              >
                <SelectTrigger className="w-full md:w-[170px]" aria-label="Estado">
                  <SelectValue placeholder="Todos os estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={companyFilter || "all"}
                onValueChange={(value) => {
                  dropUrlFilter();
                  setSelectedIds(new Set());
                  setCompanyFilter(value);
                }}
              >
                <SelectTrigger className="w-full md:w-[200px]" aria-label="Empresa">
                  <SelectValue placeholder="Todas as empresas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {filterOrganizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="inline-flex min-h-6 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={awaitingOnly}
                  onCheckedChange={(v) => {
                    dropUrlFilter();
                    setSelectedIds(new Set());
                    setAwaitingOnly(v === true);
                  }}
                />
                À espera do fornecedor
                <span className="rounded-md bg-accent/10 px-1.5 text-[10.5px] font-bold text-accent">Novo</span>
              </label>
              <label className="inline-flex min-h-6 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={catalogOnly}
                  onCheckedChange={(v) => {
                    dropUrlFilter();
                    setSelectedIds(new Set());
                    setCatalogOnly(v === true);
                  }}
                />
                Com catálogo por ligar
              </label>
              <label
                className={`inline-flex min-h-6 items-center gap-2 text-sm ${canPricing ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                title={canPricing ? undefined : priceGateReason}
              >
                <Checkbox
                  checked={pricesOnly}
                  disabled={!canPricing}
                  onCheckedChange={(v) => {
                    dropUrlFilter();
                    setSelectedIds(new Set());
                    setPricesOnly(v === true);
                  }}
                />
                Com preços por aprovar
              </label>
              <label className="inline-flex min-h-6 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={showDeleted}
                  onCheckedChange={(v) => {
                    setSelectedIds(new Set());
                    setShowDeleted(v === true);
                  }}
                />
                Ver eliminados
              </label>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                  <X className="h-4 w-4" />
                  {t("common.clearFilters")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardContent className="p-4">
            {/* Ações em massa — não aparecem na lista de eliminados */}
            {!showDeleted && (
              <BulkActionsBar
                selectedCount={selectedIds.size}
                onStatusClick={() => setBulkStatusDialogOpen(true)}
                onDeleteClick={() => setBulkDeleteDialogOpen(true)}
                onOrgClick={() => setBulkCompanyDialogOpen(true)}
                onClearSelection={() => setSelectedIds(new Set())}
                showOrgAction={true}
                statusPermission="suppliers.edit"
                deletePermission="suppliers.delete"
              />
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <OlyviaLoader size={32} />
              </div>
            ) : suppliers.length === 0 ? (
              <InventoryEmptyState title="Sem fornecedores" description="Ajuste os filtros.">
                {hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                ) : null}
              </InventoryEmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1000px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label="Selecionar todos"
                          checked={selectedIds.size === suppliers.length && suppliers.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead className="text-right">POs abertas</TableHead>
                      <TableHead className="text-right">SLA %</TableHead>
                      <TableHead>Portal</TableHead>
                      <TableHead>Preços por aprovar</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((supplier) => {
                      const inStatsOrg = supplier.organization_id === statsOrgId;
                      const portalState = inStatsOrg && orgStats ? orgStats.portal.get(supplier.id) ?? "none" : null;
                      const openPos = inStatsOrg && rowStats?.openPos ? rowStats.openPos.get(supplier.id) ?? 0 : null;
                      const slaPct = inStatsOrg && rowStats?.slaPct ? rowStats.slaPct.get(supplier.id) : null;
                      const prices = inStatsOrg && orgStats?.pricesPending ? orgStats.pricesPending.get(supplier.id) ?? 0 : null;
                      const isDeleted = !!supplier.deleted_at;
                      const rowOpens = !isDeleted && canEditSupplier;
                      const hasContact = !!(supplier.contact_person || supplier.email || supplier.phone);
                      const companyName = (supplier as Supplier & { anew_organizations?: { name?: string } | null }).anew_organizations?.name;
                      return (
                        <TableRow
                          key={supplier.id}
                          className={`${selectedIds.has(supplier.id) ? "bg-muted/50" : ""} ${rowOpens ? "cursor-pointer" : ""} ${isDeleted ? "opacity-70" : ""}`}
                          onClick={rowOpens ? () => void handleEdit(supplier) : undefined}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              aria-label={`Selecionar ${supplier.name}`}
                              checked={selectedIds.has(supplier.id)}
                              onCheckedChange={() => toggleSelectOne(supplier.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <b className="font-semibold">{supplier.name}</b>
                            {isDeleted ? (
                              <>
                                {" "}
                                <InventoryStatusBadge>Eliminado</InventoryStatusBadge>
                              </>
                            ) : null}
                            <br />
                            <small className="text-xs text-muted-foreground">{companyName || "—"}</small>
                          </TableCell>
                          <TableCell className="font-mono text-[13px]">
                            {supplier.code || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {hasContact ? (
                              <div className="flex flex-col leading-tight">
                                <span>{supplier.contact_person || "—"}</span>
                                {supplier.email ? <small className="text-xs text-muted-foreground">{supplier.email}</small> : null}
                                {supplier.phone ? <small className="text-xs text-muted-foreground">{supplier.phone}</small> : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{supplier.city || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right">
                            <SupplierOpenPos supplierId={supplier.id} count={openPos} />
                          </TableCell>
                          <TableCell className="text-right">
                            <SupplierSla pct={slaPct} slaDays={supplier.delivery_sla_days} />
                          </TableCell>
                          <TableCell>
                            <SupplierPortalBadge state={portalState} />
                          </TableCell>
                          <TableCell>
                            {canEditSupplier ? (
                              <SupplierPricesPending
                                count={prices}
                                onOpen={() => openSupplierVia(supplier.id, { tab: "portal", prices: "pending" })}
                              />
                            ) : prices ? (
                              <InventoryStatusBadge tone="warn">{prices} por aprovar</InventoryStatusBadge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <InventoryStatusBadge tone={supplier.is_active ? "ok" : "neutral"}>
                              {supplier.is_active ? "Ativo" : "Inativo"}
                            </InventoryStatusBadge>
                          </TableCell>
                          <TableCell className="text-right">
                            {isDeleted ? (
                              <RowActions
                                primary={{
                                  label: t("suppliers.restore") || "Restaurar",
                                  icon: Undo2,
                                  onClick: () => void handleRestore(supplier),
                                  permission: "suppliers.delete",
                                }}
                              />
                            ) : (
                              <RowActions
                                primary={{
                                  label: "Abrir",
                                  onClick: () => void handleEdit(supplier),
                                  permission: "suppliers.edit",
                                }}
                                items={rowMenu(supplier)}
                                menuLabel={`Mais ações para ${supplier.name}`}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Infinite Scroll Sentinel */}
            {suppliers.length > 0 && (
              <div ref={loadMoreRef} className="flex justify-center py-4">
                {loadingMore && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <OlyviaLoader size={20} inline />
                    <span className="text-sm">{t('common.loadingMore')}</span>
                  </div>
                )}
              </div>
            )}
            {!loading && (
              <div className="flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
                <span>
                  {t('suppliers.showingCount').replace("{current}", String(suppliers.length)).replace("{total}", String(totalCount))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ficha do fornecedor: folha lateral (FornecedorFolha do protótipo) */}
        <SupplierSheet
          open={open}
          onClose={() => {
            setOpen(false);
            setEditingId(null);
            resetForm();
          }}
          supplier={editingId ? editingSupplier : null}
          tab={formTab}
          onTabChange={setFormTab}
          formId={SUPPLIER_FORM_ID}
          cancelLabel={t("suppliers.form.cancel")}
          submitLabel={editingId ? t("suppliers.form.update") : t("suppliers.form.create")}
          focusPriceChanges={focusPriceChanges}
          canManagePortal={canManagePortal}
          fallbackOrganizationId={activeCompany?.id ?? null}
          dataForm={
            <SupplierDataForm
              formId={SUPPLIER_FORM_ID}
              formData={formData}
              setFormData={setFormData}
              fieldErrors={fieldErrors}
              organizationSelection={organizationSelection}
              onOrganizationChange={setOrganizationSelection}
              onSubmit={handleSubmit}
              t={t}
              portalLinked={editingPortalLinked}
              onGoToPortal={editingId ? () => setFormTab("portal") : undefined}
            />
          }
        />

        {catalogSupplier && (
          <SupplierCatalogDialog
            open={catalogDialogOpen}
            onOpenChange={(open) => {
              setCatalogDialogOpen(open);
              if (!open) setCatalogSupplier(null);
            }}
            supplierId={catalogSupplier.id}
            supplierName={catalogSupplier.name}
          />
        )}

        {slaReportSupplier && (
          <SupplierSlaReportDialog
            open={slaReportDialogOpen}
            onOpenChange={(open) => {
              setSlaReportDialogOpen(open);
              if (!open) setSlaReportSupplier(null);
            }}
            supplierId={slaReportSupplier.id}
            supplierName={slaReportSupplier.name}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('suppliers.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('suppliers.delete.description').replace("{name}", supplierToDelete?.name || "")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Status Change Dialog */}
        <AlertDialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('suppliers.bulkStatus.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('suppliers.bulkStatus.description').replace("{count}", String(selectedIds.size))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Select value={bulkNewStatus ? "active" : "inactive"} onValueChange={(value) => setBulkNewStatus(value === "active")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('suppliers.status.active')}</SelectItem>
                  <SelectItem value="inactive">{t('suppliers.status.inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkStatusChange}>
                {t('common.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Dialog */}
        <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('suppliers.bulkDelete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('suppliers.bulkDelete.description').replace("{count}", String(selectedIds.size))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Company Dialog */}
        <Dialog open={bulkCompanyDialogOpen} onOpenChange={(open) => {
          setBulkCompanyDialogOpen(open);
          if (!open) {
            setBulkCompanyId("");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('common.changeOrg') || 'Alterar Empresa'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {(t('suppliers.bulkCompany.description') || 'Alterar empresa de {count} fornecedor(es)').replace("{count}", String(selectedIds.size))}
              </p>
              <div className="space-y-2">
                <Label>{t('common.company')}</Label>
                <Select value={bulkCompanyId} onValueChange={setBulkCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.selectCompany') || 'Selecione uma empresa'} />
                  </SelectTrigger>
                  <SelectContent>
                    {filterOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkCompanyDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleBulkCompanyUpdate} disabled={!bulkCompanyId}>
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </>
  );
};

export default Suppliers;
