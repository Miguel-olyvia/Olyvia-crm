import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { ContactoDaLista } from "./listaPessoasTipos";
import { lotesDeIds } from "./lotesDeIds";
import { useFontePessoas } from "./useFontePessoas";
import { useUltimoConhecidoPorId } from "./useUltimoConhecidoPorId";

const STALE_TIME_MS = 5 * 60_000;
const MAX_REPETICOES = 1;

type Entrada = readonly [string, ContactoDaLista];

interface LinhaEntidade {
  id: string;
  email: string | null;
  phone: string | null;
}

const limpo = (valor: string | null | undefined): string | null => {
  const aparado = valor?.trim() ?? "";
  return aparado === "" ? null : aparado;
};

/**
 * Lê o email e o telefone de um lote de pessoas da própria entidade: UM pedido direto
 * `anew_entities.select("id, email, phone").in("id", lote)`, a RLS aplica-se. Todos os ids do lote voltam com entrada:
 * quem não tem contacto (ou a RLS esconde) fica com null e null. Um erro no pedido é reportado e lançado, para a coluna não
 * mostrar um valor falso: só as pessoas desse lote ficam por saber.
 */
async function lerLote(lote: readonly string[]): Promise<Entrada[]> {
  const ids = [...lote];
  let linhas: LinhaEntidade[] = [];
  try {
    const resposta = await supabase.from("anew_entities").select("id, email, phone").in("id", ids);
    if (resposta.error) throw resposta.error;
    linhas = (resposta.data ?? []) as LinhaEntidade[];
  } catch (excecao) {
    captureFlowError(excecao, "pessoas-neg");
    throw excecao;
  }
  const porId = new Map(linhas.map((l) => [l.id, l] as const));
  return lote.map((id) => [id, { telefone: limpo(porId.get(id)?.phone), email: limpo(porId.get(id)?.email) }] as const);
}

function juntar(resultados: readonly UseQueryResult<Entrada[]>[]): ReadonlyMap<string, ContactoDaLista> {
  const mapa = new Map<string, ContactoDaLista>();
  for (const r of resultados) for (const [id, contacto] of r.data ?? []) mapa.set(id, contacto);
  return mapa;
}

/**
 * O telefone e o email de cada pessoa visível, por id. Um pedido por lote de 100 (uma página); sem `ativo` (as colunas estão
 * escondidas), em modo exemplo ou sem ids, não há pedidos. Quem não está no mapa ainda se não sabe (a carregar, ou em erro).
 */
export function useContactosPessoas(ids: readonly string[], ativo: boolean): ReadonlyMap<string, ContactoDaLista> {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const lotes = useMemo(() => lotesDeIds(ids), [ids]);
  const atuais = useQueries({
    queries: lotes.map((lote) => ({
      queryKey: ["pessoas-contactos", organizationId, [...lote].sort()] as const,
      queryFn: () => lerLote(lote),
      enabled: ativo && !!organizationId,
      staleTime: STALE_TIME_MS,
      retry: MAX_REPETICOES,
    })),
    combine: juntar,
  });
  return useUltimoConhecidoPorId(atuais, organizationId);
}
