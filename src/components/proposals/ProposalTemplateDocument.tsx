import type { CSSProperties } from "react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import type { ClientCtx } from "@/utils/documentVariables/context";
import { formatCurrency } from "@/lib/utils";

/**
 * Renderiza uma proposta EXATAMENTE com o layout configurado em "Templates de
 * Proposta" (ProposalTemplateEditor / ProposalPreview) — mas com os dados
 * reais da proposta, em vez dos dados de demonstração usados no editor.
 *
 * Isto existe para que o PDF descarregado corresponda ao que o utilizador vê
 * e configura no editor de templates, em vez do layout do portal do cliente
 * (ProposalPortalDocument, que é interativo e tem uma aparência diferente).
 *
 * O switch de secções replica deliberadamente o de ProposalPreview em
 * ProposalTemplateEditor.tsx — qualquer alteração visual feita lá ao layout
 * de uma secção deve ser espelhada aqui para os dois se manterem em sintonia.
 */

interface DocumentSection {
  id?: string;
  type: string;
  label?: string;
  visible?: boolean;
  settings?: Record<string, any>;
}

// Mesmos defaults usados em ProposalTemplateEditor.tsx (defaultConfig) para os
// campos visuais lidos por este documento. Mantidos aqui em separado — este
// ficheiro não importa do editor (componente grande, com estado/UI própria).
const DEFAULTS = {
  primary_color: "#000000",
  secondary_color: "#374151",
  accent_color: "#f59e0b",
  background_color: "#ffffff",
  surface_color: "#f3f4f6",
  text_color: "#1f2937",
  text_secondary_color: "#6b7280",
  border_color: "#e5e7eb",
  header_bg_color: "#ffffff",
  header_text_color: "#000000",
  header_gradient: false,
  header_gradient_to: "#ffffff",
  quote_header_bg: "#374151",
  quote_header_text: "#ffffff",
  quote_row_alt_bg: "#f9fafb",
  quote_border_color: "#e5e7eb",
  content_block_bg: "#ffffff",
  font_family: "Inter",
  heading_font_family: "Inter",
  font_size_base: 16,
  font_size_heading: 24,
  font_size_small: 14,
  line_height: 1.6,
  padding_page: 40,
  padding_section: 24,
  padding_card: 20,
  gap_sections: 24,
  border_radius: 0,
  max_width: 794,
  accept_button_text: "Aceitar Proposta",
  accept_button_bg: "#10b981",
  accept_button_text_color: "#ffffff",
  reject_button_text: "Recusar",
  reject_button_bg: "#ef4444",
  reject_button_text_color: "#ffffff",
};

const DEFAULT_SECTIONS: DocumentSection[] = [
  { id: "header", type: "header", label: "Cabeçalho", visible: true, settings: { layout: "quote_pdf", showLogo: true, showDate: true, customTitle: "PROPOSTA" } },
  { id: "client_info", type: "client_info", label: "Cliente", visible: true, settings: { layout: "quote_pdf", showAddress: true, showContacts: true, sectionLabel: "CLIENTE" } },
  { id: "notes", type: "notes", label: "Notas", visible: true, settings: { showTitle: true, sectionLabel: "NOTAS" } },
  { id: "quote_items", type: "quote_items", label: "Detalhes do Orçamento", visible: true, settings: { showUnitPrice: true, tableStyle: "quote_pdf", sectionLabel: "DETALHES DO ORÇAMENTO" } },
  { id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
  { id: "footer", type: "footer", label: "Rodapé", visible: true, settings: {} },
];

// Mesma fórmula usada em QuotePDFDocument.tsx (calculateUnitPrice) — mantém o
// preço unitário consistente com o PDF do orçamento.
function calculateUnitPrice(line: any): number {
  const materialCost = parseFloat(String(line.custo_material_unit || 0));
  const laborCost = parseFloat(String(line.custo_mao_obra_unit || 0));
  const margin = parseFloat(String(line.margem_percent || 0));
  const intermediary = parseFloat(String(line.int_percent || 0));
  const totalCost = materialCost + laborCost;
  if (totalCost === 0 && line.retail_price_unit) {
    return parseFloat(String(line.retail_price_unit || 0));
  }
  return totalCost * (1 + margin / 100) * (1 + intermediary / 100);
}

function mergeConfig(template: any | null) {
  const design = (template?.design_settings && typeof template.design_settings === "object")
    ? template.design_settings
    : {};
  return {
    ...DEFAULTS,
    ...design,
    primary_color: template?.primary_color || DEFAULTS.primary_color,
    secondary_color: template?.secondary_color || DEFAULTS.secondary_color,
    accent_color: template?.accent_color || DEFAULTS.accent_color,
    background_color: template?.background_color || DEFAULTS.background_color,
    text_color: template?.text_color || DEFAULTS.text_color,
    font_family: template?.font_family || DEFAULTS.font_family,
    heading_font_family: template?.heading_font_family || DEFAULTS.heading_font_family,
    header_text: template?.header_text || "",
    footer_text: template?.footer_text || "",
    terms_conditions: template?.terms_conditions || "",
    thank_you_message: template?.thank_you_message || "",
    logo_url: template?.logo_url || "",
  };
}

interface ProposalTemplateDocumentProps {
  proposal: any;
  template: any | null;
  quotes: any[];
  quoteLines: Record<string, any[]>;
  client: ClientCtx | null;
  company: any | null;
  commercial: { name: string; phone: string | null; email: string | null } | null;
}

export function ProposalTemplateDocument({
  proposal,
  template,
  quotes,
  quoteLines,
  client,
  company,
  commercial,
}: ProposalTemplateDocumentProps) {
  const cfg = mergeConfig(template);
  const sections: DocumentSection[] = Array.isArray(template?.sections) && template.sections.length > 0
    ? template.sections
    : DEFAULT_SECTIONS;
  const visibleSections = sections.filter((s) => s.visible !== false);

  const proposalNumber = proposal.proposal_number || "";
  const proposalValue = Number(proposal.value) || quotes.reduce((sum, q) => sum + (Number(q.total) || 0), 0);
  const clientAddress = client?.address || "";

  const renderSection = (section: DocumentSection) => {
    const sectionStyle: CSSProperties = { marginBottom: cfg.gap_sections };
    const icon = section.settings?.showIcon !== false ? (section.settings?.customIcon || "") : "";
    const label = section.settings?.sectionLabel || section.label || "";

    switch (section.type) {
      case "header": {
        if (section.settings?.layout === "quote_pdf") {
          return (
            <div key={section.id || "header"} style={{ ...sectionStyle, paddingBottom: 24, borderBottom: `4px solid ${cfg.primary_color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32 }}>
                <div>
                  <h1 style={{ fontFamily: cfg.heading_font_family, fontSize: 42, fontWeight: "bold", color: cfg.header_text_color, marginBottom: 14 }}>
                    {section.settings?.customTitle || proposal.title || "PROPOSTA"}
                  </h1>
                  {proposalNumber && <p style={{ color: cfg.text_color, fontSize: cfg.font_size_small, marginBottom: 4 }}>{proposalNumber}</p>}
                  {section.settings?.showDate !== false && (
                    <p style={{ color: cfg.text_color, fontSize: cfg.font_size_small }}>
                      Data: {format(new Date(proposal.created_at), "dd/MM/yyyy", { locale: pt })}
                    </p>
                  )}
                  {cfg.header_text && <p style={{ color: cfg.text_secondary_color, marginTop: 12 }}>{cfg.header_text}</p>}
                </div>
                {section.settings?.showLogo !== false && cfg.logo_url && (
                  <img src={cfg.logo_url} alt="Logo" style={{ height: 96, width: 192, objectFit: "contain" }} />
                )}
              </div>
            </div>
          );
        }
        return (
          <div
            key={section.id || "header"}
            style={{
              ...sectionStyle,
              background: cfg.header_gradient ? `linear-gradient(135deg, ${cfg.header_bg_color}, ${cfg.header_gradient_to})` : cfg.header_bg_color,
              color: cfg.header_text_color,
              padding: cfg.padding_section,
              borderRadius: cfg.border_radius,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                {section.settings?.showLogo !== false && cfg.logo_url && (
                  <img src={cfg.logo_url} alt="Logo" style={{ height: 48, marginBottom: 16, objectFit: "contain" }} />
                )}
                <h1 style={{ fontFamily: cfg.heading_font_family, fontSize: cfg.font_size_heading, fontWeight: "bold", marginBottom: 8 }}>
                  {section.settings?.customTitle || proposal.title}
                </h1>
                {cfg.header_text && <p style={{ opacity: 0.8 }}>{cfg.header_text}</p>}
              </div>
              {section.settings?.showDate !== false && (
                <div style={{ textAlign: "right" }}>
                  <p style={{ opacity: 0.8, fontSize: cfg.font_size_small, marginTop: 8 }}>
                    {format(new Date(proposal.created_at), "dd 'de' MMMM 'de' yyyy", { locale: pt })}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      }

      case "company_info": {
        if (!company?.name && !cfg.logo_url) return null;
        return (
          <div key={section.id || "company_info"} style={{ ...sectionStyle, border: `1px solid ${cfg.border_color}`, borderRadius: cfg.border_radius, padding: cfg.padding_card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: cfg.primary_color }}>
              {icon && <span>{icon}</span>}
              <span style={{ fontSize: cfg.font_size_small, fontWeight: 500 }}>{label || "Empresa"}</span>
            </div>
            {company?.name && <p style={{ fontWeight: 600, color: cfg.text_color }}>{company.name}</p>}
          </div>
        );
      }

      case "client_info": {
        const name = client?.display_name || "";
        if (section.settings?.layout === "quote_pdf") {
          return (
            <div key={section.id || "client_info"} style={sectionStyle}>
              <div style={{ backgroundColor: cfg.surface_color, padding: "8px 10px", marginBottom: 10 }}>
                <span style={{ color: cfg.text_color, fontWeight: "bold", fontSize: cfg.font_size_small }}>{label || "CLIENTE"}</span>
              </div>
              <div>
                {name && (
                  <div style={{ display: "flex" }}>
                    <span style={{ fontWeight: "bold", width: 112, color: cfg.text_color, fontSize: cfg.font_size_small }}>Nome:</span>
                    <span style={{ color: cfg.text_color, fontSize: cfg.font_size_small }}>{name}</span>
                  </div>
                )}
                {section.settings?.showContacts !== false && client?.email && (
                  <div style={{ display: "flex" }}>
                    <span style={{ fontWeight: "bold", width: 112, color: cfg.text_color, fontSize: cfg.font_size_small }}>Email:</span>
                    <span style={{ color: cfg.text_color, fontSize: cfg.font_size_small }}>{client.email}</span>
                  </div>
                )}
                {section.settings?.showContacts !== false && client?.phone && (
                  <div style={{ display: "flex" }}>
                    <span style={{ fontWeight: "bold", width: 112, color: cfg.text_color, fontSize: cfg.font_size_small }}>Telefone:</span>
                    <span style={{ color: cfg.text_color, fontSize: cfg.font_size_small }}>{client.phone}</span>
                  </div>
                )}
                {section.settings?.showAddress !== false && clientAddress && (
                  <div style={{ display: "flex" }}>
                    <span style={{ fontWeight: "bold", width: 112, color: cfg.text_color, fontSize: cfg.font_size_small }}>Morada:</span>
                    <span style={{ color: cfg.text_color, fontSize: cfg.font_size_small }}>{clientAddress}</span>
                  </div>
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={section.id || "client_info"} style={{ ...sectionStyle, border: `1px solid ${cfg.border_color}`, borderRadius: cfg.border_radius, padding: cfg.padding_card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: cfg.primary_color }}>
              {icon && <span>{icon}</span>}
              <span style={{ fontSize: cfg.font_size_small, fontWeight: 500 }}>{label || "Cliente"}</span>
            </div>
            {name && <p style={{ fontWeight: 600, color: cfg.text_color }}>{name}</p>}
            {section.settings?.showContacts !== false && client?.email && <p style={{ color: cfg.text_secondary_color, fontSize: cfg.font_size_small }}>{client.email}</p>}
            {section.settings?.showContacts !== false && client?.phone && <p style={{ color: cfg.text_secondary_color, fontSize: cfg.font_size_small }}>{client.phone}</p>}
            {section.settings?.showAddress !== false && clientAddress && <p style={{ color: cfg.text_secondary_color, fontSize: cfg.font_size_small }}>{clientAddress}</p>}
          </div>
        );
      }

      case "description": {
        const content = section.settings?.content || proposal.description || "";
        if (!content) return null;
        return (
          <div key={section.id || "description"} style={sectionStyle}>
            {section.settings?.showTitle !== false && (
              <div style={{ backgroundColor: cfg.surface_color, padding: "8px 10px", marginBottom: 10 }}>
                <span style={{ color: cfg.text_color, fontWeight: "bold", fontSize: cfg.font_size_small }}>{icon && `${icon} `}{label || "Descrição do trabalho"}</span>
              </div>
            )}
            <div style={{ padding: cfg.padding_card, backgroundColor: cfg.content_block_bg, border: `1px solid ${cfg.border_color}`, borderRadius: cfg.border_radius }}>
              <p style={{ color: cfg.text_secondary_color, lineHeight: cfg.line_height, whiteSpace: "pre-wrap" }}>{content}</p>
            </div>
          </div>
        );
      }

      case "notes": {
        const content = section.settings?.content || proposal.notes || quotes.map((q) => q.client_notes).filter(Boolean).join("\n\n") || "";
        if (!content) return null;
        return (
          <div key={section.id || "notes"} style={sectionStyle}>
            {section.settings?.showTitle !== false && (
              <div style={{ backgroundColor: cfg.surface_color, padding: "8px 10px", marginBottom: 10 }}>
                <span style={{ color: cfg.text_color, fontWeight: "bold", fontSize: cfg.font_size_small }}>{icon && `${icon} `}{label || "Notas"}</span>
              </div>
            )}
            <div style={{ padding: cfg.padding_card, backgroundColor: cfg.content_block_bg, border: `1px solid ${cfg.border_color}`, borderRadius: cfg.border_radius }}>
              <p style={{ color: cfg.text_secondary_color, lineHeight: cfg.line_height, whiteSpace: "pre-wrap" }}>{content}</p>
            </div>
          </div>
        );
      }

      case "terms": {
        if (!cfg.terms_conditions) return null;
        return (
          <div key={section.id || "terms"} style={sectionStyle}>
            {section.settings?.showTitle !== false && (
              <div style={{ backgroundColor: cfg.surface_color, padding: "8px 10px", marginBottom: 10 }}>
                <span style={{ color: cfg.text_color, fontWeight: "bold", fontSize: cfg.font_size_small }}>{icon && `${icon} `}{label || "Condições Gerais"}</span>
              </div>
            )}
            <div style={{ padding: cfg.padding_card, backgroundColor: cfg.content_block_bg, border: `1px solid ${cfg.border_color}`, borderRadius: cfg.border_radius }}>
              <p style={{ color: cfg.text_secondary_color, fontSize: cfg.font_size_small, lineHeight: cfg.line_height, whiteSpace: "pre-wrap" }}>{cfg.terms_conditions}</p>
            </div>
          </div>
        );
      }

      case "validity": {
        if (!proposal.valid_until) return null;
        return (
          <div key={section.id || "validity"} style={{ ...sectionStyle, display: "flex", alignItems: "center", gap: 8 }}>
            {icon && <span style={{ color: cfg.text_secondary_color, fontSize: cfg.font_size_small }}>{icon}</span>}
            <span style={{ color: cfg.text_secondary_color, fontSize: cfg.font_size_small }}>{label || "Válida até"}:</span>
            <span style={{ fontWeight: 500, color: cfg.text_color, fontSize: cfg.font_size_small }}>
              {format(new Date(proposal.valid_until), "dd/MM/yyyy", { locale: pt })}
            </span>
          </div>
        );
      }

      case "value": {
        return (
          <div
            key={section.id || "value"}
            style={{
              ...sectionStyle,
              background: `${cfg.primary_color}10`,
              padding: cfg.padding_card,
              borderRadius: cfg.border_radius,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {icon && <span style={{ color: cfg.primary_color }}>{icon}</span>}
              <span style={{ fontWeight: 500, color: cfg.text_color }}>{label || "Valor da Proposta"}</span>
            </div>
            <span style={{ fontSize: 24, fontWeight: "bold", color: cfg.primary_color }}>{formatCurrency(proposalValue)}</span>
          </div>
        );
      }

      case "quotes": {
        return (
          <div key={section.id || "quotes"} style={sectionStyle}>
            <h3 style={{ fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, color: cfg.text_color }}>
              {icon && <span>{icon}</span>}{label || "Orçamentos Associados"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {quotes.map((quote) => (
                <div key={quote.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, backgroundColor: cfg.surface_color, borderRadius: cfg.border_radius, border: `1px solid ${cfg.border_color}` }}>
                  <span style={{ fontWeight: 500, color: cfg.text_color }}>{quote.quote_number}</span>
                  <span style={{ fontWeight: 600, color: cfg.primary_color }}>{formatCurrency(quote.total || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case "quote_items": {
        if (quotes.length === 0) return null;
        const quoteItemsLabel = label || "Itens dos Orçamentos";
        if (section.settings?.tableStyle === "quote_pdf") {
          return (
            <div key={section.id || "quote_items"} style={sectionStyle}>
              <div style={{ backgroundColor: cfg.surface_color, padding: "8px 10px", marginBottom: 10 }}>
                <span style={{ color: cfg.text_color, fontWeight: "bold", fontSize: cfg.font_size_small }}>{quoteItemsLabel}</span>
              </div>
              <div style={{ border: `1px solid ${cfg.quote_border_color}` }}>
                <div style={{ display: "flex", padding: "8px 12px", fontWeight: "bold", backgroundColor: cfg.quote_header_bg, color: cfg.quote_header_text, fontSize: 12 }}>
                  <span style={{ width: "14%" }}>SKU</span>
                  <span style={{ flex: 1 }}>Descrição</span>
                  <span style={{ width: "8%", textAlign: "center" }}>Unid.</span>
                  <span style={{ width: "8%", textAlign: "right" }}>Qtd.</span>
                  <span style={{ width: "13%", textAlign: "right" }}>P. Unit.</span>
                  <span style={{ width: "7%", textAlign: "center" }}>IVA</span>
                  <span style={{ width: "13%", textAlign: "right" }}>Total</span>
                </div>
                {quotes.map((quote) => (quoteLines[quote.id] || []).map((line: any, idx: number) => {
                  const unitPrice = calculateUnitPrice(line);
                  const qty = parseFloat(String(line.qt || 0));
                  const total = parseFloat(String(line.total_sem_iva || 0));
                  const sku = line.products?.sku || line.services?.sku || line.ordem?.toString() || "-";
                  return (
                    <div key={line.id || idx} style={{ display: "flex", padding: "8px 12px", borderTop: `1px solid ${cfg.quote_border_color}`, fontSize: 12, color: cfg.text_color }}>
                      <span style={{ width: "14%" }}>{sku}</span>
                      <span style={{ flex: 1 }}>{line.descricao_snapshot || ""}</span>
                      <span style={{ width: "8%", textAlign: "center" }}>{line.unidade || "UN"}</span>
                      <span style={{ width: "8%", textAlign: "right" }}>{qty.toFixed(2)}</span>
                      <span style={{ width: "13%", textAlign: "right" }}>{formatCurrency(unitPrice)}</span>
                      <span style={{ width: "7%", textAlign: "center" }}>{Number(line.iva_percent || 0).toFixed(0)}%</span>
                      <span style={{ width: "13%", textAlign: "right", fontWeight: "bold" }}>{formatCurrency(total)}</span>
                    </div>
                  );
                }))}
              </div>
            </div>
          );
        }
        return (
          <div key={section.id || "quote_items"} style={sectionStyle}>
            <h3 style={{ fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, color: cfg.text_color }}>
              {icon && <span>{icon}</span>}{quoteItemsLabel}
            </h3>
            {quotes.map((quote) => (
              <div key={quote.id} style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: cfg.font_size_small, fontWeight: 500, marginBottom: 8, color: cfg.text_secondary_color }}>Itens de {quote.quote_number}</h4>
                <div style={{ borderRadius: cfg.border_radius, overflow: "hidden", border: `1px solid ${cfg.quote_border_color}` }}>
                  <div style={{ display: "flex", padding: 12, fontSize: 14, fontWeight: 500, backgroundColor: cfg.quote_header_bg, color: cfg.quote_header_text }}>
                    <span style={{ flex: 1 }}>Item</span>
                    <span style={{ width: 64, textAlign: "right" }}>Qtd</span>
                    {section.settings?.showUnitPrice !== false && (
                      <>
                        <span style={{ width: 96, textAlign: "right" }}>Preço</span>
                        <span style={{ width: 96, textAlign: "right" }}>Total</span>
                      </>
                    )}
                  </div>
                  {(quoteLines[quote.id] || []).map((line: any, idx: number) => {
                    const unitPrice = calculateUnitPrice(line);
                    const qty = parseFloat(String(line.qt || 0));
                    const total = parseFloat(String(line.total_sem_iva || 0));
                    return (
                      <div key={line.id || idx} style={{ display: "flex", padding: 12, fontSize: 14, backgroundColor: idx % 2 === 1 ? cfg.quote_row_alt_bg : "#ffffff", borderTop: idx > 0 ? `1px solid ${cfg.quote_border_color}` : "none" }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 500, color: cfg.text_color }}>{line.descricao_snapshot}</p>
                          {line.item_description && <p style={{ fontSize: 12, color: cfg.text_secondary_color }}>{line.item_description}</p>}
                        </div>
                        <span style={{ width: 64, textAlign: "right", color: cfg.text_color }}>{qty.toFixed(2)}</span>
                        {section.settings?.showUnitPrice !== false && (
                          <>
                            <span style={{ width: 96, textAlign: "right", color: cfg.text_secondary_color }}>{formatCurrency(unitPrice)}</span>
                            <span style={{ width: 96, textAlign: "right", fontWeight: 500, color: cfg.text_color }}>{formatCurrency(total)}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "thank_you": {
        if (!cfg.thank_you_message) return null;
        return (
          <div key={section.id || "thank_you"} style={{ ...sectionStyle, textAlign: "center", padding: cfg.padding_section }}>
            <p style={{ color: cfg.text_color, lineHeight: cfg.line_height }}>{cfg.thank_you_message}</p>
          </div>
        );
      }

      case "footer": {
        if (!cfg.footer_text) return null;
        return (
          <div key={section.id || "footer"} style={{ ...sectionStyle, textAlign: "center", color: cfg.text_secondary_color, fontSize: cfg.font_size_small, paddingTop: cfg.padding_section }}>
            {cfg.footer_text}
          </div>
        );
      }

      case "custom": {
        const content = section.settings?.content || "";
        return (
          <div key={section.id} style={{ ...sectionStyle, border: `1px solid ${cfg.border_color}`, borderRadius: cfg.border_radius, padding: cfg.padding_card }}>
            <h3 style={{ fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8, color: cfg.text_color }}>
              {icon && <span>{icon}</span>}{section.label || "Secção Personalizada"}
            </h3>
            <p style={{ color: cfg.text_secondary_color, lineHeight: cfg.line_height, whiteSpace: "pre-wrap" }}>{content}</p>
          </div>
        );
      }

      default:
        return null;
    }
  };

  const isAccepted = proposal.status === "accepted";
  const isRejected = proposal.status === "rejected";

  return (
    <div
      style={{
        backgroundColor: cfg.background_color,
        fontFamily: cfg.font_family,
        fontSize: cfg.font_size_base,
        lineHeight: cfg.line_height,
        color: cfg.text_color,
        padding: cfg.padding_page,
        maxWidth: cfg.max_width,
        margin: "0 auto",
        borderRadius: cfg.border_radius,
      }}
    >
      {visibleSections.map(renderSection)}

      {isAccepted && (
        <div style={{ marginTop: 24, padding: cfg.padding_card, borderRadius: cfg.border_radius, border: "1px solid #a7f3d0", backgroundColor: "#ecfdf5" }}>
          <h3 style={{ fontWeight: "bold", color: "#047857", fontSize: cfg.font_size_base }}>✅ Proposta aceite</h3>
          {proposal.accepted_at && (
            <p style={{ color: "#059669", fontSize: cfg.font_size_small, marginTop: 4 }}>
              Aceite em {format(new Date(proposal.accepted_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: pt })}
            </p>
          )}
        </div>
      )}
      {isRejected && (
        <div style={{ marginTop: 24, padding: cfg.padding_card, borderRadius: cfg.border_radius, border: "1px solid #fecaca", backgroundColor: "#fef2f2" }}>
          <h3 style={{ fontWeight: "bold", color: "#b91c1c", fontSize: cfg.font_size_base }}>❌ Proposta rejeitada</h3>
        </div>
      )}
      {!isAccepted && !isRejected && (
        <div style={{ textAlign: "center", marginTop: 32, paddingTop: cfg.padding_section }}>
          <p style={{ color: cfg.text_secondary_color, marginBottom: 16 }}>Deseja aceitar esta proposta?</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <span style={{ backgroundColor: cfg.reject_button_bg, color: cfg.reject_button_text_color, padding: "12px 24px", borderRadius: cfg.border_radius, fontWeight: 500, display: "inline-block" }}>
              {cfg.reject_button_text}
            </span>
            <span style={{ backgroundColor: cfg.accept_button_bg, color: cfg.accept_button_text_color, padding: "12px 24px", borderRadius: cfg.border_radius, fontWeight: 500, display: "inline-block" }}>
              {cfg.accept_button_text}
            </span>
          </div>
        </div>
      )}

      {(company?.name || commercial) && (
        <div style={{ textAlign: "center", fontSize: cfg.font_size_small, color: cfg.text_secondary_color, marginTop: 24, paddingTop: 16 }}>
          {company?.name && <p>Proposta enviada por {company.name}</p>}
          {commercial && <p>Dúvidas? Contacte {commercial.name}{commercial.phone ? ` · ${commercial.phone}` : ""}{commercial.email ? ` · ${commercial.email}` : ""}</p>}
        </div>
      )}
    </div>
  );
}
