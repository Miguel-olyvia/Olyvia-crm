import { supabase } from '@/integrations/supabase/client';
import { notifyVisitsForOrg } from '@/lib/scheduling/notifyClientOfScheduleChange';

/**
 * Regra: o dono da lead/cliente (assigned_to) e o recurso das visitas futuras
 * dessa lead/cliente nunca divergem. A base faz cumprir a regra (trigger); estas
 * funcoes chamam as RPCs que devolvem as visitas afectadas, para o ecra poder
 * avisar o cliente ("mudou o comercial").
 */

export type OwnerEntityKind = 'lead' | 'client';

export interface OwnerChangeResult {
  affectedVisitIds: string[];
  ownerName: string | null;
}

export type BulkSkipReason = 'no_resource' | 'owner_required';

export interface BulkSkippedEntity {
  id: string;
  name: string | null;
  reason: BulkSkipReason;
}

export interface BulkOwnerResult {
  updatedIds: string[];
  skipped: BulkSkippedEntity[];
  notPermittedIds: string[];
  affectedVisitIds: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Muda o dono de UMA lead/cliente. Lanca o erro da base (ex.: dono sem recurso de agenda). */
export async function setEntityOwner(
  kind: OwnerEntityKind,
  id: string,
  assignedTo: string | null,
): Promise<OwnerChangeResult> {
  const { data, error } = await supabase.rpc('rpc_set_entity_owner', {
    p_kind: kind,
    p_id: id,
    p_assigned_to: assignedTo as string,
  });
  if (error) throw error;
  const rec = asRecord(data);
  return {
    affectedVisitIds: asStringArray(rec.affected_visit_ids),
    ownerName: typeof rec.owner_name === 'string' ? rec.owner_name : null,
  };
}

/** Muda o dono de varias leads/clientes; as que nao podem mudar ficam de fora e voltam em `skipped`. */
export async function bulkSetEntityOwner(
  kind: OwnerEntityKind,
  ids: string[],
  assignedTo: string | null,
): Promise<BulkOwnerResult> {
  const { data, error } = await supabase.rpc('rpc_bulk_set_entity_owner', {
    p_kind: kind,
    p_ids: ids,
    p_assigned_to: assignedTo as string,
  });
  if (error) throw error;
  const rec = asRecord(data);
  const skipped = Array.isArray(rec.skipped)
    ? rec.skipped.map((s): BulkSkippedEntity => {
        const item = asRecord(s);
        return {
          id: String(item.id ?? ''),
          name: typeof item.name === 'string' ? item.name : null,
          reason: item.reason === 'owner_required' ? 'owner_required' : 'no_resource',
        };
      })
    : [];
  return {
    updatedIds: asStringArray(rec.updated_ids),
    skipped,
    notPermittedIds: asStringArray(rec.not_permitted_ids),
    affectedVisitIds: asStringArray(rec.affected_visit_ids),
  };
}

/** Texto curto com os nomes das fichas saltadas (para o aviso da atribuicao em massa). */
export function describeSkipped(skipped: BulkSkippedEntity[], fallbackName = '?'): string {
  return skipped.map((s) => s.name ?? fallbackName).join(', ');
}

/**
 * Depois de mudar o dono: avisa o cliente das visitas que passaram para outro
 * comercial (respeita o interruptor notify_client_on_reassign). Devolve quantas
 * visitas enviaram mesmo email/SMS.
 */
export function notifyOwnerChangeVisits(
  orgId: string | null | undefined,
  affectedVisitIds: readonly string[],
): Promise<number> {
  return notifyVisitsForOrg(orgId, affectedVisitIds, ['assignee']);
}
