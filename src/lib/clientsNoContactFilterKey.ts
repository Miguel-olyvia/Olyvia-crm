/**
 * Chave estavel do filtro "sem contacto ha mais de 30 dias" da pagina de Clientes.
 *
 * PORQUE EXISTE. `loadClients` (AnewClients.tsx) precisa da lista de entidades
 * em risco -- mas SO quando o filtro ativo e `no_contact_30d`, que e a
 * drill-down do cartao de KPI. Essa lista vem de `alertData`, que e derivado
 * de `clients`, que e precisamente o que `loadClients` escreve.
 *
 * Com `alertData` inteiro nas dependencias de `loadClients`, o ciclo fechava:
 *
 *   loadClients -> setClients (array novo)
 *     -> analyticsClientsBase muda (e `clients` enquanto allClientsLoaded=false)
 *     -> analyticsClients muda -> alertData muda
 *     -> loadClients muda de identidade
 *     -> o useEffect que depende de loadClients volta a disparar
 *     -> loadClients ...
 *
 * ou seja, um recarregamento completo da pagina 1 (anew_clients + identidades
 * + anew_users + enriquecimento) atras do outro, desde a montagem ate
 * `allClientsLoaded` passar a true -- e indefinidamente se essa carga de fundo
 * falhar, porque so ela troca a base do calculo por um array estavel.
 *
 * Esta funcao devolve uma STRING que so muda quando o conjunto em risco
 * realmente importa para a query. Nos restantes filtros devolve sempre "" e o
 * ciclo deixa de existir. Em `no_contact_30d` continua a mudar -- e tem de
 * mudar, senao a lista ficaria presa a um conjunto obsoleto -- mas converge
 * numa iteracao ou duas, porque as linhas devolvidas passam a ser um
 * subconjunto dos ids enviados.
 *
 * Ordenada de proposito: a ordem em que `alertData` acumula as entidades
 * depende da ordem de `analyticsClients` e nao tem significado nenhum aqui;
 * sem ordenar, uma reordenacao sem alteracao de conteudo dava uma chave nova.
 */
export function buildNoContactFilterKey(
  statusFilter: string,
  noContactClients: { entityId?: string | null }[],
): string {
  if (statusFilter !== "no_contact_30d") return "";
  return [...new Set(noContactClients.map(c => c.entityId).filter((id): id is string => !!id))]
    .sort()
    .join(",");
}
