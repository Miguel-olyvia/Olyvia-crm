import { supabase } from '@/integrations/supabase/client';
import { captureFlowError } from '@/lib/observability/captureFlowError';

/**
 * Confirmacao da visita ao cliente quando a EMPRESA confirma na Agenda (modo
 * 'agenda_confirm'). A base enfileira o envio (gatilho em schedule_items); o ecra
 * chama a send-visit-confirmation logo a seguir a gravar para o envio sair em
 * segundos, e le o estado por rpc_visit_confirmation_status. Nada aqui lanca.
 */

export type ConfirmationMode = 'booking' | 'agenda_confirm';
export type ConfirmationChannel = 'email' | 'sms';

export interface ConfirmationRow {
  status: string | null;
  kind?: string | null;
  attempts?: number | null;
  error_message?: string | null;
  skip_reason?: string | null;
  recipient?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
}

export interface VisitConfirmationStatus {
  mode: ConfirmationMode;
  email: ConfirmationRow | null;
  sms: ConfirmationRow | null;
}

export type ChannelView =
  | { state: 'not_sent' }
  | { state: 'sending' }
  | { state: 'sent'; at: string | null }
  | { state: 'failed'; error: string }
  | { state: 'no_contact' }
  | { state: 'disabled' }
  | { state: 'skipped'; reason: string };

interface StatusRpcRow extends ConfirmationRow {
  schedule_item_id: string;
  confirmation_send_on: string | null;
  channel: string | null;
}

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

/** As RPCs novas ainda nao estao nos tipos gerados: chamada tipada a mao, sem `any`. */
function callRpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  return (supabase.rpc.bind(supabase) as unknown as RpcFn)(fn, args);
}

export function normalizeMode(value: unknown): ConfirmationMode {
  return value === 'agenda_confirm' ? 'agenda_confirm' : 'booking';
}

/** A gravacao passou a visita a confirmada (e nao estava). */
export function becameConfirmed(prevStatus: string | null | undefined, nextStatus: string | null | undefined): boolean {
  return nextStatus === 'confirmed' && prevStatus !== 'confirmed';
}

/** Como mostrar um canal. */
export function channelView(row: ConfirmationRow | null | undefined): ChannelView {
  if (!row || !row.status) return { state: 'not_sent' };
  switch (row.status) {
    case 'sent':
      return { state: 'sent', at: row.sent_at ?? null };
    case 'pending':
    case 'sending':
      return { state: 'sending' };
    case 'failed':
      return { state: 'failed', error: row.error_message || '' };
    case 'skipped':
      if (row.skip_reason === 'no_email' || row.skip_reason === 'no_phone') return { state: 'no_contact' };
      if (row.skip_reason === 'email_disabled' || row.skip_reason === 'sms_disabled') return { state: 'disabled' };
      return { state: 'skipped', reason: row.skip_reason || '' };
    default:
      return { state: 'not_sent' };
  }
}

/** Estado da confirmacao das visitas pedidas (so as que o utilizador pode ver). */
export async function fetchVisitConfirmationStatus(itemIds: readonly string[]): Promise<Map<string, VisitConfirmationStatus>> {
  const out = new Map<string, VisitConfirmationStatus>();
  const ids = [...new Set(itemIds)].slice(0, 200);
  if (ids.length === 0) return out;
  try {
    const { data, error } = await callRpc('rpc_visit_confirmation_status', { p_item_ids: ids });
    if (error) {
      // Migration por aplicar ou sem permissao: o ecra fica como hoje.
      console.error('[visitConfirmation] estado:', error.message);
      return out;
    }
    for (const row of (Array.isArray(data) ? data : []) as StatusRpcRow[]) {
      const current = out.get(row.schedule_item_id)
        ?? { mode: normalizeMode(row.confirmation_send_on), email: null, sms: null };
      if (row.channel === 'email') current.email = row;
      if (row.channel === 'sms') current.sms = row;
      out.set(row.schedule_item_id, current);
    }
    return out;
  } catch (error) {
    console.error('[visitConfirmation] estado:', error);
    return out;
  }
}

export interface TriggerSummary {
  processed?: number;
  sent?: number;
  skipped?: number;
  retried?: number;
  failed?: number;
}

/** Processa ja a confirmacao desta visita (a fila e a rede de seguranca). */
export async function triggerVisitConfirmation(itemId: string): Promise<TriggerSummary | null> {
  try {
    const { data, error } = await supabase.functions.invoke('send-visit-confirmation', {
      body: { schedule_item_id: itemId },
    });
    if (error) {
      console.error('[visitConfirmation] envio:', error);
      captureFlowError(error, 'lead-lifecycle');
      return null;
    }
    return (data ?? null) as TriggerSummary | null;
  } catch (error) {
    console.error('[visitConfirmation] envio:', error);
    captureFlowError(error, 'lead-lifecycle');
    return null;
  }
}

/**
 * Depois de confirmar varias visitas (botao «Confirmar todos»): chama a funcao so
 * para as que estao em modo 'agenda_confirm'. Devolve quantas chamou.
 */
export async function triggerConfirmationsForItems(itemIds: readonly string[]): Promise<number> {
  const status = await fetchVisitConfirmationStatus(itemIds);
  const targets = [...status.entries()].filter(([, s]) => s.mode === 'agenda_confirm').map(([id]) => id);
  await Promise.all(targets.map((id) => triggerVisitConfirmation(id)));
  return targets.length;
}

/** Quantas destas visitas enviam a confirmacao ao cliente quando forem confirmadas. */
export async function countAgendaConfirmItems(itemIds: readonly string[]): Promise<number> {
  const status = await fetchVisitConfirmationStatus(itemIds);
  return [...status.values()].filter((s) => s.mode === 'agenda_confirm').length;
}

export type ResendResult = { ok: true; queued: number } | { ok: false; error: string };

/** Reenvio explicito (limitado na base: 3 por canal por visita por 24 h). */
export async function requestVisitConfirmationResend(
  itemId: string,
  channels: ConfirmationChannel[],
): Promise<ResendResult> {
  try {
    const { data, error } = await callRpc('rpc_request_visit_confirmation_resend', {
      p_item_id: itemId,
      p_channels: channels,
    });
    if (error) return { ok: false, error: error.message };
    await triggerVisitConfirmation(itemId);
    return { ok: true, queued: typeof data === 'number' ? data : 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
