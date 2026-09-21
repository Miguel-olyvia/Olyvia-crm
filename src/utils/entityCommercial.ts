import { supabase } from "@/integrations/supabase/client";

/**
 * Comercial atribuído a uma entidade (lead ou cliente).
 *
 * A atribuição vive nas FACETAS (`anew_leads.assigned_to` /
 * `anew_clients.assigned_to`), não em `anew_entities` — a mesma entidade pode
 * ser lead e cliente ao mesmo tempo. A lead tem prioridade: é lá que a
 * atribuição comercial começa, e uma entidade que já é cliente normalmente
 * mantém a lead com o mesmo responsável.
 *
 * Usado em dois sítios com propósitos diferentes:
 *   · na CRIAÇÃO de uma venda direta, para gravar `direct_sales.assigned_to` —
 *     o comercial fica fotografado e não muda depois;
 *   · na LISTAGEM, para mostrar quem tem a lead AGORA, ao vivo, quando for
 *     diferente do comercial da venda.
 */

export interface EntityCommercial {
  id: string;
  name: string | null;
}

/** Um só: devolve o id do comercial, ou null se a entidade não tiver responsável. */
export async function resolveEntityCommercial(
  entityId: string | null,
  organizationId: string | null,
): Promise<string | null> {
  if (!entityId || !organizationId) return null;
  const map = await resolveEntityCommercials([entityId], organizationId);
  return map.get(entityId)?.id ?? null;
}

/**
 * Vários de uma vez, para a listagem não fazer uma query por linha.
 * Duas queries no total, independentemente do número de entidades.
 */
export async function resolveEntityCommercials(
  entityIds: string[],
  organizationId: string | null,
): Promise<Map<string, EntityCommercial>> {
  const result = new Map<string, EntityCommercial>();
  const ids = Array.from(new Set(entityIds.filter(Boolean)));
  if (ids.length === 0 || !organizationId) return result;

  try {
    const [leads, clients] = await Promise.all([
      (supabase as any)
        .from("anew_leads")
        .select("entity_id, assigned_to")
        .in("entity_id", ids)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .not("assigned_to", "is", null),
      (supabase as any)
        .from("anew_clients")
        .select("entity_id, assigned_to")
        .in("entity_id", ids)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .not("assigned_to", "is", null),
    ]);

    const byEntity = new Map<string, string>();
    // Cliente primeiro e lead por cima: a lead tem prioridade, e escrever por
    // cima é mais barato do que verificar a existência a cada linha.
    for (const row of (clients?.data || []) as any[]) {
      if (row.entity_id && row.assigned_to) byEntity.set(row.entity_id, row.assigned_to);
    }
    for (const row of (leads?.data || []) as any[]) {
      if (row.entity_id && row.assigned_to) byEntity.set(row.entity_id, row.assigned_to);
    }
    if (byEntity.size === 0) return result;

    const userIds = Array.from(new Set(byEntity.values()));
    const { data: users } = await (supabase as any)
      .from("anew_users")
      .select("id, name")
      .in("id", userIds);

    const nameById = new Map<string, string | null>(
      ((users || []) as any[]).map((u) => [u.id, u.name ?? null]),
    );

    for (const [entityId, userId] of byEntity.entries()) {
      result.set(entityId, { id: userId, name: nameById.get(userId) ?? null });
    }
  } catch {
    // Silencioso: quem chama mostra a listagem à mesma, apenas sem o comercial.
    // Falhar aqui nunca pode impedir as vendas diretas de carregar.
  }

  return result;
}
