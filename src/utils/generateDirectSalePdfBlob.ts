import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { QuotePDFDocument } from '@/components/QuotePDFDocument';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchDefaultProposalBrandingTemplate,
  fetchDefaultQuotePdfTemplate,
  mergeProposalBranding,
} from '@/utils/quotePdfTemplate';
import { resolveEmitterCompany } from '@/utils/generateProformaPdfBlob';
import { resolveQuotePdfClient } from '@/utils/quotePdfClient';
import { resolveQuotePdfCommercialUser } from '@/utils/quotePdfCommercialUser';
import { round2 } from '@/utils/quotes/quoteLinePricing';
import type { AggregatedTotals, VatRateBucket } from '@/utils/quotes/computeQuoteTotals';
import type { RenderContext } from '@/utils/documentVariables';

// Venda Direta: PDF para o cliente, com o MESMO aspecto do PDF das propostas.
//
// Molde: generateProposalPdfBlob.ts + generateQuotePdfBlob.ts. O documento é o
// mesmo QuotePDFDocument, com o modelo estrutural de orçamento da empresa e a
// marca (cores, logótipo, rodapé, termos) do modelo de proposta por omissão —
// exatamente a fusão que as propostas fazem (mergeProposalBranding).
//
// Não passa por generateQuotePdfBlob: esse vai buscar o orçamento, e o
// buildQuoteRenderContext chama a RPC resolve_quote_contact com o id do
// orçamento — que aqui seria o id de uma venda direta.
//
// NUNCA lê `notes` (notas internas), `cost_price` nem `margem_percent`, e nunca
// imprime proforma_number/invoice_*: isto é a proposta de venda, não a proforma
// nem a fatura.

/** Igual ao de generateQuotePdfBlob.ts — o logótipo nunca pode pendurar a geração do PDF. */
const fetchBlobWithTimeout = async (url: string, timeoutMs = 5000): Promise<Blob> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Falha ao carregar imagem (${response.status})`);
    return await response.blob();
  } finally {
    window.clearTimeout(timeout);
  }
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

const toNumberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Linha tal como o QuotePDFDocument a lê (só colunas que o cliente pode ver). */
export interface DirectSalePdfLine {
  id: string;
  descricao_snapshot: string | null;
  qt: number;
  unidade: string | null;
  retail_price_unit: number | null;
  iva_percent: number;
  /** Já com o desconto da linha (getLineSubtotal no editor). */
  total_sem_iva: number;
  ordem: number | null;
  products: { sku: string | null } | null;
  services: { sku: string | null } | null;
}

/**
 * Bloco de totais a partir dos valores GRAVADOS no cabeçalho da venda.
 *
 * O QuotePDFDocument, sem override, recalcula tudo a partir das linhas com a
 * matemática dos orçamentos (IVA por taxa sobre a soma, arredondado no fim),
 * enquanto o editor da venda direta arredonda o IVA linha a linha. Para o PDF
 * bater ao cêntimo com o que o comercial viu e o cliente aceita, o subtotal e
 * o total vêm do cabeçalho; a divisão do IVA por taxa vem das linhas visíveis,
 * e a diferença de arredondamento (se houver) vai para a taxa de maior base,
 * para a soma das linhas de IVA fechar com total − subtotal.
 *
 * Sem subtotal/total gravados (vendas antigas), cai para a soma das linhas.
 */
export function buildDirectSaleTotals(
  sale: { subtotal: number | null; total: number | null },
  lines: DirectSalePdfLine[],
): AggregatedTotals {
  const byRate = new Map<number, number>();
  lines.forEach((line) => {
    const rate = Number(line.iva_percent) || 0;
    byRate.set(rate, (byRate.get(rate) || 0) + (Number(line.total_sem_iva) || 0));
  });

  const vatBreakdown: VatRateBucket[] = Array.from(byRate.entries())
    .map(([rate, base]) => ({ rate, base, vat: round2(base * (rate / 100)) }))
    .filter((v) => v.base > 0 || v.vat > 0)
    .sort((a, b) => a.rate - b.rate);

  const linesSubtotal = round2(vatBreakdown.reduce((s, v) => s + v.base, 0));
  const linesVat = round2(vatBreakdown.reduce((s, v) => s + v.vat, 0));

  const subtotal = sale.subtotal ?? linesSubtotal;
  const total = sale.total ?? round2(subtotal + linesVat);
  const totalIva = round2(total - subtotal);

  const drift = round2(totalIva - linesVat);
  if (drift !== 0 && vatBreakdown.length > 0) {
    const target = vatBreakdown.reduce((best, v) => (v.base > best.base ? v : best), vatBreakdown[0]);
    target.vat = round2(target.vat + drift);
  }

  return {
    subtotalBruto: subtotal,
    // Vendas diretas não têm desconto global: o desconto é por linha e já
    // está no total_sem_iva de cada uma.
    discountValue: 0,
    discountPercent: null,
    fees: [],
    subtotalWithFees: subtotal,
    vatBreakdown,
    feeVatBreakdown: [],
    totalIva,
    total,
  };
}

/**
 * Gera o PDF da venda direta para o cliente (modo CRM — a RLS do CRM deixa ler
 * direct_sales/direct_sale_lines). Qualquer estado: é o documento da proposta
 * de venda, não depende de aceitação.
 */
export async function generateDirectSalePdfBlob(
  saleId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const { data: saleRow, error: saleError } = await (supabase as any)
    .from('direct_sales')
    .select(
      'id, organization_id, entity_id, client_id, sale_number, title, status, client_notes, subtotal, total, valid_until, assigned_to, created_by, created_at',
    )
    .eq('id', saleId)
    .maybeSingle();
  if (saleError) throw saleError;
  if (!saleRow) throw new Error('Venda direta não encontrada.');

  // Só as linhas visíveis ao cliente: as internas (visible_to_client = false)
  // também não entram no subtotal/total gravados, logo mostrá-las faria o
  // documento não bater certo consigo próprio (e revelava registo interno).
  const { data: lineRows, error: linesError } = await (supabase as any)
    .from('direct_sale_lines')
    .select(
      'id, descricao_snapshot, qt, unidade, retail_price_unit, iva_percent, total_sem_iva, ordem, products (sku), services (sku)',
    )
    .eq('direct_sale_id', saleId)
    .eq('visible_to_client', true)
    .order('ordem', { ascending: true });
  if (linesError) throw linesError;

  const lines: DirectSalePdfLine[] = ((lineRows || []) as any[]).map((row) => ({
    id: row.id,
    descricao_snapshot: row.descricao_snapshot ?? null,
    qt: toNumberOrNull(row.qt) ?? 0,
    unidade: row.unidade ?? null,
    retail_price_unit: toNumberOrNull(row.retail_price_unit),
    iva_percent: toNumberOrNull(row.iva_percent) ?? 0,
    total_sem_iva: toNumberOrNull(row.total_sem_iva) ?? 0,
    ordem: toNumberOrNull(row.ordem),
    products: row.products ? { sku: row.products.sku ?? null } : null,
    services: row.services ? { sku: row.services.sku ?? null } : null,
  }));

  const organizationId: string | null = saleRow.organization_id ?? null;

  const [emitter, orgBrand, clientResult, commercial, structuralTemplate, brandingTemplate] = await Promise.all([
    resolveEmitterCompany(organizationId),
    // brand_color: o resolveEmitterCompany não o devolve, e é o fallback de cor
    // do QuotePDFDocument quando o modelo não traz primary_color.
    organizationId
      ? (supabase as any).from('anew_organizations').select('metadata').eq('id', organizationId).maybeSingle()
          .then((r: any) => r?.data ?? null, () => null)
      : Promise.resolve(null),
    // Mesmo resolver que o resolveSaleClient da proforma usa, mas sem o
    // achatar: o QuotePDFDocument lê client_addresses, email e telefone. Sem
    // quoteId, não chama a RPC resolve_quote_contact.
    resolveQuotePdfClient({ entityId: saleRow.entity_id ?? null, clientId: saleRow.client_id ?? null })
      .catch((error) => {
        // Um cliente por resolver não pode impedir a emissão do documento.
        console.error('[generateDirectSalePdfBlob] Error resolving client:', error);
        return { entityId: null, client: null };
      }),
    // assigned_to → created_by → utilizador autenticado, como nos orçamentos.
    resolveQuotePdfCommercialUser({ assigned_to: saleRow.assigned_to, created_by: saleRow.created_by })
      .catch(() => null),
    fetchDefaultQuotePdfTemplate(organizationId),
    fetchDefaultProposalBrandingTemplate(organizationId),
  ]);

  const client: any = clientResult?.client ?? null;
  const meta = (orgBrand?.metadata || {}) as Record<string, any>;
  const company: any = {
    name: emitter.name || '',
    vat: emitter.vat || '',
    email: emitter.email || '',
    phone: emitter.phone || '',
    // Já em base64 (resolveEmitterCompany).
    logo_url: emitter.logo_url || null,
    brand_color: meta.brand_color || null,
    // Sem moradas estruturadas: o QuotePDFDocument cai para `address`.
    company_addresses: [],
    address: emitter.address || '',
  };

  const template = mergeProposalBranding(structuralTemplate, brandingTemplate);
  let resolvedTemplate = template;
  if (template?.logo_url) {
    try {
      const templateLogoBlob = await fetchBlobWithTimeout(template.logo_url);
      resolvedTemplate = { ...template, logo_url: await blobToDataUrl(templateLogoBlob) };
    } catch (error) {
      console.error('[generateDirectSalePdfBlob] Error converting template logo to base64:', error);
      resolvedTemplate = { ...template, logo_url: null };
    }
  }

  const clientDisplayName: string =
    client?.company_name
    || client?.display_name
    || [client?.first_name, client?.last_name].filter(Boolean).join(' ')
    || '';
  const primaryAddress = (client?.client_addresses || []).find((a: any) => a?.is_primary)
    || (client?.client_addresses || [])[0];

  const commercialCtx = commercial
    ? { id: commercial.id, name: commercial.name, email: commercial.email, phone: commercial.phone }
    : { name: '', email: '', phone: '' };

  const renderContext: RenderContext = {
    client: {
      display_name: clientDisplayName,
      email: client?.email || '',
      phone: client?.phone || '',
      vat: client?.vat || '',
      address: primaryAddress
        ? [primaryAddress.street, primaryAddress.number, primaryAddress.postal_code, primaryAddress.city].filter(Boolean).join(', ')
        : '',
    },
    company: {
      name: company.name,
      vat: company.vat,
      email: company.email,
      phone: company.phone,
      logo_url: company.logo_url,
      address: company.address,
    },
    commercial: commercialCtx,
    authUser: null,
  };

  // Cabeçalho com a forma de um orçamento, só com o que o documento lê.
  const quoteShaped = {
    id: saleRow.id,
    quote_number: saleRow.sale_number ?? null,
    created_at: saleRow.created_at,
    estado: saleRow.status,
    client_notes: saleRow.client_notes ?? null,
    conditions: null,
    desconto_global_percent: 0,
    assigned_to: saleRow.assigned_to ?? null,
    created_by: saleRow.created_by ?? null,
    organization_id: organizationId,
  };

  const totalsOverride = buildDirectSaleTotals(
    { subtotal: toNumberOrNull(saleRow.subtotal), total: toNumberOrNull(saleRow.total) },
    lines,
  );

  const element = React.createElement(QuotePDFDocument as any, {
    quote: quoteShaped,
    company,
    client,
    lines,
    fees: [],
    user: commercialCtx,
    descontoPercent: 0,
    proposalTemplate: resolvedTemplate,
    renderContext,
    // Como nas propostas: uma variável do modelo sem valor na venda direta
    // deixa o campo vazio em vez de deitar o PDF abaixo.
    strictVariables: false,
    documentContext: {
      kind: 'direct_sale',
      number: saleRow.sale_number ?? null,
      validUntil: saleRow.valid_until ?? null,
    },
    hideTotals: false,
    totalsOverride,
  });
  const blob = await (pdf as any)(element).toBlob();

  const fileName = `VendaDireta_${saleRow.sale_number || saleId}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, fileName };
}
