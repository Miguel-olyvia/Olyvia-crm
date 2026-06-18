import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { generateQuotePdfBlob } from '@/utils/generateQuotePdfBlob';
import { fetchQuotePdfTemplateById, fetchDefaultQuotePdfTemplate } from '@/utils/quotePdfTemplate';

/**
 * Generate a single PDF blob for a proposal by merging the PDFs of its
 * associated quotes (one per quote, in order).
 */
export async function generateProposalPdfBlob(
  proposalId: string,
): Promise<{ blob: Blob; fileName: string }> {
  // Fetch proposal basic data for filename + template resolution
  const { data: proposal, error: propErr } = await (supabase as any)
    .from('proposals')
    .select('id, proposal_number, title, template_id, organization_id')
    .eq('id', proposalId)
    .maybeSingle();
  if (propErr) throw propErr;

  // Fallback template (used only if a quote has no template_id of its own).
  // Each quote is rendered with ITS OWN template — that's the layout the user
  // configured on the quote and expects to see in the proposal.
  const fallbackTemplate =
    (await fetchQuotePdfTemplateById(proposal?.template_id))
    ?? (await fetchDefaultQuotePdfTemplate(proposal?.organization_id || null));

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

  const merged = await PDFDocument.create();

  for (const quote of resolvedQuotes) {
    try {
      // Prefer the quote's own template; fall back to the proposal/org template.
      const quoteOwnTemplate = quote.template_id
        ? await fetchQuotePdfTemplateById(quote.template_id)
        : null;
      const templateForQuote = quoteOwnTemplate ?? fallbackTemplate;
      const { blob } = await generateQuotePdfBlob(quote.id, { templateOverride: templateForQuote });
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
