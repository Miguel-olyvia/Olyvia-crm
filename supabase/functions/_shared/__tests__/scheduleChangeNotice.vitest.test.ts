import { describe, expect, it } from 'vitest';
import { buildNoticeCopy, resolveNoticeChannels, resolveNoticeKind } from '../scheduleChangeNotice';

describe('resolveNoticeKind', () => {
  it('devolve null quando os dois interruptores estao desligados', () => {
    const toggles = { notify_client_on_reschedule: false, notify_client_on_reassign: false };
    expect(resolveNoticeKind(['datetime'], toggles)).toBeNull();
    expect(resolveNoticeKind(['assignee'], toggles)).toBeNull();
    expect(resolveNoticeKind(['datetime', 'assignee'], toggles)).toBeNull();
  });

  it('so reschedule ligado com os dois pedidos da datetime', () => {
    const toggles = { notify_client_on_reschedule: true, notify_client_on_reassign: false };
    expect(resolveNoticeKind(['datetime', 'assignee'], toggles)).toBe('datetime');
  });

  it('so reassign ligado com pedido so de datetime da null', () => {
    const toggles = { notify_client_on_reschedule: false, notify_client_on_reassign: true };
    expect(resolveNoticeKind(['datetime'], toggles)).toBeNull();
  });

  it('os dois ligados com os dois pedidos da both', () => {
    const toggles = { notify_client_on_reschedule: true, notify_client_on_reassign: true };
    expect(resolveNoticeKind(['assignee', 'datetime'], toggles)).toBe('both');
  });

  it('ignora duplicados e valores desconhecidos', () => {
    const toggles = { notify_client_on_reschedule: true, notify_client_on_reassign: false };
    const requested = ['datetime', 'datetime', 'unknown' as unknown as 'datetime'];
    expect(resolveNoticeKind(requested, toggles)).toBe('datetime');
  });
});

describe('buildNoticeCopy', () => {
  it('assignee contem o nome do comercial no intro e no sms', () => {
    const copy = buildNoticeCopy('assignee', {
      companyName: 'Acme',
      meetingDate: '5 de outubro de 2026, 10:00',
      technicianName: 'Joana Silva',
      includeSmsLink: false,
    });
    expect(copy.intro).toContain('Joana Silva');
    expect(copy.sms).toContain('Joana Silva');
  });

  it('sms nao leva link quando includeSmsLink e false, mesmo com manageUrl', () => {
    const copy = buildNoticeCopy('datetime', {
      companyName: 'Acme',
      meetingDate: '5 de outubro de 2026, 10:00',
      technicianName: '',
      manageUrl: 'https://olyvia.lovable.app/manage/token',
      includeSmsLink: false,
    });
    expect(copy.sms).not.toContain('Gerir:');
  });

  it('sms leva " Gerir: <url>" quando includeSmsLink e true e ha url', () => {
    const copy = buildNoticeCopy('datetime', {
      companyName: 'Acme',
      meetingDate: '5 de outubro de 2026, 10:00',
      technicianName: '',
      manageUrl: 'https://olyvia.lovable.app/manage/token',
      includeSmsLink: true,
    });
    expect(copy.sms).toContain(' Gerir: https://olyvia.lovable.app/manage/token');
  });

  it('companyName vazio da "A empresa"', () => {
    const copy = buildNoticeCopy('datetime', {
      companyName: '',
      meetingDate: '5 de outubro de 2026, 10:00',
      technicianName: '',
      includeSmsLink: false,
    });
    expect(copy.sms.startsWith('A empresa:')).toBe(true);
  });
});

describe('resolveNoticeChannels', () => {
  it('por omissao: email ligado, SMS desligado, sem modelo', () => {
    expect(resolveNoticeChannels('datetime', {})).toEqual({
      email: true, sms: false, templateId: null, smsMessage: null,
    });
  });

  it('datetime usa so os campos de reagendamento', () => {
    const r = resolveNoticeChannels('datetime', {
      reschedule_notify_email: false,
      reschedule_notify_sms: true,
      reschedule_email_template_id: 't1',
      reschedule_sms_message: 'Ola {{lead_name}}',
      reassign_notify_email: true,
      reassign_email_template_id: 't2',
    });
    expect(r).toEqual({ email: false, sms: true, templateId: 't1', smsMessage: 'Ola {{lead_name}}' });
  });

  it('assignee usa so os campos de comercial', () => {
    const r = resolveNoticeChannels('assignee', {
      reschedule_notify_sms: true,
      reassign_notify_email: false,
      reassign_notify_sms: false,
      reassign_email_template_id: 't2',
    });
    expect(r).toEqual({ email: false, sms: false, templateId: 't2', smsMessage: null });
  });

  it('both une os canais e prefere o modelo de data/hora', () => {
    const r = resolveNoticeChannels('both', {
      reschedule_notify_email: false,
      reschedule_notify_sms: false,
      reschedule_email_template_id: 't1',
      reassign_notify_email: true,
      reassign_notify_sms: true,
      reassign_email_template_id: 't2',
      reassign_sms_message: 'SMS comercial',
    });
    expect(r).toEqual({ email: true, sms: true, templateId: 't1', smsMessage: 'SMS comercial' });
  });

  it('both cai no modelo de comercial quando data/hora nao tem; SMS so com espacos conta como vazio', () => {
    const r = resolveNoticeChannels('both', { reassign_email_template_id: 't2', reschedule_sms_message: '   ' });
    expect(r.templateId).toBe('t2');
    expect(r.smsMessage).toBeNull();
  });
});
