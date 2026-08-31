import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ShoppingCart, Pencil, Trash2, Download, Upload, Tag, X, FileDown, PackageCheck } from "lucide-react";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { PermissionGate } from "@/components/PermissionGate";
import LineAttributesDialog from "@/components/LineAttributesDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Database } from "@/integrations/supabase/types";
import { exportPurchaseOrdersToCSV, parsePurchaseOrdersCSV } from "@/utils/purchaseOrdersExportImport";
import { useTranslation } from "@/hooks/useTranslation";
import { OrganizationFormSection, OrganizationSelection } from "@/components/OrganizationFormSection";
import { pdf } from '@react-pdf/renderer';
import { PurchaseOrderPDFDocument } from "@/components/PurchaseOrderPDFDocument";
import { purchaseOrderSchema } from "@/lib/validations";

type PurchaseOrder = Database["public"]["Tables"]["purchase_orders"]["Row"] & {
  suppliers: { name: string } | null;
};

type PurchaseOrderItem = {
  id?: string;
  item_type: 'product' | 'service';
  product_id?: string;
  service_id?: string;
  description: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  total_price: number;
  selected_attributes?: Record<string, any>;
  notes?: string;
};

// Receção parcial (migration 20261114040000): tipo de conveniência para as
// linhas de purchase_order_items usadas no fluxo de receção.
// `products` (join) é usado para mostrar o nome REAL/atual do produto no
// diálogo — a `description` da linha é um snapshot da altura da encomenda e
// não distingue variantes cujo nome só difere na medida (ex.: "Base Duche
// Stone Plus" 70x70 vs 70x90 guardam a mesma description genérica).
type PurchaseOrderItemWithReceipt = Database["public"]["Tables"]["purchase_order_items"]["Row"] & {
  products?: { name: string } | null;
};

type ProductCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_name: string | null;
  brand_name: string | null;
  purchase_price: number | null;
  vat_rate: number | null;
};

type PriceInfo = {
  price: number | null;
  vat_rate: number | null;
};

type ProductAttribute = {
  id: string;
  name: string;
  code: string;
  value_type: string;
  unit: string | null;
  allowed_values: string[] | null;
  values: Array<{ id: string; value: string }>;
};

// PostgREST caps an unranged response at 1000 rows (Content-Range: 0-999/*,
// confirmed live via Network tab) — a plain .select() silently truncates for
// catalogs bigger than that (2000+ products for orgs like Mudelar), returning
// only whichever ~1000 happen to come first in undefined order. This paginates
// past that cap instead of ever relying on a single unranged request.
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

const PurchaseOrders = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [services, setServices] = useState<ProductCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeleted, setShowDeleted] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const loadRequestRef = useRef(0);
  // Receção (Fase 4C): dedicado, fora do dropdown de estado genérico — pede o
  // armazém de destino e liga-se a rpc_receive_purchase_order (gera a entrada
  // em stock_movements na mesma transação que muda o estado para 'received').
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<{ id: string; order_number: string } | null>(null);
  const [receiveWarehouses, setReceiveWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");
  // Receção parcial (20261114040000): linhas de produto desta encomenda e a
  // quantidade a receber agora por linha, editável — por omissão pré-preenchida
  // com o saldo por receber de cada linha (equivalente ao antigo "tudo de uma
  // vez", mas agora ajustável antes de confirmar).
  const [receiveLines, setReceiveLines] = useState<PurchaseOrderItemWithReceipt[]>([]);
  const [receiveLineQuantities, setReceiveLineQuantities] = useState<Record<string, number>>({});
  const [receiving, setReceiving] = useState(false);
  // Fase 5.0F: link inverso — quando a encomenda foi gerada automaticamente a
  // partir de um Contrato assinado (source_type='contract'), mostra a origem
  // no diálogo de detalhe, com link de volta para "Encomendas Clientes".
  const [orderSourceInfo, setOrderSourceInfo] = useState<{ contractId: string; contractNumber: string; clientName: string } | null>(null);
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  const [formData, setFormData] = useState({
    supplier_id: "",
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery: "",
    status: "pending",
    notes: "",
  });

  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);
  const [showItemsDialog, setShowItemsDialog] = useState(false);
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<string[]>([]);
  const [selectedItemType, setSelectedItemType] = useState<'product' | 'service'>('product');
  const [productAttributes, setProductAttributes] = useState<Map<string, ProductAttribute[]>>(new Map());
  // product_id/service_id -> { purchase_price, supplier_sku } for the SELECTED supplier,
  // resolved from item_suppliers (Fase 1). Determines which catalog items are eligible
  // to add to this order and at what price — replaces the deprecated
  // products.supplier_id/services.supplier_id single-supplier match.
  const [supplierProductRefs, setSupplierProductRefs] = useState<Map<string, { purchase_price: number | null; supplier_sku: string | null }>>(new Map());
  const [supplierServiceRefs, setSupplierServiceRefs] = useState<Map<string, { purchase_price: number | null; supplier_sku: string | null }>>(new Map());
  const [selectedItemAttributes, setSelectedItemAttributes] = useState<Record<string, Record<string, string>>>({});
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductName, setEditingProductName] = useState<string>("");

  const [organizationSelection, setOrganizationSelection] = useState<OrganizationSelection>({
    tenantId: "",
    companyId: activeCompany?.id || "",
    businessUnitId: "",
    departmentId: "",
    secondaryCompanyIds: [],
  });

  // Update organization selection when activeCompany changes
  useEffect(() => {
    if (activeCompany?.id) {
      setOrganizationSelection(prev => ({
        ...prev,
        companyId: activeCompany.id,
      }));
    }
  }, [activeCompany?.id]);

  // Load suppliers when company selection changes in the form
  useEffect(() => {
    const loadFormSuppliers = async () => {
      const companyId = organizationSelection.companyId;
      console.log("Loading suppliers for company:", companyId);
      
      if (!companyId) {
        console.log("No company selected, clearing suppliers");
        setSuppliers([]);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from("suppliers")
          .select("id, name")
          .eq("organization_id", companyId);
        
        if (error) throw error;
        console.log("Loaded suppliers:", data);
        setSuppliers(data || []);
        
        // Reset supplier selection if it's not in the new list
        if (formData.supplier_id && !data?.find(s => s.id === formData.supplier_id)) {
          setFormData(prev => ({ ...prev, supplier_id: "" }));
        }
      } catch (error: any) {
        console.error("Error loading suppliers:", error);
      }
    };

    loadFormSuppliers();
  }, [organizationSelection.companyId]);

  // Resolve which products/services the SELECTED supplier can actually supply, via
  // item_suppliers (Fase 1 do plano de fornecedores) — substitui o antigo
  // products.supplier_id/services.supplier_id (deprecated, só guarda 1 fornecedor
  // por artigo). products/services em si continuam a vir de loadData(), que já
  // carrega o catálogo completo da organização; este efeito só resolve, para o
  // fornecedor escolhido no cabeçalho da encomenda, QUAIS desses artigos ele
  // fornece e a que preço/referência — não volta a fazer fetch de products/services.
  useEffect(() => {
    const loadSupplierItemRefs = async () => {
      const companyId = organizationSelection.companyId;
      const supplierId = formData.supplier_id;

      if (!companyId || !supplierId) {
        setSupplierProductRefs(new Map());
        setSupplierServiceRefs(new Map());
        return;
      }

      try {
        const { data, error } = await (supabase as any)
          .from("item_suppliers")
          .select("product_id, service_id, purchase_price, supplier_sku")
          .eq("organization_id", companyId)
          .eq("supplier_id", supplierId)
          .eq("is_active", true)
          .is("deleted_at", null);

        if (error) throw error;

        const productMap = new Map<string, { purchase_price: number | null; supplier_sku: string | null }>();
        const serviceMap = new Map<string, { purchase_price: number | null; supplier_sku: string | null }>();

        (data || []).forEach((row: any) => {
          const info = { purchase_price: row.purchase_price ?? null, supplier_sku: row.supplier_sku ?? null };
          if (row.product_id) productMap.set(row.product_id, info);
          if (row.service_id) serviceMap.set(row.service_id, info);
        });

        setSupplierProductRefs(productMap);
        setSupplierServiceRefs(serviceMap);
      } catch (error: any) {
        console.error("Error loading supplier item references:", error);
        setSupplierProductRefs(new Map());
        setSupplierServiceRefs(new Map());
      }
    };

    loadSupplierItemRefs();
  }, [organizationSelection.companyId, formData.supplier_id]);

  useEffect(() => {
    if (activeCompany?.id) {
      setLoading(true);
      loadData();
    }
  }, [activeCompany?.id, showDeleted]);

  // Catálogo (produtos/serviços/preços/atributos) só é preciso para escolher
  // itens ao criar/editar uma encomenda — carregado sob demanda quando o
  // diálogo abre, não no carregamento inicial da lista. Reseta quando a
  // empresa ativa muda para forçar recarga do catálogo certo.
  useEffect(() => {
    setCatalogLoaded(false);
  }, [activeCompany?.id]);

  useEffect(() => {
    if (open && !catalogLoaded && activeCompany?.id) {
      loadCatalog();
    }
  }, [open, catalogLoaded, activeCompany?.id]);

  // Fase 5.0F: abre o dialog de edição/detalhe de uma encomenda específica quando
  // se navega para cá a partir de outro ecrã (ex. "Encomendas Clientes", link por
  // linha em ClientOrders.tsx) com ?open=<purchase_order_id> — mesmo padrão de
  // cross-link já usado em ClientContracts.tsx.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    if (loading) return;

    const target = orders.find((o) => o.id === openId);
    if (target) {
      handleEdit(target);
    } else {
      toast({
        title: t('purchaseOrders.toast.loadError'),
        description: 'Encomenda não encontrada.',
        variant: "destructive",
      });
    }

    searchParams.delete("open");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, orders, loading]);

  const loadData = async () => {
    if (!activeCompany?.id) {
      console.log("loadData: No activeCompany");
      return;
    }

    const requestId = ++loadRequestRef.current;

    try {
      const companyId = activeCompany.id;
      console.log("loadData: Loading purchase orders for company:", companyId, activeCompany.name);

      const [ordersRes, suppliersRes] = await Promise.all([
        fetchAllRows(() =>
          showDeleted
            ? supabase
                .from("purchase_orders")
                .select("*, suppliers(name)")
                .eq("organization_id", companyId)
                .not("deleted_at", "is", null)
                .order("created_at", { ascending: false })
            : supabase
                .from("purchase_orders")
                .select("*, suppliers(name)")
                .eq("organization_id", companyId)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
        ),
        supabase.from("suppliers").select("id, name").eq("organization_id", companyId).is("deleted_at", null),
      ]);

      // Um loadData() mais recente (ex.: alternou "Ver eliminados" outra vez antes
      // deste pedido terminar) já está em curso — descarta esta resposta desatualizada
      // em vez de sobrepor dados mais recentes com dados antigos.
      if (loadRequestRef.current !== requestId) return;

      console.log("loadData: Orders response:", ordersRes.data, ordersRes.error);

      if (ordersRes.error) throw ordersRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      setOrders((ordersRes.data as PurchaseOrder[]) || []);
      setSuppliers(suppliersRes.data || []);
    } catch (error: any) {
      if (loadRequestRef.current !== requestId) return;
      toast({
        title: t('purchaseOrders.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  };

  // Catálogo completo (produtos + serviços + preços de compra + atributos), usado
  // apenas no formulário de criar/editar encomenda para escolher itens. Carregado
  // uma vez sob demanda (ver useEffect de `open`/`catalogLoaded` acima) em vez de em
  // todo o carregamento da lista de encomendas — isto evitava dezenas de pedidos de
  // rede (e falhas "Failed to fetch" ocasionais) só para mostrar a tabela.
  const loadCatalog = async () => {
    if (!activeCompany?.id) return;

    setCatalogLoading(true);
    try {
      const companyId = activeCompany.id;

      const productColumns = `
            id,
            sku,
            name,
            description,
            product_categories!category_id(name),
            brands(name)
          `;

      const fetchAllProductRows = (applyFilters: (q: any) => any) =>
        fetchAllRows(() => applyFilters(supabase.from("products").select(productColumns)));

      const [companyProductsRes, directProductsRes, servicesRes] = await Promise.all([
        fetchAllRows(() =>
          supabase.from("product_organizations").select("product_id").eq("organization_id", companyId)
        ),
        // Direct match: products owned by this org — the bulk of the catalog, paginated
        // past the 1000-row cap above.
        fetchAllProductRows((q) =>
          q
            .eq("organization_id", companyId)
            .eq("is_active", true)
            .eq("is_purchasable", true)
            .is("deleted_at", null)
        ),
        supabase
          .from("services")
          .select(`
            id,
            sku,
            name,
            short_desc,
            service_categories:service_category_id(name)
          `)
          .eq("is_active", true)
          .eq("organization_id", companyId),
      ]);

      if (companyProductsRes.error) throw companyProductsRes.error;
      if (directProductsRes.error) throw directProductsRes.error;
      if (servicesRes.error) throw servicesRes.error;

      // Shared products: linked via product_organizations to this org but owned
      // (products.organization_id) by a DIFFERENT org — not covered by the direct query
      // above. This set is expected to be small (cross-org sharing is the exception, not
      // the rule), so a .in() over just these leftover ids stays well within URL limits.
      const directProductsData = directProductsRes.data || [];
      const directProductIds = new Set(directProductsData.map((p: any) => p.id));
      const junctionOnlyIds = (companyProductsRes.data || [])
        .map((p: any) => p.product_id)
        .filter((id: string) => id && !directProductIds.has(id));

      let sharedProductsData: any[] = [];
      if (junctionOnlyIds.length > 0) {
        const sharedRes = await fetchAllProductRows((q) =>
          q
            .eq("is_active", true)
            .eq("is_purchasable", true)
            .is("deleted_at", null)
            .in("id", junctionOnlyIds)
        );
        if (sharedRes.error) throw sharedRes.error;
        sharedProductsData = sharedRes.data || [];
      }

      const productsData: any[] = [...directProductsData, ...sharedProductsData];

      // Fetch product prices — batched (same BATCH=200 pattern as AddItemsDialog.tsx):
      // a single .in("product_id", productIds) with thousands of ids builds a query
      // string that fails outright with net::ERR_FAILED for large catalogs.
      const productIds = productsData?.map((p: any) => p.id) || [];
      const PRICE_BATCH = 200;
      const productPrices: any[] = [];
      for (let i = 0; i < productIds.length; i += PRICE_BATCH) {
        const batch = productIds.slice(i, i + PRICE_BATCH);
        if (batch.length === 0) continue;
        const { data: batchPrices, error: batchError } = await supabase
          .from("product_prices")
          .select("product_id, price, vat_rate")
          .eq("price_type", "purchase")
          .in("product_id", batch);
        if (batchError) throw batchError;
        productPrices.push(...(batchPrices || []));
      }

      const productPriceEntries: Array<[string, PriceInfo]> = (productPrices || [])
        .filter((p: any) => typeof p.product_id === "string")
        .map((p: any) => [p.product_id, { price: p.price ?? null, vat_rate: p.vat_rate ?? null }]);

      const productPricesMap = new Map<string, PriceInfo>(productPriceEntries);

      const mappedProducts: ProductCatalogItem[] = (productsData || []).map((product: any) => {
        const priceInfo = productPricesMap.get(product.id);
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          sku: product.sku,
          category_name: product.product_categories?.name || null,
          brand_name: product.brands?.name || null,
          purchase_price: priceInfo?.price || null,
          vat_rate: priceInfo?.vat_rate || 23,
        };
      });

      setProducts(mappedProducts);

      // Fetch product attributes — restrito aos produtos deste catálogo (em vez de
      // todos os produtos ativos de todas as organizações, como acontecia antes).
      await fetchProductAttributes(productIds);

      // Fetch service prices — same batching as product_prices above, for consistency
      // (services catalogs are usually much smaller, but no reason to risk it).
      const serviceIds = servicesRes.data?.map((s: any) => s.id) || [];
      const servicePrices: any[] = [];
      for (let i = 0; i < serviceIds.length; i += PRICE_BATCH) {
        const batch = serviceIds.slice(i, i + PRICE_BATCH);
        if (batch.length === 0) continue;
        const { data: batchPrices, error: batchError } = await supabase
          .from("service_prices")
          .select("service_id, price, vat_rate")
          .eq("price_type", "purchase")
          .in("service_id", batch);
        if (batchError) throw batchError;
        servicePrices.push(...(batchPrices || []));
      }

      const servicePriceEntries: Array<[string, PriceInfo]> = (servicePrices || [])
        .filter((p: any) => typeof p.service_id === "string")
        .map((p: any) => [p.service_id, { price: p.price ?? null, vat_rate: p.vat_rate ?? null }]);

      const servicePricesMap = new Map<string, PriceInfo>(servicePriceEntries);

      const mappedServices: ProductCatalogItem[] = (servicesRes.data || []).map((service: any) => {
        const priceInfo = servicePricesMap.get(service.id);
        return {
          id: service.id,
          name: service.name,
          description: service.short_desc,
          sku: service.sku,
          category_name: service.service_categories?.name || null,
          brand_name: null,
          purchase_price: priceInfo?.price || null,
          vat_rate: priceInfo?.vat_rate || 23,
        };
      });

      setServices(mappedServices);
      setCatalogLoaded(true);
    } catch (error: any) {
      toast({
        title: t('purchaseOrders.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCatalogLoading(false);
    }
  };

  const fetchProductAttributes = async (productIds: string[]) => {
    try {
      if (productIds.length === 0) return;

      // Restrito aos produtos deste catálogo (batched a 200 ids, mesmo padrão dos
      // preços acima) — antes ia buscar TODOS os produtos ativos de TODAS as
      // organizações só para montar este mapa de atributos.
      const BATCH = 200;
      const productsData: Array<{ id: string; category_id: string | null }> = [];
      for (let i = 0; i < productIds.length; i += BATCH) {
        const batch = productIds.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from("products")
          .select("id, category_id")
          .in("id", batch);
        if (error) throw error;
        productsData.push(...(data || []));
      }

      // Get unique category IDs
      const categoryIds = [...new Set(productsData.map(p => p.category_id).filter(Boolean))];

      if (categoryIds.length === 0) {
        return;
      }

      // Get attributes for these categories
      const { data: categoryAttrs, error: caError } = await supabase
        .from("category_attributes")
        .select(`
          category_id,
          attribute_id,
          product_attributes!inner (
            id,
            code,
            label,
            value_type,
            unit,
            allowed_values
          )
        `)
        .in("category_id", categoryIds);

      if (caError) throw caError;

      const attributesMap = new Map<string, ProductAttribute[]>();

      productsData.forEach(product => {
        if (!product.category_id) return;

        const productAttrs = categoryAttrs
          ?.filter(ca => ca.category_id === product.category_id)
          .map(ca => ({
            id: ca.attribute_id,
            name: ca.product_attributes.label,
            code: ca.product_attributes.code,
            value_type: ca.product_attributes.value_type,
            unit: ca.product_attributes.unit,
            allowed_values: Array.isArray(ca.product_attributes.allowed_values)
              ? ca.product_attributes.allowed_values as string[]
              : null,
            values: []
          })) || [];

        if (productAttrs.length > 0) {
          attributesMap.set(product.id, productAttrs);
        }
      });

      setProductAttributes(attributesMap);
    } catch (error: any) {
      console.error("Error loading product attributes:", error);
    }
  };

  const handleEdit = async (order: PurchaseOrder) => {
    setEditingId(order.id);
    setFormData({
      supplier_id: order.supplier_id,
      order_date: order.order_date,
      expected_delivery: order.expected_delivery || "",
      status: order.status,
      notes: order.notes || "",
    });

    // Fase 5.0F: origem via Contrato (source_type/source_id, Fase 5.0C) —
    // best-effort, nunca bloqueia a abertura do diálogo se falhar.
    setOrderSourceInfo(null);
    if ((order as any).source_type === "contract" && (order as any).source_id) {
      supabase
        .from("client_contracts")
        .select("contract_number, entity_id, anew_entities(display_name)")
        .eq("id", (order as any).source_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setOrderSourceInfo({
              contractId: (order as any).source_id,
              contractNumber: data.contract_number || "",
              clientName: (data as any).anew_entities?.display_name || "",
            });
          }
        });
    }

    // Load existing items
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("purchase_order_id", order.id);
    
    if (items) {
      setOrderItems(items.map(item => ({
        id: item.id,
        item_type: item.item_type as 'product' | 'service',
        product_id: item.product_id,
        service_id: item.service_id,
        description: item.description,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate || 23,
        vat_amount: item.vat_amount || 0,
        total_price: item.total_price,
        selected_attributes: item.selected_attributes as Record<string, string> || {},
        notes: item.notes,
      })));
    }
    
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('purchaseOrders.delete.confirm'))) return;

    try {
      const { error } = await supabase.rpc("rpc_delete_purchase_order", { p_id: id });

      if (error) throw error;

      toast({
        title: t('purchaseOrders.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('purchaseOrders.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const { error } = await supabase.rpc("rpc_restore_purchase_order", { p_id: id });
      if (error) throw error;

      toast({ title: t('purchaseOrders.toast.restoreSuccess') || "Encomenda restaurada" });

      loadData();
    } catch (error: any) {
      toast({
        title: t('purchaseOrders.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openReceiveDialog = async (order: PurchaseOrder) => {
    setReceivingOrder({ id: order.id, order_number: order.order_number });
    setReceiveWarehouseId("");
    setReceiveLines([]);
    setReceiveLineQuantities({});
    setReceiveDialogOpen(true);

    if (!activeCompany?.id) return;

    const [warehousesRes, itemsRes] = await Promise.all([
      supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("purchase_order_items")
        .select("*, products(name)")
        .eq("purchase_order_id", order.id)
        .eq("item_type", "product"),
    ]);

    if (warehousesRes.error) {
      toast({ title: t('purchaseOrders.toast.error'), description: warehousesRes.error.message, variant: "destructive" });
      return;
    }
    setReceiveWarehouses(warehousesRes.data || []);

    if (itemsRes.error) {
      toast({ title: t('purchaseOrders.toast.error'), description: itemsRes.error.message, variant: "destructive" });
      return;
    }
    const items = (itemsRes.data as PurchaseOrderItemWithReceipt[] | null) || [];
    setReceiveLines(items);

    const initialQuantities: Record<string, number> = {};
    items.forEach((item) => {
      const remaining = item.quantity - (item.received_quantity || 0);
      initialQuantities[item.id] = remaining > 0 ? remaining : 0;
    });
    setReceiveLineQuantities(initialQuantities);
  };

  const getReceiveRemaining = (item: PurchaseOrderItemWithReceipt) =>
    item.quantity - (item.received_quantity || 0);

  // "Selecionar tudo": repõe cada input ao saldo por receber da respetiva
  // linha — replica num clique o antigo comportamento por omissão ("recebe
  // tudo de uma vez").
  const handleSelectAllReceiveLines = () => {
    const quantities: Record<string, number> = {};
    receiveLines.forEach((item) => {
      const remaining = getReceiveRemaining(item);
      quantities[item.id] = remaining > 0 ? remaining : 0;
    });
    setReceiveLineQuantities(quantities);
  };

  const handleReceiveOrder = async () => {
    if (!receivingOrder || !receiveWarehouseId) return;

    const linesToReceive = receiveLines
      .map((item) => ({
        purchase_order_item_id: item.id,
        quantity: receiveLineQuantities[item.id] || 0,
      }))
      .filter((line) => line.quantity > 0);

    if (linesToReceive.length === 0) {
      toast({
        title: t('purchaseOrders.toast.error'),
        description: "Indica pelo menos uma quantidade a receber numa linha.",
        variant: "destructive",
      });
      return;
    }

    setReceiving(true);
    try {
      const { data, error } = await supabase.rpc("rpc_receive_purchase_order_lines", {
        p_purchase_order_id: receivingOrder.id,
        p_warehouse_id: receiveWarehouseId,
        p_lines: linesToReceive,
      });
      if (error) throw error;

      // O status devolvido pelo RPC é a fonte da verdade — não assumir
      // 'received' (pode ter ficado 'partially_received').
      const resultStatus = (data as { status?: string } | null)?.status;
      const isFullyReceived = resultStatus === 'received';

      toast({
        title: isFullyReceived ? "Encomenda totalmente recebida" : "Receção parcial registada",
        description: isFullyReceived
          ? `${receivingOrder.order_number} foi totalmente recebida — stock atualizado.`
          : `${receivingOrder.order_number} teve uma receção parcial registada — stock atualizado nas linhas indicadas.`,
      });
      setReceiveDialogOpen(false);
      setReceivingOrder(null);
      setReceiveLines([]);
      setReceiveLineQuantities({});
      loadData();
    } catch (error: any) {
      toast({ title: t('purchaseOrders.toast.error'), description: error.message, variant: "destructive" });
    } finally {
      setReceiving(false);
    }
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalVat = 0;
    
    orderItems.forEach(item => {
      const itemSubtotal = item.unit_price * item.quantity;
      const itemVat = itemSubtotal * (item.vat_rate / 100);
      subtotal += itemSubtotal;
      totalVat += itemVat;
    });
    
    const total = subtotal + totalVat;
    
    return {
      subtotal,
      totalVat,
      total,
    };
  };

  // Products/services the selected supplier actually supplies, per item_suppliers,
  // with purchase_price overridden to the supplier-specific price when it has one
  // (falls back to the product_prices-derived price otherwise). Single source used
  // both by getAvailableItems() (confirm/add) and the two tab lists in the items
  // dialog (render) — kept as one computation so they can never disagree.
  const availableProductsForSupplier = useMemo(() => {
    if (!formData.supplier_id) return [];
    return products
      .filter(p => supplierProductRefs.has(p.id))
      .map(p => {
        const ref = supplierProductRefs.get(p.id);
        return ref?.purchase_price != null ? { ...p, purchase_price: ref.purchase_price } : p;
      });
  }, [products, supplierProductRefs, formData.supplier_id]);

  const availableServicesForSupplier = useMemo(() => {
    if (!formData.supplier_id) return [];
    return services
      .filter(s => supplierServiceRefs.has(s.id))
      .map(s => {
        const ref = supplierServiceRefs.get(s.id);
        return ref?.purchase_price != null ? { ...s, purchase_price: ref.purchase_price } : s;
      });
  }, [services, supplierServiceRefs, formData.supplier_id]);

  const getAvailableItems = () => {
    return selectedItemType === 'product' ? availableProductsForSupplier : availableServicesForSupplier;
  };

  const handleAddCatalogItems = () => {
    const availableItems = getAvailableItems();
    const selectedProducts = availableItems.filter(p => selectedCatalogItems.includes(p.id));
    
    if (selectedProducts.length === 0) {
      toast({
        title: t('purchaseOrders.toast.noItemsSelected'),
        description: t('purchaseOrders.toast.selectAtLeastOne'),
        variant: "destructive",
      });
      return;
    }
    
    const newItems: PurchaseOrderItem[] = selectedProducts.map(item => {
      const selectedAttrs = selectedItemAttributes[item.id] || {};
      const purchasePrice = item.purchase_price || 0;
      const vatRate = item.vat_rate || 23;
      
      if (!purchasePrice || purchasePrice <= 0) {
        toast({
          title: t('purchaseOrders.toast.missingPrice'),
          description: t('purchaseOrders.toast.noPurchasePrice', { name: item.name }),
          variant: "destructive",
        });
      }
      
      // Transform selected attributes to full format for LineAttributesDialog
      const fullAttributes: Record<string, any> = {};
      if (Object.keys(selectedAttrs).length > 0 && selectedItemType === 'product') {
        const attrs = productAttributes.get(item.id);
        Object.entries(selectedAttrs).forEach(([attrId, value]) => {
          const attr = attrs?.find(a => a.id === attrId);
          if (attr && value) {
            fullAttributes[attrId] = {
              attribute_code: attr.code,
              label: attr.name,
              value_type: attr.value_type,
              unit: attr.unit,
              value: value
            };
          }
        });
      }
      
      // Build description with attributes
      let description = item.name;
      if (Object.keys(fullAttributes).length > 0) {
        const attrStrings = Object.entries(fullAttributes).map(([attrId, attrData]) => {
          const displayValue = attrData.unit ? `${attrData.value} ${attrData.unit}` : attrData.value;
          return `${attrData.label}: ${displayValue}`;
        }).filter(Boolean);
        
        if (attrStrings.length > 0) {
          description = `${item.name} (${attrStrings.join(', ')})`;
        }
      }
      
      const quantity = 1;
      const subtotal = purchasePrice * quantity;
      const vatAmount = subtotal * (vatRate / 100);
      const totalPrice = subtotal + vatAmount;
      
      return {
        item_type: selectedItemType,
        product_id: selectedItemType === 'product' ? item.id : undefined,
        service_id: selectedItemType === 'service' ? item.id : undefined,
        description,
        sku: item.sku || undefined,
        quantity,
        unit_price: purchasePrice,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_price: totalPrice,
        selected_attributes: fullAttributes,
      };
    }).filter(item => item.unit_price > 0);
    
    if (newItems.length === 0) {
      return;
    }
    
    setOrderItems([...orderItems, ...newItems]);
    setSelectedCatalogItems([]);
    setSelectedItemAttributes({});
    setShowItemsDialog(false);
    
    toast({
      title: t('purchaseOrders.toast.itemsAdded'),
      description: t('purchaseOrders.toast.itemsAddedDesc', { count: newItems.length }),
    });
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    const newItems = [...orderItems];
    const item = newItems[index];
    
    if (field === 'quantity' || field === 'unit_price') {
      const quantity = field === 'quantity' ? parseFloat(value) || 0 : item.quantity;
      const unitPrice = field === 'unit_price' ? parseFloat(value) || 0 : item.unit_price;
      const subtotal = quantity * unitPrice;
      const vatAmount = subtotal * (item.vat_rate / 100);
      const totalPrice = subtotal + vatAmount;
      
      newItems[index] = {
        ...item,
        [field]: field === 'quantity' ? quantity : unitPrice,
        vat_amount: vatAmount,
        total_price: totalPrice,
      };
    } else {
      newItems[index] = {
        ...item,
        [field]: value,
      };
    }
    
    setOrderItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = purchaseOrderSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) errors[err.path[0].toString()] = err.message;
      });
      setFieldErrors(errors);
      toast({
        title: t('purchaseOrders.toast.createError'),
        description: validation.error.errors[0]?.message,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors({});

    if (orderItems.length === 0) {
      toast({
        title: t('purchaseOrders.toast.addAtLeastOneItem'),
        description: t('purchaseOrders.toast.addAtLeastOneItemDesc'),
        variant: "destructive",
      });
      return;
    }

    const { total } = calculateTotals();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
        return;
      }

      const orderData = {
        supplier_id: formData.supplier_id,
        order_date: formData.order_date,
        expected_delivery: formData.expected_delivery || null,
        status: formData.status,
        total_value: total,
        notes: formData.notes || null,
      };

      const itemsPayload = orderItems.map(item => ({
        item_type: item.item_type,
        product_id: item.product_id || null,
        service_id: item.service_id || null,
        description: item.description,
        sku: item.sku || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate,
        vat_amount: item.vat_amount,
        total_price: item.total_price,
        selected_attributes: item.selected_attributes || {},
        notes: item.notes || null,
      }));

      if (editingId) {
        // Update order + full item replace (delete-all + re-insert) in a single
        // atomic RPC call, matching rpc_update_purchase_order's contract.
        const { error: updateError } = await supabase.rpc("rpc_update_purchase_order", {
          p_purchase_order_id: editingId,
          p_order: orderData,
          p_items: itemsPayload,
        });

        if (updateError) throw updateError;

        toast({
          title: t('purchaseOrders.toast.updateSuccess'),
        });
      } else {
        const companyId = organizationSelection.companyId || activeCompany?.id;
        if (!companyId) throw new Error("No company selected");

        // Create order + items in a single atomic RPC call, matching
        // rpc_create_purchase_order's contract (order_number auto-generated by trigger).
        const { error: createError } = await supabase.rpc("rpc_create_purchase_order", {
          p_organization_id: companyId,
          p_order: orderData,
          p_items: itemsPayload,
        });

        if (createError) throw createError;

        toast({
          title: t('purchaseOrders.toast.createSuccess'),
        });
      }

      setOpen(false);
      setEditingId(null);
      setFormData({
        supplier_id: "",
        order_date: new Date().toISOString().split('T')[0],
        expected_delivery: "",
        status: "pending",
        notes: "",
      });
      setFieldErrors({});
      setOrderItems([]);
      loadData();
    } catch (error: any) {
      toast({
        title: editingId ? t('purchaseOrders.toast.updateError') : t('purchaseOrders.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-warning/10 text-warning",
      ordered: "bg-info/10 text-info",
      // Intermédio entre "ordered" (info/azul) e "received" (success/verde) —
      // teal já usado noutros ecrãs do projeto para estados intermédios.
      partially_received: "bg-teal-500/10 text-teal-600",
      received: "bg-success/10 text-success",
      cancelled: "bg-destructive/10 text-destructive",
    };
    return colors[status] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('purchaseOrders.status.pending'),
      ordered: t('purchaseOrders.status.ordered'),
      partially_received: t('purchaseOrders.status.partiallyReceived'),
      received: t('purchaseOrders.status.received'),
      cancelled: t('purchaseOrders.status.cancelled'),
    };
    return labels[status] || status;
  };

  const handleGeneratePDF = async (orderId: string) => {
    try {
      // Fetch order data with company and supplier
      const { data: orderData, error: orderError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (name, tax_id, email, phone),
          anew_organizations!organization_id (name, logo_url)
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', orderId);

      if (itemsError) throw itemsError;

      // Fetch current user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let userData = null;
      if (authUser) {
        const { data: anewUser } = await supabase
          .from('anew_users')
          .select('name, phone')
          .eq('auth_user_id', authUser.id)
          .single();

        userData = {
          id: authUser.id,
          email: authUser.email,
          name: anewUser?.name || '',
          phone: anewUser?.phone || '',
        };
      }

      // Convert logo to base64
      let logoBase64 = null;
      const orgData = orderData?.anew_organizations as any;
      if (orgData?.logo_url) {
        try {
          const response = await fetch(orgData.logo_url);
          const blob = await response.blob();
          logoBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('Error converting logo to base64:', error);
        }
      }

      const companyWithLogo = {
        ...(orgData || {}),
        logo_url: logoBase64 || orgData?.logo_url,
      };

      // Generate PDF
      const blob = await pdf(
        <PurchaseOrderPDFDocument
          order={orderData}
          company={companyWithLogo}
          supplier={orderData.suppliers}
          items={itemsData || []}
          user={userData}
        />
      ).toBlob();

      // Download PDF
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Encomenda_${orderData.order_number || orderId}_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: t('purchaseOrders.toast.pdfSuccess'),
      });
    } catch (error: any) {
      toast({
        title: t('purchaseOrders.toast.pdfError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    if (orders.length === 0) {
      toast({
        title: t('purchaseOrders.toast.exportNoData'),
        description: t('purchaseOrders.toast.exportNoDataDesc'),
        variant: "destructive",
      });
      return;
    }
    exportPurchaseOrdersToCSV(orders);
    toast({
      title: t('purchaseOrders.toast.exportSuccess'),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      // order_number is unique per organization (not globally), and a single
      // duplicate would otherwise fail the whole all-or-nothing RPC import.
      // Pre-fetch existing order_numbers for this org (regardless of
      // deleted_at — the DB constraint applies to soft-deleted rows too) so
      // colliding rows can be skipped/reported instead of aborting the batch.
      const { data: existingOrders, error: existingOrdersError } = await supabase
        .from("purchase_orders")
        .select("order_number")
        .eq("organization_id", activeCompany.id);

      if (existingOrdersError) throw existingOrdersError;

      const existingOrderNumbers = new Set((existingOrders || []).map((o: any) => o.order_number));

      const { ordersToInsert, skippedLines } = parsePurchaseOrdersCSV(
        text,
        suppliers,
        businessUserId,
        activeCompany.id,
        existingOrderNumbers,
      );

      if (ordersToInsert.length === 0) {
        throw new Error(
          skippedLines.length > 0
            ? `${t('purchaseOrders.toast.noValidOrders')} ${skippedLines.slice(0, 5).map(s => `Linha ${s.line}: ${s.reason}`).join(" | ")}`
            : t('purchaseOrders.toast.noValidOrders')
        );
      }

      const { error } = await supabase.rpc("rpc_import_purchase_orders_csv", {
        p_orders: ordersToInsert,
      });

      if (error) throw error;

      const skippedSuffix = skippedLines.length > 0
        ? ` ${skippedLines.length} linha(s) ignoradas: ${skippedLines.slice(0, 5).map(s => `L${s.line} (${s.orderNumber}): ${s.reason}`).join(" | ")}${skippedLines.length > 5 ? ` (+${skippedLines.length - 5} mais)` : ""}`
        : "";

      toast({
        title: t('purchaseOrders.toast.importSuccess', { count: ordersToInsert.length }) + skippedSuffix,
      });

      setImportDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: t('purchaseOrders.toast.importError'),
        description: error.message,
        variant: "destructive",
      });
    }

    e.target.value = "";
  };

  const totals = calculateTotals();

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
          <div><h1 className="text-3xl font-bold">{t('purchaseOrders.title')}</h1><p className="text-muted-foreground">{t('purchaseOrders.description')}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">{t('purchaseOrders.loading')}</h1>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-full"></div>
            <div className="h-64 bg-muted rounded w-full"></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-2">{t('purchaseOrders.title')}</h1>
              <p className="text-muted-foreground">{t('purchaseOrders.description')}</p>
            </div>
            <PageFAQSheet pageKey="operations.purchaseOrders" />
          </div>
          <div className="flex gap-2">
            <Button
              variant={showDeleted ? "default" : "outline"}
              onClick={() => setShowDeleted((prev) => !prev)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {showDeleted ? (t('purchaseOrders.hideDeleted') || 'Ocultar eliminados') : (t('purchaseOrders.showDeleted') || 'Ver eliminados')}
            </Button>
            <PermissionGate permission="purchase_orders.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t('purchaseOrders.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="purchase_orders.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    {t('purchaseOrders.import')}
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('purchaseOrders.import.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="csv-upload">{t('purchaseOrders.import.csvFile')}</Label>
                    <Input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      onChange={handleImport}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('purchaseOrders.import.description')}
                  </p>
                </div>
              </DialogContent>
            </Dialog>
            </PermissionGate>
            <PermissionGate permission="purchase_orders.create">
           <Dialog open={open} onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (!isOpen) {
                setEditingId(null);
                setFormData({
                  supplier_id: "",
                  order_date: new Date().toISOString().split('T')[0],
                  expected_delivery: "",
                  status: "pending",
                  notes: "",
                });
                setFieldErrors({});
                setOrderItems([]);
                setOrganizationSelection({
                  tenantId: "",
                  companyId: activeCompany?.id || "",
                  businessUnitId: "",
                  departmentId: "",
                  secondaryCompanyIds: [],
                });
               }
             }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('purchaseOrders.newOrder')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingId ? t('purchaseOrders.editOrder') : t('purchaseOrders.newOrder')}</DialogTitle>
                  {editingId && orderSourceInfo && (
                    <p className="text-sm text-muted-foreground">
                      {t('purchaseOrders.generatedFromContract', {
                        contractNumber: orderSourceInfo.contractNumber,
                        clientName: orderSourceInfo.clientName,
                      }) || `Gerada automaticamente a partir do Contrato ${orderSourceInfo.contractNumber} — Cliente ${orderSourceInfo.clientName}`}
                      {' '}
                      <Link to={`/client-orders?open=${orderSourceInfo.contractId}`} className="underline">
                        {t('purchaseOrders.viewClientOrder') || 'Ver Encomenda Cliente'}
                      </Link>
                    </p>
                  )}
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Organization Selection */}
                  <OrganizationFormSection
                    value={organizationSelection}
                    onChange={setOrganizationSelection}
                    showSecondaryCompanies={false}
                    multiSelectCompanies={false}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="supplier_id">{t('purchaseOrders.form.supplier')} *</Label>
                      <Select value={formData.supplier_id} onValueChange={(value) => {
                        setFormData({ ...formData, supplier_id: value });
                        setOrderItems([]);
                      }} required>
                        <SelectTrigger>
                          <SelectValue placeholder={t('purchaseOrders.form.selectSupplier')} />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.supplier_id && <p className="text-xs text-destructive">{fieldErrors.supplier_id}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order_date">{t('purchaseOrders.form.orderDate')} *</Label>
                      <Input
                        id="order_date"
                        type="date"
                        value={formData.order_date}
                        onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                        required
                        className={fieldErrors.order_date ? "border-destructive" : ""}
                      />
                      {fieldErrors.order_date && <p className="text-xs text-destructive">{fieldErrors.order_date}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expected_delivery">{t('purchaseOrders.form.expectedDelivery')}</Label>
                      <Input
                        id="expected_delivery"
                        type="date"
                        value={formData.expected_delivery}
                        onChange={(e) => setFormData({ ...formData, expected_delivery: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">{t('purchaseOrders.form.status')} *</Label>
                      <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{t('purchaseOrders.status.pending')}</SelectItem>
                          {/* Passar a "ordered" (aprovar a encomenda) requer purchase_orders.approve.
                              Continua visível se já for o valor atual (ex.: a reabrir uma encomenda
                              já aprovada por quem entretanto perdeu a permissão), só fica indisponível
                              para escolher de novo a partir de outro estado sem a permissão. Isto é só
                              UX — o backend rejeita na mesma quem contornar isto. */}
                          {(hasPermission('purchase_orders.approve') || formData.status === 'ordered') && (
                            <SelectItem value="ordered">{t('purchaseOrders.status.ordered')}</SelectItem>
                          )}
                          {/* "received" já não é uma opção genérica aqui — passa pelo botão
                              dedicado "Marcar como recebida" na lista (Fase 4C), que pede o
                              armazém de destino e gera a entrada em stock_movements. Manter
                              este dropdown a permitir 'received' deixaria criar encomendas
                              "recebidas" sem nunca dar entrada em stock nenhum. */}
                          {editingId && formData.status === 'received' && (
                            <SelectItem value="received">{t('purchaseOrders.status.received')}</SelectItem>
                          )}
                          {/* "partially_received" nunca é uma escolha manual — é derivado por
                              rpc_receive_purchase_order_lines a partir das receções parciais
                              já registadas. Só aparece aqui, desativado, se a encomenda já
                              estiver neste estado (hoje inatingível a partir deste formulário,
                              já que o botão de editar fica desativado para encomendas com
                              receção parcial — mantido por clareza/defesa em profundidade). */}
                          {editingId && formData.status === 'partially_received' && (
                            <SelectItem value="partially_received" disabled>
                              {t('purchaseOrders.status.partiallyReceived')}
                            </SelectItem>
                          )}
                          <SelectItem value="cancelled">{t('purchaseOrders.status.cancelled')}</SelectItem>
                        </SelectContent>
                      </Select>
                      {!hasPermission('purchase_orders.approve') && formData.status !== 'ordered' && (
                        <p className="text-xs text-muted-foreground">
                          Sem permissão para aprovar encomendas (mudar para "{t('purchaseOrders.status.ordered')}").
                        </p>
                      )}
                      {formData.status === 'received' && (
                        <p className="text-xs text-muted-foreground">
                          Esta encomenda já foi recebida (stock atualizado). Para reverter, usa um ajuste em Stocks.
                        </p>
                      )}
                      {formData.status === 'partially_received' && (
                        <p className="text-xs text-muted-foreground">
                          Esta encomenda já tem linhas parcialmente recebidas — não é possível editá-la nem cancelá-la. Para devolver mercadoria já recebida, usa a devolução ao fornecedor.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">{t('purchaseOrders.form.notes')}</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">{t('purchaseOrders.form.orderItems')}</h3>
                      <Button 
                        type="button" 
                        onClick={() => setShowItemsDialog(true)}
                        disabled={!formData.supplier_id}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('purchaseOrders.form.addItems')}
                      </Button>
                    </div>

                    {orderItems.length > 0 ? (
                      <div className="grid grid-cols-3 gap-6">
                        <div className="col-span-2 space-y-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('purchaseOrders.items.sku')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.description')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.quantity')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.unitPrice')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.vat')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.total')}</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                             <TableBody>
                               {orderItems.map((item, index) => (
                                 <TableRow key={index}>
                                   <TableCell className="font-mono text-xs">{item.sku || "N/A"}</TableCell>
                                   <TableCell>{item.description}</TableCell>
                                   <TableCell>
                                     <Input
                                       type="number"
                                       value={item.quantity}
                                       onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                       className="w-20"
                                       min="0"
                                       step="0.01"
                                     />
                                   </TableCell>
                                   <TableCell>
                                     <Input
                                       type="number"
                                       value={item.unit_price}
                                       onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                       className="w-24"
                                       min="0"
                                       step="0.01"
                                     />
                                   </TableCell>
                                   <TableCell>{item.vat_rate}%</TableCell>
                                   <TableCell className="font-semibold">€{item.total_price.toFixed(2)}</TableCell>
                                   <TableCell>
                                     <div className="flex gap-1">
                                        {item.item_type === 'product' && item.product_id && (
                                         <Button
                                           type="button"
                                           variant="ghost"
                                           size="icon"
                                           onClick={() => {
                                             const product = products.find(p => p.id === item.product_id);
                                             setEditingItemIndex(index);
                                             setEditingProductId(item.product_id);
                                             setEditingProductName(product?.name || item.description);
                                           }}
                                           title={t('quoteBuilder.editAttributes')}
                                         >
                                           <Tag className="w-4 h-4" />
                                         </Button>
                                       )}
                                       <Button
                                         type="button"
                                         variant="ghost"
                                         size="icon"
                                         onClick={() => handleRemoveItem(index)}
                                       >
                                         <Trash2 className="w-4 h-4" />
                                       </Button>
                                     </div>
                                   </TableCell>
                                 </TableRow>
                               ))}
                             </TableBody>
                          </Table>
                        </div>

                        <div>
                          <Card>
                            <CardHeader>
                              <CardTitle>{t('purchaseOrders.summary.title')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('purchaseOrders.summary.subtotal')}</span>
                                <span>€{totals.subtotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('purchaseOrders.summary.vat')}</span>
                                <span>€{totals.totalVat.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                                <span>{t('purchaseOrders.summary.total')}</span>
                                <span>€{totals.total.toFixed(2)}</span>
                              </div>
                              <div className="text-sm text-muted-foreground pt-2">
                                {t('purchaseOrders.summary.items')}: {orderItems.length}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        {t('purchaseOrders.form.noItems')}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      {t('purchaseOrders.form.cancel')}
                    </Button>
                    <Button type="submit">
                      {editingId ? t('purchaseOrders.form.update') : t('purchaseOrders.form.create')}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </PermissionGate>
          </div>
        </div>

        <Card>
          {orders.length === 0 ? (
            <div className="p-8 text-center space-y-4">
              <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                {t('purchaseOrders.noOrders')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('purchaseOrders.table.number')}</TableHead>
                  <TableHead>{t('purchaseOrders.table.supplier')}</TableHead>
                  <TableHead>{t('purchaseOrders.table.date')}</TableHead>
                  <TableHead>{t('purchaseOrders.table.delivery')}</TableHead>
                  <TableHead>{t('purchaseOrders.table.status')}</TableHead>
                  <TableHead>{t('purchaseOrders.table.totalValue')}</TableHead>
                  <TableHead className="text-right">{t('purchaseOrders.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono font-semibold">{order.order_number}</TableCell>
                    <TableCell>{order.suppliers?.name || "N/A"}</TableCell>
                    <TableCell>{new Date(order.order_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {order.expected_delivery
                        ? new Date(order.expected_delivery).toLocaleDateString()
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status)}>
                        {getStatusLabel(order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">€{order.total_value.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {showDeleted ? (
                          <PermissionGate permission="purchase_orders.delete">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestore(order.id)}
                            >
                              {t('purchaseOrders.restore') || 'Restaurar'}
                            </Button>
                          </PermissionGate>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleGeneratePDF(order.id)} title="Gerar PDF">
                              <FileDown className="w-4 h-4" />
                            </Button>
                            {(order.status === 'pending' || order.status === 'ordered' || order.status === 'partially_received') && (
                              <PermissionGate permission="purchase_orders.receive">
                                <Button variant="ghost" size="icon" onClick={() => openReceiveDialog(order)} title="Marcar como recebida">
                                  <PackageCheck className="w-4 h-4" />
                                </Button>
                              </PermissionGate>
                            )}
                            <PermissionGate permission="purchase_orders.edit">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(order)}
                                disabled={order.status === 'partially_received' || order.status === 'received'}
                                title={
                                  order.status === 'partially_received' || order.status === 'received'
                                    ? "Não é possível editar uma encomenda já recebida"
                                    : undefined
                                }
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="purchase_orders.delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(order.id)}
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
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Items Selection Dialog */}
      <Dialog open={showItemsDialog} onOpenChange={setShowItemsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('purchaseOrders.items.title')}</DialogTitle>
          </DialogHeader>
          
          <Tabs value={selectedItemType} onValueChange={(v) => setSelectedItemType(v as 'product' | 'service')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="product">{t('purchaseOrders.items.products')}</TabsTrigger>
              <TabsTrigger value="service">{t('purchaseOrders.items.services')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="product" className="space-y-4 max-h-[50vh] overflow-y-auto">
              {availableProductsForSupplier.map((product) => (
                <div key={product.id} className="flex items-start gap-4 p-4 border rounded-lg">
                  <Checkbox
                    checked={selectedCatalogItems.includes(product.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCatalogItems([...selectedCatalogItems, product.id]);
                      } else {
                        setSelectedCatalogItems(selectedCatalogItems.filter(id => id !== product.id));
                        const newAttrs = { ...selectedItemAttributes };
                        delete newAttrs[product.id];
                        setSelectedItemAttributes(newAttrs);
                      }
                    }}
                  />
                  <div className="flex-1 space-y-2">
                    <div>
                      <div className="font-semibold">{product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        SKU: {product.sku || "N/A"} | {t('purchaseOrders.items.price')}: €{product.purchase_price?.toFixed(2) || "N/A"} | {t('purchaseOrders.items.vat')}: {product.vat_rate}%
                      </div>
                    </div>
                    
                    {selectedCatalogItems.includes(product.id) && productAttributes.get(product.id) && (
                      <div className="pl-4 space-y-2 border-l-2">
                        {productAttributes.get(product.id)!.map(attr => (
                          <div key={attr.id} className="space-y-1">
                            <Label className="text-xs">
                              {attr.name}
                              {attr.unit && <span className="text-muted-foreground ml-1">({attr.unit})</span>}
                            </Label>
                            {attr.value_type === 'list' && attr.allowed_values ? (
                              <Select
                                value={selectedItemAttributes[product.id]?.[attr.id] || ""}
                                onValueChange={(value) => {
                                  setSelectedItemAttributes({
                                    ...selectedItemAttributes,
                                    [product.id]: {
                                      ...selectedItemAttributes[product.id],
                                      [attr.id]: value,
                                    }
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder={`${t('purchaseOrders.items.select')} ${attr.name}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {attr.allowed_values.map(val => (
                                    <SelectItem key={val} value={val}>
                                      {val}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={attr.value_type === 'number' ? 'number' : 'text'}
                                placeholder={attr.unit ? `${attr.unit}` : ''}
                                className="h-8"
                                value={selectedItemAttributes[product.id]?.[attr.id] || ""}
                                onChange={(e) => {
                                  setSelectedItemAttributes({
                                    ...selectedItemAttributes,
                                    [product.id]: {
                                      ...selectedItemAttributes[product.id],
                                      [attr.id]: e.target.value,
                                    }
                                  });
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </TabsContent>
            
            <TabsContent value="service" className="space-y-4 max-h-[50vh] overflow-y-auto">
              {availableServicesForSupplier.map((service) => (
                <div key={service.id} className="flex items-start gap-4 p-4 border rounded-lg">
                  <Checkbox
                    checked={selectedCatalogItems.includes(service.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCatalogItems([...selectedCatalogItems, service.id]);
                      } else {
                        setSelectedCatalogItems(selectedCatalogItems.filter(id => id !== service.id));
                      }
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-semibold">{service.name}</div>
                    <div className="text-sm text-muted-foreground">
                      SKU: {service.sku || "N/A"} | {t('purchaseOrders.items.price')}: €{service.purchase_price?.toFixed(2) || "N/A"} | {t('purchaseOrders.items.vat')}: {service.vat_rate}%
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowItemsDialog(false)}>
              {t('purchaseOrders.items.cancel')}
            </Button>
            <Button onClick={handleAddCatalogItems} disabled={selectedCatalogItems.length === 0}>
              {t('purchaseOrders.items.add')} {selectedCatalogItems.length} Item(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Edit Line Attributes Dialog */}
      {editingItemIndex !== null && editingProductId && (
        <LineAttributesDialog
          open={editingItemIndex !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditingItemIndex(null);
              setEditingProductId(null);
              setEditingProductName("");
            }
          }}
          productId={editingProductId}
          productName={editingProductName}
          currentAttributes={orderItems[editingItemIndex]?.selected_attributes || {}}
          onSave={(attributes) => {
            if (editingItemIndex !== null) {
              const updatedItems = [...orderItems];
              updatedItems[editingItemIndex] = {
                ...updatedItems[editingItemIndex],
                selected_attributes: attributes
              };
              setOrderItems(updatedItems);
              
              toast({
                title: t('purchaseOrders.toast.attributesUpdated'),
                description: t('purchaseOrders.toast.attributesUpdatedDesc')
              });
            }
          }}
        />
      )}

      {/* Receção de encomenda, total ou parcial (Fase 4) — pede o armazém de
          destino e, por linha de produto, a quantidade a dar entrada agora;
          liga a rpc_receive_purchase_order_lines (recebe só as
          linhas/quantidades indicadas). Receções parciais em armazéns
          diferentes fazem-se em 2 chamadas separadas (1 armazém por chamada). */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receção de encomenda{receivingOrder ? ` — ${receivingOrder.order_number}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Indica, por linha, a quantidade a dar entrada em stock agora. Só as quantidades
              indicadas são recebidas — o que ficar por preencher continua por receber para uma
              entrega posterior.
            </p>
            <div className="space-y-2">
              <Label>Armazém de destino</Label>
              <Select value={receiveWarehouseId} onValueChange={setReceiveWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolhe um armazém" />
                </SelectTrigger>
                <SelectContent>
                  {receiveWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {receiveLines.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Linhas a receber</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectAllReceiveLines}>
                    Selecionar tudo
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Encomendada</TableHead>
                      <TableHead className="text-right">Já recebida</TableHead>
                      <TableHead className="text-right">Receber agora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiveLines.map((item) => {
                      const remaining = getReceiveRemaining(item);
                      const fullyReceived = remaining <= 0;
                      return (
                        <TableRow key={item.id} className={fullyReceived ? "opacity-50" : ""}>
                          <TableCell className={fullyReceived ? "line-through" : ""}>
                            <div className="font-medium">{item.products?.name || item.description}</div>
                            {item.sku && (
                              <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{item.received_quantity || 0}</TableCell>
                          <TableCell className="text-right">
                            {fullyReceived ? (
                              <span className="text-xs text-muted-foreground">já recebida</span>
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                max={remaining}
                                step="1"
                                className="w-24 ml-auto"
                                value={receiveLineQuantities[item.id] ?? 0}
                                onChange={(e) => {
                                  const raw = parseFloat(e.target.value);
                                  const clamped = isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), remaining);
                                  setReceiveLineQuantities((prev) => ({ ...prev, [item.id]: clamped }));
                                }}
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

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReceiveDialogOpen(false)} disabled={receiving}>
                Cancelar
              </Button>
              <Button onClick={handleReceiveOrder} disabled={receiving || !receiveWarehouseId}>
                {receiving ? "A confirmar..." : "Confirmar receção"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PurchaseOrders;