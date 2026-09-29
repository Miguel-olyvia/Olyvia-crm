import { describe, expect, it } from 'vitest';
import { buildAudienceVars, pickAudienceTemplateId } from '../audienceTemplates';
import type { FormEmailConfig } from '../formEmails';

function cfg(over: Partial<FormEmailConfig> = {}): FormEmailConfig {
  return {
    meeting_notify_template_id: null,
    reminder_template_id: null,
    reminder_technician_template_id: null,
    reschedule_client_template_id: null,
    reschedule_technician_template_id: null,
    cancel_client_template_id: null,
    cancel_technician_template_id: null,
    email_locale_templates: null,
    ...over,
  } as FormEmailConfig;
}

describe('pickAudienceTemplateId - por omissao nada muda', () => {
  it('sem configuracao nenhuma devolve null (texto padrao) em todos os casos', () => {
    for (const event of ['reminder', 'reschedule', 'cancel'] as const) {
      for (const aud of ['client', 'technician'] as const) {
        expect(pickAudienceTemplateId(cfg(), event, aud, 'pt')).toBeNull();
      }
    }
  });

  it('cfg nulo devolve null', () => {
    expect(pickAudienceTemplateId(null, 'reminder', 'client', 'pt')).toBeNull();
  });

  it('lembrete: as duas pontas usam reminder_template_id como hoje', () => {
    const c = cfg({ reminder_template_id: 'R' });
    expect(pickAudienceTemplateId(c, 'reminder', 'client', 'pt')).toBe('R');
    expect(pickAudienceTemplateId(c, 'reminder', 'technician', 'pt')).toBe('R');
  });

  it('reagendamento: sem modelos novos usa meeting_notify_template_id como hoje', () => {
    const c = cfg({ meeting_notify_template_id: 'M' });
    expect(pickAudienceTemplateId(c, 'reschedule', 'client', 'pt')).toBe('M');
    expect(pickAudienceTemplateId(c, 'reschedule', 'technician', 'pt')).toBe('M');
  });

  it('cancelamento nunca reutiliza meeting_notify nem reminder', () => {
    const c = cfg({ meeting_notify_template_id: 'M', reminder_template_id: 'R' });
    expect(pickAudienceTemplateId(c, 'cancel', 'client', 'pt')).toBeNull();
    expect(pickAudienceTemplateId(c, 'cancel', 'technician', 'pt')).toBeNull();
  });
});

describe('pickAudienceTemplateId - recurso em cadeia', () => {
  it('comercial com modelo proprio usa-o', () => {
    const c = cfg({ reminder_template_id: 'R', reminder_technician_template_id: 'RT' });
    expect(pickAudienceTemplateId(c, 'reminder', 'technician', 'pt')).toBe('RT');
    expect(pickAudienceTemplateId(c, 'reminder', 'client', 'pt')).toBe('R');
  });

  it('comercial sem modelo proprio cai no do cliente antes da coluna antiga', () => {
    const c = cfg({ reschedule_client_template_id: 'RC', meeting_notify_template_id: 'M' });
    expect(pickAudienceTemplateId(c, 'reschedule', 'technician', 'pt')).toBe('RC');
    expect(pickAudienceTemplateId(c, 'reschedule', 'client', 'pt')).toBe('RC');
  });

  it('cliente nao herda o modelo do comercial', () => {
    const c = cfg({ cancel_technician_template_id: 'CT' });
    expect(pickAudienceTemplateId(c, 'cancel', 'client', 'pt')).toBeNull();
    expect(pickAudienceTemplateId(c, 'cancel', 'technician', 'pt')).toBe('CT');
  });

  it('comercial de cancelamento sem modelo usa o do cliente', () => {
    const c = cfg({ cancel_client_template_id: 'CC' });
    expect(pickAudienceTemplateId(c, 'cancel', 'technician', 'pt')).toBe('CC');
  });

  it('respeita o idioma por destinatario', () => {
    const c = cfg({
      reminder_technician_template_id: 'RT',
      email_locale_templates: { reminder_technician: { en: 'RT-en' } },
    });
    expect(pickAudienceTemplateId(c, 'reminder', 'technician', 'en-GB')).toBe('RT-en');
    expect(pickAudienceTemplateId(c, 'reminder', 'technician', 'pt')).toBe('RT');
  });
});

describe('buildAudienceVars', () => {
  const base = {
    lead_name: 'Ana',
    cancel_url: 'https://x/cancel',
    company_name: 'Acme',
  };

  it('cliente recebe cancel_url e confirm_url', () => {
    const v = buildAudienceVars(base, 'client', { confirmUrl: 'https://x/confirm' });
    expect(v.cancel_url).toBe('https://x/cancel');
    expect(v.confirm_url).toBe('https://x/confirm');
    expect(v.appointment_url).toBe('');
  });

  it('comercial nunca recebe cancel_url nem confirm_url, mesmo se vierem no base ou no extra', () => {
    const v = buildAudienceVars({ ...base, confirm_url: 'https://x/confirm' }, 'technician', {
      cancelUrl: 'https://x/cancel2',
      confirmUrl: 'https://x/confirm2',
    });
    expect(v.cancel_url).toBe('');
    expect(v.confirm_url).toBe('');
  });

  it('comercial recebe contacto da lead, morada e link do calendario', () => {
    const v = buildAudienceVars(base, 'technician', {
      leadPhone: '910000000',
      leadEmail: 'a@b.pt',
      address: 'Rua A 1, Lisboa',
      appointmentUrl: 'https://app/scheduling',
    });
    expect(v.lead_phone).toBe('910000000');
    expect(v.lead_email).toBe('a@b.pt');
    expect(v.address).toBe('Rua A 1, Lisboa');
    expect(v.appointment_url).toBe('https://app/scheduling');
    expect(v.lead_name).toBe('Ana');
  });

  it('nao muta o objecto base', () => {
    const copy = { ...base };
    buildAudienceVars(base, 'technician', { leadPhone: '1' });
    expect(base).toEqual(copy);
  });
});
