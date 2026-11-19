// REGRA: as palavras da data seguem o idioma do TEXTO REALMENTE USADO, não o idioma da pessoa.
//  (a) há modelo escolhido para o idioma da pessoa           -> data nesse idioma;
//  (b) cai no modelo da coluna única (idioma por omissão)    -> data no idioma por omissão do formulário;
//  (c) não há modelo nenhum (texto por omissão do sistema)   -> texto e data no idioma da pessoa;
//  (d) SMS: a mesma regra (texto do idioma -> esse idioma; texto da coluna -> idioma por omissão).
// Origem: o utilizador viu a confirmação com o modelo em português e a data em inglês.
import { describe, expect, it } from 'vitest';
import { contentLang, defaultLocaleFromSettings } from '../emailDefaults';
import { pickTemplateChoice, pickTemplateId } from '../formEmails';
import type { FormEmailConfig } from '../formEmails';
import { pickAudienceTemplateChoice, pickAudienceTemplateId } from '../audienceTemplates';
import { pickConfirmationSms, pickConfirmationSmsMessage } from '../confirmationSms';
import { buildBookingConfirmationMail, buildCancelMail, buildRescheduleMail } from '../bookingMails';
import { buildReminderMail } from '../reminderContent';

const cfg = (over: Partial<FormEmailConfig> = {}): FormEmailConfig =>
  ({
    confirmation_email_template_id: 'tpl-col',
    reminder_template_id: 'rem-col',
    cancel_client_template_id: 'can-col',
    reschedule_client_template_id: 'res-col',
    reminder_technician_template_id: null,
    cancel_technician_template_id: null,
    reschedule_technician_template_id: null,
    email_locale_templates: null,
    ...over,
  }) as FormEmailConfig;

describe('pickTemplateChoice: diz de onde veio o modelo', () => {
  it('entrada do mapa para o idioma da pessoa -> locale (exato ou curto)', () => {
    const c = cfg({ email_locale_templates: { confirmation: { en: 'tpl-en' } } });
    expect(pickTemplateChoice(c, 'confirmation', 'en', 'tpl-col')).toEqual({ id: 'tpl-en', source: 'locale' });
    expect(pickTemplateChoice(c, 'confirmation', 'en-GB', 'tpl-col')).toEqual({ id: 'tpl-en', source: 'locale' });
  });

  it('sem entrada para o idioma, cai na coluna -> column', () => {
    const c = cfg({ email_locale_templates: { confirmation: { es: 'tpl-es' } } });
    expect(pickTemplateChoice(c, 'confirmation', 'en', 'tpl-col')).toEqual({ id: 'tpl-col', source: 'column' });
    expect(pickTemplateChoice(cfg(), 'confirmation', null, 'tpl-col')).toEqual({ id: 'tpl-col', source: 'column' });
    expect(pickTemplateChoice(null, 'confirmation', 'en', 'tpl-col')).toEqual({ id: 'tpl-col', source: 'column' });
  });

  it('sem nada -> none', () => {
    expect(pickTemplateChoice(cfg(), 'confirmation', 'en', null)).toEqual({ id: null, source: 'none' });
    expect(pickTemplateChoice(cfg(), 'confirmation', 'en', undefined)).toEqual({ id: null, source: 'none' });
  });

  it('pickTemplateId devolve o mesmo id de sempre', () => {
    const c = cfg({ email_locale_templates: { confirmation: { en: 'tpl-en' } } });
    expect(pickTemplateId(c, 'confirmation', 'en', 'tpl-col')).toBe('tpl-en');
    expect(pickTemplateId(c, 'confirmation', 'pt', 'tpl-col')).toBe('tpl-col');
    expect(pickTemplateId(c, 'confirmation', 'pt', null)).toBeNull();
  });
});

describe('pickAudienceTemplateChoice', () => {
  it('cliente: mapa do idioma -> locale; coluna -> column; nada -> none', () => {
    const c = cfg({ email_locale_templates: { cancel_client: { en: 'can-en' } } });
    expect(pickAudienceTemplateChoice(c, 'cancel', 'client', 'en')).toEqual({ id: 'can-en', source: 'locale' });
    expect(pickAudienceTemplateChoice(c, 'cancel', 'client', 'pt')).toEqual({ id: 'can-col', source: 'column' });
    expect(pickAudienceTemplateChoice(cfg({ cancel_client_template_id: null }), 'cancel', 'client', 'en')).toEqual({ id: null, source: 'none' });
  });

  it('pickAudienceTemplateId mantém o resultado de sempre e o comercial não cai no do cliente', () => {
    const c = cfg({ email_locale_templates: { reminder: { en: 'rem-en' } } });
    expect(pickAudienceTemplateId(c, 'reminder', 'client', 'en')).toBe('rem-en');
    expect(pickAudienceTemplateId(c, 'reminder', 'technician', 'en')).toBeNull();
    expect(pickAudienceTemplateChoice(c, 'reminder', 'technician', 'en')).toEqual({ id: null, source: 'none' });
  });
});

describe('contentLang: o idioma do texto realmente usado', () => {
  const base = { personLocale: 'en', formDefaultLocale: 'pt' };

  it('(b) o cenário do utilizador: modelo da coluna (pt) + pessoa em inglês + sem modelo en -> data em pt', () => {
    expect(contentLang({ ...base, source: 'column', templateUsed: true })).toBe('pt');
  });

  it('(a) modelo escolhido para o idioma da pessoa -> data nesse idioma', () => {
    expect(contentLang({ ...base, source: 'locale', templateUsed: true })).toBe('en');
  });

  it('(c) sem modelo nenhum (texto por omissão do sistema) -> idioma da pessoa', () => {
    expect(contentLang({ ...base, source: 'none', templateUsed: false })).toBe('en');
  });

  it('modelo escolhido que não se conseguiu usar (apagado, sem corpo) -> texto por omissão, idioma da pessoa', () => {
    expect(contentLang({ ...base, source: 'column', templateUsed: false })).toBe('en');
  });

  it('(b) com o inglês como idioma por omissão do formulário, a coluna é inglesa mesmo para uma pessoa em português', () => {
    expect(contentLang({ personLocale: 'pt', formDefaultLocale: 'en', source: 'column', templateUsed: true })).toBe('en');
  });

  it('idiomas sem versão (es, fr, desconhecido, nulo) saem em português', () => {
    expect(contentLang({ personLocale: 'es', formDefaultLocale: 'pt', source: 'none', templateUsed: false })).toBe('pt');
    expect(contentLang({ personLocale: null, formDefaultLocale: null, source: 'column', templateUsed: true })).toBe('pt');
    expect(contentLang({ personLocale: 'en', formDefaultLocale: 'fr', source: 'column', templateUsed: true })).toBe('pt');
  });

  it('o português continua português em todos os casos', () => {
    for (const source of ['locale', 'column', 'none'] as const) {
      expect(contentLang({ personLocale: 'pt', formDefaultLocale: 'pt', source, templateUsed: source !== 'none' })).toBe('pt');
    }
  });
});

describe('defaultLocaleFromSettings', () => {
  it('lê forms.settings.i18n.default_locale; sem ele, pt', () => {
    expect(defaultLocaleFromSettings({ i18n: { default_locale: 'en', enabled_locales: ['pt'] } })).toBe('en');
    expect(defaultLocaleFromSettings({ i18n: { default_locale: ' EN-gb ' } })).toBe('en-gb');
    for (const s of [null, undefined, {}, 'x', [], { i18n: null }, { i18n: { default_locale: '' } }, { i18n: { default_locale: 3 } }]) {
      expect(defaultLocaleFromSettings(s)).toBe('pt');
    }
  });
});

describe('pickConfirmationSms: de onde veio o texto (regra d)', () => {
  const byLocale = { en: 'EN text' };

  it('texto do idioma da pessoa -> locale', () => {
    expect(pickConfirmationSms({ column: 'COL', byLocale, locale: 'en' })).toEqual({ text: 'EN text', source: 'locale' });
  });

  it('texto da coluna única -> column (idioma por omissão do formulário)', () => {
    expect(pickConfirmationSms({ column: 'COL', byLocale, locale: 'es' })).toEqual({ text: 'COL', source: 'column' });
    expect(pickConfirmationSms({ column: 'COL', byLocale: null, locale: 'en' })).toEqual({ text: 'COL', source: 'column' });
  });

  it('nada configurado -> null', () => {
    expect(pickConfirmationSms({ column: null, byLocale: {}, locale: 'en' })).toBeNull();
  });

  it('pickConfirmationSmsMessage continua a devolver só o texto', () => {
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: 'en' })).toBe('EN text');
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: 'pt' })).toBe('COL');
    expect(pickConfirmationSmsMessage({ column: null, byLocale: {}, locale: 'en' })).toBeNull();
  });
});

describe('builders: o assunto por omissão de um modelo sem assunto segue o idioma do modelo', () => {
  const vars = { lead_name: 'Rita', meeting_date: 'segunda-feira, 5 de outubro de 2026 às 11:00' };
  const common = { vars, leadName: 'Rita', when: vars.meeting_date };

  it('confirmação: modelo da coluna (pt) sem assunto, pessoa em inglês -> assunto em pt', () => {
    const m = buildBookingConfirmationMail({ ...common, lang: 'en', templateLang: 'pt', template: { subject: '', body_html: '<p>Olá {{lead_name}}</p>' } });
    expect(m.subject).toBe('Confirmação da sua visita — segunda-feira, 5 de outubro de 2026 às 11:00');
    expect(m.html).toBe('<p>Olá Rita</p>');
  });

  it('confirmação: modelo en escolhido sem assunto -> assunto em inglês', () => {
    const m = buildBookingConfirmationMail({
      ...common, vars: { ...vars, meeting_date: 'Monday, 5 October 2026 at 11:00' }, lang: 'en', templateLang: 'en',
      template: { subject: '', body_html: '<p>Hi</p>' },
    });
    expect(m.subject).toBe('Your visit is confirmed — Monday, 5 October 2026 at 11:00');
  });

  it('confirmação: sem modelo -> texto e assunto no idioma da pessoa (templateLang ignorado)', () => {
    const m = buildBookingConfirmationMail({ ...common, vars: { ...vars, meeting_date: 'Monday, 5 October 2026 at 11:00' }, lang: 'en', templateLang: 'pt', template: null });
    expect(m.subject).toBe('Your visit is confirmed — Monday, 5 October 2026 at 11:00');
    expect(m.html).toContain('Visit confirmed');
  });

  it('sem templateLang é o idioma da pessoa, como antes', () => {
    const m = buildBookingConfirmationMail({ ...common, lang: 'en', template: { subject: '', body_html: '<p>x</p>' } });
    expect(m.subject.startsWith('Your visit is confirmed')).toBe(true);
  });

  it('cancelar e reagendar (cliente): modelo da coluna sem assunto -> assunto no idioma do modelo', () => {
    const p = { ...common, kind: 'client' as const, lang: 'en', templateLang: 'pt', template: { subject: '', body_html: '<p>x</p>' } };
    expect(buildCancelMail(p).subject).toBe('A sua visita foi cancelada');
    expect(buildRescheduleMail(p).subject).toBe('A sua visita foi reagendada');
    expect(buildCancelMail({ ...p, templateLang: 'en' }).subject).toBe('Your visit has been cancelled');
  });

  it('lembrete (cliente): modelo da coluna sem assunto -> assunto em pt; sem modelo -> idioma da pessoa', () => {
    const t = { subject: '', body_html: '<p>x</p>' };
    const withTpl = buildReminderMail({ audience: 'client', template: t, vars, brand: null, lang: 'en', templateLang: 'pt' });
    expect(withTpl.subject).toBe('Lembrete da sua visita — segunda-feira, 5 de outubro de 2026 às 11:00');
    const noTpl = buildReminderMail({ audience: 'client', template: null, vars, brand: null, lang: 'en', templateLang: 'pt' });
    expect(noTpl.subject.startsWith('Reminder of your visit')).toBe(true);
  });
});
