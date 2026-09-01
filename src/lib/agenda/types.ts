/**
 * Tipos da vista "O Meu Dia".
 *
 * Descrevem apenas o que a página lê de `schedule_items` — deliberadamente um
 * subconjunto de `ScheduleItem`, para que a lógica pura seja testável sem
 * fabricar a linha inteira da base de dados.
 */

/** Estados terminais do enum `schedule_item_status`: já não estão "por fazer". */
export const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

/**
 * Assignee tal como vem do embed PostgREST
 * `schedule_item_assignees -> schedule_resources(user_id)`.
 * O `user_id` do recurso é um `anew_users.id`.
 */
export interface AgendaAssigneeRow {
  resource?: { user_id?: string | null } | null;
}

export interface AgendaItemRow {
  id: string;
  title: string | null;
  description?: string | null;
  status: string;
  start_datetime: string;
  end_datetime: string;
  /** Coluna GENERATED STORED na base — lê-se, nunca se calcula nem se escreve. */
  duration_minutes?: number | null;
  all_day?: boolean | null;
  location?: string | null;
  client_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
  /**
   * Caminho de dono directo (escrito só pelo assistente de IA). Em produção
   * está preenchido em ~1% das linhas — ver `useMyDay` para o porquê da união.
   */
  user_id?: string | null;
  metadata?: Record<string, unknown> | null;
  assignees?: AgendaAssigneeRow[] | null;
  board?: { id?: string; name?: string | null; color?: string | null } | null;
}

/** Entidade associada ao item, resolvida à parte (lead via metadata, cliente via coluna). */
export interface AgendaEntityRef {
  kind: "lead" | "client";
  id: string;
  name: string;
}

export interface AgendaItem extends AgendaItemRow {
  /** `null` é o caso NORMAL: 98% dos itens não declaram tipo nenhum. */
  itemType: string | null;
  entity: AgendaEntityRef | null;
}
