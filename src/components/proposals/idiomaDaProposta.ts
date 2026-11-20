// O idioma de uma proposta, gravado em proposals.language (nulo = português, como sempre).
//
// As RPCs rpc_create_proposal e rpc_update_proposal inserem/atualizam uma lista FIXA de colunas e não têm
// parâmetro `language`: o idioma vai num update separado, logo a seguir (ver gravarIdiomaDaProposta). Uma falha
// aí não desfaz a proposta, que já existe: quem chama avisa e segue.

import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { IDIOMA_BASE, parseEscolha, serializarEscolha } from "@/lib/idiomaDocumento";

/** Prefixo da preferência (localStorage) do último idioma usado com cada template de proposta. */
export const PREFIXO_PREFERENCIA_PROPOSTA = "olyvia:idioma-proposta";

/** O valor da coluna para uma escolha: só português (ou nada) = null, ou seja, nada a gravar. */
export function languageParaGravar(escolha: readonly string[] | null | undefined): string | null {
  if (!escolha || escolha.length === 0) return null;
  const serializada = serializarEscolha(escolha);
  return serializada === IDIOMA_BASE ? null : serializada;
}

export interface EntradaDecisaoIdioma {
  modo: "criar" | "editar";
  /** A escolha feita no seletor. */
  escolha: readonly string[];
  /** O que a proposta já tinha gravado (só ao editar). */
  gravado?: string | null;
}

/**
 * Há alguma coisa a gravar? null = não (a proposta fica exatamente como hoje, sem tocar na coluna);
 * `{ language }` = sim, com o valor da coluna (null limpa-a, ao voltar ao português).
 */
export function decidirGravacaoDoIdioma({ modo, escolha, gravado }: EntradaDecisaoIdioma): { language: string | null } | null {
  const language = languageParaGravar(escolha);
  if (modo === "criar") return language === null ? null : { language };
  const antes = serializarEscolha(parseEscolha(gravado ?? null));
  const agora = serializarEscolha(parseEscolha([...escolha]));
  return antes === agora ? null : { language };
}

/** `erro` só vem quando `ok` é false. (Não é uma união discriminada: o tsconfig da app não é strict.) */
export interface ResultadoGravacaoIdioma {
  ok: boolean;
  erro?: string;
}

/** Grava `language` numa proposta que já existe. Nunca lança: devolve o resultado. */
export async function gravarIdiomaDaProposta(
  propostaId: string,
  language: string | null,
  utilizadorId: string,
): Promise<ResultadoGravacaoIdioma> {
  try {
    await supabase.rpc("set_audit_context", { p_user_id: utilizadorId, p_source: "ui" });
    // `language` ainda não consta dos tipos gerados da tabela.
    const { error } = await (supabase.from("proposals") as any).update({ language }).eq("id", propostaId);
    if (error) {
      captureFlowError(error, "proposal-lifecycle");
      return { ok: false, erro: error.message ?? "erro desconhecido" };
    }
    return { ok: true };
  } catch (e: unknown) {
    captureFlowError(e, "proposal-lifecycle");
    return { ok: false, erro: e instanceof Error ? e.message : "erro desconhecido" };
  }
}
