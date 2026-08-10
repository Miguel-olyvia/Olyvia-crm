import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { generateQuotePdfBlob } from '@/utils/generateQuotePdfBlob';
import { fetchQuotePdfTemplateById, fetchDefaultQuotePdfTemplate } from '@/utils/quotePdfTemplate';
import { aggregateQuoteTotals, type AggregatedTotals } from '@/utils/quotes/computeQuoteTotals';

async function generateFromQuotePdfs(
  proposalId: string,
): Promise<{ blob: Blob; fileName: string }> {
  // Fetch proposal basic data for filename + template resolution
  const { data: proposal, error: propErr } = await (supabase as any)
    .from('proposals')
    .select('id, proposal_number, title, template_id, organization_id')
    .eq('id', proposalId)
    .maybeSingle();
  if (propErr) throw propErr;

  // Template explicitly selected on the PROPOSAL itself ("Template" field in
  // Templates de Proposta) — takes priority over whatever template the
  // underlying quote happens to have, because that's the one the user picked
  // for this specific proposal (e.g. a "Cozinha" proposal template on a quote
  // that still carries a generic/older quote template). `null` here means
  // "no explicit proposal template" — the per-quote loop below still falls
  // back to each quote's own template, and only then to the org default.
  const explicitProposalTemplate = await fetchQuotePdfTemplateById(proposal?.template_id);
  const orgDefaultTemplate = await fetchDefaultQuotePdfTemplate(proposal?.organization_id || null);

  // Resolve quote ids linked to this proposal
  const { data: quotes, error: quotesErr } = await (supabase as any)
    .from('quotes')
    .select('id, quote_number, template_id, created_at')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });
  if (quotesErr) throw quotesErr;

  let resolvedQuotes: Array<{ id: string; quote_number?: string | null; template_id?: string | null; created_at?: string | null }> = quotes || [];

  // Fallback: alguns orçamentos ficam associados via pipeline_links (não têm
  // quotes.proposal_id preenchido). Replicar a lógica do ProposalDetailsDialog
  // para o PDF não falhar quando o utilizador vê o orçamento listado na UI.
  if (resolvedQuotes.length === 0) {
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
      // Prefer the proposal's own selected template; only fall back to the
      // quote's own template (then the org default) when the proposal has
      // none configured.
      const templateForQuote = explicitProposalTemplate
        ?? (quote.template_id ? await fetchQuotePdfTemplateById(quote.template_id) : null)
        ?? orgDefaultTemplate;
      const isLastQuote = quote.id === lastQuoteId;
      // Mark this render as proposal-context so a quote missing a variable
      // referenced only by the proposal template renders (blank/placeholder)
      // instead of being silently dropped from the merged PDF.
      const { blob } = await generateQuotePdfBlob(quote.id, {
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
): Promise<{ blob: Blob; fileName: string }> {
  return generateFromQuotePdfs(proposalId);
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
