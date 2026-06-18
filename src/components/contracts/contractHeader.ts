/**
 * Fonte única de verdade do cabeçalho de minutas/contratos.
 * Usada pelo preview (ContractPreviewHeader) e pelo exportador de PDF
 * (TemplateExportButtons.buildPdfRenderContainer).
 *
 * Devolve HTML com estilos inline — sem classes Tailwind — para que o
 * html2canvas o consiga renderizar fielmente.
 */

export type ContractHeaderStyle = "simple" | "split";
export type ContractHeaderAlign = "left" | "center" | "right";
export type LogoSize = "small" | "medium" | "large";

export interface ContractHeaderSettings {
  primary_color?: string | null;
  header_show_separator?: boolean;
  header_layout?: ContractHeaderAlign; // legacy / "simple" alignment
  header_style?: ContractHeaderStyle;
  logo_url?: string | null;
  logo_size?: LogoSize;
  company_name_override?: string | null;
  company_website?: string | null;
  show_nif?: boolean;
  show_address?: boolean;
  show_phone?: boolean;
  show_email?: boolean;
  show_website?: boolean;

  // Bloco "Contrato" (apenas no estilo "split")
  contract_block_show?: boolean;
  contract_block_title?: string | null;     // ex: "CONTRATO"
  contract_block_subtitle?: string | null;  // ex: "www.mudelar.pt"
  contract_block_number_label?: string | null; // ex: "CONTRATO Nº"
  contract_block_number_value?: string | null; // ex: "{{contrato_numero}}"
  contract_block_show_date?: boolean;
  contract_block_date_label?: string | null;
  contract_block_date_value?: string | null;   // ex: "{{data}}"
  contract_block_show_commercial?: boolean;
  contract_block_commercial_label?: string | null;
  contract_block_commercial_value?: string | null; // ex: "{{comercial_nome}}"
}

const LOGO_PX: Record<LogoSize, number> = {
  small: 40,
  medium: 60,
  large: 80,
};

function escapeHtml(text: unknown): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Substitui {{var}} no texto pelos valores em sampleData (sem html). */
function fillVars(text: string | null | undefined, sampleData: Record<string, any>): string {
  if (!text) return "";
  return text.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (_m, key) => {
    const v = sampleData?.[key] ?? sampleData?.[String(key).toLowerCase()];
    if (v == null || v === "") return "";
    return String(v);
  });
}

function todayPt(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function renderContractHeaderHtml(
  settings: ContractHeaderSettings | null | undefined,
  sampleData: Record<string, any> = {},
): string {
  const s = settings || {};
  const primary = /^#[0-9a-fA-F]{3,8}$/.test(s.primary_color || "") ? (s.primary_color as string) : "#7C3AED";
  const separator = s.header_show_separator !== false;
  const style: ContractHeaderStyle = s.header_style || "simple";
  const align: ContractHeaderAlign = (s.header_layout || "left") as ContractHeaderAlign;
  const logoPx = LOGO_PX[s.logo_size || "medium"];
  const companyName = s.company_name_override || sampleData.empresa_nome || "";
  const nif = sampleData.empresa_nif || "";
  const morada = sampleData.empresa_morada || "";
  const tel = sampleData.empresa_telefone || "";
  const email = sampleData.empresa_email || "";
  const website = s.company_website || sampleData.empresa_website || "";

  const borderBottom = separator ? `border-bottom:2px solid ${primary};` : "";

  // Logo HTML reutilizável
  const logoImg = s.logo_url
    ? `<img src="${escapeHtml(s.logo_url)}" alt="Logo" crossorigin="anonymous" style="height:${logoPx}px;object-fit:contain;display:block;" />`
    : "";

  // Linhas de info da empresa
  const infoLine1Parts: string[] = [];
  if (s.show_nif !== false && nif) infoLine1Parts.push(`NIF: ${escapeHtml(nif)}`);
  if (s.show_address !== false && morada) infoLine1Parts.push(escapeHtml(morada));
  const infoLine2Parts: string[] = [];
  if (s.show_phone !== false && tel) infoLine2Parts.push(`Tel: ${escapeHtml(tel)}`);
  if (s.show_email !== false && email) infoLine2Parts.push(escapeHtml(email));
  if (s.show_website && website) infoLine2Parts.push(escapeHtml(website));

  // ===== Estilo SIMPLES (legacy) =====
  if (style !== "split") {
    const logoBlock = logoImg
      ? `<div style="margin-bottom:8px;${
          align === "center" ? "display:flex;justify-content:center;" : align === "right" ? "display:flex;justify-content:flex-end;" : ""
        }">${logoImg}</div>`
      : "";
    return `
<div data-pdf-section="header" style="margin-bottom:24px;padding-bottom:12px;text-align:${align};${borderBottom}">
  ${logoBlock}
  <h2 style="margin:0;font-size:20pt;font-weight:bold;color:${primary};">${escapeHtml(companyName)}</h2>
  ${infoLine1Parts.length ? `<p style="margin:4px 0 0;font-size:9pt;color:#666;">${infoLine1Parts.join(" · ")}</p>` : ""}
  ${infoLine2Parts.length ? `<p style="margin:2px 0 0;font-size:9pt;color:#666;">${infoLine2Parts.join(" · ")}</p>` : ""}
</div>`.trim();
  }

  // ===== Estilo SPLIT (Contrato + Marca) =====
  const data = { ...sampleData, data: sampleData.data || todayPt() };

  const blockShow = s.contract_block_show !== false;
  const title = s.contract_block_title || "CONTRATO";
  const subtitle = s.contract_block_subtitle || "";
  const numberLabel = s.contract_block_number_label || "CONTRATO Nº";
  const numberValue = fillVars(s.contract_block_number_value || "{{contrato_numero}}", data);
  const showDate = s.contract_block_show_date !== false;
  const dateLabel = s.contract_block_date_label || "Data:";
  const dateValue = fillVars(s.contract_block_date_value || "{{data}}", data);
  const showCommercial = s.contract_block_show_commercial !== false;
  const commercialLabel = s.contract_block_commercial_label || "Comercial:";
  const commercialValue = fillVars(s.contract_block_commercial_value || "{{comercial_nome}}", data);

  const leftInner = blockShow
    ? `
  <div style="font-size:22pt;font-weight:bold;color:${primary};letter-spacing:1px;line-height:1;">
    <span style="border-left:3px solid ${primary};padding-left:8px;">${escapeHtml(title)}</span>
  </div>
  ${subtitle ? `<div style="margin-top:4px;font-size:9pt;color:${primary};letter-spacing:1px;">${escapeHtml(subtitle)}</div>` : ""}
  <div style="margin-top:18px;font-size:10pt;color:#374151;line-height:1.6;">
    ${numberLabel || numberValue ? `<div><span style="color:#6b7280;">${escapeHtml(numberLabel)}</span> <strong style="color:#111827;margin-left:6px;">${escapeHtml(numberValue)}</strong></div>` : ""}
    ${showDate ? `<div><span style="color:#6b7280;">${escapeHtml(dateLabel)}</span> <span style="margin-left:6px;">${escapeHtml(dateValue)}</span></div>` : ""}
    ${showCommercial ? `<div><span style="color:#6b7280;">${escapeHtml(commercialLabel)}</span> <span style="margin-left:6px;">${escapeHtml(commercialValue)}</span></div>` : ""}
  </div>`.trim()
    : `&nbsp;`;

  const rightInner = `
  ${logoImg ? `<div style="display:flex;justify-content:flex-end;margin-bottom:6px;">${logoImg}</div>` : ""}
  ${!logoImg && companyName ? `<div style="font-size:16pt;font-weight:bold;color:${primary};letter-spacing:2px;">${escapeHtml(companyName)}</div>` : ""}
  ${infoLine1Parts.length ? `<div style="margin-top:6px;font-size:8.5pt;color:${primary};">${infoLine1Parts.join(" · ")}</div>` : ""}
  ${infoLine2Parts.length ? `<div style="margin-top:2px;font-size:8.5pt;color:${primary};">${infoLine2Parts.join(" | ")}</div>` : ""}`.trim();

  return `
<div data-pdf-section="header" style="margin-bottom:24px;padding-bottom:16px;${borderBottom}">
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:12px;">${leftInner}</td>
      <td style="width:50%;vertical-align:top;padding-left:12px;text-align:right;">${rightInner}</td>
    </tr>
  </table>
</div>`.trim();
}

