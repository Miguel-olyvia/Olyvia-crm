import { describe, expect, it } from 'vitest';
import { buildNoticeCopy, resolveNoticeKind } from '../scheduleChangeNotice';

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
