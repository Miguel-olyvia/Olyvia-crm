import { supabase } from '@/integrations/supabase/client';

export type ScheduleChange = 'datetime' | 'assignee';

export interface NotifyResult {
  sent: { email: boolean; sms: boolean };
  skipped: string | null;
}

/**
 * Chama a edge function notify-schedule-change depois de um update manual na
 * Agenda interna ter corrido bem. Nunca lanca excepcao — em erro, devolve
 * null e regista no console, para nao interromper o fluxo de gravar.
 */
export async function notifyClientOfScheduleChange(
  itemId: string,
  changes: ScheduleChange[],
): Promise<NotifyResult | null> {
  if (changes.length === 0) return null;

  try {
    const { data, error } = await supabase.functions.invoke('notify-schedule-change', {
      body: { schedule_item_id: itemId, changes },
    });
    if (error) {
      console.error('[notifyClientOfScheduleChange]', error);
      return null;
    }
    return data as NotifyResult;
  } catch (error) {
    console.error('[notifyClientOfScheduleChange]', error);
    return null;
  }
}

interface PrevScheduleItem {
  start_datetime: string;
  end_datetime: string;
  assignees?: { resource_id: string }[];
}

interface NextScheduleItem {
  start_datetime?: string;
  end_datetime?: string;
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

function sortedIds(ids: string[]): string[] {
  return [...ids].sort();
}

/** Funcao pura: compara o estado anterior e o novo e diz o que mudou. */
export function detectScheduleChanges(
  prev: PrevScheduleItem | null,
  next: NextScheduleItem,
  nextAssigneeIds: string[] | null,
): ScheduleChange[] {
  if (!prev) return [];

  const changes: ScheduleChange[] = [];

  const startChanged = next.start_datetime !== undefined && !sameInstant(next.start_datetime, prev.start_datetime);
  const endChanged = next.end_datetime !== undefined && !sameInstant(next.end_datetime, prev.end_datetime);
  if (startChanged || endChanged) {
    changes.push('datetime');
  }

  if (nextAssigneeIds !== null) {
    const prevIds = sortedIds((prev.assignees ?? []).map((a) => a.resource_id));
    const nextIds = sortedIds(nextAssigneeIds);
    const sameSet = prevIds.length === nextIds.length && prevIds.every((id, i) => id === nextIds[i]);
    if (!sameSet) {
      changes.push('assignee');
    }
  }

  return changes;
}
