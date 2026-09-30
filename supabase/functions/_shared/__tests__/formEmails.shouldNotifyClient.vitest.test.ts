import { describe, expect, it } from 'vitest';
import { shouldNotifyClient } from '../formEmails';

describe('shouldNotifyClient', () => {
  it('ligado envia, nos dois eventos', () => {
    const cfg = { reschedule_notify_client: true, cancel_notify_client: true };
    expect(shouldNotifyClient(cfg, 'reschedule')).toBe(true);
    expect(shouldNotifyClient(cfg, 'cancel')).toBe(true);
  });

  it('desligado nao envia', () => {
    const cfg = { reschedule_notify_client: false, cancel_notify_client: false };
    expect(shouldNotifyClient(cfg, 'reschedule')).toBe(false);
    expect(shouldNotifyClient(cfg, 'cancel')).toBe(false);
  });

  it('null ou undefined conta como ligado', () => {
    const nulls = { reschedule_notify_client: null, cancel_notify_client: null };
    expect(shouldNotifyClient(nulls, 'reschedule')).toBe(true);
    expect(shouldNotifyClient(nulls, 'cancel')).toBe(true);
    expect(shouldNotifyClient({} as never, 'cancel')).toBe(true);
  });

  it('sem configuracao do formulario conta como ligado', () => {
    expect(shouldNotifyClient(null, 'reschedule')).toBe(true);
    expect(shouldNotifyClient(undefined, 'cancel')).toBe(true);
  });

  it('um evento e independente do outro', () => {
    const soReagendar = { reschedule_notify_client: true, cancel_notify_client: false };
    expect(shouldNotifyClient(soReagendar, 'reschedule')).toBe(true);
    expect(shouldNotifyClient(soReagendar, 'cancel')).toBe(false);
    const soCancelar = { reschedule_notify_client: false, cancel_notify_client: true };
    expect(shouldNotifyClient(soCancelar, 'reschedule')).toBe(false);
    expect(shouldNotifyClient(soCancelar, 'cancel')).toBe(true);
  });
});
