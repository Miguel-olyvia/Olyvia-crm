// Textos por omissão dos emails e SMS ao cliente, por idioma. O português tem de sair IDÊNTICO ao de
// hoje: o golden (fixtures/emailDefaultsPt.golden.json) foi capturado do código antes de o alterar.
import { describe, expect, it } from 'vitest';
import golden from './fixtures/emailDefaultsPt.golden.json';
import {
  MAIL_TEXTS,
  defaultConfirmationSms,
  formatVisitDate,
  mailLangFor,
  normalizeMailLang,
  reminderSmsText,
  resolveLeadLocale,
} from '../emailDefaults';
import {
  buildBookingConfirmationMail,
  buildCancelMail,
  buildMeetingNotifyMail,
  buildRescheduleMail,
} from '../bookingMails';
import { defaultMeetingHtml, defaultSchedulingInviteHtml, renderSubject } from '../formEmails';
import {
  buildReminderMail,
  formatVisitWhen,
  reminderSmsTemplate,
  withFreshVisitVars,
} from '../reminderContent';

const G = golden as Record<string, string>;
const ISOS = ['2026-10-05T10:00:00Z', '2026-12-24T18:30:00Z', '2027-01-02T07:05:00Z'];
const when = 'segunda-feira, 5 de outubro de 2026 às 11:00';
const brand = { primaryColor: '#123ABC', logoUrl: 'https://cdn.test/logo.png' };
const vars = {
  lead_name: 'Rita Sousa', client_name: 'Rita Sousa', lead_email: 'rita@x.pt', client_email: 'rita@x.pt',
  lead_phone: '912345678', company_name: 'Acme', technician_name: 'Ana', meeting_date: when,
  meeting_datetime: when, location: 'Rua A, Lisboa', cancel_url: 'https://app.test/m?token=abc',
};
const LANGS_AS_PT: Array<string | null | undefined> = [undefined, null, '', 'pt', 'pt-PT', 'PT', 'fr', 'xx', 'es-ES'];

describe('normalizeMailLang e mailLangFor', () => {
  it('inglês só para en e variantes; tudo o resto (desconhecido, vazio, nulo) é português', () => {
    expect(normalizeMailLang('en')).toBe('en');
    expect(normalizeMailLang('EN-gb')).toBe('en');
    expect(normalizeMailLang(' en_US ')).toBe('en');
    for (const l of LANGS_AS_PT) expect(normalizeMailLang(l)).toBe('pt');
  });

  it('o comercial (interno) fica sempre em português; o cliente segue o idioma', () => {
    expect(mailLangFor('technician', 'en')).toBe('pt');
    expect(mailLangFor('client', 'en')).toBe('en');
    expect(mailLangFor('client', 'fr')).toBe('pt');
    expect(mailLangFor(undefined, 'en')).toBe('en');
  });
});

describe('resolveLeadLocale', () => {
  it('o idioma do pedido tem prioridade; sem ele, o guardado na lead; sem nenhum, null', () => {
    expect(resolveLeadLocale('EN', 'pt')).toBe('en');
    expect(resolveLeadLocale(undefined, 'En-GB')).toBe('en-gb');
    expect(resolveLeadLocale('  ', 'pt')).toBe('pt');
    expect(resolveLeadLocale(null, null)).toBeNull();
    expect(resolveLeadLocale(undefined, undefined)).toBeNull();
    expect(resolveLeadLocale(7 as unknown as string, '')).toBeNull();
  });
});

describe('datas: só as palavras seguem o idioma', () => {
  it.each(ISOS.map((iso, i) => [iso, i] as const))('pt idêntico ao de hoje (%s)', (iso, i) => {
    expect(formatVisitDate(iso, 'pt', true)).toBe(G[`when.withYear.${i}`]);
    expect(formatVisitDate(iso, 'pt', false)).toBe(G[`when.noYear.${i}`]);
    expect(formatVisitWhen(iso)).toBe(G[`when.formatVisitWhen.${i}`]);
    for (const l of LANGS_AS_PT) expect(formatVisitWhen(iso, l)).toBe(G[`when.formatVisitWhen.${i}`]);
  });

  it('inglês: nomes de dias e meses em inglês, «at», o mesmo dia, ano e hora (fuso de Lisboa)', () => {
    expect(formatVisitDate(ISOS[0], 'en', true)).toBe('Monday, 5 October 2026 at 11:00');
    expect(formatVisitDate(ISOS[1], 'en', true)).toBe('Thursday, 24 December 2026 at 18:30');
    expect(formatVisitDate(ISOS[2], 'en', false)).toBe('Saturday, 2 January at 07:05');
    expect(formatVisitWhen(ISOS[0], 'en-GB')).toBe('Monday, 5 October 2026 at 11:00');
  });

  it('withFreshVisitVars: sem idioma é o de hoje; com en só a data muda', () => {
    ISOS.forEach((iso, i) => {
      expect(JSON.stringify(withFreshVisitVars({ a: 'b' }, { startIso: iso, location: 'L', technicianName: 'T' }))).toBe(
        G[`reminder.freshVars.${i}`],
      );
    });
    const en = withFreshVisitVars({ a: 'b' }, { startIso: ISOS[0], location: 'L', technicianName: 'T' }, 'en');
    expect(en.meeting_date).toBe('Monday, 5 October 2026 at 11:00');
    expect(en.meeting_datetime).toBe(en.meeting_date);
    expect(en.location).toBe('L');
  });
});

describe('dicionário: pt e en têm as mesmas chaves e nada vazio', () => {
  const keys = (o: unknown, p = ''): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`],
    );

  it('mesma forma nos dois idiomas', () => {
    expect(keys(MAIL_TEXTS.en)).toEqual(keys(MAIL_TEXTS.pt));
  });

  it('nenhum texto vazio e o inglês difere do português nos textos visíveis', () => {
    for (const lang of ['pt', 'en'] as const) {
      for (const [k, v] of Object.entries(MAIL_TEXTS[lang].labels)) expect(v, `${lang}.labels.${k}`).not.toBe('');
    }
    expect(MAIL_TEXTS.en.labels.confirmVisit).toBe('I confirm the visit');
    expect(MAIL_TEXTS.en.cancel.heading).toBe('Visit cancelled');
    expect(MAIL_TEXTS.en.bookingConfirmation.heading).not.toBe(MAIL_TEXTS.pt.bookingConfirmation.heading);
  });
});

describe('defaultMeetingHtml: rótulos por idioma', () => {
  const args = { heading: 'H', intro: 'I', leadName: 'Rita', when, location: 'L', technicianName: 'T', cancelUrl: 'https://x/c', confirmUrl: 'https://x/k' } as const;

  it('pt idêntico ao de hoje, com ou sem lang (e para idiomas desconhecidos)', () => {
    for (const l of LANGS_AS_PT) {
      expect(defaultMeetingHtml({ ...args, lang: l })).toBe(G['meeting.noAudience']);
      expect(defaultMeetingHtml({ ...args, audience: 'client', lang: l })).toBe(G['meeting.client.confirm']);
    }
    expect(defaultMeetingHtml({ ...args })).toBe(G['meeting.noAudience']);
    expect(
      defaultMeetingHtml({ audience: 'technician', heading: 'H', intro: 'I', leadName: 'Rita', leadPhone: '9', leadEmail: 'a@b', address: 'Morada', when, appointmentUrl: 'https://x/a' }),
    ).toBe(G['meeting.technician.agenda']);
  });

  it('en: traduz os rótulos e os botões', () => {
    const html = defaultMeetingHtml({ ...args, audience: 'client', lang: 'en' });
    expect(html).toContain('>Date / time<');
    expect(html).toContain('>Location<');
    expect(html).toContain('>Technician<');
    expect(html).toContain('I confirm the visit');
    expect(html).toContain('Manage or cancel booking');
    expect(html).not.toContain('Data / hora');
    expect(html).not.toContain('Confirmo a visita');
    // Os rótulos do comercial existem em inglês no dicionário, mas o aviso interno nunca os usa (ver o teste abaixo).
    expect(MAIL_TEXTS.en.labels).toMatchObject({ lead: 'Lead', phone: 'Phone', address: 'Address', openAgenda: 'Open in calendar' });
    const none = defaultMeetingHtml({ heading: 'H', intro: 'I', leadName: 'Rita', when, lang: 'en' });
    expect(none).toContain('>Client<');
  });

  it('o comercial fica em português mesmo com lang en', () => {
    const tech = defaultMeetingHtml({ audience: 'technician', heading: 'H', intro: 'I', leadName: 'Rita', leadPhone: '9', leadEmail: 'a@b', address: 'Morada', when, appointmentUrl: 'https://x/a', lang: 'en' });
    expect(tech).toBe(G['meeting.technician.agenda']);
  });
});

describe('book-slot: confirmação e aviso (pt idêntico ao golden)', () => {
  const confBase = {
    template: null, vars, leadName: 'Rita Sousa', when, location: 'Rua A, Lisboa', technicianName: 'Ana',
    cancelUrl: 'https://app.test/m?token=abc', primaryColor: brand.primaryColor, logoUrl: brand.logoUrl,
  };

  it('confirmação ao cliente por omissão em pt, com qualquer idioma que não seja en', () => {
    for (const l of LANGS_AS_PT) {
      const m = buildBookingConfirmationMail({ ...confBase, lang: l });
      expect(m.html).toBe(G['bookSlot.confirmation.full']);
      expect(m.subject).toBe(G['bookSlot.confirmation.subject']);
    }
    const min = buildBookingConfirmationMail({
      template: null, vars, leadName: 'Rita Sousa', when, location: undefined, technicianName: undefined,
      cancelUrl: undefined, primaryColor: null, logoUrl: null,
    });
    expect(min.html).toBe(G['bookSlot.confirmation.minimal']);
  });

  it('confirmação ao cliente em inglês', () => {
    const m = buildBookingConfirmationMail({ ...confBase, lang: 'en', vars: { ...vars, meeting_date: 'Monday, 5 October 2026 at 11:00' } });
    expect(m.subject).toBe('Your visit is confirmed — Monday, 5 October 2026 at 11:00');
    expect(m.html).toContain('Visit confirmed');
    expect(m.html).toContain('Your visit has been scheduled successfully.');
    expect(m.html).toContain('Manage or cancel booking');
  });

  it('com modelo escolhido, o modelo manda (corpo e assunto), em qualquer idioma', () => {
    const tpl = { subject: 'Olá {{lead_name}}', body_html: '<p>Hi {{lead_name}}</p>' };
    for (const lang of ['pt', 'en']) {
      const m = buildBookingConfirmationMail({ ...confBase, template: tpl, lang });
      expect(m.subject).toBe('Olá Rita Sousa');
      expect(m.html).toBe('<p>Hi Rita Sousa</p>');
    }
  });

  it('modelo sem assunto usa o assunto por omissão do idioma; sem corpo usa o corpo por omissão', () => {
    const noSubject = buildBookingConfirmationMail({ ...confBase, template: { subject: '', body_html: '<p>x</p>' }, lang: 'en', vars: { ...vars, meeting_date: 'D' } });
    expect(noSubject.subject).toBe('Your visit is confirmed — D');
    const noBody = buildBookingConfirmationMail({ ...confBase, template: { subject: 'S {{lead_name}}', body_html: '' } });
    expect(noBody.subject).toBe('S Rita Sousa');
    expect(noBody.html).toBe(G['bookSlot.confirmation.full']);
  });

  it('aviso ao comercial: sempre português, idêntico ao golden', () => {
    const full = {
      template: null, vars, leadName: 'Rita Sousa', leadPhone: '912345678', leadEmail: 'rita@x.pt', address: 'Rua A, Lisboa',
      appointmentUrl: 'https://app.test/scheduling', when, location: 'Rua A, Lisboa', technicianName: 'Ana',
      primaryColor: brand.primaryColor, logoUrl: brand.logoUrl,
    };
    expect(buildMeetingNotifyMail(full).html).toBe(G['bookSlot.notify.full']);
    expect(buildMeetingNotifyMail(full).subject).toBe(G['bookSlot.notify.subject']);
    expect(buildMeetingNotifyMail({ ...full, lang: 'en' }).html).toBe(G['bookSlot.notify.full']);
    const min = buildMeetingNotifyMail({ template: null, vars, leadName: 'Rita Sousa', when });
    expect(min.html).toBe(G['bookSlot.notify.minimal']);
  });
});

describe('cancelar e reagendar: pt idêntico ao golden, en ao cliente, comercial sempre pt', () => {
  const common = {
    template: null, vars, leadName: 'Rita Sousa', leadPhone: '912345678', leadEmail: 'rita@x.pt', address: 'Rua A, Lisboa',
    appointmentUrl: 'https://app.test/scheduling', when, location: 'Rua A, Lisboa', technicianName: 'Ana',
    cancelUrl: 'https://app.test/m?token=abc', primaryColor: brand.primaryColor, logoUrl: brand.logoUrl,
  };

  it.each(['client', 'technician'] as const)('pt (%s) idêntico ao golden, qualquer idioma que não seja en', (kind) => {
    for (const l of LANGS_AS_PT) {
      const c = buildCancelMail({ ...common, kind, lang: l });
      expect(c.html).toBe(G[`cancel.${kind}.html`]);
      expect(c.subject).toBe(G[`cancel.${kind}.subject`]);
      const r = buildRescheduleMail({ ...common, kind, lang: l });
      expect(r.html).toBe(G[`reschedule.${kind}.html`]);
      expect(r.subject).toBe(G[`reschedule.${kind}.subject`]);
    }
  });

  it('cliente em inglês', () => {
    const c = buildCancelMail({ ...common, kind: 'client', lang: 'en' });
    expect(c.subject).toBe('Your visit has been cancelled');
    expect(c.html).toContain('Visit cancelled');
    expect(c.html).toContain('Your scheduled visit has been cancelled.');
    const r = buildRescheduleMail({ ...common, kind: 'client', lang: 'en' });
    expect(r.subject).toBe('Your visit has been rescheduled');
    expect(r.html).toContain('Meeting rescheduled');
    expect(r.html).toContain('Your visit has been rescheduled to the date below.');
    expect(r.html).toContain('Manage or cancel booking');
  });

  it('comercial em inglês de pedido continua em português', () => {
    expect(buildCancelMail({ ...common, kind: 'technician', lang: 'en' }).html).toBe(G['cancel.technician.html']);
    expect(buildRescheduleMail({ ...common, kind: 'technician', lang: 'en' }).subject).toBe(G['reschedule.technician.subject']);
  });

  it('com modelo escolhido manda o modelo; sem corpo mas com assunto, o assunto é o por omissão (como hoje)', () => {
    const withBody = buildCancelMail({ ...common, kind: 'client', lang: 'en', template: { subject: 'S {{lead_name}}', body_html: '<b>{{lead_name}}</b>' } });
    expect(withBody).toEqual({ subject: 'S Rita Sousa', html: '<b>Rita Sousa</b>' });
    const noBody = buildCancelMail({ ...common, kind: 'client', template: { subject: 'S', body_html: '' } });
    expect(noBody.subject).toBe(G['cancel.client.subject']);
  });
});

describe('lembrete por omissão', () => {
  const rv = { ...vars, confirm_url: 'https://app.test/booking/confirm?token=xyz', address: 'Rua A, Lisboa', appointment_url: 'https://app.test/scheduling' };

  it('pt idêntico ao golden, com e sem lang', () => {
    for (const l of LANGS_AS_PT) {
      const c = buildReminderMail({ audience: 'client', template: null, vars: rv, brand: { primary_color: '#123ABC', logo_url: 'https://cdn.test/logo.png' }, lang: l });
      expect(c.subject).toBe(G['reminder.client.subject']);
      expect(c.html).toBe(G['reminder.client.html']);
    }
    const noLang = buildReminderMail({ audience: 'client', template: null, vars: rv, brand: { primary_color: '#123ABC', logo_url: 'https://cdn.test/logo.png' } });
    expect(noLang.html).toBe(G['reminder.client.html']);
    const t = buildReminderMail({ audience: 'technician', template: null, vars: { ...rv, cancel_url: '', confirm_url: '' }, brand: null });
    expect(t.subject).toBe(G['reminder.technician.subject']);
    expect(t.html).toBe(G['reminder.technician.html']);
  });

  it('cliente em inglês; comercial continua em português', () => {
    const c = buildReminderMail({ audience: 'client', template: null, vars: { ...rv, meeting_date: 'Monday, 5 October 2026 at 11:00' }, brand: null, lang: 'en' });
    expect(c.subject).toBe('Reminder of your visit — Monday, 5 October 2026 at 11:00');
    expect(c.html).toContain('This is a reminder of your scheduled visit.');
    expect(c.html).toContain('I confirm the visit');
    const t = buildReminderMail({ audience: 'technician', template: null, vars: { ...rv, cancel_url: '', confirm_url: '' }, brand: null, lang: 'en' });
    expect(t.subject).toBe(G['reminder.technician.subject']);
    expect(t.html).toBe(G['reminder.technician.html']);
  });

  it('modelo escolhido manda, em qualquer idioma', () => {
    const m = buildReminderMail({ audience: 'client', template: { subject: 'S {{lead_name}}', body_html: '<i>{{lead_name}}</i>' }, vars: rv, brand: null, lang: 'en' });
    expect(m).toEqual({ subject: 'S Rita Sousa', html: '<i>Rita Sousa</i>' });
  });
});

describe('SMS por omissão', () => {
  it('lembrete: pt idêntico ao golden nas 16 combinações, com e sem lang', () => {
    for (const company of ['Acme', '']) {
      for (const rescheduled of [false, true]) {
        for (const links of [[false, false], [true, false], [false, true], [true, true]]) {
          const key = `sms.reminder.${company || 'vazio'}.${rescheduled}.${links.join('-')}`;
          const o = { companyName: company, rescheduled, withConfirmLink: links[0], withManageLink: links[1] };
          expect(reminderSmsTemplate(o)).toBe(G[key]);
          expect(reminderSmsText('pt', o)).toBe(G[key]);
          for (const l of LANGS_AS_PT) expect(reminderSmsTemplate({ ...o, lang: l })).toBe(G[key]);
        }
      }
    }
  });

  it('lembrete em inglês', () => {
    const o = { companyName: 'Acme', rescheduled: false, withConfirmLink: true, withManageLink: false, lang: 'en' };
    expect(reminderSmsTemplate(o)).toBe('Acme: reminder of your visit on {{meeting_date}}. Confirm: {{confirm_url}}');
    expect(reminderSmsTemplate({ ...o, companyName: '', rescheduled: true, withConfirmLink: false, withManageLink: true })).toBe(
      'The company: reminder of your rescheduled visit on {{meeting_date}}. Manage: {{cancel_url}}',
    );
  });

  it('confirmação: pt idêntico ao golden (modelo e texto renderizado)', () => {
    for (const org of ['Acme', '']) {
      for (const includeLink of [false, true]) {
        for (const cancelLink of ['', 'https://app.test/m?token=abc']) {
          const base = `sms.confirmation.${org || 'vazio'}.${includeLink}.${cancelLink ? 'link' : 'semlink'}`;
          const tpl = defaultConfirmationSms('pt', { companyName: org, withCancelLink: includeLink && !!cancelLink });
          expect(tpl).toBe(G[`${base}.template`]);
          expect(renderSubject(tpl, includeLink ? vars : { ...vars, cancel_url: '' })).toBe(G[`${base}.rendered`]);
          for (const l of LANGS_AS_PT) {
            expect(defaultConfirmationSms(normalizeMailLang(l), { companyName: org, withCancelLink: includeLink && !!cancelLink })).toBe(G[`${base}.template`]);
          }
        }
      }
    }
  });

  it('confirmação em português: diz confirmada, sem «aguarde» nem «ficou marcada»', () => {
    expect(defaultConfirmationSms('pt', { companyName: 'Acme', withCancelLink: false })).toBe(
      'Acme: a sua visita está confirmada para {{meeting_date}}.',
    );
    expect(defaultConfirmationSms('pt', { companyName: '', withCancelLink: true })).toBe(
      'A empresa: a sua visita está confirmada para {{meeting_date}}. Gerir/cancelar: {{cancel_url}}',
    );
  });

  it('confirmação em inglês: diz confirmed, sem «please wait»', () => {
    expect(defaultConfirmationSms('en', { companyName: 'Acme', withCancelLink: false })).toBe(
      'Acme: your visit is confirmed for {{meeting_date}}.',
    );
    expect(defaultConfirmationSms('en', { companyName: '', withCancelLink: true })).toBe(
      'The company: your visit is confirmed for {{meeting_date}}. Manage/cancel: {{cancel_url}}',
    );
  });

  it('o lembrete e o resto do vocabulário de SMS não mudam com a confirmação', () => {
    expect(reminderSmsText('pt', { companyName: 'Acme', rescheduled: true, withConfirmLink: true, withManageLink: true })).toBe(
      'Acme: lembrete da sua visita reagendada para {{meeting_date}}. Confirme: {{confirm_url}} Gerir: {{cancel_url}}',
    );
  });
});

describe('convite «falta agendar»', () => {
  const inv = { leadName: 'Rita Sousa', companyName: 'Acme', resumeUrl: 'https://f.test/r?resume=t', unsubscribeUrl: 'https://f.test/r?unsub=t' };

  it('pt idêntico ao golden, com e sem lang', () => {
    for (const l of LANGS_AS_PT) {
      expect(defaultSchedulingInviteHtml({ ...inv, lang: l })).toBe(G['invite.full']);
    }
    expect(defaultSchedulingInviteHtml(inv)).toBe(G['invite.full']);
    expect(defaultSchedulingInviteHtml({ leadName: '', resumeUrl: 'https://f.test/r?resume=t' })).toBe(G['invite.noName']);
    expect(defaultSchedulingInviteHtml({ leadName: 'Rita', resumeUrl: 'https://f.test/r?resume=t', ctaLabel: 'Ir' })).toBe(G['invite.cta']);
    expect(MAIL_TEXTS.pt.invite.subject).toBe(G['invite.subject']);
  });

  it('em inglês', () => {
    const html = defaultSchedulingInviteHtml({ ...inv, lang: 'en' });
    expect(html).toContain('Hello Rita Sousa,');
    expect(html).toContain('free technical visit');
    expect(html).toContain('Book my visit');
    expect(html).toContain('I no longer want to receive these reminders');
    expect(html).not.toContain('Olá');
    expect(defaultSchedulingInviteHtml({ leadName: '', resumeUrl: 'https://f.test/r', lang: 'en' })).toContain('Hello,');
    expect(MAIL_TEXTS.en.invite.subject).toBe('Your free technical visit is still waiting to be booked');
  });
});
