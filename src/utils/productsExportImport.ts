import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

interface ProductExport {
  sku: string;
  name: string;
  description: string;
  barcode: string;
  status: string;
  category: string;
  subcategory: string;
  brand: string;
  supplier: string;
  product_type: string;
  company: string;
  vat_rate: number;
  purchase_price: number;
  retail_price: number;
  wholesale_price: number;
  distributor_price: number;
  promo_price: number;
  promo_from: string;
  promo_to: string;
  currency: string;
  attributes: string;
}

// CSV Headers - 22 columns aligned with export (Stock is read-only on import)
const CSV_HEADERS = [
  'SKU', 'Nome', 'Descrição', 'Código de Barras', 'Status',
  'Categoria', 'Subcategoria', 'Marca', 'Fornecedor', 'Tipo Produto',
  'Empresa', 'Taxa IVA', 'Preço Compra', 'Preço Venda',
  'Preço Grossista', 'Preço Distribuidor', 'Preço Promo',
  'Promo Início', 'Promo Fim', 'Moeda', 'Stock', 'Atributos'
];

// Helper to determine product type from flags
const getProductType = (product: any): string => {
  const isSellable = product.is_sellable !== false;
  const isPurchasable = product.is_purchasable === true;
  
  if (isSellable && isPurchasable) return 'ambos';
  if (isPurchasable) return 'compra';
  return 'venda';
};

// Export headers — full format (1 line per product, aligned with import template)
const EXPORT_HEADERS = [
  'SKU', 'Nome', 'Descrição', 'Código de Barras', 'Status',
  'Categoria', 'Subcategoria', 'Marca', 'Fornecedor', 'Tipo Produto',
  'Empresa', 'Taxa IVA', 'Preço Compra', 'Preço Venda',
  'Preço Grossista', 'Preço Distribuidor', 'Preço Promo',
  'Promo Início', 'Promo Fim', 'Moeda', 'Stock', 'Atributos'
];

const fmtDecimal = (v: number): string => (Number(v) || 0).toFixed(2).replace('.', ',');

const formatRangeValue = (range: any): string => {
  const infinity = '∞';
  const type = (range?.range_type ?? 'linear').toString().trim().toLowerCase();

  if (type === 'dimension3d') {
    return `${range.min_width ?? 0}x${range.min_height ?? 0}x${range.min_depth ?? 0} - ${range.max_width ?? infinity}x${range.max_height ?? infinity}x${range.max_depth ?? infinity}`;
  }

  if (type === 'dimension') {
    return `${range.min_width ?? 0}x${range.min_height ?? 0} - ${range.max_width ?? infinity}x${range.max_height ?? infinity}`;
  }

  return `${range.min_value ?? 0}-${range.max_value ?? infinity}`;
};

const resolveRangeRows = ({
  ranges,
  attributeId,
  productId,
  categoryId,
  parentCategoryId,
  organizationId,
}: {
  ranges: any[];
  attributeId: string;
  productId: string;
  categoryId?: string | null;
  parentCategoryId?: string | null;
  organizationId?: string;
}) => {
  const relevant = (ranges || []).filter((range: any) =>
    range.attribute_id === attributeId &&
    (!organizationId || !range.organization_id || range.organization_id === organizationId)
  );

  const sortRanges = (items: any[]) => [...items].sort((a, b) => {
    const aStart = Number(a.min_value ?? a.min_width ?? a.min_height ?? 0);
    const bStart = Number(b.min_value ?? b.min_width ?? b.min_height ?? 0);
    return aStart - bStart;
  });

  const productSpecific = relevant.filter((range: any) => range.product_id === productId);
  if (productSpecific.length > 0) return sortRanges(productSpecific);

  if (categoryId) {
    const categorySpecific = relevant.filter((range: any) => range.product_id == null && range.category_id === categoryId);
    if (categorySpecific.length > 0) return sortRanges(categorySpecific);
  }

  if (parentCategoryId) {
    const parentSpecific = relevant.filter((range: any) => range.product_id == null && range.category_id === parentCategoryId);
    if (parentSpecific.length > 0) return sortRanges(parentSpecific);
  }

  return sortRanges(relevant.filter((range: any) => range.product_id == null && range.category_id == null));
};

export const exportProductsToCSV = async (products: any[], organizationId?: string) => {
  const BOM = '\uFEFF';
  const productIds = products.map((p) => p.id).filter(Boolean);

  if (productIds.length === 0) {
    throw new Error('Não existem produtos para exportar');
  }

  const [{ data: exportProducts, error: productsError }, { data: allPrices, error: pricesError }, { data: rangePrices, error: rangePricesError }] = await Promise.all([
    (supabase.from('products') as any)
      .select(`
        id,
        sku,
        name,
        description,
        barcode,
        is_active,
        is_sellable,
        is_purchasable,
        category_id,
        organization_id,
        product_categories!category_id(id, name, parent_category:product_categories!parent_id(id, name)),
        subcategory:product_categories!subcategory_id(name),
        brands(name),
        suppliers(name),
        anew_organizations!organization_id(name),
        product_stock(qty_available),
        product_attribute_values(
          id,
          attribute_id,
          value_text,
          value_number,
          value_bool,
          product_attributes(id, label, code, pricing_type, value_type)
        )
      `)
      .in('id', productIds)
      .is('deleted_at', null),
    supabase
      .from('product_prices')
      .select('product_id, price_type, price, currency, vat_rate, price_promo, valid_from, valid_to')
      .in('product_id', productIds),
    supabase
      .from('product_attribute_price_ranges')
      .select('attribute_id, product_id, category_id, organization_id, min_value, max_value, min_width, max_width, min_height, max_height, min_depth, max_depth, price_per_unit, range_type')
      .or(`product_id.in.(${productIds.join(',')}),product_id.is.null`),
  ]);

  if (productsError) throw productsError;
  if (pricesError) throw pricesError;
  if (rangePricesError) throw rangePricesError;

  // Build price map: product_id -> { retail, purchase, wholesale, distributor, currency }
  const priceMap = new Map<string, { retail: number; purchase: number; wholesale: number; distributor: number; currency: string; vat_rate: number; promo_price: number; promo_from: string; promo_to: string }>();
  allPrices?.forEach((p: any) => {
    if (!priceMap.has(p.product_id)) {
      priceMap.set(p.product_id, { retail: 0, purchase: 0, wholesale: 0, distributor: 0, currency: 'EUR', vat_rate: 23, promo_price: 0, promo_from: '', promo_to: '' });
    }
    const entry = priceMap.get(p.product_id)!;
    if (p.price_type === 'retail') {
      entry.retail = Number(p.price) || 0;
      if (p.vat_rate != null) entry.vat_rate = Number(p.vat_rate);
      if (p.price_promo) entry.promo_price = Number(p.price_promo) || 0;
      if (p.valid_from) entry.promo_from = p.valid_from;
      if (p.valid_to) entry.promo_to = p.valid_to;
    }
    if (p.price_type === 'purchase') entry.purchase = Number(p.price) || 0;
    if (p.price_type === 'wholesale') entry.wholesale = Number(p.price) || 0;
    if (p.price_type === 'distributor') entry.distributor = Number(p.price) || 0;
    if (p.currency) entry.currency = p.currency;
  });

  const resolvedOptionsCache = new Map<string, any[]>();
  const rows: any[][] = [];

  for (const product of exportProducts || []) {
    const prices = priceMap.get(product.id) ?? { retail: 0, purchase: 0, wholesale: 0, distributor: 0, currency: 'EUR', vat_rate: 23, promo_price: 0, promo_from: '', promo_to: '' };
    const parentCategory = product.product_categories?.parent_category?.name ?? '';
    const categoryName = product.product_categories?.name ?? '';
    const categoria = parentCategory || categoryName;
    const subcategoria = parentCategory ? categoryName : (product.subcategory?.name ?? '');
    const stock = product.product_stock?.reduce((sum: number, item: any) => sum + (Number(item.qty_available) || 0), 0) ?? 0;

    const attrValues = product.product_attribute_values || [];
    const attrParts: string[] = [];

    for (const attrValue of attrValues) {
      const attr = attrValue.product_attributes;
      const attrId = attrValue.attribute_id ?? attr?.id;
      if (!attrId || !attr) continue;

      const pricingType = (attr.pricing_type ?? '').toString().trim().toLowerCase();
      const valueType = (attr.value_type ?? '').toString().trim().toLowerCase();
      const cacheKey = `${product.id}:${attrId}`;

      if (!resolvedOptionsCache.has(cacheKey)) {
        const { data, error } = await supabase.rpc('resolve_product_attribute_options', {
          p_product_id: product.id,
          p_attribute_id: attrId,
        });
        if (error) throw error;
        resolvedOptionsCache.set(cacheKey, data || []);
      }

      const resolvedOptions = resolvedOptionsCache.get(cacheKey) || [];
      const label = attr.label ?? attr.code ?? '';

      if ((pricingType === 'fixed' || pricingType === 'both' || valueType === 'list') && resolvedOptions.length > 0) {
        const activeOptions = resolvedOptions.filter((o: any) => o.is_available !== false);
        if (activeOptions.length > 0) {
          const optionTexts = activeOptions.map((option: any) => {
            const adj = Number(option.price_addon) || 0;
            const priceStr = adj !== 0 ? ` (${adj > 0 ? '+' : ''}${fmtDecimal(adj)}€)` : '';
            return `${option.value_text ?? ''}${priceStr}`;
          });
          attrParts.push(`${label}: ${optionTexts.join(', ')}`);
        }
        continue;
      }

      const resolvedRanges = resolveRangeRows({
        ranges: rangePrices || [],
        attributeId: attrId,
        productId: product.id,
        categoryId: product.category_id,
        parentCategoryId: product.product_categories?.parent_category?.id,
        organizationId,
      });

      if ((pricingType === 'range' || pricingType === 'both') && resolvedRanges.length > 0) {
        const rangeTexts = resolvedRanges.map((range: any) => {
          const adj = Number(range.price_per_unit) || 0;
          return `${formatRangeValue(range)} (${fmtDecimal(adj)}€/un)`;
        });
        attrParts.push(`${label}: ${rangeTexts.join(', ')}`);
        continue;
      }

      const rawValue = attrValue.value_text ?? attrValue.value_number ?? (attrValue.value_bool != null ? (attrValue.value_bool ? 'Sim' : 'Não') : '');
      if (rawValue !== '') {
        attrParts.push(`${label}: ${rawValue}`);
      }
    }

    const productType = getProductType(product);
    const status = product.is_active !== false ? 'active' : 'draft';

    rows.push([
      product.sku ?? '',
      product.name ?? '',
      product.description ?? '',
      product.barcode ?? '',
      status,
      categoria,
      subcategoria,
      product.brands?.name ?? '',
      product.suppliers?.name ?? '',
      productType,
      product.anew_organizations?.name ?? '',
      prices.vat_rate,
      prices.purchase,
      prices.retail,
      prices.wholesale,
      prices.distributor,
      prices.promo_price || '',
      prices.promo_from,
      prices.promo_to,
      prices.currency,
      stock,
      attrParts.join(' | '),
    ]);
  }

  const numericColumns = new Set([11, 12, 13, 14, 15, 16, 20]);
  downloadStandardXlsx({
    sheetName: "Produtos",
    columns: EXPORT_HEADERS.map((header, index) => ({
      key: `column_${index}`,
      header,
      type: numericColumns.has(index) ? "number" : "text",
      width: index === 2 || index === 21 ? 40 : index === 1 ? 30 : 18,
    })),
    rows: rows.map((row) =>
      Object.fromEntries(row.map((value, index) => [`column_${index}`, value])),
    ),
  }, `produtos_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const downloadProductsTemplate = () => {
  const exampleRow = [
    'SKU001', 'Produto Exemplo', 'Descrição do produto', '1234567890123',
    'draft', 'Categoria Principal', 'Subcategoria', 'Marca X', 'Fornecedor Y',
    'venda', 'Empresa Z', 23, 10.00, 15.00, 12.00, 11.00, '', '', '', 'EUR', '', '',
  ];

  const ws = XLSX.utils.aoa_to_sheet([CSV_HEADERS, exampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, `template_produtos_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export interface ParseProductsParams {
  text: string;
  categories: any[];
  subcategories: any[];
  brands: any[];
  suppliers: any[];
  companies: any[];
  userId: string;
  activeCompanyId?: string;
  existingProducts?: any[]; // For upsert logic (filtered by company, non-deleted)
  trashedSkuMap?: Map<string, any>; // For trash conflict detection
  signal?: AbortSignal;
}

export interface SkippedLine {
  line: number;
  sku: string;
  reason: string;
}

export interface ParsedProductsResult {
  productsToInsert: any[];
  productsToUpdate: any[];
  pricesToInsert: any[];
  pricesToUpdate: any[];
  companyAssociations: any[];
  skippedLines: SkippedLine[];
  warnings: string[];
  stats: {
    newCount: number;
    updateCount: number;
    skippedCount: number;
  };
}

export const parseProductsCSV = async ({
  text,
  categories,
  subcategories,
  brands,
  suppliers,
  companies,
  userId,
  activeCompanyId,
  existingProducts = [],
  trashedSkuMap = new Map(),
  signal,
}: ParseProductsParams): Promise<ParsedProductsResult> => {
  const CANCELLED_MESSAGE = "Importação cancelada";
  const checkCancelled = () => {
    if (signal?.aborted) throw new Error(CANCELLED_MESSAGE);
  };
  const yieldToUI = async () => {
    // Let the browser paint / respond (prevents UI freeze on large CSVs)
    await new Promise<void>((r) => setTimeout(r, 0));
  };

  checkCancelled();
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  // Robust normalization: trim, lowercase, strip diacritics
  const normalizeName = (v?: string | null) =>
    (v ?? '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

  // Caches para entidades criadas on-the-fly
  const _createdCategories = new Map<string, any>();
  const _createdSubcategories = new Map<string, any>();
  const _createdBrands = new Map<string, any>();
  const _createdSuppliers = new Map<string, any>();

  const resolvedActiveOrgId = activeCompanyId || null;

  const _slugify = (name: string) =>
    name.trim().toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Busca por nome filtrado pela org activa
  const _fetchByName = async (table: string, name: string, orgId: string): Promise<any | null> => {
    const { data } = await (supabase.from(table as any) as any)
      .select('*').ilike('name', name.trim()).eq('organization_id', orgId).limit(1);
    return data?.[0] ?? null;
  };

  const getOrCreateCategory = async (name: string, orgId?: string | null): Promise<any | null> => {
    if (!name.trim()) return null;
    const targetOrg = orgId || resolvedActiveOrgId;
    if (!targetOrg) return null;
    const key = `${normalizeName(name)}::${targetOrg}`;
    const local = (categories as any[]).find(c => normalizeName(c.name) === normalizeName(name) && c.organization_id === targetOrg);
    if (local) return local;
    if (_createdCategories.has(key)) return _createdCategories.get(key);
    const fromDb = await _fetchByName('product_categories', name, targetOrg);
    if (fromDb) { _createdCategories.set(key, fromDb); (categories as any[]).push(fromDb); return fromDb; }
    const slug = _slugify(name);
    const { data } = await (supabase.from('product_categories' as any) as any)
      .insert({ name: name.trim(), slug, path: slug, organization_id: targetOrg, created_by: userId }).select().limit(1);
    const created = data?.[0] ?? null;
    if (created) { _createdCategories.set(key, created); (categories as any[]).push(created); }
    return created;
  };

  const getOrCreateSubcategory = async (name: string, parentId: string | null, orgId?: string | null): Promise<any | null> => {
    if (!name.trim()) return null;
    const targetOrg = orgId || resolvedActiveOrgId;
    if (!targetOrg) return null;
    const key = `${normalizeName(name)}::${parentId ?? ''}::${targetOrg}`;
    const local = (subcategories as any[]).find(s => normalizeName(s.name) === normalizeName(name) && s.organization_id === targetOrg);
    if (local) return local;
    if (_createdSubcategories.has(key)) return _createdSubcategories.get(key);
    const fromDb = await _fetchByName('product_categories', name, targetOrg);
    if (fromDb) { _createdSubcategories.set(key, fromDb); (subcategories as any[]).push(fromDb); return fromDb; }
    const slug = _slugify(name);
    const { data } = await (supabase.from('product_categories' as any) as any)
      .insert({ name: name.trim(), slug, path: slug, parent_id: parentId || null, organization_id: targetOrg, created_by: userId }).select().limit(1);
    const created = data?.[0] ?? null;
    if (created) { _createdSubcategories.set(key, created); (subcategories as any[]).push(created); }
    return created;
  };

  const getOrCreateBrand = async (name: string, orgId?: string | null): Promise<any | null> => {
    if (!name.trim()) return null;
    const targetOrg = orgId || resolvedActiveOrgId;
    if (!targetOrg) return null;
    const key = `${normalizeName(name)}::${targetOrg}`;
    const local = (brands as any[]).find(b => normalizeName(b.name) === normalizeName(name) && b.organization_id === targetOrg);
    if (local) return local;
    if (_createdBrands.has(key)) return _createdBrands.get(key);
    const fromDb = await _fetchByName('brands', name, targetOrg);
    if (fromDb) { _createdBrands.set(key, fromDb); (brands as any[]).push(fromDb); return fromDb; }
    const { data } = await (supabase.from('brands' as any) as any)
      .insert({ name: name.trim(), organization_id: targetOrg }).select().limit(1);
    const created = data?.[0] ?? null;
    if (created) { _createdBrands.set(key, created); (brands as any[]).push(created); }
    return created;
  };

  const getOrCreateSupplier = async (name: string, orgId?: string | null): Promise<any | null> => {
    if (!name.trim()) return null;
    const targetOrg = orgId || resolvedActiveOrgId;
    if (!targetOrg) return null;
    const key = `${normalizeName(name)}::${targetOrg}`;
    const local = (suppliers as any[]).find(s => normalizeName(s.name) === normalizeName(name) && s.organization_id === targetOrg);
    if (local) return local;
    if (_createdSuppliers.has(key)) return _createdSuppliers.get(key);
    const fromDb = await _fetchByName('suppliers', name, targetOrg);
    if (fromDb) { _createdSuppliers.set(key, fromDb); (suppliers as any[]).push(fromDb); return fromDb; }
    const { data } = await (supabase.from('suppliers' as any) as any)
      .insert({ name: name.trim(), organization_id: targetOrg }).select().limit(1);
    const created = data?.[0] ?? null;
    if (created) { _createdSuppliers.set(key, created); (suppliers as any[]).push(created); }
    return created;
  };

  // Validate header by names (more informative than counting columns)
  const headerLine = lines[0];
  const headerCells = headerLine
    .split(';')
    .map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  const normalizedHeader = headerCells.map(normalizeName);

  // Required columns (Stock and Atributos are read-only and optional)
  const REQUIRED_HEADERS = CSV_HEADERS.filter(h => h !== 'Stock' && h !== 'Atributos');
  const missingHeaders = REQUIRED_HEADERS.filter(h => !normalizedHeader.includes(normalizeName(h)));

  if (missingHeaders.length > 0 || headerCells.length < 20) {
    throw new Error(
      `Cabeçalho CSV inválido. Colunas em falta: ${missingHeaders.join(', ') || '(estrutura mínima de 20 colunas não atingida)'}. ` +
      `Faça download do template actualizado.`
    );
  }

  const dataLines = lines.slice(1);
  const productsToInsert: any[] = [];
  const productsToUpdate: any[] = [];
  const pricesToInsert: any[] = [];
  const pricesToUpdate: any[] = [];
  const companyAssociations: any[] = [];
  const skippedLines: SkippedLine[] = [];
  const warnings: string[] = [];

  const recordSkip = (line: number, sku: string, reason: string) => {
    skippedLines.push({ line, sku, reason });
    console.warn('[parseProductsCSV] skipped', { line, sku, reason });
  };

  // Create a map of existing products by (sku + organization_id) for quick lookup.
  // SKU uniqueness is now scoped per organization, so the same SKU can exist in
  // multiple orgs and must be matched within the row's target org.
  const skuKey = (sku: string, orgId?: string | null) =>
    `${sku.toLowerCase()}::${orgId ?? ''}`;
  const existingProductsBySku = new Map<string, any>();
  existingProducts.forEach(p => {
    if (p.sku) {
      existingProductsBySku.set(skuKey(p.sku, p.organization_id), p);
    }
  });

  // Pre-scan CSV for duplicate SKUs within the file itself, scoped per company column.
  // The CSV "Empresa" column overrides the active company, so duplicates are
  // only real conflicts when SKU + target company match.
  const skuLineMap = new Map<string, number[]>();
  const skuCompanyLineMap = new Map<string, number[]>();
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    if (values.length >= 1 && values[0]) {
      const sku = values[0].toLowerCase();
      const companyName = values[10] || '';
      const company = companyName
        ? companies.find(c => normalizeName(c.name) === normalizeName(companyName))
        : null;
      const targetOrg = company?.id || activeCompanyId || '';
      const compositeKey = `${sku}::${targetOrg}`;

      if (!skuLineMap.has(sku)) skuLineMap.set(sku, []);
      skuLineMap.get(sku)!.push(i + 2);

      if (!skuCompanyLineMap.has(compositeKey)) skuCompanyLineMap.set(compositeKey, []);
      skuCompanyLineMap.get(compositeKey)!.push(i + 2);
    }
  }

  // Duplicates: keep first occurrence, skip subsequent ones (don't abort file)
  const duplicateSkipLines = new Set<number>();
  skuCompanyLineMap.forEach((occLines, key) => {
    if (occLines.length > 1) {
      const [sku] = key.split('::');
      const [, ...rest] = occLines;
      rest.forEach(ln => {
        duplicateSkipLines.add(ln);
        recordSkip(ln, sku.toUpperCase(), `SKU duplicado no ficheiro (linha ${occLines[0]} mantida)`);
      });
    }
  });

  // SKUs in trash within same org → skip and warn (don't abort file)
  const trashSkipLines = new Set<number>();
  skuCompanyLineMap.forEach((occLines, key) => {
    const [sku, orgId] = key.split('::');
    const trashedProduct = trashedSkuMap.get(skuKey(sku, orgId));
    const existsInContext = existingProductsBySku.has(skuKey(sku, orgId));

    if (trashedProduct && !existsInContext) {
      occLines.forEach(ln => {
        trashSkipLines.add(ln);
        recordSkip(ln, sku.toUpperCase(), 'SKU existe no Lixo — restaure ou elimine permanentemente o produto');
      });
    }
  });

  for (let i = 0; i < dataLines.length; i++) {
    checkCancelled();
    // Yield periodically to avoid locking the UI for big imports
    if (i > 0 && i % 200 === 0) {
      await yieldToUI();
      checkCancelled();
    }

    const line = dataLines[i];
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    // Skip empty lines or lines without SKU and Name
    if (values.length < 2 || !values[0] || !values[1]) continue;

    const lineNumber = i + 2; // +2 for header and 0-index

    // Skip duplicates and trash conflicts detected in pre-scan
    if (duplicateSkipLines.has(lineNumber)) continue;
    if (trashSkipLines.has(lineNumber)) continue;

    // Parse all fields with correct indices
    const sku = values[0];
    const name = values[1];
    const description = values[2] || null;
    const barcode = values[3] || null;
    const status = values[4] || 'draft';
    const categoryName = values[5];
    const subcategoryName = values[6];
    const brandName = values[7];
    const supplierName = values[8];
    const productType = values[9]?.toLowerCase() || 'venda';
    const companyName = values[10];
    const vatRate = parseFloat(values[11]) || 23;
    const purchasePrice = parseFloat(values[12]) || 0;
    const retailPrice = parseFloat(values[13]) || 0;
    const wholesalePrice = parseFloat(values[14]) || 0;
    const distributorPrice = parseFloat(values[15]) || 0;
    const promoPrice = parseFloat(values[16]) || 0;
    const promoFrom = values[17] || null;
    const promoTo = values[18] || null;
    const currency = values[19] || 'EUR';

    // Resolve company for this row first (CSV "Empresa" overrides active company)
    const company = companyName ? companies.find(c => 
      normalizeName(c.name) === normalizeName(companyName)
    ) : null;

    if (companyName && !company) {
      warnings.push(`Linha ${lineNumber} (SKU ${sku}): empresa "${companyName}" não encontrada — usada empresa activa.`);
    }

    // Determine the company context for this row
    const targetCompanyId: string | undefined = company?.id || activeCompanyId;
    const matchesOrg = (entityOrgId?: string | null) => {
      if (!targetCompanyId) return true;
      return !entityOrgId || entityOrgId === targetCompanyId;
    };

    // Resolve IDs — cria automaticamente se não existir
    const category = categoryName ? await getOrCreateCategory(categoryName, targetCompanyId) : null;
    const subcategory = subcategoryName ? await getOrCreateSubcategory(subcategoryName, category?.id ?? null, targetCompanyId) : null;
    const brand = brandName ? await getOrCreateBrand(brandName, targetCompanyId) : null;
    const supplier = supplierName ? await getOrCreateSupplier(supplierName, targetCompanyId) : null;

    if (!category) {
      recordSkip(lineNumber, sku, categoryName
        ? `Não foi possível criar categoria "${categoryName}"`
        : 'Categoria em branco — coluna obrigatória');
      continue;
    }

    // Determine product type flags
    const isSellable = productType === 'venda' || productType === 'ambos' || productType === 'sale' || productType === 'both';
    const isPurchasable = productType === 'compra' || productType === 'ambos' || productType === 'purchase' || productType === 'both';

    const resolvedCompanyId = company?.id || activeCompanyId || null;

    // Check if product with this SKU already exists in the target organization.
    // SKU uniqueness is scoped per organization, so we must match using both.
    const existingProduct = existingProductsBySku.get(skuKey(sku, resolvedCompanyId));

    if (existingProduct) {
      // UPDATE existing product
      productsToUpdate.push({
        id: existingProduct.id,
        sku,
        name,
        description,
        barcode,
        status,
        category_id: category.id,
        subcategory_id: subcategory?.id || null,
        brand_id: brand?.id || null,
        supplier_id: supplier?.id || null,
        organization_id: resolvedCompanyId,
        is_sellable: isSellable,
        is_purchasable: isPurchasable,
        updated_at: new Date().toISOString(),
      });

      // Add prices for update (will upsert)
      const priceTypes = [
        { type: 'purchase', value: purchasePrice },
        { type: 'retail', value: retailPrice },
        { type: 'wholesale', value: wholesalePrice },
        { type: 'distributor', value: distributorPrice },
        { type: 'promotional', value: promoPrice, validFrom: promoFrom, validTo: promoTo }
      ];

      priceTypes.forEach(({ type, value, validFrom, validTo }) => {
        if (value && value > 0) {
          const priceData: any = {
            product_id: existingProduct.id,
            price_type: type,
            price: value,
            currency: currency,
            vat_rate: vatRate,
          };

          if (validFrom) priceData.valid_from = validFrom;
          if (validTo) priceData.valid_to = validTo;

          pricesToUpdate.push(priceData);
        }
      });
    } else {
      // INSERT new product
      const productId = crypto.randomUUID();

      productsToInsert.push({
        id: productId,
        sku,
        name,
        description,
        barcode,
        status,
        category_id: category.id,
        subcategory_id: subcategory?.id || null,
        brand_id: brand?.id || null,
        supplier_id: supplier?.id || null,
        organization_id: resolvedCompanyId,
        is_sellable: isSellable,
        is_purchasable: isPurchasable,
        is_active: true,
        created_by: userId,
      });

      // Add company association if we have a company
      if (resolvedCompanyId) {
        companyAssociations.push({
          product_id: productId,
          organization_id: resolvedCompanyId,
          created_by: userId
        });
      }

      // Add prices for insert
      const priceTypes = [
        { type: 'purchase', value: purchasePrice },
        { type: 'retail', value: retailPrice },
        { type: 'wholesale', value: wholesalePrice },
        { type: 'distributor', value: distributorPrice },
        { type: 'promotional', value: promoPrice, validFrom: promoFrom, validTo: promoTo }
      ];

      priceTypes.forEach(({ type, value, validFrom, validTo }) => {
        if (value && value > 0) {
          const priceData: any = {
            product_id: productId,
            price_type: type,
            price: value,
            currency: currency,
            vat_rate: vatRate,
            created_by: userId
          };

          if (validFrom) priceData.valid_from = validFrom;
          if (validTo) priceData.valid_to = validTo;

          pricesToInsert.push(priceData);
        }
      });
    }
  }

  return { 
    productsToInsert, 
    productsToUpdate,
    pricesToInsert, 
    pricesToUpdate,
    companyAssociations,
    skippedLines,
    warnings,
    stats: {
      newCount: productsToInsert.length,
      updateCount: productsToUpdate.length,
      skippedCount: skippedLines.length,
    }
  };
};

export const calculateMargin = (purchasePrice: number, salePrice: number): number => {
  if (!salePrice || salePrice === 0) return 0;
  if (!purchasePrice) return 100;
  return Math.round(((salePrice - purchasePrice) / salePrice * 100) * 100) / 100;
};

export const formatMarginBadge = (margin: number): { variant: string; label: string } => {
  if (margin < 10) return { variant: 'destructive', label: `${margin}% - Baixo` };
  if (margin < 20) return { variant: 'secondary', label: `${margin}% - Médio` };
  return { variant: 'default', label: `${margin}% - Bom` };
};
