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

  // Snapshots e tokens — volumosos e sem leitura humana
  "published_at", "published_snapshot", "published_snapshot_hash",
  "decided_snapshot", "decided_snapshot_hash", "decided_published_at",
  "template_snapshot", "has_unpublished_changes",
  "public_token", "tracking_token", "document_url",
  "acceptance_ip", "acceptance_user_agent", "signature_image",
];
