// Configuracao do formulario (forms, form_steps, form_fields) para create-lead
// e update-lead. Uma leitura falhada NAO pode degradar em silencio (totalSteps
// a 1 completaria um formulario de varios passos): devolve falha RETRY.
import { describe, expect, it } from 'vitest';
import { lerConfiguracaoFormulario } from './formConfig.ts';
import { makeSupabase } from './__tests__/supabaseSimulado.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORM = 'ffffffff-0000-4000-8000-000000000003';

const dados = () => ({
  forms: [{ id: FORM, organization_id: ORG, name: 'Orcamento', location_required: true }],
  form_steps: [
    { form_id: FORM, step_number: 1 }, { form_id: FORM, step_number: 3 }, { form_id: FORM, step_number: 2 },
  ] as Record<string, any>[],
  form_fields: [
    { form_id: FORM, is_active: true, field_key: 'email', step_number: 1 },
    { form_id: FORM, is_active: false, field_key: 'velho', step_number: 1 },
  ],
});
const args = (s: ReturnType<typeof makeSupabase>) => ({
  supabase: s.client, formId: FORM, organizationId: ORG, formSelect: 'name, location_required',
  fieldsSelect: '*', ordenarCampos: true, totalStepsOmissao: 1,
});

describe('lerConfiguracaoFormulario', () => {
  it('devolve formulario, maior passo e so os campos activos', async () => {
    const s = makeSupabase(dados());
    const r = await lerConfiguracaoFormulario(args(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formRow).toMatchObject({ name: 'Orcamento', location_required: true });
    expect(r.totalSteps).toBe(3);
    expect(r.definitions.map((d) => d.field_key)).toEqual(['email']);
  });

  it('sem passos nenhuns usa o total por omissao', async () => {
    const d = dados();
    d.form_steps = [];
    const r = await lerConfiguracaoFormulario({ ...args(makeSupabase(d)), totalStepsOmissao: 2 });
    expect(r.ok && r.totalSteps).toBe(2);
  });

  it('o formulario e lido com o filtro da organizacao', async () => {
    const s = makeSupabase(dados());
    await lerConfiguracaoFormulario(args(s));
    const f = s.reads.find((x) => x.table === 'forms')!;
    expect(f.filters).toEqual(expect.arrayContaining([['id', FORM], ['organization_id', ORG]]));
  });

  it.each(['forms', 'form_steps', 'form_fields'])('erro a ler %s devolve 503 RETRY e nao uma configuracao por omissao', async (tabela) => {
    const s = makeSupabase(dados(), { [`${tabela}:select`]: { message: 'boom' } });
    const r = await lerConfiguracaoFormulario(args(s));
    expect(r).toMatchObject({ ok: false, status: 503, code: 'RETRY' });
    if (!r.ok) expect(JSON.stringify(r)).not.toContain('boom');
  });
});
