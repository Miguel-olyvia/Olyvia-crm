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

const EVENTS = ['reminder', 'reschedule', 'cancel'] as const;
const AUDIENCES = ['client', 'technician'] as const;

// Cada destinatario, evento e idioma so olha para as suas proprias colunas.
const OWN_COLUMN = {
  client: { reminder: 'reminder_template_id', reschedule: 'reschedule_client_template_id', cancel: 'cancel_client_template_id' },
  technician: {
    reminder: 'reminder_technician_template_id',
    reschedule: 'reschedule_technician_template_id',
    cancel: 'cancel_technician_template_id',
  },
} as const;
const OWN_PURPOSE = {
  client: { reminder: 'reminder', reschedule: 'reschedule_client', cancel: 'cancel_client' },
  technician: { reminder: 'reminder_technician', reschedule: 'reschedule_technician', cancel: 'cancel_technician' },
} as const;

describe('pickAudienceTemplateId - sem configuracao', () => {
  it('sem configuracao nenhuma devolve null (texto por omissao do proprio lado) em todos os casos', () => {
    for (const event of EVENTS) {
      for (const aud of AUDIENCES) {
        expect(pickAudienceTemplateId(cfg(), event, aud, 'pt')).toBeNull();
      }
    }
  });

  it('cfg nulo devolve null', () => {
    expect(pickAudienceTemplateId(null, 'reminder', 'client', 'pt')).toBeNull();
    expect(pickAudienceTemplateId(null, 'reminder', 'technician', 'pt')).toBeNull();
  });
});

describe('pickAudienceTemplateId - separacao total', () => {
  it('cada destinatario usa o seu modelo em cada evento', () => {
    for (const event of EVENTS) {
      for (const aud of AUDIENCES) {
        const c = cfg({ [OWN_COLUMN[aud][event]]: 'OWN' } as Partial<FormEmailConfig>);
        expect(pickAudienceTemplateId(c, event, aud, 'pt')).toBe('OWN');
      }
    }
  });

  it('nenhum lado cai para o outro, em nenhum evento nem idioma', () => {
    for (const event of EVENTS) {
      for (const aud of AUDIENCES) {
        const other = aud === 'client' ? 'technician' : 'client';
        // So o outro lado esta configurado (coluna e idioma).
        const c = cfg({
          [OWN_COLUMN[other][event]]: 'OTHER',
          email_locale_templates: { [OWN_PURPOSE[other][event]]: { pt: 'OTHER-pt', en: 'OTHER-en' } },
        } as Partial<FormEmailConfig>);
        for (const locale of ['pt', 'pt-PT', 'en', 'en-GB', 'fr', null]) {
          expect(pickAudienceTemplateId(c, event, aud, locale)).toBeNull();
        }
      }
    }
  });

  it('o comercial nunca recebe o modelo do cliente, mesmo vazio o dele', () => {
    const c = cfg({ reminder_template_id: 'R', reschedule_client_template_id: 'RC', cancel_client_template_id: 'CC' });
    expect(pickAudienceTemplateId(c, 'reminder', 'technician', 'pt')).toBeNull();
    expect(pickAudienceTemplateId(c, 'reschedule', 'technician', 'pt')).toBeNull();
    expect(pickAudienceTemplateId(c, 'cancel', 'technician', 'pt')).toBeNull();
  });

  it('o cliente nunca recebe o modelo do aviso de nova reuniao (meeting_notify) nem o do comercial', () => {
    const c = cfg({
      meeting_notify_template_id: 'M',
      reminder_technician_template_id: 'RT',
      reschedule_technician_template_id: 'ST',
      cancel_technician_template_id: 'CT',
    });
    for (const event of EVENTS) {
      expect(pickAudienceTemplateId(c, event, 'client', 'pt')).toBeNull();
    }
  });

  it('o comercial tambem nao usa o aviso de nova reuniao como modelo de reagendamento', () => {
    const c = cfg({ meeting_notify_template_id: 'M' });
    expect(pickAudienceTemplateId(c, 'reschedule', 'technician', 'pt')).toBeNull();
  });

  it('respeita o idioma por destinatario e cai na coluna do proprio lado', () => {
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
