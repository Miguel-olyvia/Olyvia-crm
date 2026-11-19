import { describe, expect, it } from 'vitest';
import {
  CONFIRMATION_SMS_KEY,
  pickConfirmationSmsMessage,
  smsByLocaleFromSettings,
} from '../confirmationSms';

const settings = (branding: unknown) => ({ i18n: { default_locale: 'pt', enabled_locales: ['en'], content: { branding } } });

describe('smsByLocaleFromSettings: lê o SMS por idioma de forms.settings.i18n.content.branding', () => {
  it('a chave reservada é confirmation_sms_message, a mesma coluna do idioma por omissão', () => {
    expect(CONFIRMATION_SMS_KEY).toBe('confirmation_sms_message');
  });

  it('devolve só os idiomas com texto, em minúsculas', () => {
    const s = settings({
      en: { confirmation_sms_message: 'Hello {{lead_name}}', form_title: 'Title' },
      ES: { confirmation_sms_message: '  Hola  ' },
      fr: { form_title: 'Titre' },
      de: { confirmation_sms_message: '   ' },
    });
    expect(smsByLocaleFromSettings(s)).toEqual({ en: 'Hello {{lead_name}}', es: 'Hola' });
  });

  it('settings em falta, sem i18n ou com formas inesperadas dão {}', () => {
    for (const s of [null, undefined, {}, 'x', 3, [], { i18n: null }, { i18n: {} }, { i18n: { content: null } }, { i18n: { content: { branding: [] } } }]) {
      expect(smsByLocaleFromSettings(s)).toEqual({});
    }
    expect(smsByLocaleFromSettings(settings({ en: null, pt: 'texto', es: { confirmation_sms_message: 5 } }))).toEqual({});
  });
});

describe('pickConfirmationSmsMessage: idioma próprio, depois idioma curto, depois a coluna única', () => {
  const byLocale = { en: 'EN text', 'pt-br': 'BR text' };

  it('usa o texto do idioma da pessoa', () => {
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: 'en' })).toBe('EN text');
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: 'EN' })).toBe('EN text');
  });

  it('variante regional cai no idioma curto; o exato tem prioridade', () => {
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: 'en-GB' })).toBe('EN text');
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: 'pt-br' })).toBe('BR text');
  });

  it('sem texto próprio usa a coluna única (idioma por omissão do formulário)', () => {
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: 'pt' })).toBe('COL');
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: 'es' })).toBe('COL');
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale, locale: null })).toBe('COL');
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale: null, locale: 'en' })).toBe('COL');
  });

  it('sem nada configurado devolve null (o chamador usa o texto por omissão do idioma)', () => {
    expect(pickConfirmationSmsMessage({ column: null, byLocale: {}, locale: 'en' })).toBeNull();
    expect(pickConfirmationSmsMessage({ column: '   ', byLocale: null, locale: 'pt' })).toBeNull();
    expect(pickConfirmationSmsMessage({ column: undefined, byLocale: undefined, locale: undefined })).toBeNull();
  });

  it('um texto vazio no idioma não esconde a coluna', () => {
    expect(pickConfirmationSmsMessage({ column: 'COL', byLocale: { en: '  ' }, locale: 'en' })).toBe('COL');
  });
});
