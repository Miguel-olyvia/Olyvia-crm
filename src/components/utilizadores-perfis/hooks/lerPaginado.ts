// Leitura paginada: o PostgREST (max_rows = 1000) corta qualquer resposta nas 1000 linhas em silêncio, mesmo com `.limit(5000)`.
// Lê página a página com `.range()` até vir uma página incompleta. A consulta TEM de ter uma ordem determinística (por exemplo
// `.order("role_id").order("permission_code")`), senão as páginas podem repetir ou saltar linhas. Um erro em qualquer página
// sobe tal como veio: nunca se devolve uma lista parcial.

/** O tamanho de página que o PostgREST serve de uma vez (max_rows). */
export const PAGINA_POSTGREST = 1000;

type PedirPagina = (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>;

/** `pedirPagina(de, ate)` monta a consulta (já ordenada) e acaba em `.range(de, ate)`. */
export async function lerTodasAsPaginas<T>(pedirPagina: PedirPagina, tamanho = PAGINA_POSTGREST): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await pedirPagina(de, de + tamanho - 1);
    if (error) throw error;
    const pagina = (data ?? []) as T[];
    todas.push(...pagina);
    if (pagina.length < tamanho) return todas;
  }
}
