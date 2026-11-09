// Resolução de referências (número/título/nome → id) só dentro do âmbito do utilizador (auditoria Administração F6).
// O resolveEntityId pesquisa com a service_role em toda a organização; aqui ficam só os candidatos que o utilizador
// vê pela RLS. Um único candidato visível resolve; nenhum = não encontrado (não se revela que existe).

import type { EntityKind, ResolveResult } from "./resolveEntityId.ts";
import type { ExecCtx } from "./types.ts";
import { rlsVisibleIds, type ScopedTable } from "./scope.ts";

const KIND_TABLE: Partial<Record<EntityKind, ScopedTable>> = {
  quote: "quotes",
  deal: "deals",
  proposal: "proposals",
  lead: "anew_leads",
  contact: "anew_contacts",
  client: "anew_clients",
  schedule_item: "schedule_items",
  contract: "client_contracts",
};

export async function scopeResolveOutcome(ctx: ExecCtx, kind: EntityKind, outcome: ResolveResult): Promise<ResolveResult> {
  const table = KIND_TABLE[kind];
  if (!table) return outcome; // catálogo (produto/serviço/bundle): sem dono
  if ("uuid" in outcome) {
    const visible = await rlsVisibleIds(ctx, table, [outcome.uuid]);
    return visible.has(outcome.uuid) ? outcome : { notFound: true };
  }
  if ("ambiguous" in outcome) {
    const visible = await rlsVisibleIds(ctx, table, outcome.ambiguous.map((c) => c.id));
    const kept = outcome.ambiguous.filter((c) => visible.has(c.id));
    if (kept.length === 0) return { notFound: true };
    if (kept.length === 1) return { uuid: kept[0].id };
    return { ambiguous: kept };
  }
  return outcome;
}
