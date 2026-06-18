import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { resolveField, type RenderContext } from '@/utils/documentVariables';

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 145,
    paddingHorizontal: 35,
    fontFamily: 'Helvetica',
    fontSize: 9,
    backgroundColor: '#ffffff',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  quoteNumber: {
    fontSize: 11,
    color: '#000000',
    marginBottom: 3,
  },
  quoteDate: {
    fontSize: 9,
    color: '#000000',
    marginBottom: 5,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  statusText: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  logo: {
    width: 160,
    height: 80,
    objectFit: 'contain',
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#000000',
    backgroundColor: '#f3f4f6',
    padding: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  label: {
    width: '25%',
    fontWeight: 'bold',
    color: '#000000',
    fontSize: 9,
  },
  value: {
    width: '75%',
    color: '#000000',
    fontSize: 9,
  },
  table: {
    marginTop: 5,
    marginBottom: 5,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#374151',
    padding: 6,
    fontWeight: 'bold',
    color: '#ffffff',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    padding: 5,
    backgroundColor: '#ffffff',
    fontSize: 8,
  },
  totalsSection: {
    marginTop: 12,
    marginBottom: 0,
    alignItems: 'flex-end',
  },
  totalsRow: {
    flexDirection: 'row',
    width: '50%',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingVertical: 3,
    borderBottom: '1 solid #e5e7eb',
  },
  totalLabel: {
    fontSize: 9,
    color: '#000000',
    flex: 1,
    marginRight: 10,
  },
  totalValue: {
    fontSize: 9,
    color: '#000000',
    textAlign: 'right',
    minWidth: 80,
  },
  grandTotal: {
    fontSize: 11,
    fontWeight: 'bold',
    borderTop: '2 solid #000000',
    borderBottom: 'none',
    paddingTop: 8,
  },
  fixedFooter: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingTop: 8,
  },
  footerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  footerSection: {
    flex: 1,
  },
  footerTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 3,
  },
  footerText: {
    fontSize: 7,
    color: '#6b7280',
    marginBottom: 1,
  },
  footerBottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1 solid #8b5cf6',
  },
  footerBrandText: {
    fontSize: 9,
    color: '#8b5cf6',
    fontWeight: 'bold',
  },
  footerValidityText: {
    fontSize: 7,
    color: '#9ca3af',
  },
});

interface QuotePDFProps {
  quote: any;
  company: any;
  client: any;
  lines: any[];
  fees?: any[];
  user?: any;
  descontoPercent?: number;
  proposalTemplate?: any | null;
  /** Contexto canónico para resolver os 4 blocos configuráveis. Opcional para retrocompat. */
  renderContext?: RenderContext | null;
  /** Quando true (envio/download), variáveis vazias em modo "variable" lançam erro. */
  strictVariables?: boolean;
}

// Extract attributes from a line as a list of { label, value, priceImpact }
const getLineAttributes = (line: any): { label: string; value: string; priceImpact: number }[] => {
  const attrs = line.selected_attributes || {};
  const result: { label: string; value: string; priceImpact: number }[] = [];
  Object.values(attrs).forEach((attr: any) => {
    if (!attr || !attr.label) return;
    const rawValue = attr.value ?? attr.option_label ?? '';
    const unit = attr.unit || '';
    const value = rawValue !== '' ? (unit ? `${rawValue} ${unit}` : String(rawValue)) : '';
    if (!value) return;
    const priceImpact = parseFloat(
      String(attr.price_impact ?? attr.priceImpact ?? attr.extra_price ?? attr.price ?? 0)
    ) || 0;
    result.push({ label: attr.label, value, priceImpact });
  });
  return result;
};

type BundleComponentAttr = { label: string; value: string };
type BundleComponentForPdf = {
  name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  attributes: BundleComponentAttr[];
  hasAttributeStructure: boolean;
};

const extractComponentAttributes = (component: any): BundleComponentAttr[] => {
  const attrs = component?.selected_attributes;
  if (!attrs || typeof attrs !== 'object') return [];
  const result: BundleComponentAttr[] = [];
  Object.values(attrs).forEach((attr: any) => {
    if (!attr || !attr.label) return;
    const raw = attr.value ?? attr.option_label;
    if (raw === undefined || raw === null || raw === '') return;
    const unit = attr.unit || '';
    let formatted: string;
    if (typeof raw === 'boolean') formatted = raw ? 'Sim' : 'Não';
    else formatted = unit ? `${raw} ${unit}` : String(raw);
    result.push({ label: attr.label, value: formatted });
  });
  return result;
};

const componentHasAttributeStructure = (component: any): boolean => {
  const attrs = component?.selected_attributes;
  if (!attrs || typeof attrs !== 'object') return false;
  return Object.values(attrs).some((a: any) => a && typeof a === 'object' && a.label);
};

const getBundleComponents = (line: any): BundleComponentForPdf[] => {
  const directComponents = Array.isArray(line.bundle_components) ? line.bundle_components : [];
  const metadataComponents = Array.isArray(line.selected_attributes?.bundle_components)
    ? line.selected_attributes.bundle_components
    : [];
  const attributeComponents = Array.isArray(line.selected_attributes?.bundle_components_data)
    ? line.selected_attributes.bundle_components_data
    : [];

  const source = directComponents.length > 0
    ? directComponents
    : (metadataComponents.length > 0 ? metadataComponents : attributeComponents);

  return source
    .filter((component: any) => component && typeof component.name === 'string')
    .map((component: any) => ({
      name: component.name,
      sku: component.sku || null,
      quantity: parseFloat(String(component.quantity || 0)) || 0,
      unit_price: parseFloat(String(component.unit_price || 0)) || 0,
      vat_rate: parseFloat(String(component.vat_rate || 23)) || 23,
      attributes: extractComponentAttributes(component),
      hasAttributeStructure: componentHasAttributeStructure(component),
    }));
};

const isBundleLine = (line: any): boolean => {
  return !!line?.bundle_id || line?.categoria === 'Bundles';
};

const stripHtml = (value?: string | null): string => {
  if (!value) return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

const resolveTemplateText = (template: any, section: any, keys: string[]): string => {
  for (const key of keys) {
    const value = section?.settings?.[key] ?? template?.[key];
    const text = stripHtml(typeof value === 'string' ? value : value == null ? '' : String(value));
    if (text) return text;
  }
  return '';
};

export const QuotePDFDocument = ({ quote, company, client, lines, fees = [], user, descontoPercent = 0, proposalTemplate = null, renderContext = null, strictVariables = false }: QuotePDFProps) => {
  /**
   * Helper para os 3 blocos configuráveis (client_info, company_info, footer).
   * Backward-compat: se não houver renderContext ou se fieldModes[key] estiver
   * ausente/em "default", devolve `currentValue` (o binding hardcoded atual).
   */
  const fieldValue = (section: any, fieldKey: string, defaultRegistryKey: string, currentValue: string): string => {
    const mode = section?.settings?.fieldModes?.[fieldKey];
    if (!renderContext || !mode || mode === 'default') return currentValue;
    try {
      return resolveField(section.settings, fieldKey, renderContext, defaultRegistryKey, { strict: strictVariables });
    } catch (err) {
      // Em strict mode propaga; preview deixa cair para o valor atual.
      if (strictVariables) throw err;
      return currentValue;
    }
  };
  // Get company brand color or default to black
  const brandColor = proposalTemplate?.primary_color || company?.brand_color || '#000000';
  const accentColor = proposalTemplate?.accent_color || proposalTemplate?.secondary_color || brandColor;
  const textColor = proposalTemplate?.text_color || '#000000';
  const surfaceColor = proposalTemplate?.surface_color || proposalTemplate?.background_color || '#f3f4f6';
  const borderColor = proposalTemplate?.border_color || '#e5e7eb';
  const quoteHeaderBg = proposalTemplate?.quote_header_bg || proposalTemplate?.secondary_color || '#374151';
  const quoteHeaderText = proposalTemplate?.quote_header_text || '#ffffff';
  const quoteRowAltBg = proposalTemplate?.quote_row_alt_bg || '#f9fafb';
  const contentBlockBg = proposalTemplate?.content_block_bg || proposalTemplate?.background_color || '#ffffff';
  const secondaryTextColor = proposalTemplate?.text_secondary_color || '#374151';
  const headerTitle = proposalTemplate?.sections?.find?.((section: any) => section?.type === 'header')?.settings?.customTitle || 'ORÇAMENTO';
  const showCompanyInfo = proposalTemplate?.show_company_info !== false;
  const showClientInfo = proposalTemplate?.show_client_info !== false;
  const showValidity = proposalTemplate?.show_validity !== false;
  const showTerms = proposalTemplate?.show_terms !== false;
  const headerText = stripHtml(proposalTemplate?.header_text);
  const footerText = stripHtml(proposalTemplate?.footer_text);
  const termsText = stripHtml(proposalTemplate?.terms_conditions);
  const templateDescriptionText = stripHtml(proposalTemplate?.description || proposalTemplate?.header_text || '');
  const logoSource = proposalTemplate?.logo_url || company?.logo_url;

  const columnStyles = {
    sku: { width: '14%', fontSize: 8 },
    description: { width: '46%', fontSize: 8 },
    unit: { width: '7%', fontSize: 8, textAlign: 'center' as const },
    quantity: { width: '8%', fontSize: 8, textAlign: 'right' as const },
    unitPrice: { width: '12%', fontSize: 8, textAlign: 'right' as const },
    iva: { width: '5%', fontSize: 8, textAlign: 'center' as const },
    total: { width: '13%', fontSize: 8, fontWeight: 'bold' as const, textAlign: 'right' as const },
  };
  
  // Dynamic header style with brand color
  const headerStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 15,
    paddingBottom: 12,
    borderBottom: `2 solid ${brandColor}`,
  };

  // Dynamic footer bottom row style with brand color
  const footerBottomRowStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginTop: 6,
    paddingTop: 6,
    borderTop: `1 solid ${brandColor}`,
  };

  const footerBrandTextStyle = {
    fontSize: 9,
    color: brandColor,
    fontWeight: 'bold' as const,
  };

  // Dynamic footer style with brand color
  const fixedFooterStyle = {
    position: 'absolute' as const,
    bottom: 16,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingTop: 8,
    borderTop: `2 solid ${brandColor}`,
  };
  
  // Calculate totals
  const subtotalBruto = lines.reduce((sum, line) => {
    return sum + (parseFloat(String(line.total_sem_iva || 0)));
  }, 0);

  // Apply global discount
  const discountFactor = descontoPercent > 0 ? (1 - descontoPercent / 100) : 1;
  const discountValue = subtotalBruto * (1 - discountFactor);
  const subtotal = subtotalBruto * discountFactor;

  // Calculate service fees totals
  const totalFeesValue = fees.reduce((sum, fee) => {
    return sum + parseFloat(String(fee.calculated_value || 0));
  }, 0);

  const totalFeesVat = fees.reduce((sum, fee) => {
    return sum + parseFloat(String(fee.vat_amount || 0));
  }, 0);

  // Group VAT by rate (e.g. 6%, 23%) — apply global discount proportionally.
  // For bundle lines with components having mixed VAT, split the line base
  // proportionally by each component's subtotal and use each component's own rate.
  const vatByRateMap = new Map<number, { base: number; vat: number }>();
  lines.forEach((line) => {
    const lineBase = parseFloat(String(line.total_sem_iva || 0)) * discountFactor;
    const components = getBundleComponents(line);
    const componentsTotal = components.reduce(
      (s, c) => s + (c.unit_price * c.quantity),
      0
    );
    const ivaOverrideRaw = (line as any)?.selected_attributes?.iva_override;
    const hasOverride = typeof ivaOverrideRaw === "number" && !Number.isNaN(ivaOverrideRaw);

    if (components.length > 0 && componentsTotal > 0 && !hasOverride) {
      // Split line base across components by their share of the gross components total
      components.forEach((c) => {
        const share = (c.unit_price * c.quantity) / componentsTotal;
        const base = lineBase * share;
        const rate = c.vat_rate;
        const vat = base * (rate / 100);
        const existing = vatByRateMap.get(rate) || { base: 0, vat: 0 };
        vatByRateMap.set(rate, { base: existing.base + base, vat: existing.vat + vat });
      });
    } else {
      const rate = hasOverride ? ivaOverrideRaw : parseFloat(String(line.iva_percent || 0));
      const vat = lineBase * (rate / 100);
      const existing = vatByRateMap.get(rate) || { base: 0, vat: 0 };
      vatByRateMap.set(rate, { base: existing.base + lineBase, vat: existing.vat + vat });
    }
  });
  // Compute fee VAT: merge with product VAT bucket when same rate exists,
  // otherwise show as a separate "IVA X% (Nome)" line.
  const feeVatBreakdown: { name: string; rate: number; vat: number }[] = [];
  fees.forEach((fee) => {
    const base = parseFloat(String(fee.calculated_value || 0));
    const storedVat = parseFloat(String(fee.vat_amount || 0));
    const rateField = parseFloat(String(fee.vat_rate ?? 0));
    const rate = rateField > 0
      ? rateField
      : (base > 0 && storedVat > 0 ? Math.round((storedVat / base) * 100) : 0);
    const vat = storedVat > 0 ? storedVat : base * (rate / 100);
    if (vat <= 0 && rate <= 0) return;
    const existing = vatByRateMap.get(rate);
    if (existing) {
      vatByRateMap.set(rate, { base: existing.base + base, vat: existing.vat + vat });
    } else {
      const name = fee.service_fee_types?.name || 'Taxa';
      feeVatBreakdown.push({ name, rate, vat });
    }
  });

  const vatBreakdown = Array.from(vatByRateMap.entries())
    .filter(([, v]) => v.base > 0 || v.vat > 0)
    .sort((a, b) => a[0] - b[0]);

  const totalIva = vatBreakdown.reduce((sum, [, v]) => sum + v.vat, 0)
    + feeVatBreakdown.reduce((sum, f) => sum + f.vat, 0);
  const subtotalWithFees = subtotal + totalFeesValue;
  const total = subtotalWithFees + totalIva;


  // Calculate unit price from costs and margin
  const calculateUnitPrice = (line: any) => {
    const materialCost = parseFloat(String(line.custo_material_unit || 0));
    const laborCost = parseFloat(String(line.custo_mao_obra_unit || 0));
    const margin = parseFloat(String(line.margem_percent || 0));
    const intermediary = parseFloat(String(line.int_percent || 0));
    const totalCost = materialCost + laborCost;
    if (totalCost === 0 && line.retail_price_unit) {
      return parseFloat(String(line.retail_price_unit || 0));
    }
    return totalCost * (1 + margin / 100) * (1 + intermediary / 100);
  };

  // Format client address
  const primaryAddress = client?.client_addresses?.find((addr: any) => addr.is_primary) 
    || client?.client_addresses?.[0];
  const clientAddress = primaryAddress 
    ? [primaryAddress.street, primaryAddress.number, primaryAddress.postal_code, primaryAddress.city]
        .filter(Boolean).join(", ")
    : '';
  const clientName = client?.company_name
    || client?.display_name
    || [client?.first_name, client?.last_name].filter(Boolean).join(' ')
    || quote?.client_name
    || '';

  // Format company address
  const companyAddress = company?.company_addresses?.find((addr: any) => addr.is_primary) 
    || company?.company_addresses?.[0];
  const companyFullAddress = companyAddress 
    ? [companyAddress.street, companyAddress.number, companyAddress.postal_code, companyAddress.city]
        .filter(Boolean).join(", ")
    : company?.address || '';

  // Get status badge styling
  const getStatusStyle = (status: string) => {
    const statusConfig: Record<string, { bg: string; color: string; text: string }> = {
      rascunho: { bg: '#fef3c7', color: '#92400e', text: 'Rascunho' },
      enviado: { bg: '#dbeafe', color: '#1e40af', text: 'Enviado' },
      aceite: { bg: '#d1fae5', color: '#065f46', text: 'Aceite' },
      perdido: { bg: '#fee2e2', color: '#991b1b', text: 'Perdido' },
    };
    return statusConfig[status] || { bg: '#f3f4f6', color: '#374151', text: status };
  };

  const statusStyle = getStatusStyle(quote.estado);

  const configuredSections = Array.isArray(proposalTemplate?.sections) && proposalTemplate.sections.length > 0
    ? proposalTemplate.sections
    : [
        { id: 'header', type: 'header', label: 'Cabeçalho', visible: true, settings: { customTitle: 'ORÇAMENTO' } },
        { id: 'client_info', type: 'client_info', label: 'Cliente', visible: true, settings: { sectionLabel: 'CLIENTE' } },
        { id: 'notes', type: 'notes', label: 'Notas', visible: true, settings: { sectionLabel: 'NOTAS' } },
        { id: 'quote_items', type: 'quote_items', label: 'Detalhes do Orçamento', visible: true, settings: { sectionLabel: 'DETALHES DO ORÇAMENTO' } },
        { id: 'terms', type: 'terms', label: 'Condições Gerais', visible: true, settings: { sectionLabel: 'CONDIÇÕES GERAIS' } },
        { id: 'footer', type: 'footer', label: 'Rodapé', visible: true, settings: {} },
      ];

  const visibleSections = configuredSections.filter((section: any) => section?.visible !== false);
  const headerSection = visibleSections.find((section: any) => section.type === 'header');
  const footerSection = visibleSections.find((section: any) => section.type === 'footer');
  const bodySections = visibleSections.filter((section: any) => !['header', 'footer'].includes(section.type));
  const hasValueSection = bodySections.some((section: any) => section.type === 'value');
  const sectionLabel = (section: any, fallback: string) => section?.settings?.sectionLabel || section?.label || fallback;

  const renderHeader = (section: any) => (
    <View fixed style={headerStyle}>
      <View style={styles.headerLeft}>
        <Text style={[styles.title, { color: textColor }]}>{section?.settings?.customTitle || headerTitle}</Text>
        <Text style={styles.quoteNumber}>{quote.quote_number || 'N/A'}</Text>
        <Text style={styles.quoteDate}>Data: {new Date(quote.created_at).toLocaleDateString('pt-PT')}</Text>
      </View>
      {logoSource && section?.settings?.showLogo !== false && <Image src={logoSource} style={styles.logo} />}
    </View>
  );

  const renderHeaderText = (section: any) => {
    const content = resolveTemplateText(proposalTemplate, section, ['content', 'text', 'description', 'header_text']) || headerText;
    return content ? (
    <View style={[styles.section, { padding: 8, backgroundColor: contentBlockBg, borderWidth: 1, borderColor, borderLeftWidth: 2, borderLeftColor: accentColor }]}> 
      {section?.settings?.showTitle !== false && sectionLabel(section, '') && (
        <Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, '')}</Text>
      )}
      <Text style={{ fontSize: 9, color: textColor, lineHeight: 1.4 }}>{content}</Text>
    </View>
  ) : null;
  };

  const renderCompanyInfo = (section: any) => showCompanyInfo ? (() => {
    const name    = fieldValue(section, 'companyName',    'company.name',    company?.name    || '');
    const vat     = fieldValue(section, 'companyVat',     'company.vat',     company?.vat     || '');
    const email   = fieldValue(section, 'companyEmail',   'company.email',   company?.email   || '');
    const phone   = fieldValue(section, 'companyPhone',   'company.phone',   company?.phone   || '');
    const address = fieldValue(section, 'companyAddress', 'company.address', companyFullAddress || '');
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, 'EMPRESA')}</Text>
        <View style={styles.row}><Text style={styles.label}>Nome:</Text><Text style={styles.value}>{name}</Text></View>
        {vat     && <View style={styles.row}><Text style={styles.label}>NIF:</Text><Text style={styles.value}>{vat}</Text></View>}
        {email   && <View style={styles.row}><Text style={styles.label}>Email:</Text><Text style={styles.value}>{email}</Text></View>}
        {phone   && <View style={styles.row}><Text style={styles.label}>Telefone:</Text><Text style={styles.value}>{phone}</Text></View>}
        {address && <View style={styles.row}><Text style={styles.label}>Morada:</Text><Text style={styles.value}>{address}</Text></View>}
      </View>
    );
  })() : null;

  const renderClientInfo = (section: any) => showClientInfo ? (() => {
    const name    = fieldValue(section, 'clientName',    'client.name',    clientName);
    const vat     = fieldValue(section, 'clientVat',     'client.vat',     client?.vat   || '');
    const email   = fieldValue(section, 'clientEmail',   'client.email',   client?.email || '');
    const phone   = fieldValue(section, 'clientPhone',   'client.phone',   client?.phone || '');
    const address = fieldValue(section, 'clientAddress', 'client.address', clientAddress);
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, 'CLIENTE')}</Text>
        <View style={styles.row}><Text style={styles.label}>Nome:</Text><Text style={styles.value}>{name}</Text></View>
        {vat     && <View style={styles.row}><Text style={styles.label}>NIF:</Text><Text style={styles.value}>{vat}</Text></View>}
        {email   && <View style={styles.row}><Text style={styles.label}>Email:</Text><Text style={styles.value}>{email}</Text></View>}
        {phone   && <View style={styles.row}><Text style={styles.label}>Telefone:</Text><Text style={styles.value}>{phone}</Text></View>}
        {address && <View style={styles.row}><Text style={styles.label}>Morada:</Text><Text style={styles.value}>{address}</Text></View>}
        {quote.obra_endereco && <View style={styles.row}><Text style={styles.label}>Morada Obra:</Text><Text style={styles.value}>{quote.obra_endereco}</Text></View>}
      </View>
    );
  })() : null;

  const renderNotes = (section: any) => {
    const templateContent = resolveTemplateText(proposalTemplate, section, ['content', 'text', 'notes', 'description']);
    const notes = templateContent || quote.obra_notas || quote.client_notes;
    return notes ? (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, 'NOTAS')}</Text>
        <View style={{ padding: 8, backgroundColor: contentBlockBg, borderWidth: 1, borderColor, borderRadius: 4 }}>
          <Text style={{ fontSize: 9, color: secondaryTextColor, lineHeight: 1.4 }}>{notes}</Text>
        </View>
      </View>
    ) : null;
  };

  const renderQuoteItems = (section: any) => (
    <View>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, 'DETALHES DO ORÇAMENTO')}</Text>
        <View style={styles.table}>
          <View style={[styles.tableHeader, { backgroundColor: quoteHeaderBg, color: quoteHeaderText }]}> 
            <Text style={columnStyles.sku}>SKU</Text>
            <Text style={columnStyles.description}>Descrição</Text>
            <Text style={columnStyles.unit}>Unid.</Text>
            <Text style={columnStyles.quantity}>Qtd.</Text>
            <Text style={columnStyles.unitPrice}>P. Unit.</Text>
            <Text style={columnStyles.iva}>IVA</Text>
            <Text style={columnStyles.total}>Total</Text>
          </View>
        </View>
      </View>

      <View>
        {(() => {
          const sections = new Map<string, any[]>();
          lines.forEach((line) => {
            const sectionName = line.section_name || 'Geral';
            if (!sections.has(sectionName)) sections.set(sectionName, []);
            sections.get(sectionName)!.push(line);
          });
          const sectionEntries = Array.from(sections.entries());
          const hasMultipleSections = sectionEntries.length > 1;

          return sectionEntries.map(([sectionName, sectionLines]) => (
            <View key={sectionName}>
              {hasMultipleSections && (
                <View style={{ backgroundColor: '#f3f4f6', paddingVertical: 4, paddingHorizontal: 8, marginTop: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold' as const, color: '#374151' }}>{sectionName}</Text>
                </View>
              )}
              {sectionLines.map((line: any) => {
                const unitPrice = calculateUnitPrice(line);
                const quantity = parseFloat(String(line.qt || 0));
                const lineTotal = parseFloat(String(line.total_sem_iva || 0));
                const lineIva = parseFloat(String(line.iva_percent || 0));
                const lineAttrs = getLineAttributes(line);
                const bundleComponents = getBundleComponents(line);
                const showBundleBadge = isBundleLine(line) || bundleComponents.length > 0;
                const unidade = line.unidade || 'UN';
                const uniqueComponentRates = Array.from(new Set(bundleComponents.map(c => c.vat_rate)));
                const lineIvaOverride = (line as any)?.selected_attributes?.iva_override;
                const hasLineIvaOverride = typeof lineIvaOverride === "number" && !Number.isNaN(lineIvaOverride);
                const ivaDisplay = hasLineIvaOverride
                  ? `${Number(lineIvaOverride).toFixed(0)}%`
                  : (bundleComponents.length > 0 && uniqueComponentRates.length > 1
                      ? 'Mista'
                      : `${(bundleComponents.length > 0 ? uniqueComponentRates[0] : lineIva).toFixed(0)}%`);

                return (
                  <View key={line.id} wrap={false}>
                    <View style={[styles.tableRow, { borderBottomColor: borderColor, backgroundColor: quoteRowAltBg }]}> 
                      <Text style={columnStyles.sku}>{line.products?.sku || line.services?.sku || line.ordem?.toString() || '-'}</Text>
                      <View style={columnStyles.description}>
                        <Text>{showBundleBadge && <Text style={{ fontSize: 7, color: brandColor, fontWeight: 'bold' as const }}>[BUNDLE] </Text>}{line.descricao_snapshot || ''}</Text>
                      </View>
                      <Text style={columnStyles.unit}>{unidade}</Text>
                      <Text style={columnStyles.quantity}>{quantity.toFixed(2)}</Text>
                      <Text style={columnStyles.unitPrice}>€{unitPrice.toFixed(2)}</Text>
                      <Text style={columnStyles.iva}>{ivaDisplay}</Text>
                      <Text style={columnStyles.total}>€{lineTotal.toFixed(2)}</Text>
                    </View>
                    {line.item_description ? (
                      <View style={{ backgroundColor: '#f8fafc', paddingVertical: 6, paddingHorizontal: 10, borderBottom: '1 solid #e5e7eb', borderLeftWidth: 2, borderLeftColor: brandColor }}>
                        <Text style={{ fontSize: 8, color: '#1f2937', lineHeight: 1.5 }}>{line.item_description}</Text>
                      </View>
                    ) : null}
                    {showBundleBadge && bundleComponents.length === 0 && (
                      <View style={{ paddingLeft: 18, paddingRight: 8, paddingVertical: 4, borderBottom: '1 solid #e5e7eb', backgroundColor: '#fef3c7' }}>
                        <Text style={{ fontSize: 7, color: '#92400e', fontStyle: 'italic' as const }}>Bundle sem detalhe de componentes guardado. Reabra o item no editor e volte a adicionar para gravar a composição.</Text>
                      </View>
                    )}
                    {bundleComponents.length > 0 && (
                      <View style={{ paddingLeft: 18, paddingRight: 8, paddingVertical: 6, borderBottom: '1 solid #e5e7eb', backgroundColor: '#f8fafc', borderLeftWidth: 2, borderLeftColor: brandColor }}>
                        <Text style={{ fontSize: 7, color: '#6b7280', marginBottom: 4, fontWeight: 'bold' as const, textTransform: 'uppercase' as const }}>Componentes do bundle:</Text>
                        {bundleComponents.map((component, idx) => {
                          const effectiveQty = component.quantity * (quantity || 1);
                          const componentTotal = component.unit_price * effectiveQty;
                          return (
                            <View key={`${component.name}-${idx}`} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: idx === bundleComponents.length - 1 ? 'none' : '1 solid #e5e7eb' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 1 }}>
                                <Text style={{ fontSize: 8, color: '#111827', fontWeight: 'bold' as const, flex: 1, marginRight: 8 }}>• {component.name}</Text>
                                <Text style={{ fontSize: 8, color: '#111827', fontWeight: 'bold' as const, minWidth: 70, textAlign: 'right' }}>€{componentTotal.toFixed(2)}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                                <Text style={{ fontSize: 7, color: '#6b7280', flex: 1 }}>{component.sku ? `SKU: ${component.sku} · ` : ''}Qtd: {effectiveQty.toFixed(2)} · P. Unit.: €{component.unit_price.toFixed(2)}</Text>
                                <Text style={{ fontSize: 7, color: '#374151', minWidth: 52, textAlign: 'right' }}>IVA {(hasLineIvaOverride ? Number(lineIvaOverride) : component.vat_rate).toFixed(0)}%</Text>
                              </View>
                              {component.attributes.length > 0 && (
                                <View style={{ marginTop: 3, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: '#cbd5e1' }}>
                                  {component.attributes.map((a, aIdx) => <Text key={aIdx} style={{ fontSize: 7, color: '#374151', marginBottom: 1 }}><Text style={{ color: '#6b7280' }}>– {a.label}: </Text><Text style={{ fontWeight: 'bold' as const, color: '#111827' }}>{a.value}</Text></Text>)}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                    {lineAttrs.length > 0 && (
                      <View style={{ paddingLeft: 18, paddingRight: 8, paddingVertical: 5, borderBottom: '1 solid #e5e7eb', backgroundColor: '#f9fafb', borderLeftWidth: 2, borderLeftColor: brandColor }}>
                        <Text style={{ fontSize: 7, color: '#6b7280', marginBottom: 2, fontWeight: 'bold' as const, textTransform: 'uppercase' as const }}>Características selecionadas:</Text>
                        {lineAttrs.map((a, idx) => <View key={idx} style={{ flexDirection: 'row', marginBottom: 1, alignItems: 'center' }}><Text style={{ fontSize: 8, color: '#374151', flex: 1 }}><Text style={{ color: '#6b7280' }}>• {a.label}: </Text><Text style={{ fontWeight: 'bold' as const, color: '#111827' }}>{a.value}</Text></Text></View>)}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ));
        })()}
      </View>
      {!hasValueSection && renderTotals()}
    </View>
  );

  const renderTerms = (section: any) => (quote.conditions || (showTerms && termsText)) ? (
    <View style={styles.section} wrap={false}>
      <Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, 'CONDIÇÕES GERAIS')}</Text>
      <View style={{ padding: 8, backgroundColor: contentBlockBg, borderWidth: 1, borderColor, borderRadius: 4 }}>
        <Text style={{ fontSize: 9, color: secondaryTextColor, lineHeight: 1.4 }}>{quote.conditions || termsText}</Text>
      </View>
    </View>
  ) : null;

  const renderValidity = (section: any) => showValidity ? (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, 'VALIDADE')}</Text>
      <View style={{ padding: 8, backgroundColor: contentBlockBg, borderWidth: 1, borderColor, borderRadius: 4 }}>
        <Text style={{ fontSize: 9, color: secondaryTextColor }}>Este orçamento é válido por {quote.validade_dias || 30} dias a partir da data de emissão.</Text>
      </View>
    </View>
  ) : null;

  const renderTotals = () => (
    <View style={styles.totalsSection} wrap={false} minPresenceAhead={95}>
      <View style={styles.totalsRow}><Text style={styles.totalLabel}>Subtotal Produtos (sem IVA):</Text><Text style={styles.totalValue}>€{subtotalBruto.toFixed(2)}</Text></View>
      {descontoPercent > 0 && <View style={styles.totalsRow}><Text style={[styles.totalLabel, { color: '#dc2626' }]}>Desconto Global ({descontoPercent}%):</Text><Text style={[styles.totalValue, { color: '#dc2626' }]}>-€{discountValue.toFixed(2)}</Text></View>}
      {fees.length > 0 && (() => {
        const feeRates = Array.from(new Set(fees.map(f => {
          const base = parseFloat(String(f.calculated_value || 0));
          const storedVat = parseFloat(String(f.vat_amount || 0));
          const rateField = parseFloat(String(f.vat_rate ?? 0));
          return rateField > 0 ? rateField : (base > 0 && storedVat > 0 ? Math.round((storedVat / base) * 100) : 0);
        }).filter(r => r > 0)));
        const rateLabel = feeRates.length === 1 ? `${feeRates[0].toFixed(0)}%` : '';
        return (<View style={{ marginTop: 5, marginBottom: 3, width: '50%', alignSelf: 'flex-end' }}><Text style={{ fontSize: 9, fontWeight: 'bold' as const, color: '#374151', textAlign: 'left' }}>Taxas de Serviço{rateLabel ? ` (IVA ${rateLabel})` : ''}:</Text></View>);
      })()}
      {fees.length > 0 && <>{fees.map((fee, index) => {
        const feeValue = parseFloat(String(fee.calculated_value || 0));
        return (
          <React.Fragment key={index}>
            <View style={styles.totalsRow}><Text style={styles.totalLabel}>{fee.service_fee_types?.name || 'Taxa'}:</Text><Text style={styles.totalValue}>€{feeValue.toFixed(2)}</Text></View>
          </React.Fragment>
        );
      })}</>}
      <View style={[styles.totalsRow, { marginTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 }]}><Text style={[styles.totalLabel, { fontWeight: 'bold' as const }]}>SUBTOTAL (sem IVA):</Text><Text style={[styles.totalValue, { fontWeight: 'bold' as const }]}>€{(subtotal + totalFeesValue).toFixed(2)}</Text></View>
      {vatBreakdown.map(([rate, v]) => <View key={rate} style={styles.totalsRow}><Text style={styles.totalLabel}>IVA {rate.toFixed(0)}%:</Text><Text style={styles.totalValue}>€{v.vat.toFixed(2)}</Text></View>)}
      {feeVatBreakdown.map((f, i) => <View key={`fee-vat-${i}`} style={styles.totalsRow}><Text style={styles.totalLabel}>IVA {f.rate.toFixed(0)}% ({f.name}):</Text><Text style={styles.totalValue}>€{f.vat.toFixed(2)}</Text></View>)}
      <View style={styles.totalsRow}><Text style={[styles.totalLabel, { fontWeight: 'bold' as const }]}>IVA Total:</Text><Text style={[styles.totalValue, { fontWeight: 'bold' as const }]}>€{totalIva.toFixed(2)}</Text></View>
      <View style={[styles.totalsRow, styles.grandTotal]}><Text style={[styles.totalLabel, { fontWeight: 'bold' as const }]}>TOTAL GERAL (c/ IVA):</Text><Text style={[styles.totalValue, { fontWeight: 'bold' as const }]}>€{total.toFixed(2)}</Text></View>
    </View>
  );

  const renderValue = (section: any) => (
    <View style={styles.section} wrap={false} minPresenceAhead={115}>
      <Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, 'VALOR DO ORÇAMENTO')}</Text>
      {renderTotals()}
    </View>
  );

  const renderCustom = (section: any) => {
    const content = stripHtml(section?.settings?.content || section?.settings?.text || '');
    return content ? <View style={styles.section}><Text style={[styles.sectionTitle, { backgroundColor: surfaceColor, color: textColor }]}>{sectionLabel(section, 'SECÇÃO')}</Text><Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.4 }}>{content}</Text></View> : null;
  };

  const renderSection = (section: any) => {
    switch (section.type) {
      case 'company_info': return renderCompanyInfo(section);
      case 'client_info': return renderClientInfo(section);
      case 'description': return renderHeaderText(section);
      case 'notes': return renderNotes(section);
      case 'quote_items': return renderQuoteItems(section);
      case 'terms': return renderTerms(section);
      case 'validity': return renderValidity(section);
      case 'value': return renderValue(section);
      case 'thank_you': return proposalTemplate?.thank_you_message ? <View style={styles.section}><Text style={{ fontSize: 10, color: textColor, textAlign: 'center' }}>{stripHtml(proposalTemplate.thank_you_message)}</Text></View> : null;
      case 'custom': return renderCustom(section);
      default: return null;
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {headerSection && renderHeader(headerSection)}
        {!bodySections.some((section: any) => section.type === 'description') && headerText && renderHeaderText({ label: '', settings: { content: headerText, showTitle: false } })}
        {(() => {
          const rendered = bodySections
            .map((section: any) => ({ section, node: renderSection(section) }))
            .filter((e: any) => e.node);
          const last = rendered.length - 1;
          return rendered.map((e: any, idx: number) => (
            <View
              key={e.section.id || e.section.type}
              style={idx === last ? { marginBottom: 0 } : undefined}
            >
              {e.node}
            </View>
          ));
        })()}
        {footerSection && (
          <View fixed style={fixedFooterStyle}>
            <View style={styles.footerTopRow}>
              {(() => {
                const footerCompanyName    = fieldValue(footerSection, 'footerCompanyName',    'company.name',    company?.name    || '');
                const footerCompanyVat     = fieldValue(footerSection, 'footerCompanyVat',     'company.vat',     company?.vat     || '');
                const footerCompanyAddress = fieldValue(footerSection, 'footerCompanyAddress', 'company.address', companyFullAddress || '');
                const footerCompanyPhone   = fieldValue(footerSection, 'footerCompanyPhone',   'company.phone',   company?.phone   || '');
                const footerCompanyEmail   = fieldValue(footerSection, 'footerCompanyEmail',   'company.email',   company?.email   || '');
                return showCompanyInfo && (
                  <View style={styles.footerSection}>
                    <Text style={styles.footerTitle}>EMPRESA</Text>
                    <Text style={styles.footerText}>{footerCompanyName}</Text>
                    {footerCompanyVat     && <Text style={styles.footerText}>NIF: {footerCompanyVat}</Text>}
                    {footerCompanyAddress && <Text style={styles.footerText}>{footerCompanyAddress}</Text>}
                    {footerCompanyPhone   && <Text style={styles.footerText}>Tel: {footerCompanyPhone}</Text>}
                    {footerCompanyEmail   && <Text style={styles.footerText}>Email: {footerCompanyEmail}</Text>}
                  </View>
                );
              })()}
              {user && (() => {
                const fallbackName = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
                const cName  = fieldValue(footerSection, 'footerContactName',  'commercial.name',  fallbackName);
                const cEmail = fieldValue(footerSection, 'footerContactEmail', 'commercial.email', user.email || '');
                const cPhone = fieldValue(footerSection, 'footerContactPhone', 'commercial.phone', user.phone || '');
                return (
                  <View style={styles.footerSection}>
                    <Text style={styles.footerTitle}>CONTACTO</Text>
                    <Text style={styles.footerText}>{cName}</Text>
                    {cEmail && <Text style={styles.footerText}>Email: {cEmail}</Text>}
                    {cPhone && <Text style={styles.footerText}>Tel: {cPhone}</Text>}
                  </View>
                );
              })()}
            </View>
            {footerText && <Text style={[styles.footerText, { textAlign: 'center', marginTop: 2 }]}>{footerText}</Text>}
            <View style={footerBottomRowStyle}><Text style={footerBrandTextStyle}>{company?.name || 'Orçamento'}</Text></View>
          </View>
        )}
      </Page>
    </Document>
  );
};
