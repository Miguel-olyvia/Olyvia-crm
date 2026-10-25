// Configuracao do formulario (forms, form_steps, form_fields) lida por
// create-lead e update-lead. Uma leitura falhada NAO degrada em silencio: sem
// passos o total cairia para 1 (formulario de varios passos dado como completo)
// e sem campos saltavam-se obrigatorios, unicos e a validacao de distrito.
// Falha -> 503 RETRY, antes de qualquer escrita. Sem imports remotos.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;
// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export type ConfigFormulario =
  | { ok: true; formRow: AnyRecord | null; totalSteps: number; definitions: AnyRecord[] }
  | { ok: false; status: 503; code: 'RETRY'; error: string };

export async function lerConfiguracaoFormulario(p: {
  supabase: SupabaseLike;
  formId: string;
  organizationId: string;
  formSelect: string;
  fieldsSelect: string;
  ordenarCampos: boolean;
  totalStepsOmissao: number;
}): Promise<ConfigFormulario> {
  const { supabase, formId, organizationId } = p;
  const falhou = (onde: string, error: { message?: string }): ConfigFormulario => {
    console.error(`[formConfig] leitura de ${onde} falhou:`, error.message);
    return { ok: false, status: 503, code: 'RETRY', error: 'Não foi possível processar o pedido. Tente novamente.' };
  };

  const { data: formRow, error: formError } = await supabase
    .from('forms')
    .select(p.formSelect)
    .eq('id', formId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (formError) return falhou('forms', formError);

  const { data: stepsData, error: stepsError } = await supabase
    .from('form_steps')
    .select('step_number')
    .eq('form_id', formId)
    .order('step_number', { ascending: false })
    .limit(1);
  if (stepsError) return falhou('form_steps', stepsError);
  const maiorPasso = Math.max(0, ...((stepsData ?? []) as AnyRecord[]).map((s) => Number(s.step_number) || 0));

  let query = supabase
    .from('form_fields')
    .select(p.fieldsSelect)
    .eq('form_id', formId)
    .eq('is_active', true);
  if (p.ordenarCampos) query = query.order('sort_order');
  const { data: fieldDefs, error: fieldsError } = await query;
  if (fieldsError) return falhou('form_fields', fieldsError);

  return {
    ok: true,
    formRow: formRow ?? null,
    totalSteps: maiorPasso || p.totalStepsOmissao,
    definitions: (fieldDefs ?? []) as AnyRecord[],
  };
}
