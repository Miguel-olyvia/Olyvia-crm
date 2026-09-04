import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { generateQuotePdfBlob } from '@/utils/generateQuotePdfBlob';
import { fetchDefaultQuotePdfTemplate, resolveProposalBrandingTemplate } from '@/utils/quotePdfTemplate';
import { aggregateQuoteTotals, type AggregatedTotals } from '@/utils/quotes/computeQuoteTotals';

// Proposal-type templates ("Templates de Proposta") use a different section
// layout convention (client_info/company_info as "card"/"inline" blocks)
// than quote-type templates (`layout: "quote_pdf"`), which is the only
// convention QuotePDFDocument's items table/bundle rendering actually knows
// how to lay out correctly. Swapping the whole template object for a
// proposal-type one breaks that layout (overlapping bundle rows). Instead,
// keep the quote-compatible template's structure and only patch the visible
// branding — title, colors, footer/terms/thank-you text — from the
// proposal's own selected template on top of it.
function mergeProposalBranding(structuralTemplate: any | null, proposalTemplate: any | null) {
  if (!proposalTemplate) return structuralTemplate;
  if (!structuralTemplate) return proposalTemplate;

  const proposalHeaderTitle = Array.isArray(proposalTemplate.sections)
    ? proposalTemplate.sections.find((s: any) => s?.type === 'header')?.settings?.customTitle
    : null;

  const sections = Array.isArray(structuralTemplate.sections)
    ? structuralTemplate.sections.map((s: any) =>
        s?.type === 'header' && proposalHeaderTitle
          ? { ...s, settings: { ...s.settings, customTitle: proposalHeaderTitle } }
          : s
      )
    : structuralTemplate.sections;

  return {
    ...structuralTemplate,
    sections,
    primary_color: proposalTemplate.primary_color ?? structuralTemplate.primary_color,
    secondary_color: proposalTemplate.secondary_color ?? structuralTemplate.secondary_color,
    accent_color: proposalTemplate.accent_color ?? structuralTemplate.accent_color,
    logo_url: proposalTemplate.logo_url ?? structuralTemplate.logo_url,
    footer_text: proposalTemplate.footer_text ?? structuralTemplate.footer_text,
    terms_conditions: proposalTemplate.terms_conditions ?? structuralTemplate.terms_conditions,
    thank_you_message: proposalTemplate.thank_you_message ?? structuralTemplate.thank_you_message,
  };
}

/**
 * Proposal, quotes, lines and fees already loaded by the caller.
 *
 * The client portal cannot read `quotes`/`quote_lines` (RLS), so its copy comes
 * from the client-portal-action Edge Function with cost and margin columns
 * removed. Rendering then follows exactly the same path as the CRM, so both
 * produce the same document.
 */
export interface ProposalPdfPrefetch {
  proposal: {
    id: string;
    proposal_number?: string | null;
    title?: string | null;
    template_id?: string | null;
    template_snapshot?: unknown;
    organization_id?: string | null;
  } | null;
  quotes: Array<{ quote: any; lines: any[]; fees: any[] }>;
}

async function generateFromQuotePdfs(
  proposalId: string,
  prefetched?: ProposalPdfPrefetch,
): Promise<{ blob: Blob; fileName: string }> {
  let proposal: any = prefetched?.proposal ?? null;
  if (!prefetched) {
    // Fetch proposal basic data for filename + template resolution
    const { data, error: propErr } = await (supabase as any)
      .from('proposals')
      .select('id, proposal_number, title, template_id, template_snapshot, organization_id')
      .eq('id', proposalId)
      .maybeSingle();
    if (propErr) throw propErr;
    proposal = data;
  }

  // Template explicitly selected on the proposal — used for branding only
  // (see mergeProposalBranding above), never as the structural template.
  // A copia congelada na proposta manda sobre o modelo vivo -- ver
  // resolveProposalBrandingTemplate.
  const explicitProposalTemplate = await resolveProposalBrandingTemplate(proposal);
  const orgDefaultTemplate = await fetchDefaultQuotePdfTemplate(proposal?.organization_id || null);

  // Resolve quote ids linked to this proposal
  let resolvedQuotes: Array<{ id: string; quote_number?: string | null; template_id?: string | null; created_at?: string | null }> = [];

  if (prefetched) {
    resolvedQuotes = prefetched.quotes.map(q => ({
      id: q.quote.id,
      quote_number: q.quote.quote_number,
      template_id: q.quote.template_id,
      created_at: q.quote.created_at,
    }));
  } else {
    const { data: quotes, error: quotesErr } = await (supabase as any)
      .from('quotes')
      .select('id, quote_number, template_id, created_at')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true });
    if (quotesErr) throw quotesErr;
    resolvedQuotes = quotes || [];
  }

  // Fallback: alguns orçamentos ficam associados via pipeline_links (não têm
  // quotes.proposal_id preenchido). Replicar a lógica do ProposalDetailsDialog
  // para o PDF não falhar quando o utilizador vê o orçamento listado na UI.
  if (resolvedQuotes.length === 0 && !prefetched) {
    const { data: pLinks } = await (supabase as any)
      .from('pipeline_links')
      .select('quote_id')
      .eq('proposal_id', proposalId)
      .eq('status', 'active')
      .not('quote_id', 'is', null);
    const linkedIds = (pLinks || []).map((l: any) => l.quote_id).filter(Boolean);
    if (linkedIds.length > 0) {
      const { data: linkedQuotes } = await (supabase as any)
        .from('quotes')
        .select('id, quote_number, template_id, created_at')
        .in('id', linkedIds)
        .order('created_at', { ascending: true });
      resolvedQuotes = linkedQuotes || [];
    }
  }

  if (resolvedQuotes.length === 0) {
    throw new Error('Esta proposta não tem orçamentos associados para gerar PDF.');
  }

  // Multi-quote proposals: compute a single aggregated totals block (shown
  // only on the last quote's page) instead of one disconnected totals block
  // per quote. Fetch each quote's lines/fees with the same query shape used
  // by generateQuotePdfBlob for a single quote, so the aggregate math stays
  // consistent with the per-quote math.
  let aggregatedTotals: AggregatedTotals | null = null;
  if (resolvedQuotes.length > 1) {
    try {
      const perQuoteData = await Promise.all(
        resolvedQuotes.map(async (quote) => {
          const injected = prefetched?.quotes.find(q => q.quote.id === quote.id);
          if (injected) {
            return {
              lines: injected.lines || [],
              fees: injected.fees || [],
              descontoPercent: injected.quote?.desconto_global_percent || 0,
            };
          }
          const [{ data: quoteRow }, { data: linesData }, { data: feesData }] = await Promise.all([
            (supabase as any).from('quotes').select('desconto_global_percent').eq('id', quote.id).maybeSingle(),
            supabase.from('quote_lines').select(`*, products (sku), services (sku)`).eq('quote_id', quote.id).order('ordem'),
            supabase.from('quote_fees').select(`*, service_fee_types (name, calculation_type, percentage, fixed_amount)`).eq('quote_id', quote.id),
          ]);
          return {
            lines: linesData || [],
            fees: feesData || [],
            descontoPercent: quoteRow?.desconto_global_percent || 0,
          };
        })
      );
      aggregatedTotals = aggregateQuoteTotals(perQuoteData);
    } catch (e) {
      console.error('[generateProposalPdfBlob] Failed to compute aggregated totals:', e);
      aggregatedTotals = null;
    }
  }

  const merged = await PDFDocument.create();
  const lastQuoteId = resolvedQuotes[resolvedQuotes.length - 1]?.id;

  for (const quote of resolvedQuotes) {
    try {
      // Structural template: the quote's own (compatible layout for the
      // items table/bundles), falling back to the org default quote template.
      const structuralTemplate = (quote.template_id
        ? await fetchQuotePdfTemplateById(quote.template_id)
        : null) ?? orgDefaultTemplate;
      // Branding on top: the proposal's own selected template (title, colors,
      // footer/terms/thank-you), when one is configured.
      const templateForQuote = mergeProposalBranding(structuralTemplate, explicitProposalTemplate);
      const isLastQuote = quote.id === lastQuoteId;
      // Mark this render as proposal-context so a quote missing a variable
      // referenced only by the proposal template renders (blank/placeholder)
      // instead of being silently dropped from the merged PDF.
      const { blob } = await generateQuotePdfBlob(quote.id, {
        prefetched: prefetched?.quotes.find(q => q.quote.id === quote.id),
        templateOverride: templateForQuote,
        documentContext: {
          kind: 'proposal',
          number: proposal?.proposal_number ?? null,
          title: proposal?.title ?? null,
        },
        // Hide every quote's own totals except the last, which instead shows
        // the single aggregated "Valor da Proposta" block for the whole
        // merged document. Single-quote proposals keep default behavior.
        hideTotals: aggregatedTotals ? !isLastQuote : false,
        totalsOverride: aggregatedTotals && isLastQuote ? aggregatedTotals : undefined,
      });
      const arrayBuffer = await blob.arrayBuffer();
      const src = await PDFDocument.load(arrayBuffer);
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach((page) => merged.addPage(page));
    } catch (e) {
      console.error(`[generateProposalPdfBlob] Failed quote ${quote.id}:`, e);
    }
  }

  if (merged.getPageCount() === 0) {
    throw new Error('Não foi possível gerar nenhuma página para esta proposta.');
  }

  const bytes = await merged.save();
  // Convert Uint8Array to a fresh ArrayBuffer to satisfy BlobPart typing
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: 'application/pdf' });
  const safeNumber = proposal?.proposal_number || proposalId;
  const fileName = `Proposta_${safeNumber}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, fileName };
}

/**
 * Generate a single PDF blob for a proposal by merging the vectorial PDFs of
 * its associated quotes (each rendered with its own configured template, in
 * proposal document context — hence the "Proposta ..." title/number instead
 * of "Orçamento"/quote number).
 */
export async function generateProposalPdfBlob(
  proposalId: string,
  prefetched?: ProposalPdfPrefetch,
): Promise<{ blob: Blob; fileName: string }> {
  return generateFromQuotePdfs(proposalId, prefetched);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
