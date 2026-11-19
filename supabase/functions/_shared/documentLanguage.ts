// Idioma de um documento (proposta ou contrato) lido pelas Edge Functions. Puro: sem Deno, sem rede
// (so fetchDocumentLanguages recebe um cliente Supabase, simulavel).
//
// As Edge Functions nao podem importar de src/, por isso este parser REPETE a semantica de
// src/lib/idiomaDocumento/escolha.ts (parseEscolha) e do registo de idiomas. A igualdade esta provada por um
// teste de paridade (__tests__/documentLanguage.vitest.test.ts). Se mudares um lado, muda o outro.
//
// Onde esta guardado o idioma (decisao do utilizador):
//  - proposta: proposals.language (texto; nulo = pt; «en»; «pt+en»);
//  - contrato: client_contracts.prompt_values->>'__idiomas' (nulo = pt; «en»; «pt+en»).
// Dos emails e SMS: com UM idioma, tudo nele (so `en` tem versao inglesa; outro codigo cai em portugues);
// com DOIS, os emails levam as duas versoes e o SMS so o primeiro idioma (firstMailLang).

import { normalizeMailLang } from "./emailDefaults.ts";
import type { MailLang } from "./emailDefaults.ts";

/** Os idiomas registados em src/lib/idiomaDocumento/registo.ts (IDIOMAS). */
export const DOCUMENT_LANGUAGE_CODES = ["pt", "en", "es", "fr"] as const;

const DEFAULT_CODE = "pt";

function splitCodes(valor: unknown): unknown[] {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === "string") return valor.split(/[+,]/);
  return [];
}

function registeredCode(codigo: unknown): string | null {
  const c = typeof codigo === "string" ? codigo.trim().toLowerCase() : "";
  return (DOCUMENT_LANGUAGE_CODES as readonly string[]).includes(c) ? c : null;
}

/** Le uma escolha («pt+en», ["pt","en"]...): ordem preservada, sem repetidos, codigos invalidos ignorados; nunca vazia. */
export function parseDocumentLanguages(valor: unknown, porOmissao: string = DEFAULT_CODE): string[] {
  const out: string[] = [];
  for (const item of splitCodes(valor)) {
    const c = registeredCode(item);
    if (c && !out.includes(c)) out.push(c);
  }
  return out.length > 0 ? out : [porOmissao];
}

interface RowWithLanguage {
  language?: unknown;
}

interface RowWithPromptValues {
  prompt_values?: Record<string, unknown> | null;
}

/** Idiomas de uma proposta: proposals.language (nulo = portugues). */
export function proposalLanguages(row: RowWithLanguage | null | undefined): string[] {
  return parseDocumentLanguages(row?.language ?? null);
}

/** Idiomas de um contrato: client_contracts.prompt_values.__idiomas (nulo = portugues). */
export function contractLanguages(row: RowWithPromptValues | null | undefined): string[] {
  return parseDocumentLanguages(row?.prompt_values?.__idiomas ?? null);
}

/**
 * Do idioma do documento ao idioma dos textos: so `en` tem versao inglesa, o resto e portugues.
 * Mantem a ordem da escolha e tira repetidos («es+en» -> pt, en; «fr+es» -> pt). Nunca devolve vazio.
 */
export function mailLangsOf(codes: unknown): MailLang[] {
  const out: MailLang[] = [];
  for (const code of parseDocumentLanguages(codes)) {
    const lang = normalizeMailLang(code);
    if (!out.includes(lang)) out.push(lang);
  }
  return out;
}

/** O primeiro idioma dos textos da escolha: o unico em que sai o SMS. */
export function firstMailLang(codes: unknown): MailLang {
  return mailLangsOf(codes)[0];
}

/**
 * Idiomas de um documento guardado, lidos na base. SEMPRE com organization_id (service role).
 * Qualquer falha (documento inexistente, erro, coluna ainda nao aplicada) = portugues, para nunca partir o
 * envio de um email por causa do idioma. So propostas e contratos tem idioma; o resto e portugues.
 */
export async function fetchDocumentLanguages(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  documentType: string | null | undefined,
  documentId: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<string[]> {
  if (!documentId || !organizationId) return [DEFAULT_CODE];
  if (documentType !== "proposal" && documentType !== "contract") return [DEFAULT_CODE];
  const isProposal = documentType === "proposal";
  try {
    const { data, error } = await supabase
      .from(isProposal ? "proposals" : "client_contracts")
      .select(isProposal ? "language" : "prompt_values")
      .eq("id", documentId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) {
      console.warn("[documentLanguage] idioma do documento nao lido; fica portugues:", error.message ?? error);
      return [DEFAULT_CODE];
    }
    return isProposal ? proposalLanguages(data) : contractLanguages(data);
  } catch (e) {
    console.warn("[documentLanguage] idioma do documento nao lido; fica portugues:", e);
    return [DEFAULT_CODE];
  }
}
