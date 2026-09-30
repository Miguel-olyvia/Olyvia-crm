/**
 * Estado local de uma visita depois de arrastada na Agenda.
 *
 * A base (gatilho trg_schedule_items_reset_confirmation) limpa a confirmacao
 * do cliente quando a hora muda, e o hook grava status 'rescheduled'. O estado
 * local tem de reflectir o mesmo, senao o selo "Confirmado pelo cliente" ficava
 * a apontar para a hora antiga ate se recarregar.
 */
export function applyRescheduleToItem<T extends { status: string; start_datetime: string; end_datetime: string; confirmed_at?: string | null }>(
  item: T,
  newStart: Date,
  newEnd: Date,
): T {
  return {
    ...item,
    start_datetime: newStart.toISOString(),
    end_datetime: newEnd.toISOString(),
    status: 'rescheduled',
    confirmed_at: null,
  };
}
