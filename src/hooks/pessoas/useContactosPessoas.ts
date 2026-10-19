import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { ContactoDaLista } from "./listaPessoasTipos";
import { lotesDeIds } from "./lotesDeIds";
import { useFontePessoas } from "./useFontePessoas";

const STALE_TIME_MS = 5 * 60_000;
const MAX_REPETICOES = 1;

type Entrada = readonly [string, ContactoDaLista];

interface LinhaContacto {
  entity_id: string;
  email: string | null;
  phone_number: string | null;
}

const limpo = (valor: string | null | undefined): string | null => {
  const aparado = valor?.trim() ?? "";
  return aparado === "" ? null : aparado;
};

/**
 * Lê o telefone e o email principais de um lote de pessoas com `get_entity_contact_summary` (SECURITY INVOKER: a RLS aplica-se),
 * UMA chamada por lote. Todos os ids do lote voltam com entrada: quem a função não devolve (sem contactos, ou escondido pela
 * RLS) fica com null e null. Um erro é reportado e lançado: só as pessoas desse lote ficam por saber.
 */
async function lerLote(lote: readonly string[]): Promise<Entrada[]> {
  let erro: unknown = null;
  let linhas: LinhaContacto[] = [];
  try {
    const resposta = await supabase.rpc("get_entity_contact_summary", { _entity_ids: [...lote] });
    erro = resposta.error ?? null;
    linhas = (resposta.data ?? []) as LinhaContacto[];
  } catch (excecao) {
    erro = excecao;
  }
  if (erro) {
    captureFlowError(erro, "pessoas-neg");
    throw erro;
  }
  const porId = new Map(linhas.map((l) => [l.entity_id, l]));
  return lote.map((id) => [id, { telefone: limpo(porId.get(id)?.phone_number), email: limpo(porId.get(id)?.email) }] as const);
}

function juntar(resultados: readonly UseQueryResult<Entrada[]>[]): ReadonlyMap<string, ContactoDaLista> {
  const mapa = new Map<string, ContactoDaLista>();
  for (const r of resultados) for (const [id, contacto] of r.data ?? []) mapa.set(id, contacto);
  return mapa;
}

/**
 * O telefone e o email de cada pessoa visível, por id. Uma chamada por lote de 100 (uma página); sem `ativo` (as colunas estão
 * escondidas), em modo exemplo ou sem ids, não há chamadas. Quem não está no mapa ainda se não sabe (a carregar, ou em erro).
 */
export function useContactosPessoas(ids: readonly string[], ativo: boolean): ReadonlyMap<string, ContactoDaLista> {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const lotes = useMemo(() => lotesDeIds(ids), [ids]);
  return useQueries({
    queries: lotes.map((lote) => ({
      queryKey: ["pessoas-contactos", organizationId, [...lote].sort()] as const,
      queryFn: () => lerLote(lote),
      enabled: ativo && !!organizationId,
      staleTime: STALE_TIME_MS,
      retry: MAX_REPETICOES,
    })),
    combine: juntar,
  });
}
