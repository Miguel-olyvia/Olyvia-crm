/**
 * Marcos de documentos na timeline da lead, do cliente e do contacto.
 *
 * A timeline não é uma tabela nem uma RPC: cada ficha monta a sua juntando
 * `entity_interactions` + `anew_entity_history` + `entity_audit_log` em
 * memória. O mapeamento vive aqui, num sítio só, em vez de triplicado nos três
 * componentes que o mostram — `LeadTimelineTab`, `ContactTimelineTab` (usado
 * pela ficha do cliente) e `ClientDetailsDialog`.
 *
 * Os eventos são escritos por gatilhos na base de dados
 * (20261202030000 para vendas diretas, 20261202050000 para os restantes)
 * através de `fn_write_entity_history` — a mesma via dos "Lead criada" e
 * "Convertido". Um `change_type` que não esteja mapeado aqui cai no ramo
 * genérico e sai como "Editou campo".
 */

/** Tipos usados no TYPE_CONFIG das timelines (ícone, cor, chip de filtro). */
export const DIRECT_SALE_EVENT_TYPE = "direct_sale";
export const PROPOSAL_EVENT_TYPE = "proposal_doc";
export const QUOTE_EVENT_TYPE = "quote_doc";
export const CONTRACT_EVENT_TYPE = "contract_doc";

/**
 * Tabelas cujo INSERT já é contado por um marco próprio.
 *
 * O trilho genérico (`entity_audit_log`) continua a registar tudo — é o
 * histórico de auditoria e não se mexe nele. O que se evita aqui é MOSTRAR o
 * mesmo facto duas vezes: uma bem escrita ("Proposta criada") e outra em bruto
 * ("Registo adicionado").
 */
export const DOCUMENT_INSERT_TABLES = new Set([
  "direct_sales", "direct_sale_lines", "direct_sale_sends",
  "proposals", "quotes", "client_contracts",
]);

/**
 * Tabelas onde as vendas diretas são totalmente silenciadas no ramo genérico.
 *
 * Ao contrário de propostas/orçamentos/contratos — onde ainda interessa ver
 * "Editou valor" — a venda direta tem cobertura semântica completa e os
 * restantes campos dela são escrituração interna.
 */
export const DIRECT_SALE_AUDIT_TABLES = new Set([
  "direct_sales", "direct_sale_lines", "direct_sale_sends",
]);

/**
 * Campo de estado por tabela. O diff em bruto deste campo deixa de ser
 * mostrado, porque o marco correspondente já o diz por palavras.
 */
export const DOCUMENT_STATUS_FIELD: Record<string, string> = {
  proposals: "status",
  quotes: "estado",
  client_contracts: "status",
};

interface DocumentEventMetadata {
  number?: string | null;
  title?: string | null;
  total?: number | string | null;
  currency?: string | null;
  sale_number?: string | null;
  proforma_number?: string | null;
  invoice_number?: string | null;
  rejection_reason?: string | null;
  reason?: string | null;
}

function formatTotal(meta: DocumentEventMetadata): string | null {
  if (meta?.total === null || meta?.total === undefined) return null;
  const n = Number(meta.total);
  if (!Number.isFinite(n)) return null;
  const [intPart, decPart] = Math.abs(n).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const code = (meta.currency || "EUR").toUpperCase();
  const amount = `${n < 0 ? "-" : ""}${grouped},${decPart}`;
  return code === "EUR" ? `${amount} €` : `${amount} ${code}`;
}

function join(parts: Array<string | null | undefined>): string | null {
  const kept = parts.filter(Boolean) as string[];
  return kept.length > 0 ? kept.join(" · ") : null;
}

export interface DocumentTimelineEvent {
  type: string;
  title: string;
  description: string | null;
}

/**
 * Converte um registo de `anew_entity_history` num evento de timeline.
 * Devolve `null` quando o `change_type` não é de documento — nesse caso o
 * chamador segue com a sua lógica normal.
 */
export function describeDocumentHistoryEvent(
  changeType: string | null | undefined,
  metadata: DocumentEventMetadata | null | undefined,
): DocumentTimelineEvent | null {
  if (!changeType) return null;
  const meta = metadata || {};
  const total = formatTotal(meta);

  // ── Venda direta ──────────────────────────────────────────────────────────
  if (changeType.startsWith("direct_sale_")) {
    const ref = meta.sale_number ? `Venda direta ${meta.sale_number}` : "Venda direta";
    const t = DIRECT_SALE_EVENT_TYPE;
    switch (changeType) {
      case "direct_sale_created":
        return { type: t, title: `${ref} criada`, description: total };
      case "direct_sale_sent":
        return { type: t, title: `${ref} enviada ao cliente`, description: total };
      case "direct_sale_accepted":
        return {
          type: t,
          title: `${ref} aceite pelo cliente`,
          description: join([total, meta.proforma_number ? `Proforma ${meta.proforma_number}` : null]),
        };
      case "direct_sale_rejected":
        return { type: t, title: `${ref} rejeitada pelo cliente`, description: meta.rejection_reason || total };
      case "direct_sale_cancelled":
        return { type: t, title: `${ref} cancelada`, description: total };
      case "direct_sale_invoiced":
        return {
          type: t,
          title: `${ref} faturada`,
          description: meta.invoice_number ? `Fatura ${meta.invoice_number}` : total,
        };
      default:
        return { type: t, title: `${ref} — atualização`, description: total };
    }
  }

  // ── Proposta ──────────────────────────────────────────────────────────────
  if (changeType.startsWith("proposal_")) {
    const ref = meta.number ? `Proposta ${meta.number}` : "Proposta";
    const t = PROPOSAL_EVENT_TYPE;
    const desc = join([meta.title, total]);
    switch (changeType) {
      case "proposal_created":  return { type: t, title: `${ref} criada`, description: desc };
      case "proposal_sent":     return { type: t, title: `${ref} enviada`, description: desc };
      case "proposal_accepted": return { type: t, title: `${ref} aceite`, description: desc };
      case "proposal_rejected": return { type: t, title: `${ref} rejeitada`, description: meta.reason || desc };
      default: return null;
    }
  }

  // ── Orçamento ─────────────────────────────────────────────────────────────
  if (changeType.startsWith("quote_")) {
    const ref = meta.number ? `Orçamento ${meta.number}` : "Orçamento";
    const t = QUOTE_EVENT_TYPE;
    const desc = join([meta.title, total]);
    switch (changeType) {
      case "quote_created":  return { type: t, title: `${ref} criado`, description: desc };
      case "quote_sent":     return { type: t, title: `${ref} enviado`, description: desc };
      case "quote_accepted": return { type: t, title: `${ref} aceite`, description: desc };
      case "quote_rejected": return { type: t, title: `${ref} rejeitado`, description: desc };
      case "quote_lost":     return { type: t, title: `${ref} perdido`, description: meta.reason || desc };
      default: return null;
    }
  }

  // ── Contrato ──────────────────────────────────────────────────────────────
  if (changeType.startsWith("contract_")) {
    const ref = meta.number ? `Contrato ${meta.number}` : "Contrato";
    const t = CONTRACT_EVENT_TYPE;
    switch (changeType) {
      case "contract_created":            return { type: t, title: `${ref} criado`, description: total };
      case "contract_pending_signature":  return { type: t, title: `${ref} a aguardar assinatura`, description: total };
      case "contract_signed":             return { type: t, title: `${ref} assinado`, description: total };
      case "contract_cancelled":          return { type: t, title: `${ref} cancelado`, description: total };
      default: return null;
    }
  }

  return null;
}

/**
 * Deve este diff do `entity_audit_log` ser mostrado?
 *
 * Esconde-se (a) tudo o que venha das tabelas da venda direta, e (b) o campo de
 * estado das tabelas que agora têm marcos próprios — a linha "Proposta aceite"
 * já conta o que "Editou estado: sent → accepted" contava.
 */
export function shouldHideAuditDiff(tableName: string, field: string): boolean {
  if (DIRECT_SALE_AUDIT_TABLES.has(tableName)) return true;
  return DOCUMENT_STATUS_FIELD[tableName] === field;
}
