// update-lead: decisoes puras (sem imports remotos, testaveis no vitest).
//
// A chave de continuacao e SEMPRE o id de uma linha de form_submissions. Esta
// funcao nunca le nem escreve anew_leads.

import { lerCamposContacto, type FieldDefinition } from '../_shared/formCaptacao.ts';

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export type SubmissaoAcesso = {
  id: string;
  form_id: string | null;
  campaign_id: string | null;
  organization_id?: string | null;
  field_values?: AnyRecord | null;
};

export type DecisaoAcesso =
  | { ok: true; formId: string | null }
  | { ok: false; status: number; error: string };

/**
 * Defesa em profundidade num endpoint publico: quem continua uma submissao
 * tem de conhecer o par (id da submissao, formulario) ou (id, campanha).
 *  - vem form_id: tem de coincidir com o da submissao (403 se nao);
 *  - sem form_id mas com campaign_id: compara com o da submissao (403 se nao);
 *  - nenhum dos dois: 400.
 * A mensagem nunca revela ids internos.
 */
export function decidirAcesso(params: {
  submission: SubmissaoAcesso;
  formId?: string | null;
  campaignId?: string | null;
}): DecisaoAcesso {
  const { submission, formId, campaignId } = params;
  if (formId) {
    if ((submission.form_id ?? null) !== formId) {
      return { ok: false, status: 403, error: 'Forbidden: form does not match submission' };
    }
    return { ok: true, formId: submission.form_id ?? null };
  }
  if (campaignId) {
    if ((submission.campaign_id ?? null) !== campaignId) {
      return { ok: false, status: 403, error: 'Forbidden: campaign does not match submission' };
    }
    return { ok: true, formId: submission.form_id ?? null };
  }
  return { ok: false, status: 400, error: 'form_id or campaign_id is required' };
}

/**
 * Completa a entidade que ESTE envio criou (marca `_meta.entidade_nova ===
 * true`, escrita so pelo servidor) com o nome e a morada que chegam nos
 * passos seguintes. Nunca toca em contactos, origem nem campanha, e nunca em
 * entidade que ja existia antes do envio. Best-effort: devolve false se nao
 * escreveu ou se a funcao falhou.
 */
export async function completarSeNova(params: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  submission: SubmissaoAcesso;
  fieldValues: AnyRecord;
  definitions: FieldDefinition[];
}): Promise<boolean> {
  const { supabase, submission, fieldValues, definitions } = params;
  if (submission.field_values?._meta?.entidade_nova !== true) return false;

  const campos = lerCamposContacto(fieldValues, definitions);
  if (!campos.firstName && !campos.lastName && !campos.morada) return false;

  try {
    const { data, error } = await supabase.rpc('fn_form_completar_entidade', {
      p_submission_id: submission.id,
      p_first_name: campos.firstName,
      p_last_name: campos.lastName,
      p_street: campos.morada?.street ?? null,
      p_postal_code: campos.morada?.postal_code ?? null,
      p_city: campos.morada?.city ?? null,
    });
    if (error) {
      console.error('[update-lead] fn_form_completar_entidade falhou (a continuar):', error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error('[update-lead] fn_form_completar_entidade falhou (a continuar):', e);
    return false;
  }
}
