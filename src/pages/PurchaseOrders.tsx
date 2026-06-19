import { useEffect, useState } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ShoppingCart, Pencil, Trash2, Download, Upload, Tag, X, FileDown } from "lucide-react";
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

type ProductCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_name: string | null;
  brand_name: string | null;
  supplier_id: string | null;
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
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();

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

  // Load products when company and supplier selection changes in the form
  useEffect(() => {
    const loadFormProducts = async () => {
      const companyId = organizationSelection.companyId;
      const supplierId = formData.supplier_id;

      console.log("Loading products for company:", companyId, "supplier:", supplierId);

      if (!companyId) {
        setProducts([]);
        return;
      }

      try {
        // Products can be linked either directly (products.organization_id) or via product_organizations
        const [companyProductsRes, directProductsRes] = await Promise.all([
          supabase.from("product_organizations").select("product_id").eq("organization_id", companyId),
          supabase.from("products").select("id").eq("organization_id", companyId).is("deleted_at", null),
        ]);

        if (companyProductsRes.error) throw companyProductsRes.error;
        if (directProductsRes.error) throw directProductsRes.error;

        const junctionProductIds = companyProductsRes.data?.map((p: any) => p.product_id) || [];
        const directProductIds = directProductsRes.data?.map((p: any) => p.id) || [];
        const companyProductIds = [...new Set([...junctionProductIds, ...directProductIds])];

        if (companyProductIds.length === 0) {
          setProducts([]);
          return;
        }

        // Only purchasable products AND with supplier associated
        let query = supabase
          .from("products")
          .select(
            `
              id,
              sku,
              name,
              description,
              supplier_id,
              product_categories!category_id(name),
              brands(name)
            `
          )
          .eq("is_active", true)
          .eq("is_purchasable", true)
          .is("deleted_at", null)
          .not("supplier_id", "is", null)
          .in("id", companyProductIds);

        // Filter by supplier if selected (strict match)
        if (supplierId) {
          query = query.eq("supplier_id", supplierId);
        }

        const { data: productsData, error } = await query;
        if (error) throw error;

        // Fetch product purchase prices
        const productIds = productsData?.map((p: any) => p.id) || [];
        const { data: productPrices } = productIds.length
          ? await supabase
              .from("product_prices")
              .select("product_id, price, vat_rate")
              .eq("price_type", "purchase")
              .in("product_id", productIds)
          : { data: [] as any[] };

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
            supplier_id: product.supplier_id,
            category_name: product.product_categories?.name || null,
            brand_name: product.brands?.name || null,
            purchase_price: priceInfo?.price ?? null,
            vat_rate: priceInfo?.vat_rate ?? 23,
          };
        });

        console.log("Loaded products:", mappedProducts.length);
        setProducts(mappedProducts);
      } catch (error: any) {
        console.error("Error loading products:", error);
        setProducts([]);
      }
    };

    loadFormProducts();
  }, [organizationSelection.companyId, formData.supplier_id]);

  useEffect(() => {
    if (activeCompany?.id) {
      setLoading(true);
      loadData();
    }
  }, [activeCompany?.id]);

  const loadData = async () => {
    if (!activeCompany?.id) {
      console.log("loadData: No activeCompany");
      return;
    }

    try {
      const companyId = activeCompany.id;
      console.log("loadData: Loading purchase orders for company:", companyId, activeCompany.name);

      const [
        ordersRes,
        suppliersRes,
        companyProductsRes,
        directProductsRes,
        servicesRes,
      ] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("*, suppliers(name)")
          .eq("organization_id", companyId)
          .order("created_at", { ascending: false }),
        supabase.from("suppliers").select("id, name").eq("organization_id", companyId),
        supabase.from("product_organizations").select("product_id").eq("organization_id", companyId),
        supabase.from("products").select("id").eq("organization_id", companyId).is("deleted_at", null),
        supabase
          .from("services")
          .select(`
            id,
            sku,
            name,
            short_desc,
            supplier_id,
            service_categories:service_category_id(name)
          `)
          .eq("is_active", true)
          .eq("organization_id", companyId),
      ]);

      console.log("loadData: Orders response:", ordersRes.data, ordersRes.error);

      if (ordersRes.error) throw ordersRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (companyProductsRes.error) throw companyProductsRes.error;
      if (directProductsRes.error) throw directProductsRes.error;
      if (servicesRes.error) throw servicesRes.error;

      setOrders((ordersRes.data as PurchaseOrder[]) || []);
      setSuppliers(suppliersRes.data || []);

      // Load products: organization_id OR product_organizations
      const junctionProductIds = companyProductsRes.data?.map((p: any) => p.product_id) || [];
      const directProductIds = directProductsRes.data?.map((p: any) => p.id) || [];
      const companyProductIds = [...new Set([...junctionProductIds, ...directProductIds])];

      let productsData: any[] = [];
      if (companyProductIds.length > 0) {
        const productsRes = await supabase
          .from("products")
          .select(`
            id,
            sku,
            name,
            description,
            supplier_id,
            product_categories!category_id(name),
            brands(name)
          `)
          .eq("is_active", true)
          .eq("is_purchasable", true)
          .is("deleted_at", null)
          .not("supplier_id", "is", null)
          .in("id", companyProductIds);

        if (productsRes.error) throw productsRes.error;
        productsData = productsRes.data || [];
      }

      // Fetch product prices
      const productIds = productsData?.map((p: any) => p.id) || [];
      const { data: productPrices } = productIds.length
        ? await supabase
            .from("product_prices")
            .select("product_id, price, vat_rate")
            .eq("price_type", "purchase")
            .in("product_id", productIds)
        : { data: [] as any[] };

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
          supplier_id: product.supplier_id,
          category_name: product.product_categories?.name || null,
          brand_name: product.brands?.name || null,
          purchase_price: priceInfo?.price || null,
          vat_rate: priceInfo?.vat_rate || 23,
        };
      });

      setProducts(mappedProducts);

      // Fetch product attributes
      await fetchProductAttributes();

      // Fetch service prices
      const serviceIds = servicesRes.data?.map((s: any) => s.id) || [];
      const { data: servicePrices } = serviceIds.length
        ? await supabase
            .from("service_prices")
            .select("service_id, price, vat_rate")
            .eq("price_type", "purchase")
            .in("service_id", serviceIds)
        : { data: [] as any[] };

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
          supplier_id: service.supplier_id,
          category_name: service.service_categories?.name || null,
          brand_name: null,
          purchase_price: priceInfo?.price || null,
          vat_rate: priceInfo?.vat_rate || 23,
        };
      });

      setServices(mappedServices);
    } catch (error: any) {
      toast({
        title: t('purchaseOrders.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProductAttributes = async () => {
    try {
      // Get all products with their categories
      const { data: productsData } = await supabase
        .from("products")
        .select("id, category_id")
        .eq("is_active", true);

      if (!productsData) return;

      // Get unique category IDs
      const categoryIds = [...new Set(productsData.map(p => p.category_id).filter(Boolean))];

      if (categoryIds.length === 0) {
        return;
      }

      // Get attributes for these categories
      const { data: categoryAttrs } = await supabase
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
      const { error } = await supabase.from("purchase_orders").delete().eq("id", id);

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

  const getAvailableItems = () => {
    if (!formData.supplier_id) return [];
    
    if (selectedItemType === 'product') {
      return products.filter(p => p.supplier_id === formData.supplier_id);
    } else {
      return services.filter(s => s.supplier_id === formData.supplier_id);
    }
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

      const orderData = {
        supplier_id: formData.supplier_id,
        order_date: formData.order_date,
        expected_delivery: formData.expected_delivery || null,
        status: formData.status,
        total_value: total,
        notes: formData.notes || null,
      };

      if (editingId) {
        // Update order
        const { error: orderError } = await supabase
          .from("purchase_orders")
          .update(orderData)
          .eq("id", editingId);

        if (orderError) throw orderError;

        // Delete existing items
        await supabase
          .from("purchase_order_items")
          .delete()
          .eq("purchase_order_id", editingId);

        // Insert new items
        const itemsToInsert = orderItems.map(item => ({
          purchase_order_id: editingId,
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

        const { error: itemsError } = await supabase
          .from("purchase_order_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: t('purchaseOrders.toast.updateSuccess'),
        });
      } else {
        const companyId = organizationSelection.companyId || activeCompany?.id;
        if (!companyId) throw new Error("No company selected");

        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) {
          toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
          return;
        }
        
        // Create order - order_number will be auto-generated by trigger (empty string triggers auto-generation)
        const { data: newOrder, error: orderError } = await supabase
          .from("purchase_orders")
          .insert([{
            order_number: "", // Will be auto-generated by trigger
            supplier_id: orderData.supplier_id,
            order_date: orderData.order_date,
            expected_delivery: orderData.expected_delivery,
            status: orderData.status,
            total_value: orderData.total_value,
            notes: orderData.notes,
            organization_id: companyId,
            created_by: businessUserId,
          }])
          .select()
          .single();

        if (orderError) throw orderError;

        // Insert items
        const itemsToInsert = orderItems.map(item => ({
          purchase_order_id: newOrder.id,
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

        const { error: itemsError } = await supabase
          .from("purchase_order_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

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
      received: "bg-success/10 text-success",
      cancelled: "bg-destructive/10 text-destructive",
    };
    return colors[status] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('purchaseOrders.status.pending'),
      ordered: t('purchaseOrders.status.ordered'),
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

      const ordersToInsert = parsePurchaseOrdersCSV(text, suppliers, businessUserId, activeCompany.id);

      if (ordersToInsert.length === 0) {
        throw new Error(t('purchaseOrders.toast.noValidOrders'));
      }

      const { error } = await supabase.from("purchase_orders").insert(ordersToInsert);

      if (error) throw error;

      toast({
        title: t('purchaseOrders.toast.importSuccess', { count: ordersToInsert.length }),
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
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order_date">{t('purchaseOrders.form.orderDate')} *</Label>
                      <Input
                        id="order_date"
                        type="date"
                        value={formData.order_date}
                        onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                        required
                      />
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
                          <SelectItem value="ordered">{t('purchaseOrders.status.ordered')}</SelectItem>
                          <SelectItem value="received">{t('purchaseOrders.status.received')}</SelectItem>
                          <SelectItem value="cancelled">{t('purchaseOrders.status.cancelled')}</SelectItem>
                        </SelectContent>
                      </Select>
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
                        <Button variant="ghost" size="icon" onClick={() => handleGeneratePDF(order.id)} title="Gerar PDF">
                          <FileDown className="w-4 h-4" />
                        </Button>
                        <PermissionGate permission="purchase_orders.edit">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(order)}>
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
              {products.filter(p => p.supplier_id === formData.supplier_id).map((product) => (
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
              {services.filter(s => s.supplier_id === formData.supplier_id).map((service) => (
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
    </>
  );
};

export default PurchaseOrders;