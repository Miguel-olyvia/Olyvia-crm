import { useState, useEffect, useCallback, useRef } from "react";
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { QuotePDFDocument } from "@/components/QuotePDFDocument";
import { supabase } from "@/integrations/supabase/client";
import type { InlineQuoteData } from "@/components/proposals/InlineQuoteBuilder";
import { fetchActivePdfTemplates } from "@/utils/quotePdfTemplate";
import { buildQuoteRenderContext } from "@/utils/buildQuoteRenderContext";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface QuotePdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteData: any;
  lines: any[];
  organizationId: string | null;
  entityId: string | null;
  inlineQuotes?: InlineQuoteData[];
  fees?: any[];
  initialTemplateId?: string | null;
  onTemplateChange?: (templateId: string | null) => void;
}

export function QuotePdfPreviewDialog({
  open,
  onOpenChange,
  quoteData,
  lines,
  organizationId,
  entityId,
  inlineQuotes,
  fees = [],
  initialTemplateId,
  onTemplateChange,
}: QuotePdfPreviewDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalTemplates, setProposalTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const previewRequestRef = useRef(0);

  const renderPdfPreview = useCallback(async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const pdfDocument = await getDocument({ data: arrayBuffer }).promise;
    const renderedPages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Não foi possível preparar a pré-visualização do PDF.");
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({ canvasContext: context, viewport }).promise;
      renderedPages.push(canvas.toDataURL("image/png"));
    }

    if (renderedPages.length === 0) {
      throw new Error("Não foi possível renderizar a pré-visualização do PDF.");
    }

    setPreviewPages(renderedPages);
  }, []);

  const generatePreview = useCallback(async (templateIdOverride?: string) => {
    if (open && organizationId && !templatesLoaded && !templateIdOverride) return;

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setLoading(true);
    setError(null);
    setPreviewPages([]);

    try {
      let orgData: any = null;
      let logoBase64: string | null = null;
      if (organizationId) {
        const { data: org } = await (supabase as any).from("anew_organizations").select("id, name, logo_url, metadata").eq("id", organizationId).maybeSingle();
        orgData = org;
        if (org?.logo_url) {
          try {
            const response = await fetch(org.logo_url);
            const blob = await response.blob();
            logoBase64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error("Error converting logo to base64:", e);
          }
        }
      }

      const { ctx, raw } = await buildQuoteRenderContext({
        quoteData: { ...quoteData, entity_id: entityId || quoteData?.entity_id },
        organizationId,
        preloadedOrg: orgData,
        logoBase64,
      });

      const mapLine = (line: any, sectionName: string) => {
        const custoUnit = (line.custo_material_unit || 0) + (line.custo_mao_obra_unit || 0);
        const isManual = custoUnit === 0 && (line.retail_price_unit !== undefined && line.retail_price_unit !== null);
        const unitPrice = isManual ? (line.retail_price_unit || 0) : custoUnit * (1 + (line.margem_percent || 0) / 100) * (1 + (line.int_percent || 0) / 100);
        const precoSemIvaBase = unitPrice * (line.qt || 0);
        const lineDiscount = line.discount_percent || 0;
        const precoSemIva = precoSemIvaBase * (1 - lineDiscount / 100);

        return {
          ...line,
          section_name: sectionName,
          total_sem_iva: line.total_sem_iva ?? precoSemIva,
          products: line.products || (line.sku ? { sku: line.sku } : undefined),
          services: line.services || undefined,
        };
      };

      const mainSectionName = quoteData?.title?.trim() || "Geral";
      const mappedLines = (lines || []).map((line: any) => mapLine(line, line?.section_name?.trim() || mainSectionName));

      if (inlineQuotes && inlineQuotes.length > 0) {
        for (const iq of inlineQuotes) {
          if (!iq.lines || iq.lines.length === 0) continue;
          const sectionName = iq.title || "Orçamento adicional";
          for (const iqLine of iq.lines) {
            mappedLines.push(mapLine(iqLine, sectionName));
          }
        }
      }

      const effectiveTemplateId = templateIdOverride || selectedTemplateId;
      const pdfElement = React.createElement(QuotePDFDocument as any, {
        quote: { ...quoteData, entity_id: raw.entityId || quoteData?.entity_id || null },
        company: raw.company,
        client: raw.client,
        lines: mappedLines,
        fees,
        user: raw.user,
        descontoPercent: quoteData?.desconto_global_percent || 0,
        proposalTemplate: proposalTemplates.find((template) => template.id === effectiveTemplateId) || null,
        renderContext: ctx,
        // Preview tolera variáveis vazias para permitir experimentar configurações
        strictVariables: false,
      });

      const blob = await (pdf as any)(pdfElement).toBlob();
      const url = URL.createObjectURL(blob);

      if (previewRequestRef.current !== requestId) {
        URL.revokeObjectURL(url);
        return;
      }

      setPdfUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return url;
      });

      await renderPdfPreview(blob);
    } catch (err: any) {
      if (previewRequestRef.current !== requestId) return;
      console.error("PDF preview error:", err);
      setError(err.message || "Erro ao gerar pré-visualização");
    } finally {
      if (previewRequestRef.current === requestId) setLoading(false);
    }
  }, [entityId, fees, inlineQuotes, lines, open, organizationId, proposalTemplates, quoteData, renderPdfPreview, selectedTemplateId, templatesLoaded]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    onTemplateChange?.(templateId === "default" ? null : templateId);
    void generatePreview(templateId);
  };

  useEffect(() => {
    if (!open || !organizationId) {
      setProposalTemplates([]);
      setSelectedTemplateId("default");
      setTemplatesLoaded(false);
      return;
    }

    const loadProposalTemplates = async () => {
      setTemplatesLoaded(false);
      const templates = await fetchActivePdfTemplates(organizationId);
      setProposalTemplates(templates);
      setSelectedTemplateId((current) => {
        if (initialTemplateId && templates.some((t: any) => t.id === initialTemplateId)) return initialTemplateId;
        if (current !== "default" && templates.some((template: any) => template.id === current)) return current;
        return templates.find((template: any) => template.template_type === "quote" && template.is_default)?.id
          || templates.find((template: any) => template.template_type === "quote")?.id
          || templates.find((template: any) => template.is_default)?.id
          || templates[0]?.id
          || "default";
      });
      setTemplatesLoaded(true);
    };

    void loadProposalTemplates();
  }, [open, organizationId, initialTemplateId]);

  useEffect(() => {
    if (open) {
      void generatePreview();
    } else {
      setError(null);
      setPreviewPages([]);
    }
  }, [open, generatePreview]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `Orcamento_${quoteData.quote_number || "rascunho"}_${new Date().toISOString().split("T")[0]}.pdf`;
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b flex-row items-center justify-between">
          <DialogTitle className="text-lg">Pré-visualização do PDF</DialogTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Layout do PDF</Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateChange} disabled={loading || proposalTemplates.length === 0}>
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue placeholder="Layout padrão" />
                </SelectTrigger>
                <SelectContent>
                  {proposalTemplates.length === 0 ? (
                    <SelectItem value="default">Layout padrão</SelectItem>
                  ) : proposalTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} · {template.template_type === "quote" ? "Orçamento" : "Proposta"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => void generatePreview()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button size="sm" onClick={handleDownload} disabled={!pdfUrl || loading}>
              <Download className="w-4 h-4 mr-1" />
              Download PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/30">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">A gerar pré-visualização...</p>
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={() => void generatePreview()}>Tentar novamente</Button>
              </div>
            </div>
          )}
          {!loading && !error && previewPages.length > 0 && (
            <div className="flex flex-col items-center gap-4 p-4">
              {previewPages.map((pageImage, index) => (
                <div key={index} className="w-full max-w-3xl overflow-hidden rounded-lg border bg-background shadow-sm">
                  <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                    Página {index + 1}
                  </div>
                  <img
                    src={pageImage}
                    alt={`Pré-visualização da página ${index + 1} do PDF`}
                    className="block h-auto w-full"
                    loading={index === 0 ? "eager" : "lazy"}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
