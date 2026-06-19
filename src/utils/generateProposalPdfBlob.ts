import { PDFDocument } from 'pdf-lib';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { toPng } from 'html-to-image';
import { supabase } from '@/integrations/supabase/client';
import { generateQuotePdfBlob } from '@/utils/generateQuotePdfBlob';
import { fetchQuotePdfTemplateById, fetchDefaultQuotePdfTemplate } from '@/utils/quotePdfTemplate';
import { ProposalPortalDocument } from '@/components/proposals/ProposalPortalDocument';
import { loadProposalPortalData, type ProposalPortalData } from '@/components/proposals/proposalPortalData';

const STATUS_LABELS: Record<string, string> = {
  sent: 'A aguardar decisão',
  pending: 'A aguardar decisão',
  draft: 'Rascunho',
  accepted: 'Proposta aceite',
  rejected: 'Proposta rejeitada',
  expired: 'Proposta expirada',
};

async function waitForImages(container: HTMLElement, timeoutMs = 5000): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));
  if (imgs.length === 0) return;
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const tid = setTimeout(resolve, timeoutMs);
            img.onload = () => { clearTimeout(tid); resolve(); };
            img.onerror = () => { clearTimeout(tid); resolve(); };
          })
    )
  );
}

async function generateFromPortalTemplate(
  portalData: ProposalPortalData,
): Promise<{ blob: Blob; fileName: string }> {
  const { proposal, template, quotes, quoteLines, quoteFees, commercial, company } = portalData;
  const statusLabel = STATUS_LABELS[proposal.status as string] || (proposal.status as string);

  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '-9999px',
    width: '900px',
    background: '#ffffff',
    zIndex: '-1',
    overflow: 'visible',
  });
  document.body.appendChild(container);

  let root: ReturnType<typeof createRoot> | null = null;

  try {
    root = createRoot(container);
    root.render(
      createElement(ProposalPortalDocument, {
        proposal,
        template,
        quotes,
        quoteLines,
        quoteFees,
        commercial,
        company,
        mode: 'preview',
        statusLabel,
        canActOnProposal: false,
      })
    );

    // Give React a tick to commit, then wait for fonts + images to settle
    await new Promise<void>((r) => setTimeout(r, 100));
    await document.fonts.ready;
    await waitForImages(container);
    await new Promise<void>((r) => setTimeout(r, 300));

    const fullWidth = 900;
    const fullHeight = Math.max(container.offsetHeight, 1200);

    const dataUrl = await toPng(container, {
      width: fullWidth,
      height: fullHeight,
      pixelRatio: 2,
    });

    // A4 dimensions in PDF points (72 dpi)
    const A4_W = 595.28;
    const A4_H = 841.89;
    const scale = A4_W / fullWidth;
    const scaledH = fullHeight * scale;
    const numPages = Math.ceil(scaledH / A4_H);

    const pdfDoc = await PDFDocument.create();
    const pngImage = await pdfDoc.embedPng(dataUrl);

    for (let i = 0; i < numPages; i++) {
      const page = pdfDoc.addPage([A4_W, A4_H]);
      // PDF y-axis: 0=bottom, A4_H=top — shift image so page i shows the correct slice
      page.drawImage(pngImage, {
        x: 0,
        y: A4_H - scaledH + i * A4_H,
        width: A4_W,
        height: scaledH,
      });
    }

    const bytes = await pdfDoc.save();
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([ab], { type: 'application/pdf' });
    const safeNumber = (proposal.proposal_number as string) || (proposal.id as string);
    const fileName = `Proposta_${safeNumber}_${new Date().toISOString().split('T')[0]}.pdf`;

    return { blob, fileName };
  } finally {
    try { root?.unmount(); } catch { /* ignore unmount errors */ }
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

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

/**
 * Generate a single PDF blob for a proposal.
 * - If the proposal has a portal template selected → renders ProposalPortalDocument as HTML → PDF
 *   (respects the layout/brand the user configured in "Template de Proposta")
 * - Otherwise → falls back to merging the PDFs of its associated quotes (legacy behaviour)
 */
export async function generateProposalPdfBlob(
  proposalId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const portalData = await loadProposalPortalData(proposalId);

  if (portalData?.template) {
    return generateFromPortalTemplate(portalData);
  }

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
