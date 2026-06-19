import type {
  DocumentTemplateSettings,
  ItemsTableSettings,
} from "./types";
import { DEFAULT_DOCUMENT_TEMPLATE_SETTINGS } from "./types";

/**
 * Adapter NÃO-DESTRUTIVO para proposal_templates (template_type: 'proposal' | 'quote').
 *
 * - read(): lê colunas atuais e devolve DocumentTemplateSettings em memória.
 *   Para campos ausentes devolve defaults que reproduzem o render atual.
 * - toWriteShape(): converte DocumentTemplateSettings de volta nas MESMAS colunas
 *   existentes. NÃO introduz coluna doc_settings. NÃO cria sections.
 *
 * Plano: .lovable/plan.md §5. Save só pode ser chamado para o template que o
 * utilizador está ativamente a editar — nunca em batch nem em background.
 */

// Shape mínimo do registo lido de proposal_templates (parcial; só os campos usados).
export interface ProposalTemplateRow {
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  font_family?: string | null;
  heading_font_family?: string | null;
  header_style?: string | null;
  header_text?: string | null;
  footer_text?: string | null;
  show_company_info?: boolean | null;
  show_client_info?: boolean | null;
  design_settings?: Record<string, unknown> | null;
}

function readItemsTable(design: Record<string, unknown> | null | undefined): ItemsTableSettings {
  const raw = (design && typeof design === "object" ? (design as any).items_table : undefined) as
    | Partial<ItemsTableSettings>
    | undefined;
  return {
    ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.items_table,
    ...(raw || {}),
  };
}

export function readProposalTemplateSettings(
  row: ProposalTemplateRow | null | undefined,
): DocumentTemplateSettings {
  const r = row || {};
  const design = (r.design_settings || {}) as Record<string, unknown>;
  return {
    header: {
      show_company_info: r.show_company_info ?? true,
      show_logo: true,
      show_client_info: r.show_client_info ?? true,
      header_text: r.header_text ?? null,
      header_style: r.header_style ?? null,
    },
    footer: {
      footer_text: r.footer_text ?? null,
      show_page_numbers: true,
    },
    page: {
      ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.page,
      ...((design.page as object) || {}),
    },
    style: {
      primary_color: r.primary_color ?? undefined,
      secondary_color: r.secondary_color ?? undefined,
      accent_color: r.accent_color ?? undefined,
      background_color: r.background_color ?? undefined,
      text_color: r.text_color ?? undefined,
      font_family: r.font_family ?? undefined,
      heading_font_family: r.heading_font_family ?? undefined,
    },
    items_table: readItemsTable(design),
  };
}

/**
 * Devolve um patch parcial para UPDATE em proposal_templates.
 * Nunca mexe em colunas que não constem em settings (não apaga campos).
 * Nunca toca em `sections` (gerido pelo editor de propostas existente).
 */
export function toProposalTemplateWriteShape(
  settings: DocumentTemplateSettings,
  existingDesign: Record<string, unknown> | null | undefined,
): Partial<ProposalTemplateRow> {
  const design: Record<string, unknown> = { ...(existingDesign || {}) };
  design.items_table = settings.items_table;
  design.page = settings.page;

  return {
    primary_color: settings.style.primary_color ?? null,
    secondary_color: settings.style.secondary_color ?? null,
    accent_color: settings.style.accent_color ?? null,
    background_color: settings.style.background_color ?? null,
    text_color: settings.style.text_color ?? null,
    font_family: settings.style.font_family ?? null,
    heading_font_family: settings.style.heading_font_family ?? null,
    header_style: settings.header.header_style ?? null,
    header_text: settings.header.header_text ?? null,
    footer_text: settings.footer.footer_text ?? null,
    show_company_info: settings.header.show_company_info ?? true,
    show_client_info: settings.header.show_client_info ?? true,
    design_settings: design,
  };
}
