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

interface LinhaEmail {
  entity_id: string;
  email: string | null;
}

interface LinhaTelefone {
  entity_id: string;
  phone_number: string | null;
}

const limpo = (valor: string | null | undefined): string | null => {
  const aparado = valor?.trim() ?? "";
  return aparado === "" ? null : aparado;
};

/** O primeiro valor de cada entidade, como em Leads (`find` por entity_id). */
function primeiroPorEntidade<T extends { entity_id: string }>(linhas: readonly T[], valor: (l: T) => string | null): Map<string, string | null> {
  const mapa = new Map<string, string | null>();
  for (const l of linhas) if (!mapa.has(l.entity_id)) mapa.set(l.entity_id, limpo(valor(l)));
  return mapa;
}

/**
 * Lê o email e o telefone principais de um lote de pessoas pela mesma via que a página de Leads: dois pedidos diretos
 * `.in("entity_id", lote).eq("is_primary", true)` (emails e telefones), a RLS aplica-se. Todos os ids do lote voltam com entrada:
 * quem não tem contacto principal (ou a RLS esconde) fica com null e null. Um erro em QUALQUER dos dois pedidos é reportado e
 * lançado, para a coluna não mostrar um valor falso: só as pessoas desse lote ficam por saber.
 */
async function lerLote(lote: readonly string[]): Promise<Entrada[]> {
  const ids = [...lote];
  let emails: LinhaEmail[] = [];
  let telefones: LinhaTelefone[] = [];
  try {
    const [respEmails, respTelefones] = await Promise.all([
      supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", ids).eq("is_primary", true),
      supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", ids).eq("is_primary", true),
    ]);
    const erro = respEmails.error ?? respTelefones.error ?? null;
    if (erro) throw erro;
    emails = (respEmails.data ?? []) as LinhaEmail[];
    telefones = (respTelefones.data ?? []) as LinhaTelefone[];
  } catch (excecao) {
    captureFlowError(excecao, "pessoas-neg");
    throw excecao;
  }
  const emailPorId = primeiroPorEntidade(emails, (l) => l.email);
  const telefonePorId = primeiroPorEntidade(telefones, (l) => l.phone_number);
  return lote.map((id) => [id, { telefone: telefonePorId.get(id) ?? null, email: emailPorId.get(id) ?? null }] as const);
}

function juntar(resultados: readonly UseQueryResult<Entrada[]>[]): ReadonlyMap<string, ContactoDaLista> {
  const mapa = new Map<string, ContactoDaLista>();
  for (const r of resultados) for (const [id, contacto] of r.data ?? []) mapa.set(id, contacto);
  return mapa;
}

/**
 * O telefone e o email de cada pessoa visível, por id. Dois pedidos por lote de 100 (uma página); sem `ativo` (as colunas estão
 * escondidas), em modo exemplo ou sem ids, não há pedidos. Quem não está no mapa ainda se não sabe (a carregar, ou em erro).
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
