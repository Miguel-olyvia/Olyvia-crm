import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { QuotePDFDocument } from '@/components/QuotePDFDocument';
import { supabase } from '@/integrations/supabase/client';
import { fetchDefaultQuotePdfTemplate, fetchQuotePdfTemplateById } from '@/utils/quotePdfTemplate';
import { buildQuoteRenderContext } from '@/utils/buildQuoteRenderContext';

/**
 * Generate a PDF blob for a given quote ID.
 * Returns { blob, fileName } or throws on error.
 */
export async function generateQuotePdfBlob(
  quoteId: string,
  options: { templateOverride?: any | null } = {},
): Promise<{ blob: Blob; fileName: string }> {
  const { data: quoteData, error: quoteError } = await (supabase as any)
    .from('quotes').select('*').eq('id', quoteId).single();
  if (quoteError) throw quoteError;

  const { data: linesData } = await supabase.from('quote_lines').select(`*, products (sku), services (sku)`).eq('quote_id', quoteId).order('ordem');
  const { data: feesData } = await supabase.from('quote_fees').select(`*, service_fee_types (name, calculation_type, percentage, fixed_amount)`).eq('quote_id', quoteId);

  // Logo em base64 para embed no PDF (mantém comportamento atual)
  let logoBase64: string | null = null;
  if (quoteData.organization_id) {
    const { data: org } = await (supabase as any).from('anew_organizations').select('logo_url').eq('id', quoteData.organization_id).maybeSingle();
    if (org?.logo_url) {
      try {
        const response = await fetch(org.logo_url);
        const logoBlob = await response.blob();
        logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
      } catch (error) {
        console.error('Error converting logo to base64:', error);
      }
    }
  }

  const { ctx, raw } = await buildQuoteRenderContext({
    quoteData,
    organizationId: quoteData.organization_id ?? null,
    logoBase64,
  });

  const proposalTemplate = options.templateOverride
    ?? (quoteData?.template_id ? await fetchQuotePdfTemplateById(quoteData.template_id) : null)
    ?? await fetchDefaultQuotePdfTemplate(quoteData.organization_id || null);

  const pdfElement = React.createElement(QuotePDFDocument as any, {
    quote: quoteData, company: raw.company, client: raw.client,
    lines: linesData || [], fees: feesData || [], user: raw.user,
    descontoPercent: quoteData?.desconto_global_percent || 0,
    proposalTemplate,
    renderContext: ctx,
    strictVariables: true,
  });
  const blob = await (pdf as any)(pdfElement).toBlob();

  const fileName = `Orcamento_${quoteData.quote_number || quoteId}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, fileName };
}

/**
 * Convert a Blob to a base64 data string (without the data: prefix).
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
