/**
 * Shared bundle-component extraction helpers for quote PDF rendering.
 *
 * Extracted from QuotePDFDocument.tsx so both the line-item table renderer
 * and the totals calculators (computeQuoteTotals / aggregateQuoteTotals) can
 * reuse the exact same component-resolution logic without duplication or
 * risking divergence between the two.
 */

export interface BundleComponentAttr {
  label: string;
  value: string;
}

export interface BundleComponentForPdf {
  name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  attributes: BundleComponentAttr[];
  hasAttributeStructure: boolean;
}

export const extractComponentAttributes = (component: any): BundleComponentAttr[] => {
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

export const componentHasAttributeStructure = (component: any): boolean => {
  const attrs = component?.selected_attributes;
  if (!attrs || typeof attrs !== 'object') return false;
  return Object.values(attrs).some((a: any) => a && typeof a === 'object' && a.label);
};

export const getBundleComponents = (line: any): BundleComponentForPdf[] => {
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

export const isBundleLine = (line: any): boolean => {
  return !!line?.bundle_id || line?.categoria === 'Bundles';
};
