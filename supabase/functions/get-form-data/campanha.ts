// get-form-data: a campanha e so atribuicao. Quem decide qual campanha vale
// (ativa, dentro de datas, da organizacao, do formulario; varias ativas ->
// a mais recente) e a base, em fn_form_resolver_captacao. Aqui so se traduz
// isso para o que a resposta publica leva. Sem campanha valida o formulario
// responde na mesma, sem campanha e sem origem por omissao.

import { resolverCaptacao } from '../_shared/formCaptacao.ts';

export type CampanhaResposta = {
  campaign_id: string;
  campaign_name: string | null;
  default_source_id: string | null;
};

export function escolherCampanha(
  resolvido: { campaignId: string | null; originId: string | null } | null,
  linha: { id: string; name: string | null } | null,
): CampanhaResposta | null {
  if (!resolvido?.campaignId) return null;
  return {
    campaign_id: resolvido.campaignId,
    campaign_name: linha?.name ?? null,
    default_source_id: resolvido.originId ?? null,
  };
}

export type CarregarCampanha =
  | { ok: true; formId: string | null; organizationId: string; campanha: CampanhaResposta | null }
  | { ok: false; status: number; error: string };

/**
 * Formulario e campanha validos para a pagina publica. 404 so quando nao ha
 * formulario nenhum a mostrar (formulario ou campanha inexistente).
 */
export async function carregarCampanha(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: { formId: string | null; campaignId: string | null },
): Promise<CarregarCampanha> {
  const r = await resolverCaptacao(supabase, { formId: params.formId, campaignId: params.campaignId });
  if (!r.ok) return { ok: false, status: r.status, error: r.error };
  if (!r.formId) return { ok: false, status: 404, error: 'Form not found' };

  let linha: { id: string; name: string | null } | null = null;
  if (r.campaignId) {
    const { data } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('id', r.campaignId)
      .eq('organization_id', r.organizationId)
      .maybeSingle();
    linha = data ?? null;
  }
  return {
    ok: true,
    formId: r.formId,
    organizationId: r.organizationId,
    campanha: escolherCampanha(r, linha),
  };
}
