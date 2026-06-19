import { supabase } from "@/integrations/supabase/client";

interface BundleExport {
  sku: string;
  name: string;
  description: string;
  status: string;
  pricing_type: string;
  fixed_price: number | string;
  discount_percent: number | string;
  discount_fixed: number | string;
  valid_from: string;
  valid_to: string;
  company: string;
}

// CSV Headers for Bundles
const CSV_HEADERS = [
  'SKU',
  'Nome',
  'Descrição',
  'Estado',
  'Tipo Preço',
  'Preço Fixo',
  'Desconto %',
  'Desconto €',
  'Válido De',
  'Válido Até',
  'Empresa'
];

export const exportBundlesToCSV = async (bundles: any[]) => {
  const BOM = '\uFEFF';

  const csvContent = CSV_HEADERS.map(h => `"${h}"`).join(';') + '\r\n' +
    bundles.map(bundle => {
      const row = [
        bundle.sku || '',                              // 0 - SKU
        bundle.name || '',                             // 1 - Nome
        bundle.description || '',                      // 2 - Descrição
        bundle.status || 'draft',                      // 3 - Estado
        bundle.pricing_type || 'custom',               // 4 - Tipo Preço
        bundle.fixed_price || '',                      // 5 - Preço Fixo
        bundle.discount_percent || '',                 // 6 - Desconto %
        bundle.discount_fixed || '',                   // 7 - Desconto €
        bundle.valid_from || '',                       // 8 - Válido De
        bundle.valid_to || '',                         // 9 - Válido Até
        bundle.companies?.name || '',                  // 10 - Empresa
      ];
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
    }).join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `bundles_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

export const downloadBundlesTemplate = () => {
  const BOM = '\uFEFF';
  
  const headers = CSV_HEADERS.map(h => `"${h}"`).join(';');
  
  const exampleRow = [
    'BUNDLE001',                 // SKU
    'Menu Almoço',               // Nome
    'Menu completo de almoço',   // Descrição
    'active',                    // Estado (draft, active, discontinued)
    'fixed_price',               // Tipo Preço (custom, fixed_price, percentage_discount, fixed_discount)
    '25.00',                     // Preço Fixo
    '',                          // Desconto %
    '',                          // Desconto €
    '',                          // Válido De (YYYY-MM-DD)
    '',                          // Válido Até (YYYY-MM-DD)
    'Empresa X',                 // Empresa
  ].map(v => `"${v}"`).join(';');
  
  const content = BOM + headers + '\r\n' + exampleRow;
  
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `template_bundles_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

export interface ParseBundlesParams {
  text: string;
  companies: any[];
  businessUserId: string;
  activeCompanyId?: string;
  existingBundles?: any[];
  signal?: AbortSignal;
}

export interface ParsedBundlesResult {
  bundlesToInsert: any[];
  bundlesToUpdate: any[];
  stats: {
    newCount: number;
    updateCount: number;
  };
}

export const parseBundlesCSV = async ({
  text,
  companies,
  businessUserId,
  activeCompanyId,
  existingBundles = [],
  signal,
}: ParseBundlesParams): Promise<ParsedBundlesResult> => {
  const CANCELLED_MESSAGE = "Importação cancelada";
  const checkCancelled = () => {
    if (signal?.aborted) throw new Error(CANCELLED_MESSAGE);
  };
  const yieldToUI = async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  };

  checkCancelled();
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  // Detect column count
  const headerLine = lines[0];
  const headerCount = headerLine.split(';').length;
  
  if (headerCount < 11) {
    throw new Error(
      `Formato CSV incompatível. Esperado 11 colunas, encontrado ${headerCount}. ` +
      `Por favor, faça download do novo template.`
    );
  }

  const dataLines = lines.slice(1);
  const bundlesToInsert: any[] = [];
  const bundlesToUpdate: any[] = [];

  // Create a map of existing bundles by SKU for quick lookup
  const existingBundlesBySku = new Map<string, any>();
  existingBundles.forEach(b => {
    if (b.sku) {
      existingBundlesBySku.set(b.sku.toLowerCase(), b);
    }
  });

  // Pre-scan CSV for duplicate SKUs within the file itself
  const skuLineMap = new Map<string, number[]>();
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    if (values.length >= 1 && values[0]) {
      const sku = values[0].toLowerCase();
      if (!skuLineMap.has(sku)) {
        skuLineMap.set(sku, []);
      }
      skuLineMap.get(sku)!.push(i + 2); // +2 for header and 1-index
    }
  }

  // Check for duplicates within CSV
  const duplicatesInCsv: string[] = [];
  skuLineMap.forEach((lines, sku) => {
    if (lines.length > 1) {
      duplicatesInCsv.push(`SKU "${sku.toUpperCase()}": linhas ${lines.join(', ')}`);
    }
  });

  if (duplicatesInCsv.length > 0) {
    throw new Error(
      `O ficheiro CSV contém SKUs duplicados:\n${duplicatesInCsv.join('\n')}`
    );
  }

  const normalizeName = (v?: string | null) => (v ?? '').trim().toLowerCase();

  for (let i = 0; i < dataLines.length; i++) {
    checkCancelled();
    if (i > 0 && i % 200 === 0) {
      await yieldToUI();
      checkCancelled();
    }

    const line = dataLines[i];
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    // Skip empty lines or lines without SKU and Name
    if (values.length < 2 || !values[0] || !values[1]) continue;

    const lineNumber = i + 2;

    // Parse all fields with correct indices
    const sku = values[0];
    const name = values[1];
    const description = values[2] || null;
    const status = values[3] || 'draft';
    const pricingType = values[4] || 'custom';
    const fixedPrice = parseFloat(values[5]) || null;
    const discountPercent = parseFloat(values[6]) || null;
    const discountFixed = parseFloat(values[7]) || null;
    const validFrom = values[8] || null;
    const validTo = values[9] || null;
    const companyName = values[10];

    // Resolve company
    const company = companyName ? companies.find(c => 
      normalizeName(c.name) === normalizeName(companyName)
    ) : null;

    const resolvedCompanyId = company?.id || activeCompanyId || null;

    // Validate pricing type
    const validPricingTypes = ['custom', 'fixed_price', 'percentage_discount', 'fixed_discount'];
    if (!validPricingTypes.includes(pricingType)) {
      throw new Error(
        `Linha ${lineNumber}: Tipo de preço "${pricingType}" inválido. ` +
        `Valores válidos: ${validPricingTypes.join(', ')}`
      );
    }

    // Validate status
    const validStatuses = ['draft', 'active', 'discontinued'];
    if (!validStatuses.includes(status)) {
      throw new Error(
        `Linha ${lineNumber}: Estado "${status}" inválido. ` +
        `Valores válidos: ${validStatuses.join(', ')}`
      );
    }

    // Check if bundle with this SKU already exists
    const existingBundle = existingBundlesBySku.get(sku.toLowerCase());

    const bundleData = {
      sku,
      name,
      description,
      status,
      is_active: status === 'active',
      pricing_type: pricingType as 'custom' | 'fixed_price' | 'percentage_discount' | 'fixed_discount',
      fixed_price: pricingType === 'fixed_price' ? fixedPrice : null,
      discount_percent: pricingType === 'percentage_discount' ? discountPercent : null,
      discount_fixed: pricingType === 'fixed_discount' ? discountFixed : null,
      valid_from: validFrom,
      valid_to: validTo,
      organization_id: resolvedCompanyId,
    };

    if (existingBundle) {
      // UPDATE existing bundle
      bundlesToUpdate.push({
        id: existingBundle.id,
        ...bundleData,
        updated_at: new Date().toISOString(),
      });
    } else {
      // INSERT new bundle
      bundlesToInsert.push({
        id: crypto.randomUUID(),
        ...bundleData,
        created_by: businessUserId,
      });
    }
  }

  return { 
    bundlesToInsert, 
    bundlesToUpdate,
    stats: {
      newCount: bundlesToInsert.length,
      updateCount: bundlesToUpdate.length
    }
  };
};
