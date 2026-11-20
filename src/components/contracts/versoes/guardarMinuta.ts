// Como o editor de minutas lê e grava client_contract_templates: colunas pedidas, o que se escreve em criar,
// atualizar e duplicar, e a guarda de concorrência do «Guardar».
//
// - O idioma do texto base é a coluna `language` (omissão 'pt'): lê-se, escreve-se ao criar, copia-se ao
//   duplicar e só se reescreve ao atualizar se tiver mudado.
// - doc_settings segue tal e qual o que está no formulário (versões e chaves desconhecidas incluídas).
// - O «Guardar» só atualiza se `updated_at` ainda for o que foi carregado; senão avisa «alterado por outra pessoa».

import { IDIOMA_BASE } from "@/lib/idiomaDocumento/registo";

export const COLUNAS_DA_MINUTA =
  "id, name, description, body_html, is_active, is_default, organization_id, created_at, created_by, updated_at, signatory_user_id, signatory_role_id, doc_settings, language";

type DocSettingsGravado = object | null;

interface FormularioDaMinuta {
  name: string;
  body_html: string;
  is_active: boolean;
  is_default: boolean;
  signatory_user_id: string | null;
  signatory_role_id: string | null;
  language?: string | null;
  doc_settings: DocSettingsGravado;
}

export function payloadDeCriar(data: FormularioDaMinuta, organizationId: string | undefined, criadoPor: string) {
  return {
    name: data.name,
    body_html: data.body_html,
    is_active: data.is_active,
    is_default: data.is_default,
    organization_id: organizationId,
    created_by: criadoPor,
    signatory_user_id: data.signatory_user_id,
    signatory_role_id: data.signatory_role_id,
    doc_settings: data.doc_settings,
    // Em português (ou sem idioma) o insert é o de sempre: a base põe 'pt' por omissão.
    ...(data.language && data.language !== IDIOMA_BASE ? { language: data.language } : {}),
  };
}

/** O que o «Guardar» escreve: o de sempre, mais `language` só se o idioma do texto base mudou. */
export function payloadDeAtualizar(data: FormularioDaMinuta, linguaCarregada: string | null | undefined) {
  const base = {
    name: data.name,
    body_html: data.body_html,
    is_active: data.is_active,
    is_default: data.is_default,
    signatory_user_id: data.signatory_user_id,
    signatory_role_id: data.signatory_role_id,
    doc_settings: data.doc_settings,
  };
  return data.language && linguaCarregada && data.language !== linguaCarregada ? { ...base, language: data.language } : base;
}

interface MinutaParaDuplicar {
  name: string;
  body_html: string;
  signatory_user_id: string | null;
  signatory_role_id: string | null;
  language?: string | null;
  doc_settings: DocSettingsGravado;
}

export function payloadDeDuplicar(template: MinutaParaDuplicar, organizationId: string | undefined, criadoPor: string) {
  return {
    name: `${template.name} (cópia)`,
    body_html: template.body_html,
    is_active: false,
    is_default: false,
    organization_id: organizationId,
    created_by: criadoPor,
    signatory_user_id: template.signatory_user_id,
    signatory_role_id: template.signatory_role_id,
    doc_settings: template.doc_settings,
    language: template.language || IDIOMA_BASE,
  };
}

/** A minuta foi alterada por outra pessoa depois de aberta. `atualizadoEm` é o `updated_at` de agora. */
export class ConflitoDeEdicaoError extends Error {
  readonly atualizadoEm: string;
  constructor(atualizadoEm: string) {
    super("A minuta foi alterada por outra pessoa");
    this.name = "ConflitoDeEdicaoError";
    this.atualizadoEm = atualizadoEm;
  }
}

// O cliente Supabase do projeto é tipado por tabela; aqui só interessa a forma da cadeia de chamadas.
type ClienteDeMinutas = { from: (tabela: string) => any };

interface PedidoDeAtualizacao {
  id: string;
  /** O `updated_at` com que a minuta foi aberta. Sem ele, atualiza só pelo id (como antes). */
  carregadoEm: string | null | undefined;
  payload: object;
}

/**
 * Falha com ConflitoDeEdicaoError se a minuta já foi alterada depois de aberta. Serve para travar ANTES de
 * mexer noutras linhas (tirar o «default» às outras minutas), para um «Guardar» que falha não deixar efeitos.
 * Sem `carregadoEm`, ou sem se ver a minuta, não faz nada (a falta de permissão aparece no próprio guardar).
 */
export async function verificarSemConflito(client: ClienteDeMinutas, { id, carregadoEm }: { id: string; carregadoEm: string | null | undefined }): Promise<void> {
  if (!carregadoEm) return;
  const { data: atual } = await client.from("client_contract_templates").select("id, updated_at").eq("id", id).maybeSingle();
  if (atual && atual.updated_at && atual.updated_at !== carregadoEm) throw new ConflitoDeEdicaoError(atual.updated_at);
}

/**
 * Atualiza a minuta só se `updated_at` ainda for `carregadoEm`. Sem linhas atualizadas distingue dois casos
 * (uma leitura extra, só quando falha): a minuta existe com outro `updated_at` = conflito (ConflitoDeEdicaoError);
 * não se vê ou nada mudou = o erro de permissão de sempre.
 */
export async function atualizarMinutaComGuarda(client: ClienteDeMinutas, { id, carregadoEm, payload }: PedidoDeAtualizacao): Promise<void> {
  let consulta = client.from("client_contract_templates").update(payload).eq("id", id);
  if (carregadoEm) consulta = consulta.eq("updated_at", carregadoEm);
  const { data: atualizadas, error } = await consulta.select("id");
  if (error) throw error;
  if (atualizadas && atualizadas.length > 0) return;

  await verificarSemConflito(client, { id, carregadoEm });
  throw new Error("Sem permissão para guardar esta minuta");
}
