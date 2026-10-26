import type { QueryClient } from "@tanstack/react-query";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { fichaPessoaQueryKey } from "./useFichaPessoa";
import { listaPessoasQueryKey } from "./useListaPessoas";

/**
 * Depois de uma escrita (bem-sucedida ou parcial; nunca depois de uma falha total): refaz a ficha da pessoa e todas as listas da
 * organização (o prefixo sem filtros). Sem organização não faz nada.
 */
export async function invalidarPessoas(client: QueryClient, organizationId: string | null | undefined, pessoaId: string): Promise<void> {
  if (!organizationId) return;
  try {
    await Promise.all([
      client.invalidateQueries({ queryKey: fichaPessoaQueryKey(organizationId, pessoaId) }),
      client.invalidateQueries({ queryKey: listaPessoasQueryKey(organizationId) }),
    ]);
  } catch (erro) {
    // A escrita já aconteceu; refazer a ficha é um extra. Falhar aqui não pode virar rejeição por tratar (nem fazer falhar um guardar que gravou).
    captureFlowError(erro, "pessoas-neg");
  }
}
