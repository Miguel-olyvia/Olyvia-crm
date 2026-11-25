/**
 * Larga a ficha da cache de identidades e le-a de novo, por esta ordem.
 *
 * Uma lead acabada de criar entrava na lista sem a ficha na cache e mostrava o
 * nome das respostas do formulario («Rui») ate se recarregar a pagina. E
 * `resolveEntities` salta os ids que ja tem, por isso sem largar primeiro a
 * entrada antiga (ficha reutilizada ou renomeada) nada se voltava a ler.
 */
export interface EntityIdentityCache {
  invalidateEntities: (ids: (string | null | undefined)[]) => void;
  resolveEntities: (ids: string[]) => Promise<unknown>;
}

export async function refreshEntityIdentity(
  cache: EntityIdentityCache,
  entityId: string | null | undefined,
): Promise<void> {
  if (!entityId) return;
  cache.invalidateEntities([entityId]);
  await cache.resolveEntities([entityId]);
}
