/**
 * Tipo unificado para configuração visual de templates de documentos
 * (propostas, orçamentos, contratos).
 *
 * Plano: .lovable/plan.md — Fase 1.
 *
 * IMPORTANTE:
 * - Este tipo é usado apenas em runtime via adapters (proposalTemplateAdapter,
 *   contractTemplateAdapter). NÃO existe coluna nova em proposal_templates.
 * - Templates antigos continuam a renderizar igual; o adapter de leitura devolve
 *   defaults equivalentes ao render atual para campos ausentes.
 * - Save só escreve no template ativamente editado pelo utilizador.
 */

export type DocumentContext = "proposal" | "quote" | "contract";

export type ItemsTableMode = "single" | "grouped_by_quote" | "consolidated";

export interface DocumentHeaderSettings {
  show_company_info?: boolean;
  show_logo?: boolean;
  show_client_info?: boolean;
  header_text?: string | null;
  header_style?: string | null;
}

export interface DocumentFooterSettings {
  footer_text?: string | null;
  show_page_numbers?: boolean;
}

export interface DocumentPageSettings {
  /** mm */
  margin_top?: number;
  margin_right?: number;
  margin_bottom?: number;
  margin_left?: number;
  page_size?: "A4" | "Letter";
  orientation?: "portrait" | "landscape";
}

export interface DocumentStyleSettings {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  font_family?: string;
  heading_font_family?: string;
}

export interface ItemsTableSettings {
  /**
   * Modo de exibição quando o documento referencia 2+ orçamentos.
   * Para n=1 o helper buildItemsTableModel ignora este campo e devolve
   * exatamente o modelo atual (sem regressão).
   */
  mode?: ItemsTableMode;
  /** Campos visuais (só layout/estética; nunca cálculo de valores). */
  show_quote_ref_column?: boolean;
  show_subtotals?: boolean;
  zebra_rows?: boolean;
  compact?: boolean;
}

export interface DocumentTemplateSettings {
  header: DocumentHeaderSettings;
  footer: DocumentFooterSettings;
  page: DocumentPageSettings;
  style: DocumentStyleSettings;
  items_table: ItemsTableSettings;
  /** sections jsonb (propostas) / body_html (contratos) ficam fora deste tipo. */
}

export const DEFAULT_DOCUMENT_TEMPLATE_SETTINGS: DocumentTemplateSettings = {
  header: {
    show_company_info: true,
    show_logo: true,
    show_client_info: true,
  },
  footer: {
    show_page_numbers: true,
  },
  page: {
    page_size: "A4",
    orientation: "portrait",
    margin_top: 20,
    margin_right: 20,
    margin_bottom: 20,
    margin_left: 20,
  },
  style: {},
  items_table: {
    mode: "single",
    show_subtotals: true,
    zebra_rows: true,
    compact: false,
  },
};
