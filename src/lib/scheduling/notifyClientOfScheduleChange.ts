import { supabase } from '@/integrations/supabase/client';
import { captureFlowError } from '@/lib/observability/captureFlowError';

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
      // Um 403 por ambito (comercial "so meus" que passou a visita a outra
      // pessoa) cai aqui: fica registado como achado, nao se contorna.
      console.error('[notifyClientOfScheduleChange]', error);
      captureFlowError(error, 'lead-lifecycle');
      return null;
    }
    return data as NotifyResult;
  } catch (error) {
    console.error('[notifyClientOfScheduleChange]', error);
    captureFlowError(error, 'lead-lifecycle');
    return null;
  }
}

export interface NotifySettings {
  notify_client_on_reschedule?: boolean | null;
  notify_client_on_reassign?: boolean | null;
}

/** Filtra as mudancas pelos interruptores da organizacao (schedule_settings). */
export function filterChangesBySettings(
  changes: ScheduleChange[],
  settings: NotifySettings | null | undefined,
): ScheduleChange[] {
  return changes.filter(
    (c) =>
      (c === 'datetime' && settings?.notify_client_on_reschedule === true) ||
      (c === 'assignee' && settings?.notify_client_on_reassign === true),
  );
}

/**
 * Avisa o cliente de varias visitas de uma vez (as devolvidas pelas RPCs de
 * mudanca de dono). Respeita os interruptores; devolve quantas visitas
 * enviaram mesmo email/SMS. Nunca lanca excepcao.
 */
export async function notifyVisitsIfEnabled(
  itemIds: readonly string[],
  changes: ScheduleChange[],
  settings: NotifySettings | null | undefined,
): Promise<number> {
  const wanted = filterChangesBySettings(changes, settings);
  if (wanted.length === 0 || itemIds.length === 0) return 0;

  const results = await Promise.all(
    [...new Set(itemIds)].map((id) => notifyClientOfScheduleChange(id, wanted)),
  );
  return results.filter((r) => r && (r.sent.email || r.sent.sms)).length;
}

/** Le so os dois interruptores de aviso da organizacao. Nunca lanca excepcao. */
export async function loadNotifySettings(orgId: string | null | undefined): Promise<NotifySettings | null> {
  if (!orgId) return null;
  try {
    const { data, error } = await supabase
      .from('schedule_settings')
      .select('notify_client_on_reschedule, notify_client_on_reassign')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (error) {
      console.error('[loadNotifySettings]', error);
      return null;
    }
    return data as NotifySettings | null;
  } catch (error) {
    console.error('[loadNotifySettings]', error);
    return null;
  }
}

/** Atalho para quem nao tem os interruptores a mao: carrega-os e avisa. */
export async function notifyVisitsForOrg(
  orgId: string | null | undefined,
  itemIds: readonly string[],
  changes: ScheduleChange[],
): Promise<number> {
  if (itemIds.length === 0) return 0;
  const settings = await loadNotifySettings(orgId);
  return notifyVisitsIfEnabled(itemIds, changes, settings);
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
