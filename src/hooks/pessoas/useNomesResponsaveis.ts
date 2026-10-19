import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { lotesDeIds } from "./lotesDeIds";
import { useFontePessoas } from "./useFontePessoas";

const STALE_TIME_MS = 5 * 60_000;
const MAX_REPETICOES = 1;

type Entrada = readonly [string, string];

/**
 * Os nomes de um lote de comerciais, numa só consulta a anew_users (como a página de Leads resolve `assigned_to`: sob RLS, por id).
 * Um nome vazio não entra. Um erro é reportado e lançado: só os comerciais desse lote ficam por saber.
 */
async function lerLote(lote: readonly string[]): Promise<Entrada[]> {
  let erro: unknown = null;
  let linhas: { id: string; name: string | null }[] = [];
  try {
    const resposta = await supabase.from("anew_users").select("id, name").in("id", [...lote]);
    erro = resposta.error ?? null;
    linhas = (resposta.data ?? []) as { id: string; name: string | null }[];
  } catch (excecao) {
    erro = excecao;
  }
  if (erro) {
    captureFlowError(erro, "pessoas-neg");
    throw erro;
  }
  return linhas.flatMap((l) => (l.name && l.name.trim() !== "" ? [[l.id, l.name.trim()] as const] : []));
}

function juntar(resultados: readonly UseQueryResult<Entrada[]>[]): ReadonlyMap<string, string> {
  const mapa = new Map<string, string>();
  for (const r of resultados) for (const [id, nome] of r.data ?? []) mapa.set(id, nome);
  return mapa;
}

/**
 * O nome de cada comercial (`assigned_to`) das linhas visíveis, por id. Um pedido por lote de 100, sem repetidos; sem `ativo`
 * (a coluna está escondida), em modo exemplo ou sem ids, não há pedidos. Quem não está no mapa ainda se não sabe (a carregar,
 * em erro, ou sem nome legível): a linha mostra «Sem dado» e a lista continua inteira.
 */
export function useNomesResponsaveis(ids: readonly (string | null)[], ativo: boolean): ReadonlyMap<string, string> {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const lotes = useMemo(() => lotesDeIds(ids), [ids]);
  return useQueries({
    queries: lotes.map((lote) => ({
      queryKey: ["pessoas-responsaveis", organizationId, [...lote].sort()] as const,
      queryFn: () => lerLote(lote),
      enabled: ativo && !!organizationId,
      staleTime: STALE_TIME_MS,
      retry: MAX_REPETICOES,
    })),
    combine: juntar,
  });
}
