import { describe, expect, it } from 'vitest';
import { buildCreateLeadBody, buildUpdateLeadBody } from './publicLeadFormRequests';

const FORM = 'ffffffff-0000-4000-8000-000000000003';
const CAMP = 'cccccccc-0000-4000-8000-000000000004';
const SUB = '99999999-0000-4000-8000-000000000007';

describe('buildUpdateLeadBody', () => {
  const base = {
    targetType: 'lead' as const,
    leadId: SUB,
    formId: FORM,
    campaignId: undefined as string | undefined,
    stepNumber: 2,
    stepFieldValues: { rua: 'Rua A' },
    needsManualScheduling: false,
    locale: null as string | null,
    tracking: null,
  };

  it('passo 2 sem campanha envia form_id e o corpo nao tem a chave campaign_id', () => {
    const body = buildUpdateLeadBody(base);
    expect(body.form_id).toBe(FORM);
    expect(body).not.toHaveProperty('campaign_id');
    expect(body).toMatchObject({ target_id: SUB, lead_id: SUB, target_type: 'lead', step_number: 2 });
  });

  it('com campanha continua a enviar campaign_id', () => {
    expect(buildUpdateLeadBody({ ...base, campaignId: CAMP }).campaign_id).toBe(CAMP);
  });

  it('lang e tracking so entram quando existem', () => {
    const sem = buildUpdateLeadBody(base);
    expect(sem).not.toHaveProperty('lang');
    expect(sem).not.toHaveProperty('tracking');
    const com = buildUpdateLeadBody({ ...base, locale: 'pt', tracking: { utm_source: 'x' } });
    expect(com.lang).toBe('pt');
    expect(com.tracking).toEqual({ utm_source: 'x' });
  });

  it('sem form_id (formulario antigo) nao envia a chave', () => {
    expect(buildUpdateLeadBody({ ...base, formId: undefined, campaignId: CAMP })).not.toHaveProperty('form_id');
  });
});

describe('buildCreateLeadBody', () => {
  const base = {
    stepNumber: 1,
    stepFieldValues: { email: 'a@b.pt' },
    sourceId: null as string | null,
    needsManualScheduling: false,
    locale: null as string | null,
    formId: FORM,
    campaignId: undefined as string | undefined,
    tracking: null,
    embedKind: '',
  };

  it('create-lead sem campanha segue so com form_id', () => {
    const body = buildCreateLeadBody(base);
    expect(body.form_id).toBe(FORM);
    expect(body).not.toHaveProperty('campaign_id');
    expect(body).toMatchObject({ step_number: 1, source: 'public_form', source_id: null });
  });

  it('com campanha e embed envia-os', () => {
    const body = buildCreateLeadBody({ ...base, campaignId: CAMP, embedKind: 'utm', tracking: { utm_source: 'g' } as any });
    expect(body.campaign_id).toBe(CAMP);
    expect(body.embed).toBe('utm');
    expect(body.tracking).toEqual({ utm_source: 'g' });
  });
});
