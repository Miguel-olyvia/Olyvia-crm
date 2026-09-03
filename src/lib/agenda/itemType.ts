import type { AgendaItemRow } from "./types";

/**
 * Tipo do item, lido de `metadata`.
 *
 * Não há coluna `item_type` — o tipo vive em `metadata`, com duas convenções:
 * `item_type` (escrita pelo assistente de IA) e `visit_type` (escrita pelo
 * frontend do calendário). Medido no remoto: 981 em 1000 itens não têm tipo
 * nenhum, por isso `null` é o caso NORMAL e não uma excepção a assinalar.
 */
export function getItemType(row: Pick<AgendaItemRow, "metadata">): string | null {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const candidates = [
    (metadata as Record<string, unknown>).item_type,
    (metadata as Record<string, unknown>).visit_type,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

/** Id da lead associada. Não existe coluna `lead_id`: a lead vive em `metadata.lead_id`. */
export function getLeadId(row: Pick<AgendaItemRow, "metadata">): string | null {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const leadId = (metadata as Record<string, unknown>).lead_id;
  return typeof leadId === "string" && leadId.length > 0 ? leadId : null;
}
