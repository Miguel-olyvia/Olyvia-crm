import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { substituteVariables, SAMPLE_VARIABLE_DATA } from "@/utils/contractVariables";
import { useDocumentSettings } from "@/hooks/useDocumentSettings";
import { renderContractHeaderHtml } from "./contractHeader";
import DOMPurify from "dompurify";

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function escapeText(text: unknown): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/** Patterns Tailwind das "variable tags" inseridas pelo RichTextEditor. */
const VARIABLE_CLASS_PATTERNS = [
  "variable-tag",
  "bg-primary",
  "bg-violet",
  "bg-purple",
  "text-primary",
  "font-mono",
];

/** Remove o "chip" lilás das variáveis: desembrulha o <span> deixando só o texto. */
function unwrapVariableSpans(root: HTMLElement, doc: Document) {
  const isVariableSpan = (el: HTMLElement) => {
    if (el.tagName !== "SPAN") return false;
    if (el.hasAttribute("data-var")) return true;
    if (el.getAttribute("contenteditable") === "false") return true;
    const cls = el.getAttribute("class") || "";
    return VARIABLE_CLASS_PATTERNS.some((p) => cls.includes(p));
  };

  // Iterar várias vezes porque podem estar aninhados.
  let pass = 0;
  while (pass++ < 5) {
    const targets = Array.from(root.querySelectorAll<HTMLElement>("span")).filter(isVariableSpan);
    if (targets.length === 0) break;
    targets.forEach((el) => {
      const frag = doc.createDocumentFragment();
      while (el.firstChild) frag.appendChild(el.firstChild);
      el.replaceWith(frag);
    });
  }
}


interface TemplateExportButtonsProps {
  templateName: string;
  bodyHtml: string;
  variant?: "icon" | "button";
  /** Optional document settings override (e.g. editor's mergedSettings). Falls back to org-wide settings. */
  docSettingsOverride?: any;
  /** Optional sample data (e.g. preview data merged with real org header). Falls back to SAMPLE_VARIABLE_DATA. */
  sampleData?: Record<string, any>;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateDocxHtml(name: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${name}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; margin: 2cm; }
  h1, h2, h3 { color: #333; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 6px 8px; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Builds the same DOM as the on-screen <DocumentPreview> + Contract header/footer,
 * with each top-level block tagged `data-pdf-section` so the exporter can paginate
 * without ever cutting a paragraph / list item / table in half.
 */
function buildPdfRenderContainer(opts: {
  bodyHtml: string;
  ds: any;
  sampleData?: Record<string, any>;
}): HTMLDivElement {
  const { bodyHtml, ds } = opts;
  const sampleData = opts.sampleData ?? SAMPLE_VARIABLE_DATA;
  const fontFamily = ds?.font_family || "Arial, sans-serif";

  // 1) Substitui {{var}} pelos valores (org real ou sample).
  const filled = substituteVariables(bodyHtml, sampleData);
  const safeBody = sanitizeHtml(filled);

  // 2) Parse + limpeza: tirar o fundo lilás das variáveis e marcar secções.
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${safeBody}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;

  unwrapVariableSpans(root, doc);

  Array.from(root.children).forEach((child) => {
    const el = child as HTMLElement;
    el.setAttribute("data-pdf-section", "body");
    el.style.pageBreakInside = "avoid";
    el.style.breakInside = "avoid";
    // Reserva visual para descenders ("p", "g", "ç") e underlines que ficam
    // fora do bounding-box em algumas fontes — evita que a última linha saia
    // cortada ao converter px → mm com arredondamento sub-pixel.
    el.style.paddingBottom = "6px";
  });
  root.querySelectorAll<HTMLElement>("li").forEach((li) => {
    li.style.pageBreakInside = "avoid";
    li.style.breakInside = "avoid";
    li.style.paddingBottom = "6px";
  });


  const bodyMarkup = root.innerHTML;

  // 3) Container A4 que espelha o <DocumentPreview>.
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = "210mm";
  container.style.background = "#ffffff";
  container.style.padding = "0";
  container.style.boxSizing = "border-box";
  container.style.fontFamily = fontFamily;
  container.style.fontSize = `${ds?.body_font_size || 11}pt`;
  container.style.color = "#1a1a1a";
  container.style.lineHeight = "1.6";

  // Header — mesma função usada pelo preview (fonte única de verdade).
  const headerHtml = renderContractHeaderHtml(ds, sampleData as any);

  // Footer is rendered per-page (see exportContainerToPdf), NOT inline,
  // to avoid it being pushed to a near-empty trailing page when it doesn't
  // fit in the remaining space on the last content page.
  const footerHtml = "";

  container.innerHTML = `${headerHtml}<div>${bodyMarkup}</div>${footerHtml}`;
  return container;
}

async function exportContainerToPdf(opts: {
  container: HTMLDivElement;
  ds: any;
  filename: string;
}) {
  const { container, ds, filename } = opts;
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const orientation: "portrait" | "landscape" = (ds?.page_orientation || "portrait") as any;
  const format = (ds?.page_size || "a4").toLowerCase();

  const marginTop = Number(ds?.margin_top ?? 20);
  const marginRight = Number(ds?.margin_right ?? 20);
  const marginBottom = Number(ds?.margin_bottom ?? 20);
  const marginLeft = Number(ds?.margin_left ?? 20);

  const pdf = new jsPDF({ unit: "mm", format, orientation });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const contentWidthMm = pageWidthMm - marginLeft - marginRight;
  const contentHeightMm = pageHeightMm - marginTop - marginBottom;

  // Resize container width to match the printable area so html2canvas renders at the right scale.
  // 1mm ≈ 3.7795px at 96dpi.
  const PX_PER_MM = 96 / 25.4;
  container.style.width = `${contentWidthMm}mm`;

  document.body.appendChild(container);
  // Allow images (logo) to load before capturing.
  await new Promise((r) => setTimeout(r, 100));
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );

  try {
    const sections = Array.from(
      container.querySelectorAll<HTMLElement>("[data-pdf-section]"),
    );

    // ── Pré-cálculo do espaço reservado para o rodapé ───────────────────
    // Tem de ser feito ANTES da paginação para que nenhuma secção seja
    // colada na zona onde o rodapé (texto + nº página) será impresso.
    const showFooterPre = ds?.show_footer !== false && !!ds?.footer_text;
    const showPageNumPre = ds?.show_page_numbers !== false;
    const FOOTER_FONT_PT = 9;
    const PT_TO_MM = 25.4 / 72;
    const lineHeightMm = FOOTER_FONT_PT * PT_TO_MM * 1.25; // ~3.97mm
    const pageNumGap = 2.5;
    const dividerGap = 2;
    const bottomPadding = 4;
    const footerLinesPre = showFooterPre
      ? pdf.splitTextToSize(String(ds.footer_text), contentWidthMm)
      : [];
    const footerBlockHeightPre = footerLinesPre.length * lineHeightMm;
    const footerTotalHeightMm =
      (showFooterPre ? footerBlockHeightPre + dividerGap : 0) +
      (showPageNumPre ? pageNumGap + lineHeightMm : 0) +
      bottomPadding;
    const footerReservedMm = Math.max(marginBottom, footerTotalHeightMm + 2);
    const bottomLimitMm = pageHeightMm - footerReservedMm;

    let currentY = marginTop;
    const GAP_MM = 2;

    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const sectionWidthPx = rect.width;
      const sectionHeightPx = rect.height;
      if (!sectionWidthPx || sectionHeightPx <= 0) continue;
      const hasText = (section.textContent || "").replace(/\u00a0/g, "").trim().length > 0;
      const hasVisual = section.querySelector("img, svg, canvas, table, hr, video, picture, iframe") !== null;
      if (!hasText && !hasVisual) continue;

      const canvas = await html2canvas(section, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      if (!canvas.width || !canvas.height) continue;

      const widthMm = sectionWidthPx / PX_PER_MM;
      const heightMm = sectionHeightPx / PX_PER_MM;
      // Folga adicional para descenders/underlines pintados fora da caixa.
      const renderHeightMm = heightMm + 1.2;
      if (!isFinite(heightMm) || !isFinite(widthMm) || heightMm <= 0 || widthMm <= 0) continue;

      const effectiveContentHeightMm = bottomLimitMm - marginTop;
      if (heightMm <= effectiveContentHeightMm) {
        if (currentY + heightMm > bottomLimitMm && currentY > marginTop) {
          pdf.addPage();
          currentY = marginTop;
        }
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.95),
          "JPEG",
          marginLeft,
          currentY,
          widthMm,
          renderHeightMm,
        );
        currentY += heightMm + GAP_MM;

      } else {

        // Section taller than a full page → slice vertically as last-resort fallback.
        // (Only happens for gigantic tables or huge images.)
        let renderedMm = 0;
        let firstSlice = true;
        while (renderedMm < heightMm) {
          if (!firstSlice || currentY + Math.min(effectiveContentHeightMm, heightMm - renderedMm) > bottomLimitMm) {
            pdf.addPage();
            currentY = marginTop;
          }
          const sliceHeightMm = Math.min(effectiveContentHeightMm - (currentY - marginTop), heightMm - renderedMm);

          // Cut a piece of the canvas corresponding to sliceHeightMm.
          // canvasPxPerMm: canvas.height covers heightMm; map mm → canvas px.
          const canvasPxPerMm = canvas.height / heightMm;
          const sliceCanvas = document.createElement("canvas");
          const slicePx = Math.max(1, Math.round(sliceHeightMm * canvasPxPerMm));
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = slicePx;
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            canvas,
            0,
            Math.round(renderedMm * canvasPxPerMm),
            canvas.width,
            slicePx,
            0,
            0,
            canvas.width,
            slicePx,
          );
          pdf.addImage(
            sliceCanvas.toDataURL("image/jpeg", 0.95),
            "JPEG",
            marginLeft,
            currentY,
            widthMm,
            sliceHeightMm,
          );
          renderedMm += sliceHeightMm;
          currentY += sliceHeightMm;
          firstSlice = false;
        }
        currentY += GAP_MM;
      }
    }

    // Per-page footer (text + divider) + page numbers.
    // Layout (de cima para baixo):
    //   [divisor cinza]
    //   [footer linha 1]
    //   [footer linha N]
    //   [Página X de Y]
    //   └ fundo da página
    const showFooter = showFooterPre;
    const showPageNum = showPageNumPre;
    const total = pdf.getNumberOfPages();

    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFontSize(FOOTER_FONT_PT);
      pdf.setTextColor(107, 114, 128);

      const footerLines = footerLinesPre;
      const footerBlockHeight = footerBlockHeightPre;


      // Baseline da numeração: junto ao fundo.
      const pageNumBaselineY = pageHeightMm - bottomPadding;
      // Topo do bloco do footer (baseline da 1ª linha).
      const footerFirstBaselineY = showPageNum
        ? pageNumBaselineY - pageNumGap - footerBlockHeight + lineHeightMm * 0.85
        : pageHeightMm - bottomPadding - footerBlockHeight + lineHeightMm * 0.85;
      const dividerY = footerFirstBaselineY - lineHeightMm * 0.85 - dividerGap;

      if (showFooter) {
        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.2);
        pdf.line(marginLeft, dividerY, pageWidthMm - marginRight, dividerY);
        footerLines.forEach((ln: string, idx: number) => {
          pdf.text(ln, pageWidthMm / 2, footerFirstBaselineY + idx * lineHeightMm, { align: "center" });
        });
      }
      if (showPageNum) {
        pdf.text(`Página ${i} de ${total}`, pageWidthMm / 2, pageNumBaselineY, { align: "center" });
      }
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
  // Silence unused var warning in some build modes.
  void PX_PER_MM;
}

export function TemplateExportButtons({ templateName, bodyHtml, variant = "icon", docSettingsOverride, sampleData }: TemplateExportButtonsProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const { settings: orgDocSettings } = useDocumentSettings();
  const ds = docSettingsOverride ?? orgDocSettings;
  const effectiveSample = sampleData ? { ...SAMPLE_VARIABLE_DATA, ...sampleData } : SAMPLE_VARIABLE_DATA;

  const handleExportDocx = async () => {
    setExporting("docx");
    try {
      const docHtml = generateDocxHtml(templateName, bodyHtml);
      const blob = new Blob([docHtml], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const safeName = templateName.replace(/[^a-zA-Z0-9À-ÿ\s-_]/g, "").trim() || "minuta";
      downloadBlob(blob, `${safeName}.doc`);
      toast.success("Ficheiro Word exportado");
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    setExporting("pdf");
    try {
      const container = buildPdfRenderContainer({ bodyHtml, ds, sampleData: effectiveSample });
      const safeName = templateName.replace(/[^a-zA-Z0-9À-ÿ\s-_]/g, "").trim() || "minuta";
      await exportContainerToPdf({
        container,
        ds,
        filename: `${safeName}_preview.pdf`,
      });
      toast.success("PDF exportado com dados de exemplo");
    } catch (err: any) {
      toast.error("Erro ao exportar PDF: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  if (variant === "icon") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Exportar" disabled={!!exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleExportDocx} className="gap-2">
            <FileText className="h-4 w-4" /> Exportar como Word (.doc)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportPdf} className="gap-2">
            <FileText className="h-4 w-4" /> Exportar como PDF (dados exemplo)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={!!exporting} className="gap-1.5">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportDocx} className="gap-2">
          <FileText className="h-4 w-4" /> Exportar como Word (.doc)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPdf} className="gap-2">
          <FileText className="h-4 w-4" /> Exportar como PDF (dados exemplo)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
