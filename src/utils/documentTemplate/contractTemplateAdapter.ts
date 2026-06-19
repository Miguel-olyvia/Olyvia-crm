import type {
  DocumentTemplateSettings,
  ItemsTableSettings,
} from "./types";
import { DEFAULT_DOCUMENT_TEMPLATE_SETTINGS } from "./types";

/**
 * Adapter NÃO-DESTRUTIVO para client_contract_templates.
 *
 * - read(): lê doc_settings (jsonb existente) e devolve DocumentTemplateSettings.
 *   Para campos ausentes devolve defaults que reproduzem o render atual.
 * - toWriteShape(): patch parcial sobre doc_settings (merge), preservando
 *   integralmente a stack legal (signatories, body_html, etc.).
 *
 * Plano: .lovable/plan.md §5.
 */

export interface ContractTemplateRow {
  doc_settings?: Record<string, unknown> | null;
  body_html?: string | null;
}

export function readContractTemplateSettings(
  row: ContractTemplateRow | null | undefined,
): DocumentTemplateSettings {
  const ds = (row?.doc_settings || {}) as Record<string, any>;
  return {
    header: {
      ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.header,
      ...(ds.header || {}),
    },
    footer: {
      ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.footer,
      ...(ds.footer || {}),
    },
    page: {
      ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.page,
      ...(ds.page || {}),
    },
    style: {
      ...(ds.style || {}),
    },
    items_table: {
      ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.items_table,
      ...((ds.items_table || {}) as Partial<ItemsTableSettings>),
    },
  };
}

/**
 * Devolve patch parcial para doc_settings (merge). Preserva todas as chaves
 * existentes em doc_settings que não sejam geridas por este adapter
 * (signatories config, regras legais, etc.).
 */
export function toContractTemplateWriteShape(
  settings: DocumentTemplateSettings,
  existingDocSettings: Record<string, unknown> | null | undefined,
): { doc_settings: Record<string, unknown> } {
  const merged: Record<string, unknown> = { ...(existingDocSettings || {}) };
  merged.header = settings.header;
  merged.footer = settings.footer;
  merged.page = settings.page;
  merged.style = settings.style;
  merged.items_table = settings.items_table;
  return { doc_settings: merged };
}
