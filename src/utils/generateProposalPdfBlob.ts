import { PDFDocument } from 'pdf-lib';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { toCanvas } from 'html-to-image';
import { supabase } from '@/integrations/supabase/client';
import { generateQuotePdfBlob } from '@/utils/generateQuotePdfBlob';
import { fetchQuotePdfTemplateById, fetchDefaultQuotePdfTemplate } from '@/utils/quotePdfTemplate';
import { ProposalTemplateDocument } from '@/components/proposals/ProposalTemplateDocument';
import { loadProposalPortalData, type ProposalPortalData } from '@/components/proposals/proposalPortalData';
import { aggregateQuoteTotals, type AggregatedTotals } from '@/utils/quotes/computeQuoteTotals';

// Thrown when the DOM-screenshot capture of the portal template comes back
// blank — lets generateProposalPdfBlob() tell this apart from other failures
// (data loading, etc.) and fall back to the vectorial quote-based PDF instead
// of surfacing an error to the user.
class BlankCaptureError extends Error {}

// 1x1 transparent PNG used as a fallback whenever html-to-image fails to
// embed a remote image (e.g. logo CORS/404) — without this it silently
// substitutes an empty string, which can break rasterization downstream.
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// html-to-image can "succeed" (canvas.onload fires, no exception) while the
// foreignObject/SVG failed to rasterize, leaving a uniformly blank canvas.
// Detect that by sampling a downscaled copy instead of trusting the promise
// resolving cleanly.
function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const sampleSize = 64;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const ctx = sampleCanvas.getContext('2d');
  if (!ctx) return false; // can't verify — don't block the download on this
  ctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
  const [r0, g0, b0, a0] = data;
  for (let i = 4; i < data.length; i += 4) {
    if (data[i] !== r0 || data[i + 1] !== g0 || data[i + 2] !== b0 || data[i + 3] !== a0) {
      return false; // some variation found — has real content
    }
  }
  return true; // uniform color across the whole sample — treat as blank
}

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
  const { proposal, template, quotes, quoteLines, client, commercial, company } = portalData;

  // html-to-image (like html2canvas) can come back with a fully blank
  // capture when the rendered node sits far outside the page's layout
  // bounds — some browsers deprioritize/clip paint for elements placed
  // thousands of pixels off-screen (`left: -9999px`), which is exactly how
  // this container used to be positioned. Keep it anchored at the actual
  // viewport origin (0,0) instead, and hide it by clipping a zero-size
  // outer wrapper around it — the inner node still lays out at full size
  // for capture purposes, it just never becomes visible or affects scroll.
  const clipper = document.createElement('div');
  Object.assign(clipper.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    overflow: 'hidden',
    zIndex: '-1',
  });

  const container = document.createElement('div');
  Object.assign(container.style, {
    width: '900px',
    background: '#ffffff',
    overflow: 'visible',
  });
  clipper.appendChild(container);
  document.body.appendChild(clipper);

  let root: ReturnType<typeof createRoot> | null = null;

  try {
    root = createRoot(container);
    root.render(
      createElement(ProposalTemplateDocument, {
        proposal,
        template,
        quotes,
        quoteLines,
        client,
        commercial,
        company,
      })
    );

    // Give React a tick to commit, then wait for fonts + images to settle
    await new Promise<void>((r) => setTimeout(r, 100));
    await document.fonts.ready;
    await waitForImages(container);
    await new Promise<void>((r) => setTimeout(r, 600));

    const fullWidth = 900;
    const fullHeight = Math.max(container.offsetHeight, 1200);

    const captureOptions = {
      width: fullWidth,
      height: fullHeight,
      pixelRatio: 2,
      cacheBust: true,
      imagePlaceholder: TRANSPARENT_PIXEL,
      fetchRequestInit: { mode: 'cors' as RequestMode, cache: 'no-store' as RequestCache },
    };

    let canvas = await toCanvas(container, captureOptions);

    if (isCanvasBlank(canvas)) {
      console.warn('[generateProposalPdfBlob] Captura inicial do PDF saiu em branco — a tentar novamente com pixelRatio reduzido.');
      // Give the DOM a bit more time to (re-)render before the retry capture
      // instead of retrying immediately against the same still-settling frame.
      await new Promise<void>((r) => setTimeout(r, 300));
      canvas = await toCanvas(container, { ...captureOptions, pixelRatio: 1 });
    }

    if (isCanvasBlank(canvas)) {
      throw new BlankCaptureError('Captura do template da proposta saiu em branco.');
    }

    const dataUrl = canvas.toDataURL('image/png');

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
    if (document.body.contains(clipper)) {
      document.body.removeChild(clipper);
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
      // Prefer the quote's own template; fall back to the proposal/org template.
      const quoteOwnTemplate = quote.template_id
        ? await fetchQuotePdfTemplateById(quote.template_id)
        : null;
      const templateForQuote = quoteOwnTemplate ?? fallbackTemplate;
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
 * Generate a single PDF blob for a proposal.
 * - If the proposal has a template selected → renders ProposalTemplateDocument (mirrors the
 *   "Templates de Proposta" editor layout, with the real proposal data) as HTML → PDF
 * - Otherwise → falls back to merging the PDFs of its associated quotes (legacy behaviour)
 */
export async function generateProposalPdfBlob(
  proposalId: string,
): Promise<{ blob: Blob; fileName: string; usedFallback?: boolean }> {
  const portalData = await loadProposalPortalData(proposalId);

  if (portalData?.template) {
    try {
      return await generateFromPortalTemplate(portalData);
    } catch (e) {
      if (e instanceof BlankCaptureError) {
        // The branded template render came back blank (CORS/rasterization
        // issue with html-to-image) — fall back to the vectorial per-quote
        // PDF so the user still gets the proposal's information, instead of
        // an error dialog. A template WAS configured, so let the caller warn
        // the user that the layout shown isn't the one they set up.
        console.warn('[generateProposalPdfBlob] Portal template capture failed, falling back to quote-based PDF:', e.message);
        const result = await generateFromQuotePdfs(proposalId);
        return { ...result, usedFallback: true };
      }
      throw e;
    }
  }

  // No template configured on this proposal — using the quote-based PDF is
  // the expected/default behaviour here, not a fallback from a failure.
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
