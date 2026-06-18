/**
 * DocumentPreview — Fase 3 (.lovable/plan.md §7).
 *
 * Render real (igual ao output final) para os 3 contextos:
 *   - quote / proposal / contract → HTML formatado dentro de moldura A4
 *
 * Política:
 *  - NÃO recalcula totais, IVA, descontos, fees. Apenas mostra o `bodyHtml`
 *    do template após substituição de variáveis e aplicação dos design tokens.
 *  - Se faltar `bodyHtml`, mostra placeholder seguro com a configuração atual.
 *  - Para quote: o PDF final é gerado por `@react-pdf/renderer`; aqui mostra-se
 *    a aproximação HTML do layout para feedback visual rápido no editor.
 *  - Sample data é estável e descritiva (`{{cliente_nome}} → "Cliente Exemplo"`)
 *    para o utilizador ver como cada variável vai aparecer no documento final.
 */

import { useMemo } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import type { DocumentContext, DocumentTemplateSettings } from "@/utils/documentTemplate/types";

interface Props {
  context: DocumentContext;
  settings: DocumentTemplateSettings;
  /** HTML do template (body). Quando ausente, mostra placeholder informativo. */
  bodyHtml?: string;
  /** Variáveis específicas que sobrescrevem o sample data por defeito. */
  sampleData?: Record<string, string>;
  className?: string;
  /** Pre-processador opcional para substituição context-specific. Recebe bodyHtml cru e devolve HTML resolvido. */
  preprocessHtml?: (bodyHtml: string, data: Record<string, any>) => string;
  /** JSX para substituir o header padrão (continua a respeitar `show_header !== false`). */
  headerSlot?: React.ReactNode;
  /** JSX para substituir o footer padrão (continua a respeitar `show_footer !== false`). */
  footerSlot?: React.ReactNode;
}

const CONTEXT_LABELS: Record<DocumentContext, string> = {
  proposal: "Proposta",
  quote: "Orçamento",
  contract: "Contrato",
};

const DEFAULT_SAMPLE_DATA: Record<string, string> = {
  cliente_nome: "Cliente Exemplo, Lda.",
  cliente_email: "cliente@exemplo.pt",
  cliente_telefone: "+351 912 345 678",
  cliente_nif: "500000000",
  cliente_morada: "Rua Exemplo 123, 1000-100 Lisboa",
  empresa_nome: "A Sua Empresa",
  empresa_email: "geral@suaempresa.pt",
  empresa_telefone: "+351 210 000 000",
  empresa_nif: "501234567",
  empresa_morada: "Av. Principal 1, 1000-001 Lisboa",
  data_hoje: new Date().toLocaleDateString("pt-PT"),
  numero_documento: "DOC-2026-0001",
  contrato_numero: "CC-2026-0001",
  orcamento_numero: "Q-2026-0001",
  proposta_numero: "P-2026-0001",
  valor_total: "€1.250,00",
  comercial_nome: "João Silva",
};

function substitutePlaceholders(html: string, data: Record<string, string>): string {
  // {{key}} or {{ key }} (case-insensitive)
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const lower = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(data, lower)) return data[lower];
    if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
    return `<span style="color:#9ca3af;font-style:italic;">{{${key}}}</span>`;
  });
}

export function DocumentPreview({ context, settings, bodyHtml, sampleData, className, preprocessHtml, headerSlot, footerSlot }: Props) {
  const ds = settings as any;
  const isLandscape = ds?.page_orientation === "landscape";
  const pageWidth = isLandscape ? "297mm" : "210mm";
  const pageHeight = isLandscape ? "210mm" : "297mm";
  const primaryColor = ds?.primary_color || ds?.accent_color || "#7C3AED";
  const headerLayout = ds?.header_layout || "left";
  const fontFamily = ds?.font_family || ds?.body_font || "Arial, sans-serif";

  const data = useMemo(() => ({ ...DEFAULT_SAMPLE_DATA, ...(sampleData || {}) }), [sampleData]);
  const renderedHtml = useMemo(() => {
    if (!bodyHtml) return null;
    const substituted = preprocessHtml ? preprocessHtml(bodyHtml, data) : substitutePlaceholders(bodyHtml, data);
    return DOMPurify.sanitize(substituted);
  }, [bodyHtml, data, preprocessHtml]);

  if (!renderedHtml) {
    return (
      <Card className={className}>
        <CardContent className="p-8 flex flex-col items-center justify-center text-center min-h-[300px] gap-3">
          <div className="rounded-full bg-muted p-3">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h3 className="text-base font-semibold">Pré-visualização — {CONTEXT_LABELS[context]}</h3>
              <Badge variant="outline" className="text-[10px]">sem corpo</Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              Adicione conteúdo ao corpo do template para ver a pré-visualização.
              {context === "quote" && " O PDF final é gerado pelo motor de @react-pdf."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`flex justify-center overflow-auto max-h-[70vh] ${className ?? ""}`}>
      <div
        className="bg-white shadow-lg border"
        style={{
          width: pageWidth,
          minHeight: pageHeight,
          padding: `${ds?.margin_top ?? 20}mm ${ds?.margin_right ?? 15}mm ${ds?.margin_bottom ?? 20}mm ${ds?.margin_left ?? 15}mm`,
          fontFamily,
          fontSize: `${ds?.body_font_size || 11}pt`,
          color: "#1a1a1a",
          lineHeight: 1.6,
        }}
      >
        {ds?.show_header !== false && (
          headerSlot !== undefined ? headerSlot : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: headerLayout === "center" ? "center" : headerLayout === "right" ? "flex-end" : "flex-start",
                flexDirection: headerLayout === "center" ? "column" : "row",
                gap: "12px",
                marginBottom: "16px",
                paddingBottom: "12px",
                borderBottom: ds?.header_show_separator !== false ? `2px solid ${primaryColor}` : "none",
              }}
            >
              {ds?.logo_url && (
                <img src={ds.logo_url} alt="Logo" style={{ maxHeight: "48px", objectFit: "contain" }} />
              )}
              {!ds?.logo_url && (
                <h1 style={{ margin: 0, fontSize: "18pt", color: primaryColor }}>
                  {data.empresa_nome}
                </h1>
              )}
            </div>
          )
        )}

        <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />

        {ds?.show_footer !== false && (
          footerSlot !== undefined ? footerSlot : (
            ds?.footer_text && (
              <div
                style={{
                  marginTop: "24px",
                  paddingTop: "12px",
                  borderTop: "1px solid #e5e7eb",
                  textAlign: "center",
                  fontSize: "9pt",
                  color: "#6b7280",
                }}
              >
                {ds.footer_text}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

export default DocumentPreview;
