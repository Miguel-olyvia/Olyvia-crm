import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { ArrowLeft, Save, Plus, Trash2, Euro, GripVertical, Pencil, ExternalLink, Search, Tag, Layers, ChevronDown, ChevronRight, Package, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuoteAIAssistant } from "@/components/quote/QuoteAIAssistant";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import LineAttributesDialog from "@/components/LineAttributesDialog";
import { BundleChoiceConfigDialog } from "@/components/quote/BundleChoiceConfigDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface QuoteTemplateEditorProps {
  templateId: string | null;
  onClose: () => void;
}

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  brand_name: string | null;
  retail_price: number | null;
}


interface Organization {
  id: string;
  name: string;
}

interface BundleComponentDetail {
  id: string;
  product_id: string | null;
  service_id: string | null;
  product_name: string | null;
  service_name: string | null;
  product_sku: string | null;
  quantity: number;
  is_optional: boolean;
  choice_group_id: string | null;
  choice_group_name: string | null;
  unit_price: number;
}

interface BundleCatalogItem {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  pricing_type: string;
  fixed_price: number | null;
  component_count: number;
  calculated_price: number | null;
  components: BundleComponentDetail[];
}

interface TemplateItem {
  id?: string;
  product_id?: string;
  service_id?: string;
  bundle_id?: string;
  item_type: 'product' | 'service' | 'bundle';
  default_qt: number;
  required: boolean;
  ordem: number;
  catalog_item?: CatalogItem;
  bundle_catalog_item?: BundleCatalogItem;
  
  default_attributes?: Record<string, any>;
  attribute_price_addon?: number;
}

export function QuoteTemplateEditor({ templateId, onClose }: QuoteTemplateEditorProps) {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [catalogBundles, setCatalogBundles] = useState<BundleCatalogItem[]>([]);
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProductCategory, setSelectedProductCategory] = useState<string>("all");
  const [selectedProductSubcategory, setSelectedProductSubcategory] = useState<string>("all");
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<string>("all");
  const [selectedServiceSubcategory, setSelectedServiceSubcategory] = useState<string>("all");
  const [selectedProductBrand, setSelectedProductBrand] = useState<string>("all");
  const [productSearchTerm, setProductSearchTerm] = useState<string>("");
  const [serviceSearchTerm, setServiceSearchTerm] = useState<string>("");
  const [bundleSearchTerm, setBundleSearchTerm] = useState<string>("");
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'product' | 'service' | 'bundle'; name: string } | null>(null);
  const [itemsTab, setItemsTab] = useState<"products" | "services" | "bundles">("products");
  const [_legacyAdmin, _setLegacyAdmin] = useState(false);
  const [attributesDialogOpen, setAttributesDialogOpen] = useState(false);
  const [editingAttributesItem, setEditingAttributesItem] = useState<{ productId: string; itemKey: string; productName: string; currentAttributes: Record<string, any> } | null>(null);
  const [bundleChoiceDialogOpen, setBundleChoiceDialogOpen] = useState(false);
  const [editingBundleChoice, setEditingBundleChoice] = useState<{ bundleId: string; bundleName: string; currentConfig: any } | null>(null);
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, userType: companyUserType } = useCompany();

  const [formData, setFormData] = useState({
    name: "",
    codigo: "",
    description: "",
    organization_id: "",
    active: true,
  });

  // Use companyUserType from context instead of querying profiles
  const isAdmin = ["system_admin", "org_admin", "super_admin"].includes(companyUserType);

  // Auto-select active organization when creating new template
  useEffect(() => {
    if (!templateId && activeCompany?.id && !formData.organization_id) {
      setFormData(prev => ({ ...prev, organization_id: activeCompany.id }));
    }
  }, [activeCompany, templateId]);

  useEffect(() => {
    fetchCatalogItems();
    fetchCatalogServices();
    fetchCatalogBundles();
    
    fetchOrganizations();
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  // Refetch items when organization changes
  useEffect(() => {
    fetchCatalogItems();
    fetchCatalogServices();
    fetchCatalogBundles();
  }, [formData.organization_id]);

  const fetchCatalogItems = async () => {
    try {
      const orgId = formData.organization_id || activeCompany?.id;
      if (!orgId) {
        setCatalogItems([]);
        return;
      }

      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select(`
          id, sku, name, description, is_active, organization_id,
          product_categories!category_id (name),
          subcategory:product_categories!subcategory_id (name),
          brands (name)
        `)
        .eq("is_sellable", true)
        .eq("is_active", true)
        .eq("status", "active")
        .is("deleted_at", null)
        .eq("organization_id", orgId)
        .order("name");

      if (productsError) throw productsError;

      const productIds = productsData?.map(p => p.id) || [];
      const { data: pricesData } = productIds.length > 0 ? await supabase
        .from("product_prices")
        .select("product_id, price")
        .eq("price_type", "retail")
        .in("product_id", productIds) : { data: [] };

      const pricesMap = new Map<string, number>((pricesData || []).map(p => [p.product_id, p.price as number] as [string, number]));

      const mappedItems: CatalogItem[] = (productsData || []).map((product: any) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        category_name: product.product_categories?.name || null,
        subcategory_name: product.subcategory?.name || null,
        brand_name: product.brands?.name || null,
        retail_price: pricesMap.get(product.id) || null,
      }));

      setCatalogItems(mappedItems);
    } catch (error: any) {
      toast({
        title: t('quoteTemplateEditor.toast.loadItemsError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchCatalogServices = async () => {
    try {
      const orgId = formData.organization_id || activeCompany?.id;
      if (!orgId) {
        setCatalogServices([]);
        return;
      }

      const { data: servicesData, error } = await supabase
        .from("services")
        .select(`
          id, sku, name, short_desc, is_active, organization_id, service_type,
          service_categories:service_category_id(name),
          service_subcategory:service_categories!service_subcategory_id(name)
        `)
        .eq("is_active", true)
        .in("service_type", ["sale", "both"])
        .eq("organization_id", orgId)
        .order("name");

      if (error) throw error;

      const serviceIds = servicesData?.map(s => s.id) || [];
      const { data: pricesData } = serviceIds.length > 0 ? await supabase
        .from("service_prices")
        .select("service_id, price")
        .eq("price_type", "retail")
        .in("service_id", serviceIds) : { data: [] };

      const pricesMap = new Map<string, number>((pricesData || []).map(p => [p.service_id, p.price as number] as [string, number]));

      const mappedServices: CatalogItem[] = (servicesData || []).map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.short_desc,
        sku: service.sku,
        category_name: service.service_categories?.name || null,
        subcategory_name: service.service_subcategory?.name || null,
        brand_name: null,
        retail_price: pricesMap.get(service.id) || null,
      }));

      setCatalogServices(mappedServices);
    } catch (error: any) {
      toast({
        title: t('quoteTemplateEditor.toast.loadServicesError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchCatalogBundles = async () => {
    try {
      const orgId = formData.organization_id || activeCompany?.id;
      if (!orgId) {
        setCatalogBundles([]);
        return;
      }

      const { data: bundlesData, error } = await (supabase as any)
        .from("bundles")
        .select(`
          id, sku, name, description, pricing_type, fixed_price, discount_percent, discount_fixed,
          bundle_components(id, product_id, service_id, quantity, choice_group_id, is_optional),
          bundle_choice_groups(id, name, sort_order)
        `)
        .eq("is_active", true)
        .eq("status", "active")
        .is("deleted_at", null)
        .eq("organization_id", orgId)
        .order("name");

      if (error) throw error;

      // Collect all product/service IDs for price + name lookup
      const allProductIds = new Set<string>();
      const allServiceIds = new Set<string>();
      (bundlesData || []).forEach((b: any) => {
        (b.bundle_components || []).forEach((c: any) => {
          if (c.product_id) allProductIds.add(c.product_id);
          if (c.service_id) allServiceIds.add(c.service_id);
        });
      });

      const [prodPricesRes, svcPricesRes, prodNamesRes, svcNamesRes] = await Promise.all([
        allProductIds.size > 0
          ? supabase.from("product_prices").select("product_id, price").eq("price_type", "retail").in("product_id", Array.from(allProductIds))
          : { data: [] },
        allServiceIds.size > 0
          ? supabase.from("service_prices").select("service_id, price").eq("price_type", "retail").in("service_id", Array.from(allServiceIds))
          : { data: [] },
        allProductIds.size > 0
          ? supabase.from("products").select("id, name, sku").in("id", Array.from(allProductIds))
          : { data: [] },
        allServiceIds.size > 0
          ? supabase.from("services").select("id, name").in("id", Array.from(allServiceIds))
          : { data: [] },
      ]);

      const prodPriceMap = new Map((prodPricesRes.data || []).map((p: any) => [p.product_id, Number(p.price) || 0]));
      const svcPriceMap = new Map((svcPricesRes.data || []).map((p: any) => [p.service_id, Number(p.price) || 0]));
      const prodNameMap = new Map((prodNamesRes.data || []).map((p: any) => [p.id, { name: p.name, sku: p.sku }]));
      const svcNameMap = new Map((svcNamesRes.data || []).map((s: any) => [s.id, s.name]));

      // Build choice group name map
      const choiceGroupNameMap = new Map<string, string>();
      (bundlesData || []).forEach((b: any) => {
        (b.bundle_choice_groups || []).forEach((g: any) => {
          choiceGroupNameMap.set(g.id, g.name);
        });
      });

      const mapped: BundleCatalogItem[] = (bundlesData || []).map((b: any) => {
        const comps: BundleComponentDetail[] = (b.bundle_components || []).map((c: any) => {
          const prodInfo = c.product_id ? prodNameMap.get(c.product_id) : null;
          return {
            id: c.id,
            product_id: c.product_id,
            service_id: c.service_id,
            product_name: prodInfo?.name || null,
            service_name: c.service_id ? (svcNameMap.get(c.service_id) || null) : null,
            product_sku: prodInfo?.sku || null,
            quantity: c.quantity || 1,
            is_optional: c.is_optional || false,
            choice_group_id: c.choice_group_id,
            choice_group_name: c.choice_group_id ? (choiceGroupNameMap.get(c.choice_group_id) || null) : null,
            unit_price: c.product_id ? (prodPriceMap.get(c.product_id) || 0) : (svcPriceMap.get(c.service_id) || 0),
          };
        });

        const requiredComps = comps.filter(c => !c.is_optional && !c.choice_group_id);
        const componentsTotal = requiredComps.reduce((sum, c) => sum + c.unit_price * c.quantity, 0);

        let calculatedPrice = componentsTotal;
        if (b.pricing_type === 'fixed_price' && b.fixed_price) {
          calculatedPrice = b.fixed_price;
        } else if (b.pricing_type === 'percentage_discount' && b.discount_percent) {
          calculatedPrice = componentsTotal * (1 - b.discount_percent / 100);
        } else if (b.pricing_type === 'fixed_discount' && b.discount_fixed) {
          calculatedPrice = Math.max(0, componentsTotal - b.discount_fixed);
        }

        return {
          id: b.id,
          name: b.name,
          sku: b.sku,
          description: b.description,
          pricing_type: b.pricing_type,
          fixed_price: b.fixed_price,
          component_count: comps.length,
          calculated_price: calculatedPrice,
          components: comps,
        };
      });

      setCatalogBundles(mapped);
    } catch (error: any) {
      console.error("Error loading bundles:", error);
    }
  };

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name")
        .order("name");

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error: any) {
      toast({
        title: t('quoteTemplateEditor.toast.loadCompaniesError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchTemplate = async () => {
    if (!templateId) return;

    try {
      const { data: template, error: templateError } = await supabase
        .from("quote_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (templateError) throw templateError;

      setFormData({
        name: template.name,
        codigo: template.codigo,
        description: template.description || "",
        organization_id: template.organization_id || "",
        active: template.active,
      });

      const { data: items, error: itemsError } = await (supabase as any)
        .from("quote_template_items")
        .select(`
          *,
          product:products(
            id, 
            name, 
            description,
            sku,
            product_categories!category_id (name),
            brands (name)
          ),
          service:services(
            id,
            name,
            short_desc,
            sku,
            service_categories:service_category_id(name)
          ),
          bundle:bundles(
            id,
            name,
            description,
            sku,
            pricing_type,
            fixed_price
          )
        `)
        .eq("template_id", templateId)
        .order("ordem");

      if (itemsError) throw itemsError;

      // Fetch retail prices for products
      const productIds = items?.filter(i => i.product_id).map(i => i.product_id).filter(Boolean) as string[] || [];
      const { data: productPrices } = productIds.length > 0 ? await supabase
        .from("product_prices")
        .select("product_id, price")
        .eq("price_type", "retail")
        .in("product_id", productIds) : { data: [] };
      const productPricesMap = new Map<string, number>(
        (productPrices || []).map(p => [p.product_id, p.price as number])
      );

      // Fetch retail prices for services
      const serviceIds = items?.filter(i => i.service_id).map(i => i.service_id).filter(Boolean) as string[] || [];
      const { data: servicePrices } = serviceIds.length > 0 ? await supabase
        .from("service_prices")
        .select("service_id, price")
        .eq("price_type", "retail")
        .in("service_id", serviceIds) : { data: [] };
      const servicePricesMap = new Map<string, number>(
        (servicePrices || []).map(p => [p.service_id, p.price as number])
      );

      // Map items with proper structure
      const mappedItems: TemplateItem[] = (items || []).map(item => {
        const defaultAttrs = typeof item.default_attributes === 'object' && item.default_attributes !== null 
          ? (item.default_attributes as Record<string, any>) 
          : {};
        
        if (item.item_type === 'product' && item.product) {
          return {
            ...item,
            item_type: 'product' as const,
            default_attributes: defaultAttrs,
            catalog_item: {
              id: item.product.id,
              name: item.product.name,
              description: item.product.description,
              sku: item.product.sku,
              category_name: item.product.product_categories?.name || null,
              subcategory_name: (item.product as any).product_subcategories?.name || null,
              brand_name: item.product.brands?.name || null,
              retail_price: productPricesMap.get(item.product.id) ?? null,
            }
          };
        } else if (item.item_type === 'service' && item.service) {
          return {
            ...item,
            item_type: 'service' as const,
            default_attributes: defaultAttrs,
            catalog_item: {
              id: item.service.id,
              name: item.service.name,
              description: item.service.short_desc,
              sku: item.service.sku,
              category_name: (item.service as any).service_categories?.name || null,
              subcategory_name: (item.service as any).service_subcategories?.name || null,
              brand_name: null,
              retail_price: servicePricesMap.get(item.service.id) ?? null,
            }
          };
        } else if (item.item_type === 'bundle' && item.bundle) {
          return {
            ...item,
            item_type: 'bundle' as const,
            default_attributes: defaultAttrs,
            bundle_catalog_item: {
              id: item.bundle.id,
              name: item.bundle.name,
              sku: item.bundle.sku,
              description: item.bundle.description,
              pricing_type: item.bundle.pricing_type,
              fixed_price: item.bundle.fixed_price,
              component_count: 0,
              calculated_price: item.bundle.fixed_price || null,
            }
          };
        }
        return {
          ...item,
          item_type: item.item_type as 'product' | 'service' | 'bundle',
          default_attributes: defaultAttrs,
        };
      });

      setTemplateItems(mappedItems);
    } catch (error: any) {
      toast({
        title: t('quoteTemplateEditor.toast.loadTemplateError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };


  const handleSave = async () => {
    if (!formData.name || !formData.codigo) {
      toast({
        title: t('quoteTemplateEditor.toast.requiredFields'),
        description: t('quoteTemplateEditor.toast.nameCodeRequired'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador. Faça login novamente.", variant: "destructive" });
        setLoading(false);
        return;
      }

      let savedTemplateId = templateId;

      if (templateId) {
        const { error } = await supabase
          .from("quote_templates")
          .update({
            name: formData.name,
            codigo: formData.codigo,
            description: formData.description,
            organization_id: formData.organization_id || null,
            active: formData.active,
          })
          .eq("id", templateId);

        if (error) throw error;

        await supabase
          .from("quote_template_items")
          .delete()
          .eq("template_id", templateId);
      } else {
        const { data, error } = await supabase
          .from("quote_templates")
          .insert({
            name: formData.name,
            codigo: formData.codigo,
            description: formData.description,
            organization_id: formData.organization_id || null,
            active: formData.active,
            created_by: businessUserId,
          })
          .select()
          .single();

        if (error) throw error;
        savedTemplateId = data.id;
      }

      if (templateItems.length > 0) {
        const itemsToInsert = templateItems.map((item, index) => ({
          template_id: savedTemplateId,
          product_id: item.product_id || null,
          service_id: item.service_id || null,
          bundle_id: item.bundle_id || null,
          item_type: item.item_type,
          default_qt: item.default_qt,
          required: item.required,
          ordem: index,
          default_attributes: item.default_attributes || {},
        }));

        const { error } = await supabase
          .from("quote_template_items")
          .insert(itemsToInsert);

        if (error) throw error;
      }

      toast({
        title: templateId ? t('quoteTemplateEditor.toast.updateSuccess') : t('quoteTemplateEditor.toast.createSuccess'),
        description: templateId ? t('quoteTemplateEditor.toast.updateSuccessDesc') : t('quoteTemplateEditor.toast.createSuccessDesc'),
      });

      onClose();
    } catch (error: any) {
      toast({
        title: t('quoteTemplateEditor.toast.saveError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addProductItem = (productId: string) => {
    const catalogItem = catalogItems.find(item => item.id === productId);
    if (!catalogItem) return;

    const alreadyAdded = templateItems.some(
      item => item.product_id === productId && item.item_type === 'product'
    );

    if (alreadyAdded) {
      toast({
        title: t('quoteTemplateEditor.toast.itemAlreadyAdded'),
        description: t('quoteTemplateEditor.toast.itemAlreadyAddedDesc'),
        variant: "destructive",
      });
      return;
    }

    setTemplateItems([
      ...templateItems,
      {
        product_id: productId,
        item_type: 'product',
        default_qt: 1,
        required: false,
        ordem: templateItems.length,
        catalog_item: catalogItem,
      },
    ]);
  };

  const addServiceItem = (serviceId: string) => {
    const catalogService = catalogServices.find(item => item.id === serviceId);
    if (!catalogService) return;

    const alreadyAdded = templateItems.some(
      item => item.service_id === serviceId && item.item_type === 'service'
    );

    if (alreadyAdded) {
      toast({
        title: t('quoteTemplateEditor.toast.serviceAlreadyAdded'),
        description: t('quoteTemplateEditor.toast.serviceAlreadyAddedDesc'),
        variant: "destructive",
      });
      return;
    }

    setTemplateItems([
      ...templateItems,
      {
        service_id: serviceId,
        item_type: 'service',
        default_qt: 1,
        required: false,
        ordem: templateItems.length,
        catalog_item: catalogService,
      },
    ]);
  };

  const addBundleItem = (bundleId: string) => {
    const bundle = catalogBundles.find(b => b.id === bundleId);
    if (!bundle) return;

    const alreadyAdded = templateItems.some(
      item => item.bundle_id === bundleId && item.item_type === 'bundle'
    );

    if (alreadyAdded) {
      toast({
        title: "Bundle já adicionado",
        description: "Este bundle já está no modelo.",
        variant: "destructive",
      });
      return;
    }

    setTemplateItems([
      ...templateItems,
      {
        bundle_id: bundleId,
        item_type: 'bundle',
        default_qt: 1,
        required: false,
        ordem: templateItems.length,
        bundle_catalog_item: bundle,
      },
    ]);
  };


  const updateItem = (itemId: string, itemType: 'product' | 'service' | 'bundle', field: keyof TemplateItem, value: any) => {
    setTemplateItems(templateItems.map(item => {
      if (itemType === 'product' && item.product_id === itemId && item.item_type === 'product') {
        return { ...item, [field]: value };
      }
      if (itemType === 'service' && item.service_id === itemId && item.item_type === 'service') {
        return { ...item, [field]: value };
      }
      if (itemType === 'bundle' && item.bundle_id === itemId && item.item_type === 'bundle') {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const productCategories = Array.from(new Set(catalogItems.map(item => item.category_name).filter(Boolean))) as string[];
  const productSubcategories = Array.from(new Set(
    catalogItems
      .filter(item => selectedProductCategory === "all" || item.category_name === selectedProductCategory)
      .map(item => item.subcategory_name)
      .filter(Boolean)
  )) as string[];
  const productBrands = Array.from(new Set(catalogItems.map(item => item.brand_name).filter(Boolean))) as string[];
  
  const filteredProducts = catalogItems.filter(item => {
    const matchesCategory = selectedProductCategory === "all" || item.category_name === selectedProductCategory;
    const matchesSubcategory = selectedProductSubcategory === "all" || item.subcategory_name === selectedProductSubcategory;
    const matchesBrand = selectedProductBrand === "all" || item.brand_name === selectedProductBrand;
    const matchesSearch = !productSearchTerm || 
      item.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      item.sku?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      item.category_name?.toLowerCase().includes(productSearchTerm.toLowerCase());
    return matchesCategory && matchesSubcategory && matchesBrand && matchesSearch;
  });

  const serviceCategories = Array.from(new Set(catalogServices.map(item => item.category_name).filter(Boolean))) as string[];
  const serviceSubcategories = Array.from(new Set(
    catalogServices
      .filter(item => selectedServiceCategory === "all" || item.category_name === selectedServiceCategory)
      .map(item => item.subcategory_name)
      .filter(Boolean)
  )) as string[];
  
  const filteredServices = catalogServices.filter(item => {
    const matchesCategory = selectedServiceCategory === "all" || item.category_name === selectedServiceCategory;
    const matchesSubcategory = selectedServiceSubcategory === "all" || item.subcategory_name === selectedServiceSubcategory;
    const matchesSearch = !serviceSearchTerm || 
      item.name.toLowerCase().includes(serviceSearchTerm.toLowerCase()) ||
      item.sku?.toLowerCase().includes(serviceSearchTerm.toLowerCase()) ||
      item.category_name?.toLowerCase().includes(serviceSearchTerm.toLowerCase());
    return matchesCategory && matchesSubcategory && matchesSearch;
  });

  const filteredBundles = catalogBundles.filter(bundle => {
    if (!bundleSearchTerm) return true;
    const search = bundleSearchTerm.toLowerCase();
    return bundle.name.toLowerCase().includes(search) ||
      bundle.sku?.toLowerCase().includes(search) ||
      bundle.description?.toLowerCase().includes(search);
  });

  // Helper function for fuzzy name matching
  const normalizeText = (text: string) => {
    return text?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() || '';
  };

  // Handler for AI suggestion - improved matching
  const handleAISuggestion = (suggestion: { product_id: string; name: string; category: string; quantity: number; price: number; type?: 'product' | 'service' }): boolean => {
    const isProduct = suggestion.type !== 'service';
    const searchName = normalizeText(suggestion.name);
    const searchWords = searchName.split(/\s+/).filter(w => w.length > 2);

    console.log("AI Suggestion received:", suggestion);
    console.log("Is Product:", isProduct, "Search Name:", searchName);

    if (isProduct) {
      console.log("Available catalog items:", catalogItems.length, catalogItems.map(i => ({ id: i.id, name: i.name })).slice(0, 10));

      // Try multiple matching strategies
      let catalogItem = catalogItems.find(item => item.id === suggestion.product_id);

      if (!catalogItem) {
        // Try exact name match
        catalogItem = catalogItems.find(item => normalizeText(item.name) === searchName);
      }

      if (!catalogItem) {
        // Try partial name match (suggestion name contains catalog name or vice versa)
        catalogItem = catalogItems.find(item => {
          const itemName = normalizeText(item.name);
          return itemName.includes(searchName) || searchName.includes(itemName);
        });
      }

      if (!catalogItem) {
        // Try word-based matching (at least 2 words match)
        catalogItem = catalogItems.find(item => {
          const itemWords = normalizeText(item.name).split(/\s+/).filter(w => w.length > 2);
          const matchingWords = searchWords.filter(sw => itemWords.some(iw => iw.includes(sw) || sw.includes(iw)));
          return matchingWords.length >= 2 || (searchWords.length === 1 && matchingWords.length === 1);
        });
      }

      if (!catalogItem) {
        console.log("AI: Product not found. Search name:", searchName, "Available products:", catalogItems.map(i => i.name).slice(0, 10));
        toast({
          title: "Produto não encontrado",
          description: `O produto "${suggestion.name}" não foi encontrado no catálogo. Verifique se a empresa está selecionada.`,
          variant: "destructive",
        });
        return false;
      }

      const alreadyAdded = templateItems.some(ti => ti.product_id === catalogItem.id && ti.item_type === 'product');
      if (alreadyAdded) {
        toast({
          title: t('quoteTemplateEditor.toast.itemAlreadyAdded'),
          description: t('quoteTemplateEditor.toast.itemAlreadyAddedDesc'),
          variant: "destructive",
        });
        return false;
      }

      const newItem: TemplateItem = {
        product_id: catalogItem.id,
        item_type: 'product',
        default_qt: suggestion.quantity || 1,
        required: false,
        ordem: templateItems.length,
        catalog_item: catalogItem,
      };

      setTemplateItems(prev => [...prev, newItem]);
      setItemsTab("products");
      console.log("AI: Product added:", catalogItem.name, "Total items:", templateItems.length + 1);
      return true;
    }

    // Services
    console.log("Available catalog services:", catalogServices.length, catalogServices.map(i => ({ id: i.id, name: i.name })).slice(0, 10));

    // Try multiple matching strategies for services
    let catalogService = catalogServices.find(item => item.id === suggestion.product_id);

    if (!catalogService) {
      catalogService = catalogServices.find(item => normalizeText(item.name) === searchName);
    }

    if (!catalogService) {
      catalogService = catalogServices.find(item => {
        const itemName = normalizeText(item.name);
        return itemName.includes(searchName) || searchName.includes(itemName);
      });
    }

    if (!catalogService) {
      catalogService = catalogServices.find(item => {
        const itemWords = normalizeText(item.name).split(/\s+/).filter(w => w.length > 2);
        const matchingWords = searchWords.filter(sw => itemWords.some(iw => iw.includes(sw) || sw.includes(iw)));
        return matchingWords.length >= 2 || (searchWords.length === 1 && matchingWords.length === 1);
      });
    }

    if (!catalogService) {
      console.log("AI: Service not found. Search name:", searchName, "Available services:", catalogServices.map(i => i.name).slice(0, 10));
      toast({
        title: "Serviço não encontrado",
        description: `O serviço "${suggestion.name}" não foi encontrado no catálogo. Verifique se a empresa está selecionada.`,
        variant: "destructive",
      });
      return false;
    }

    const alreadyAdded = templateItems.some(ti => ti.service_id === catalogService.id && ti.item_type === 'service');
    if (alreadyAdded) {
      toast({
        title: t('quoteTemplateEditor.toast.serviceAlreadyAdded'),
        description: t('quoteTemplateEditor.toast.serviceAlreadyAddedDesc'),
        variant: "destructive",
      });
      return false;
    }

    const newItem: TemplateItem = {
      service_id: catalogService.id,
      item_type: 'service',
      default_qt: suggestion.quantity || 1,
      required: false,
      ordem: templateItems.length,
      catalog_item: catalogService,
    };

    setTemplateItems(prev => [...prev, newItem]);
    setItemsTab("services");
    console.log("AI: Service added:", catalogService.name, "Total items:", templateItems.length + 1);
    return true;
  };

  // Helper functions for item management
  const confirmDeleteItem = (itemId: string, itemType: 'product' | 'service' | 'bundle', name: string) => {
    setItemToDelete({ id: itemId, type: itemType, name });
  };

  const removeItem = () => {
    if (!itemToDelete) return;
    setTemplateItems(templateItems.filter(item => {
      if (itemToDelete.type === 'product') {
        return !(item.product_id === itemToDelete.id && item.item_type === 'product');
      } else if (itemToDelete.type === 'service') {
        return !(item.service_id === itemToDelete.id && item.item_type === 'service');
      } else {
        return !(item.bundle_id === itemToDelete.id && item.item_type === 'bundle');
      }
    }));
    setItemToDelete(null);
    toast({ title: "Item removido", description: `"${itemToDelete.name}" foi removido do modelo.` });
  };

  const openAttributesDialog = (productId: string, productName: string, currentAttributes: Record<string, any>) => {
    setEditingAttributesItem({
      productId,
      itemKey: productId,
      productName,
      currentAttributes: currentAttributes || {}
    });
    setAttributesDialogOpen(true);
  };

  const handleAttributesSave = (attributes: Record<string, any>, attributePriceAddon: number) => {
    if (!editingAttributesItem) return;
    setTemplateItems(prev => prev.map(item => {
      if (item.product_id === editingAttributesItem.productId && item.item_type === 'product') {
        return {
          ...item,
          default_attributes: attributes,
          attribute_price_addon: attributePriceAddon
        };
      }
      return item;
    }));
    setAttributesDialogOpen(false);
    setEditingAttributesItem(null);
    toast({ title: "Atributos atualizados", description: "Os atributos padrão foram guardados." });
  };

  const openBundleChoiceDialog = (bundleId: string, bundleName: string, defaultAttrs: Record<string, any>) => {
    setEditingBundleChoice({
      bundleId,
      bundleName,
      currentConfig: defaultAttrs?.bundle_choice_config || null,
    });
    setBundleChoiceDialogOpen(true);
  };

  const handleBundleChoiceSave = (config: any) => {
    if (!editingBundleChoice) return;
    setTemplateItems(prev => prev.map(item => {
      if (item.bundle_id === editingBundleChoice.bundleId && item.item_type === 'bundle') {
        return {
          ...item,
          default_attributes: {
            ...(item.default_attributes || {}),
            bundle_choice_config: config,
          },
        };
      }
      return item;
    }));
    setBundleChoiceDialogOpen(false);
    setEditingBundleChoice(null);
    toast({ title: "Escolhas configuradas", description: "As seleções do bundle foram guardadas." });
  };

  // Helper to count configured attributes
  const countConfiguredAttributes = (attrs?: Record<string, any>): number => {
    if (!attrs) return 0;
    return Object.values(attrs).filter(a => a?.value !== undefined && a.value !== '' && a.value !== null).length;
  };

  const getItemId = (item: TemplateItem, itemType: string): string => {
    if (itemType === 'product') return item.product_id!;
    if (itemType === 'service') return item.service_id!;
    return item.bundle_id!;
  };

  const moveItemUp = (itemId: string, itemType: 'product' | 'service' | 'bundle') => {
    const sameTypeItems = templateItems.filter(i => i.item_type === itemType);
    const index = sameTypeItems.findIndex(item => getItemId(item, itemType) === itemId);
    if (index <= 0) return;
    const newItems = [...sameTypeItems];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    newItems.forEach((item, i) => item.ordem = i);
    setTemplateItems([...templateItems.filter(i => i.item_type !== itemType), ...newItems]);
  };

  const moveItemDown = (itemId: string, itemType: 'product' | 'service' | 'bundle') => {
    const sameTypeItems = templateItems.filter(i => i.item_type === itemType);
    const index = sameTypeItems.findIndex(item => getItemId(item, itemType) === itemId);
    if (index < 0 || index >= sameTypeItems.length - 1) return;
    const newItems = [...sameTypeItems];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    newItems.forEach((item, i) => item.ordem = i);
    setTemplateItems([...templateItems.filter(i => i.item_type !== itemType), ...newItems]);
  };

  // Filter items by type
  const productItems = templateItems.filter(item => item.item_type === 'product').sort((a, b) => a.ordem - b.ordem);
  const serviceItems = templateItems.filter(item => item.item_type === 'service').sort((a, b) => a.ordem - b.ordem);
  const bundleItems = templateItems.filter(item => item.item_type === 'bundle').sort((a, b) => a.ordem - b.ordem);

  // Calculate totals
 const productTotal = productItems.reduce((sum, item) => {
   const unitPrice = (item.catalog_item?.retail_price || 0) + (item.attribute_price_addon || 0);
   return sum + (unitPrice * item.default_qt);
 }, 0);
 const serviceTotal = serviceItems.reduce((sum, item) => {
   const unitPrice = (item.catalog_item?.retail_price || 0);
   return sum + (unitPrice * item.default_qt);
 }, 0);
  const calcBundleUnitPrice = (item: TemplateItem) => {
    const basePrice = item.bundle_catalog_item?.calculated_price || item.bundle_catalog_item?.fixed_price || 0;
    const components = item.bundle_catalog_item?.components || [];
    const choiceConfig = item.default_attributes?.bundle_choice_config as { choice_selections?: Record<string, string[]>; component_attributes?: Record<string, any> } | undefined;
    const selectedChoiceIds = new Set(Object.values(choiceConfig?.choice_selections || {}).flat());
    const selectedChoiceTotal = components
      .filter(c => c.choice_group_id && selectedChoiceIds.has(c.id))
      .reduce((s, c) => {
        const attrAddon = choiceConfig?.component_attributes?.[c.id]?.price_addon || 0;
        return s + (c.unit_price + attrAddon) * c.quantity;
      }, 0);
    // Also add attribute add-ons for fixed components
    const fixedAttrAddon = components
      .filter(c => !c.is_optional && !c.choice_group_id)
      .reduce((s, c) => {
        const addon = choiceConfig?.component_attributes?.[c.id]?.price_addon || 0;
        return s + addon * c.quantity;
      }, 0);
    return basePrice + selectedChoiceTotal + fixedAttrAddon;
  };
  const bundleTotal = bundleItems.reduce((sum, item) => {
    return sum + (calcBundleUnitPrice(item) * item.default_qt);
  }, 0);
  const totalPrice = productTotal + serviceTotal + bundleTotal;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('quoteTemplateEditor.back')}
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">
              {templateId ? t('quoteTemplateEditor.editTemplate') : t('quoteTemplateEditor.newTemplate')}
            </h1>
          </div>
          <Button onClick={handleSave} disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {t('quoteTemplateEditor.save')}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('quoteTemplateEditor.templateInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className={cn("flex items-center gap-1", !formData.name && "text-destructive")}>
                  {t('quoteTemplateEditor.form.name')}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t('quoteTemplateEditor.form.namePlaceholder')}
                  className={cn(!formData.name && "border-destructive")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="codigo" className={cn("flex items-center gap-1", !formData.codigo && "text-destructive")}>
                  {t('quoteTemplateEditor.form.code')}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="codigo"
                  value={formData.codigo}
                  onChange={(e) =>
                    setFormData({ ...formData, codigo: e.target.value })
                  }
                  placeholder={t('quoteTemplateEditor.form.codePlaceholder')}
                  className={cn(!formData.codigo && "border-destructive")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('quoteTemplateEditor.form.description')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t('quoteTemplateEditor.form.descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('quoteTemplateEditor.form.company')}</Label>
                <Select
                  value={formData.organization_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, organization_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('quoteTemplateEditor.form.selectCompany')} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, active: checked })
                  }
                />
                <Label htmlFor="active">{t('quoteTemplateEditor.form.activeTemplate')}</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('quoteTemplateEditor.addCatalogItems')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="products" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="products">{t('quoteTemplateEditor.tabs.saleProducts')}</TabsTrigger>
                  <TabsTrigger value="services">{t('quoteTemplateEditor.tabs.saleServices')}</TabsTrigger>
                  <TabsTrigger value="bundles" className="gap-1"><Layers className="h-3.5 w-3.5" />Bundles</TabsTrigger>
                </TabsList>
                
                <TabsContent value="products" className="space-y-4">
                  {/* Search bar for products */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('quoteTemplateEditor.searchProducts') || "Pesquisar produtos..."}
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {/* Filters */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('quoteTemplateEditor.filterByCategory')}</Label>
                      <Select value={selectedProductCategory} onValueChange={(val) => {
                        setSelectedProductCategory(val);
                        setSelectedProductSubcategory("all");
                      }}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-[9999] border shadow-lg">
                          <SelectItem value="all">{t('quoteTemplateEditor.all')}</SelectItem>
                          {productCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('quoteTemplateEditor.filterBySubcategory') || "Subcategoria"}</Label>
                      <Select value={selectedProductSubcategory} onValueChange={setSelectedProductSubcategory}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-[9999] border shadow-lg">
                          <SelectItem value="all">{t('quoteTemplateEditor.all')}</SelectItem>
                          {productSubcategories.map(subcat => (
                            <SelectItem key={subcat} value={subcat}>
                              {subcat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('quoteTemplateEditor.filterByBrand') || "Marca"}</Label>
                      <Select value={selectedProductBrand} onValueChange={setSelectedProductBrand}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-[9999] border shadow-lg">
                          <SelectItem value="all">{t('quoteTemplateEditor.all')}</SelectItem>
                          {productBrands.map(brand => (
                            <SelectItem key={brand} value={brand}>
                              {brand}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Results count */}
                  <p className="text-xs text-muted-foreground">
                    {filteredProducts.length} {t('quoteTemplateEditor.resultsFound') || "resultados"}
                  </p>

                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {filteredProducts.map(item => {
                      const isAdded = templateItems.some(
                        ti => ti.product_id === item.id && ti.item_type === 'product'
                      );
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 p-2 border rounded hover:bg-muted"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.name}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                {item.category_name || '-'}
                              </p>
                              {item.retail_price && (
                                <span className="text-xs font-semibold text-primary">
                                  €{item.retail_price.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(`/products?edit=${item.id}`, '_blank')}
                                title="Editar produto"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={isAdded ? "secondary" : "default"}
                              onClick={() => addProductItem(item.id)}
                              disabled={isAdded}
                            >
                              {isAdded ? t('quoteTemplateEditor.added') : <Plus className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="services" className="space-y-4">
                  {/* Search bar for services */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('quoteTemplateEditor.searchServices') || "Pesquisar serviços..."}
                      value={serviceSearchTerm}
                      onChange={(e) => setServiceSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {/* Category and Subcategory filters */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('quoteTemplateEditor.filterByCategory')}</Label>
                      <Select value={selectedServiceCategory} onValueChange={(val) => {
                        setSelectedServiceCategory(val);
                        setSelectedServiceSubcategory("all");
                      }}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-[9999] border shadow-lg">
                          <SelectItem value="all">{t('quoteTemplateEditor.all')}</SelectItem>
                          {serviceCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('quoteTemplateEditor.filterBySubcategory') || "Subcategoria"}</Label>
                      <Select value={selectedServiceSubcategory} onValueChange={setSelectedServiceSubcategory}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-[9999] border shadow-lg">
                          <SelectItem value="all">{t('quoteTemplateEditor.all')}</SelectItem>
                          {serviceSubcategories.map(subcat => (
                            <SelectItem key={subcat} value={subcat}>
                              {subcat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Results count */}
                  <p className="text-xs text-muted-foreground">
                    {filteredServices.length} {t('quoteTemplateEditor.resultsFound') || "resultados"}
                  </p>

                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {filteredServices.map(item => {
                      const isAdded = templateItems.some(
                        ti => ti.service_id === item.id && ti.item_type === 'service'
                      );
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 p-2 border rounded hover:bg-muted"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.name}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                {item.category_name || '-'}
                              </p>
                              {item.retail_price && (
                                <span className="text-xs font-semibold text-primary">
                                  €{item.retail_price.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(`/services?edit=${item.id}`, '_blank')}
                                title="Editar serviço"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={isAdded ? "secondary" : "default"}
                              onClick={() => addServiceItem(item.id)}
                              disabled={isAdded}
                            >
                              {isAdded ? t('quoteTemplateEditor.added') : <Plus className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="bundles" className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Pesquisar bundles..."
                      value={bundleSearchTerm}
                      onChange={(e) => setBundleSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    {filteredBundles.length} resultados
                  </p>

                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {filteredBundles.map(bundle => {
                      const isAdded = templateItems.some(
                        ti => ti.bundle_id === bundle.id && ti.item_type === 'bundle'
                      );
                      return (
                        <div
                          key={bundle.id}
                          className="flex items-center justify-between gap-2 p-2 border rounded hover:bg-muted"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                              <p className="text-sm font-medium truncate">
                                {bundle.name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-5">
                              <span className="text-[10px] text-muted-foreground font-mono">{bundle.sku}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {bundle.component_count} componentes
                              </Badge>
                              {bundle.fixed_price && (
                                <span className="text-xs font-semibold text-primary">
                                  €{bundle.fixed_price.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={isAdded ? "secondary" : "default"}
                            onClick={() => addBundleItem(bundle.id)}
                            disabled={isAdded}
                          >
                            {isAdded ? t('quoteTemplateEditor.added') : <Plus className="h-4 w-4" />}
                          </Button>
                        </div>
                      );
                    })}
                    {filteredBundles.length === 0 && (
                      <p className="text-center text-muted-foreground py-4 text-sm">
                        Nenhum bundle encontrado
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* AI Assistant */}
        <Card className="overflow-hidden">
          <QuoteAIAssistant onAddSuggestion={handleAISuggestion} />
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {t('quoteTemplateEditor.templateItemsCount', { count: templateItems.length })}
            </CardTitle>
            {totalPrice > 0 && (
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Euro className="h-5 w-5 text-muted-foreground" />
                <span>Total: €{totalPrice.toFixed(2)}</span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {templateItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {t('quoteTemplateEditor.empty')}
              </p>
            ) : (
              <Tabs value={itemsTab} onValueChange={(v) => setItemsTab(v as "products" | "services" | "bundles")}>
                <TabsList className="mb-4">
                  <TabsTrigger value="products">
                    {t('quoteTemplateEditor.table.product')}s ({productItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="services">
                    {t('quoteTemplateEditor.table.service')}s ({serviceItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="bundles">
                    Bundles ({bundleItems.length})
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="products">
                  {productItems.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">Nenhum produto adicionado</p>
                  ) : (
                    <>
                      <div className="flex justify-end mb-2 text-sm font-medium">
                        Subtotal Produtos: €{productTotal.toFixed(2)}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">Ordem</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.category')}</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.description')}</TableHead>
                            <TableHead className="text-right">Preço Unit.</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.defaultQt')}</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.required')}</TableHead>
                            <TableHead className="text-right">{t('quoteTemplateEditor.table.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {productItems.map((item, index) => {
                            const itemId = item.product_id!;
                            const unitPrice = item.catalog_item?.retail_price || 0;
                           const totalUnitPrice = unitPrice + (item.attribute_price_addon || 0);
                           const subtotal = totalUnitPrice * item.default_qt;
                            
                            return (
                              <TableRow key={`product-${itemId}`}>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      disabled={index === 0}
                                      onClick={() => moveItemUp(itemId, 'product')}
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      disabled={index === productItems.length - 1}
                                      onClick={() => moveItemDown(itemId, 'product')}
                                    >
                                      ↓
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{item.catalog_item?.category_name || '-'}</Badge>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <span>{item.catalog_item?.name || '-'}</span>
                                    {countConfiguredAttributes(item.default_attributes) > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {Object.entries(item.default_attributes || {}).filter(([key, a]: [string, any]) => key !== 'bundle_choice_config' && a?.value !== undefined && a.value !== '' && a.value !== null).map(([key, attr]: [string, any]) => (
                                          <Badge key={key} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                                            {attr.label || key}: {String(attr.value)}{attr.unit ? ` ${attr.unit}` : ''}{attr.price_addon ? ` (+€${Number(attr.price_addon).toFixed(2)})` : ''}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                 {totalUnitPrice > 0 ? `€${totalUnitPrice.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.default_qt}
                                    onChange={(e) => updateItem(itemId, 'product', "default_qt", parseFloat(e.target.value) || 0)}
                                    className="w-24"
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold text-primary">
                                  {subtotal > 0 ? `€${subtotal.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell>
                                  <Switch
                                    checked={item.required}
                                    onCheckedChange={(checked) => updateItem(itemId, 'product', "required", checked)}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openAttributesDialog(
                                              itemId,
                                              item.catalog_item?.name || 'Produto',
                                              item.default_attributes || {}
                                            )}
                                            className="relative"
                                          >
                                            <Tag className="h-4 w-4" />
                                            {countConfiguredAttributes(item.default_attributes) > 0 && (
                                              <span className="absolute -top-1 -right-1 h-4 w-4 text-[10px] bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                                                {countConfiguredAttributes(item.default_attributes)}
                                              </span>
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Configurar atributos padrão</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => confirmDeleteItem(itemId, 'product', item.catalog_item?.name || 'Item')}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </TabsContent>
                
                <TabsContent value="services">
                  {serviceItems.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">Nenhum serviço adicionado</p>
                  ) : (
                    <>
                      <div className="flex justify-end mb-2 text-sm font-medium">
                        Subtotal Serviços: €{serviceTotal.toFixed(2)}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">Ordem</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.category')}</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.description')}</TableHead>
                            <TableHead className="text-right">Preço Unit.</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.defaultQt')}</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.required')}</TableHead>
                            <TableHead className="text-right">{t('quoteTemplateEditor.table.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {serviceItems.map((item, index) => {
                            const itemId = item.service_id!;
                            const unitPrice = item.catalog_item?.retail_price || 0;
                            const subtotal = unitPrice * item.default_qt;
                            
                            return (
                              <TableRow key={`service-${itemId}`}>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      disabled={index === 0}
                                      onClick={() => moveItemUp(itemId, 'service')}
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      disabled={index === serviceItems.length - 1}
                                      onClick={() => moveItemDown(itemId, 'service')}
                                    >
                                      ↓
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{item.catalog_item?.category_name || '-'}</Badge>
                                </TableCell>
                                <TableCell>{item.catalog_item?.name || '-'}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {unitPrice > 0 ? `€${unitPrice.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.default_qt}
                                    onChange={(e) => updateItem(itemId, 'service', "default_qt", parseFloat(e.target.value) || 0)}
                                    className="w-24"
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold text-primary">
                                  {subtotal > 0 ? `€${subtotal.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell>
                                  <Switch
                                    checked={item.required}
                                    onCheckedChange={(checked) => updateItem(itemId, 'service', "required", checked)}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => confirmDeleteItem(itemId, 'service', item.catalog_item?.name || 'Item')}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="bundles">
                  {bundleItems.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">Nenhum bundle adicionado</p>
                  ) : (
                    <>
                      <div className="flex justify-end mb-2 text-sm font-medium">
                        Subtotal Bundles: €{bundleTotal.toFixed(2)}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">Ordem</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.description')}</TableHead>
                            <TableHead className="text-right">Preço</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.defaultQt')}</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                            <TableHead>{t('quoteTemplateEditor.table.required')}</TableHead>
                            <TableHead className="text-right">{t('quoteTemplateEditor.table.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bundleItems.map((item, index) => {
                            const itemId = item.bundle_id!;
                            const unitPrice = calcBundleUnitPrice(item);
                            const subtotal = unitPrice * item.default_qt;
                            const isExpanded = expandedBundles.has(itemId);
                            const components = item.bundle_catalog_item?.components || [];
                            const fixedComponents = components.filter(c => !c.is_optional && !c.choice_group_id);
                            const choiceConfig = item.default_attributes?.bundle_choice_config as { choice_selections?: Record<string, string[]>; component_attributes?: Record<string, any> } | undefined;
                            const selectedChoiceIds = new Set(Object.values(choiceConfig?.choice_selections || {}).flat());
                            const selectedChoiceComponents = components.filter(c => c.choice_group_id && selectedChoiceIds.has(c.id));
                            const allDisplayComponents = [...fixedComponents, ...selectedChoiceComponents];
                            
                            return (
                              <React.Fragment key={`bundle-group-${itemId}`}>
                                <TableRow className="cursor-pointer" onClick={() => {
                                  setExpandedBundles(prev => {
                                    const next = new Set(prev);
                                    if (next.has(itemId)) next.delete(itemId);
                                    else next.add(itemId);
                                    return next;
                                  });
                                }}>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      disabled={index === 0}
                                      onClick={(e) => { e.stopPropagation(); moveItemUp(itemId, 'bundle'); }}
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      disabled={index === bundleItems.length - 1}
                                      onClick={(e) => { e.stopPropagation(); moveItemDown(itemId, 'bundle'); }}
                                    >
                                      ↓
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {item.bundle_catalog_item?.sku || '-'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Layers className="h-3.5 w-3.5 text-primary" />
                                    <span className="font-medium">{item.bundle_catalog_item?.name || '-'}</span>
                                    <Badge variant="secondary" className="text-[10px]">
                                      {allDisplayComponents.length} itens
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {unitPrice > 0 ? `€${unitPrice.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.default_qt}
                                    onChange={(e) => updateItem(itemId, 'bundle', "default_qt", parseFloat(e.target.value) || 0)}
                                    className="w-24"
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold text-primary">
                                  {subtotal > 0 ? `€${subtotal.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Switch
                                    checked={item.required}
                                    onCheckedChange={(checked) => updateItem(itemId, 'bundle', "required", checked)}
                                  />
                                </TableCell>
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex justify-end gap-1">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openBundleChoiceDialog(
                                              itemId,
                                              item.bundle_catalog_item?.name || 'Bundle',
                                              item.default_attributes || {}
                                            )}
                                            className="relative"
                                          >
                                            <Layers className="h-4 w-4" />
                                            {item.default_attributes?.bundle_choice_config && (
                                              <span className="absolute -top-1 -right-1 h-4 w-4 text-[10px] bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                                                ✓
                                              </span>
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Configurar escolhas do bundle</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => confirmDeleteItem(itemId, 'bundle', item.bundle_catalog_item?.name || 'Bundle')}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {isExpanded && allDisplayComponents.length > 0 && (
                                allDisplayComponents.map((comp) => {
                                  const compName = comp.product_name || comp.service_name || '-';
                                  const isChoice = !!comp.choice_group_id;
                                  const attrConfig = choiceConfig?.component_attributes?.[comp.id];
                                  const attrAddon = attrConfig?.price_addon || 0;
                                  const compTotal = (comp.unit_price + attrAddon) * comp.quantity;
                                  
                                  return (
                                    <TableRow key={`bundle-comp-${comp.id}`} className="bg-muted/30 border-l-2 border-l-primary/20">
                                      <TableCell></TableCell>
                                      <TableCell>
                                        {comp.product_sku && (
                                          <span className="text-xs text-muted-foreground font-mono">{comp.product_sku}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div className="pl-4">
                                          <div className="flex items-center gap-2">
                                            {comp.product_id ? (
                                              <Package className="h-3 w-3 text-muted-foreground" />
                                            ) : (
                                              <Wrench className="h-3 w-3 text-muted-foreground" />
                                            )}
                                            <span className="text-sm">{compName}</span>
                                            {isChoice && (
                                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                                {comp.choice_group_name || 'Escolha'}
                                              </Badge>
                                            )}
                                          </div>
                                          {attrConfig?.attrs && Object.keys(attrConfig.attrs).length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1 ml-5">
                                              {Object.entries(attrConfig.attrs).map(([key, attr]: [string, any]) => (
                                                <Badge key={key} variant="secondary" className="text-[9px] px-1.5 py-0 font-normal">
                                                  {attr.label || key}: {String(attr.value)}{attr.unit ? ` ${attr.unit}` : ''}{attr.price_addon ? ` (+€${Number(attr.price_addon).toFixed(2)})` : ''}
                                                </Badge>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right text-sm text-muted-foreground">
                                        €{comp.unit_price.toFixed(2)}
                                        {attrAddon > 0 && <span className="text-xs"> +{attrAddon.toFixed(2)}</span>}
                                      </TableCell>
                                      <TableCell>
                                        <span className="text-sm text-muted-foreground ml-2">×{comp.quantity}</span>
                                      </TableCell>
                                      <TableCell className="text-right text-sm text-muted-foreground">
                                        €{compTotal.toFixed(2)}
                                      </TableCell>
                                      <TableCell></TableCell>
                                      <TableCell></TableCell>
                                    </TableRow>
                                  );
                                })
                              )}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar item?</AlertDialogTitle>
            <AlertDialogDescription>
              Tens a certeza que queres remover "{itemToDelete?.name}" do modelo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={removeItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Attributes Dialog */}
      {editingAttributesItem && (
        <LineAttributesDialog
          open={attributesDialogOpen}
          onOpenChange={(open) => {
            setAttributesDialogOpen(open);
            if (!open) setEditingAttributesItem(null);
          }}
          productId={editingAttributesItem.productId}
          productName={editingAttributesItem.productName}
          currentAttributes={editingAttributesItem.currentAttributes}
          onSave={handleAttributesSave}
        />
      )}

      {/* Bundle Choice Config Dialog */}
      {editingBundleChoice && (
        <BundleChoiceConfigDialog
          open={bundleChoiceDialogOpen}
          onOpenChange={(open) => {
            setBundleChoiceDialogOpen(open);
            if (!open) setEditingBundleChoice(null);
          }}
          bundleId={editingBundleChoice.bundleId}
          bundleName={editingBundleChoice.bundleName}
          currentConfig={editingBundleChoice.currentConfig}
          onSave={handleBundleChoiceSave}
        />
      )}
    </div>
  );
}
