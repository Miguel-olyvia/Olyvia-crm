/**
 * Eventos de Venda Direta na timeline da lead e do cliente.
 *
 * A timeline não é uma tabela nem uma RPC: cada ficha monta a sua juntando
 * `entity_interactions` + `anew_entity_history` + `entity_audit_log` em
 * memória. Por isso o mapeamento dos eventos vive aqui, num sítio só, em vez de
 * triplicado nos três componentes que os mostram — `LeadTimelineTab`,
 * `ContactTimelineTab` (usado pela ficha do cliente) e `ClientDetailsDialog`.
 *
 * Os eventos são escritos pelo trigger `trg_direct_sale_timeline_history`
 * (20261202030000) através de `fn_write_entity_history`, a mesma via dos
 * "Lead criada"/"Convertido". Um `change_type` que não esteja mapeado aqui cai
 * no ramo genérico das três timelines e sai como "Editou campo".
 */

/** Tipo usado no TYPE_CONFIG das timelines (ícone, cor, chip de filtro). */
export const DIRECT_SALE_EVENT_TYPE = "direct_sale";

/**
 * Tabelas do módulo que NÃO devem produzir eventos genéricos de auditoria.
 *
 * As `direct_sales` já tinham `trg_audit_direct_sales` a escrever em
 * `entity_audit_log`, e o resultado eram linhas "Registo adicionado" e "Editou
 * status: rascunho → enviada" sem sequer dizer que eram de uma venda direta.
 * Agora que há eventos com nome próprio, mostrar os dois seria duplicar o mesmo
 * facto — uma vez bem escrito e outra em bruto.
 */
export const DIRECT_SALE_AUDIT_TABLES = new Set([
  "direct_sales",
  "direct_sale_lines",
  "direct_sale_sends",
]);

interface DirectSaleEventMetadata {
  sale_number?: string | null;
  total?: number | string | null;
  currency?: string | null;
  proforma_number?: string | null;
  invoice_number?: string | null;
  rejection_reason?: string | null;
}

function formatTotal(meta: DirectSaleEventMetadata): string | null {
  if (meta?.total === null || meta?.total === undefined) return null;
  const n = Number(meta.total);
  if (!Number.isFinite(n)) return null;
  const [intPart, decPart] = Math.abs(n).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const code = (meta.currency || "EUR").toUpperCase();
  const amount = `${n < 0 ? "-" : ""}${grouped},${decPart}`;
  return code === "EUR" ? `${amount} €` : `${amount} ${code}`;
}

/**
 * Converte um registo de `anew_entity_history` num evento de timeline.
 * Devolve `null` quando o `change_type` não é de venda direta — nesse caso o
 * chamador segue com a sua lógica normal.
 */
export function describeDirectSaleHistoryEvent(
  changeType: string | null | undefined,
  metadata: DirectSaleEventMetadata | null | undefined,
): { title: string; description: string | null } | null {
  if (!changeType || !changeType.startsWith("direct_sale_")) return null;

  const meta = metadata || {};
  const ref = meta.sale_number ? `Venda direta ${meta.sale_number}` : "Venda direta";
  const total = formatTotal(meta);

  switch (changeType) {
    case "direct_sale_created":
      return { title: `${ref} criada`, description: total };
    case "direct_sale_sent":
      return { title: `${ref} enviada ao cliente`, description: total };
    case "direct_sale_accepted":
      return {
        title: `${ref} aceite pelo cliente`,
        description: [total, meta.proforma_number ? `Proforma ${meta.proforma_number}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      };
    case "direct_sale_rejected":
      return {
        title: `${ref} rejeitada pelo cliente`,
        description: meta.rejection_reason || total,
      };
    case "direct_sale_cancelled":
      return { title: `${ref} cancelada`, description: total };
    case "direct_sale_invoiced":
      return {
        title: `${ref} faturada`,
        description: meta.invoice_number ? `Fatura ${meta.invoice_number}` : total,
      };
    default:
      // change_type novo que ainda não foi mapeado: melhor um rótulo genérico
      // mas correcto do que deixá-lo cair em "Editou campo".
      return { title: `${ref} — atualização`, description: total };
  }
}
