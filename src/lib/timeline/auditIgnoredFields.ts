/**
 * Campos que a timeline NÃO deve mostrar como "Editou X".
 *
 * As três timelines (lead, cliente, contacto) leem o mesmo `entity_audit_log` e
 * deviam esconder as mesmas coisas — mas cada uma tinha a sua lista, e as do
 * cliente e do contacto tinham ficado com 8 entradas contra as 20 da lead. O
 * resultado era uma ficha de cliente com dezenas de "Editou pipeline dirty at"
 * e "Editou status changed by: — → <uuid>" a afogar o que interessava.
 *
 * Dois grupos, com razões diferentes:
 *
 *  · **Escrituração interna** — colunas que o sistema mexe sozinho a cada
 *    recálculo automático. Nunca foram uma acção de ninguém.
 *
 *  · **Espelhos da mudança de estado** — `signature_date`, `accepted_at`,
 *    `status_changed_by` e companhia mudam na MESMA escrita que muda o estado.
 *    A linha "Editou estado: draft → signed" já conta o facto; as outras seis
 *    repetem-no em datas e uuids. Ficou evidente com o contrato sintético da
 *    venda direta, cuja promoção a assinado escrevia sete linhas de uma vez.
 */
export const TIMELINE_AUDIT_IGNORED_FIELDS: readonly string[] = [
  "id", "entity_id", "organization_id", "root_organization_id",
  "created_at", "updated_at", "created_by", "search_text",

  // Escrituração interna
  "pipeline_dirty_at", "workflow_stage_id", "raw_status", "previous_status",
  "field_values", "needs_manual_scheduling",
  // Escritos pela mesma acção que já produz "Chamada telefónica"/"Email enviado"
  "last_contact_at", "last_contact_by", "last_contact_result",

  // Espelhos da mudança de estado em propostas/orçamentos/contratos
  "status_changed_at", "status_changed_by", "signature_date", "signed_by_name",
  "accepted_at", "rejected_at", "sent_at", "delivered_at",
  "viewed_at", "last_viewed_at", "view_count",

  // Espelhos da assinatura do lado da empresa (client_contracts)
  "company_signature_date", "company_signed_by_name", "company_signed_by_id",

  // Snapshots e tokens — volumosos e sem leitura humana
  "published_at", "published_snapshot", "published_snapshot_hash",
  "decided_snapshot", "decided_snapshot_hash", "decided_published_at",
  "template_snapshot", "has_unpublished_changes",
  "public_token", "tracking_token", "document_url",
  "acceptance_ip", "acceptance_user_agent", "signature_image",
];

/**
 * Padrões de nome cujo conteúdo não tem leitura humana nenhuma.
 *
 * Uma lista de nomes exactos nunca acompanha: cada tabela nova traz os seus
 * `*_html` e `*_snapshot`. Isto apanha a família toda de uma vez — foi o que
 * deixou passar o `contract_body_html` (um documento HTML inteiro despejado na
 * timeline) e o `prompt_values` (que saía como "[object Object]").
 */
const UNREADABLE_FIELD_PATTERNS: RegExp[] = [
  /_html$/,
  /_json$/,
  /_snapshot$/,
  /_hash$/,
  /_token$/,
  /^prompt_/,
  // Referências internas: o uuid não diz nada a ninguém, e quando existe um
  // campo legível ao lado (…_by_name para …_by_id) é esse que interessa.
  /_id$/,
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Acima disto, um valor deixa de se ler e passa a ocupar o ecrã. */
const MAX_VALUE_CHARS = 120;

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return "[object Object]";
  return String(value);
}

/**
 * Formata um diff do `entity_audit_log` para a timeline.
 * Devolve `null` quando a linha não deve sequer aparecer.
 *
 * Três razões para esconder, por ordem de aplicação:
 *   1. o nome do campo é de uma família sem leitura humana (`*_html`, `*_id`…);
 *   2. o valor é um objecto — apareceria como "[object Object]", que não é
 *      informação nenhuma;
 *   3. os dois lados são uuids.
 *
 * O que é apenas COMPRIDO não se esconde, trunca-se: uma nota longa continua a
 * ser uma edição real e o utilizador deve vê-la, só não em ecrã inteiro.
 */
export function formatAuditDiff(
  field: string,
  oldValue: unknown,
  newValue: unknown,
  translate: (v: string) => string = (v) => v,
): string | null {
  if (UNREADABLE_FIELD_PATTERNS.some((re) => re.test(field))) return null;
  if (typeof oldValue === "object" && oldValue !== null) return null;
  if (typeof newValue === "object" && newValue !== null) return null;

  const rawOld = renderValue(oldValue);
  const rawNew = renderValue(newValue);
  if (UUID_RE.test(rawOld) && UUID_RE.test(rawNew)) return null;
  if (rawOld === "—" && UUID_RE.test(rawNew)) return null;

  // Nada mudou que se veja — acontece quando o valor real está num campo já
  // escondido. Mostrar "— → —" é pior do que não mostrar nada.
  if (rawOld === "—" && rawNew === "—") return null;

  const clip = (v: string) =>
    v.length > MAX_VALUE_CHARS ? `${v.slice(0, MAX_VALUE_CHARS)}…` : v;

  return `${clip(rawOld === "—" ? rawOld : translate(rawOld))} → ${clip(rawNew === "—" ? rawNew : translate(rawNew))}`;
}
