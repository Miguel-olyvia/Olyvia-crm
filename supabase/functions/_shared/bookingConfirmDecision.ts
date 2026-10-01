/**
 * Confirmacao da visita pelo cliente (link "Confirmo" do lembrete).
 *
 * Decisao pura + aplicacao na base, separadas da Edge Function para se
 * poderem testar sem Deno.serve.
 *
 * - scheduled / rescheduled sem confirmacao: status -> 'confirmed' e
 *   confirmed_at = now(), num so UPDATE (compare-and-swap).
 * - qualquer outro estado activo sem confirmacao (draft, in_progress,
 *   completed, confirmed posto a mao): so carimba confirmed_at, sem mexer
 *   no estado.
 * - cancelled: recusa. Ja confirmada: nada a fazer (idempotente).
 *
 * Mover a visita de dia/hora limpa a confirmacao: gatilho
 * trg_schedule_items_reset_confirmation na base.
 */

export type ConfirmAction = 'refuse' | 'noop' | 'stamp_only' | 'confirm_and_set_status';

/** Estados de que uma visita pode passar a 'confirmed' pela confirmacao do cliente. */
export const CONFIRMABLE_STATUSES = ['scheduled', 'rescheduled'] as const;

export function decideConfirm(status: string, confirmedAt: string | null | undefined): ConfirmAction {
  if (status === 'cancelled') return 'refuse';
  if (confirmedAt) return 'noop';
  if ((CONFIRMABLE_STATUSES as readonly string[]).includes(status)) return 'confirm_and_set_status';
  return 'stamp_only';
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any };

export interface ConfirmItem {
  id: string;
  status: string;
  confirmed_at?: string | null;
}

export async function applyClientConfirmation(
  supabase: SupabaseLike,
  item: ConfirmItem,
  nowIso: string,
): Promise<{ error: { message: string } | null }> {
  const action = decideConfirm(item.status, item.confirmed_at);
  if (action === 'noop') return { error: null };
  if (action === 'refuse') return { error: { message: 'cancelled' } };

  if (action === 'confirm_and_set_status') {
    const { data, error } = await supabase
      .from('schedule_items')
      .update({ status: 'confirmed', confirmed_at: nowIso })
      .eq('id', item.id)
      .in('status', [...CONFIRMABLE_STATUSES])
      .is('confirmed_at', null)
      .select('id');
    if (error) return { error };
    // Alguem mexeu entretanto (estado mudou ou ja confirmada): so carimbo.
    if (Array.isArray(data) && data.length > 0) return { error: null };
  }

  const { error } = await supabase
    .from('schedule_items')
    .update({ confirmed_at: nowIso })
    .eq('id', item.id)
    .is('confirmed_at', null)
    .neq('status', 'cancelled');
  return { error: error ?? null };
}
