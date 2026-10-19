import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveQuotePdfClient, sortEntityAddressLinks } from '@/utils/quotePdfClient';
import { buildQuotePreviewData } from '@/utils/quotePreviewData';

// Preview do orcamento: o email/telefone primarios tem de ser os MAIS RECENTES,
// tal como no download (RPC resolve_quote_contact). Supabase simulado.

const calls: { table: string; ops: Array<[string, any[]]> }[] = [];
const rpc = vi.fn();
const tables: Record<string, any> = {};

vi.mock('@/lib/nif/callNifReveal', () => ({ callNifRevealSingle: vi.fn(async () => '') }));
vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const rec = { table, ops: [] as Array<[string, any[]]> };
    calls.push(rec);
    const b: any = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) {
      b[m] = (...args: any[]) => { rec.ops.push([m, args]); return b; };
    }
    b.maybeSingle = () => Promise.resolve({ data: Array.isArray(tables[table]) ? tables[table][0] : tables[table], error: null });
    b.then = (ok: any, err: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok, err);
    return b;
  };
  return { supabase: { from: (t: string) => builder(t), rpc: (...a: any[]) => ({ maybeSingle: () => rpc(...a), then: (ok: any, err: any) => Promise.resolve(rpc(...a)).then(ok, err) }) } };
});

const opsOf = (table: string) => calls.find((c) => c.table === table)?.ops ?? [];

beforeEach(() => {
  calls.length = 0;
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => name === 'resolve_quote_address'
    ? { data: [], error: null }
    : { data: { email: 'novo@x.pt', phone_number: '911', country_code: '+351' }, error: null });
  for (const k of Object.keys(tables)) delete tables[k];
  tables.anew_entities = { id: 'e1', display_name: 'Cliente', type: 'individual' };
  tables.anew_entity_emails = [{ email: 'antigo@x.pt' }];
  tables.anew_entity_phones = [{ phone_number: '900', country_code: '+351' }];
});

describe('resolveQuotePdfClient', () => {
  it('com quoteId chama o RPC e usa o contacto devolvido', async () => {
    const { client } = await resolveQuotePdfClient({ entityId: 'e1', quoteId: 'q1' });
    expect(rpc).toHaveBeenCalledWith('resolve_quote_contact', { _quote_id: 'q1' });
    expect(client?.email).toBe('novo@x.pt');
  });

  it('sem quoteId nao chama o RPC e pede email e telefone por created_at desc antes do limit', async () => {
    await resolveQuotePdfClient({ entityId: 'e1' });
    expect(rpc).not.toHaveBeenCalled();
    for (const t of ['anew_entity_emails', 'anew_entity_phones']) {
      const names = opsOf(t).map(([n]) => n);
      expect(opsOf(t)).toContainEqual(['order', ['created_at', { ascending: false }]]);
      expect(names.indexOf('order')).toBeLessThan(names.indexOf('limit'));
    }
  });
});

describe('morada do cliente por RPC', () => {
  const directa = [{ is_primary: true, created_at: '2025-01-01T00:00:00Z', valid_to: null, anew_addresses: { street: 'Directa' } }];
  const rpcRow = { address_id: 'a1', address_type: 'billing', is_primary: true, street: 'Do RPC', number: '7', postal_code: '1000-001', city: 'Lisboa', district: 'Lisboa' };
  const mockAddressRpc = (res: any) => rpc.mockImplementation(async (name: string) => (
    name === 'resolve_quote_address' ? res : { data: null, error: null }
  ));

  it('com quoteId chama resolve_quote_address e usa a morada devolvida, nao a leitura directa', async () => {
    tables.anew_entity_addresses = directa;
    mockAddressRpc({ data: [rpcRow], error: null });
    const { client } = await resolveQuotePdfClient({ entityId: 'e1', quoteId: 'q1' });
    expect(rpc).toHaveBeenCalledWith('resolve_quote_address', { _quote_id: 'q1' });
    expect(client?.client_addresses).toEqual([
      { street: 'Do RPC', number: '7', postal_code: '1000-001', city: 'Lisboa', municipality: 'Lisboa', district: 'Lisboa', is_primary: true },
    ]);
    expect(client?.contact_addresses).toEqual(client?.client_addresses);
  });

  it('RPC vazio com quoteId cai na leitura directa e usa essa morada', async () => {
    tables.anew_entity_addresses = directa;
    mockAddressRpc({ data: [], error: null });
    const { client } = await resolveQuotePdfClient({ entityId: 'e1', quoteId: 'q1' });
    expect(rpc).toHaveBeenCalledWith('resolve_quote_address', { _quote_id: 'q1' });
    expect(client?.client_addresses).toHaveLength(1);
    expect(client?.client_addresses[0].street).toBe('Directa');
  });

  it('RPC null sem erro cai tambem na leitura directa', async () => {
    tables.anew_entity_addresses = directa;
    mockAddressRpc({ data: null, error: null });
    const { client } = await resolveQuotePdfClient({ entityId: 'e1', quoteId: 'q1' });
    expect(client?.client_addresses[0].street).toBe('Directa');
  });

  it('RPC vazio e leitura directa vazia da cliente sem morada', async () => {
    tables.anew_entity_addresses = [];
    mockAddressRpc({ data: [], error: null });
    const { client } = await resolveQuotePdfClient({ entityId: 'e1', quoteId: 'q1' });
    expect(client?.client_addresses).toEqual([]);
  });

  it('erro do RPC regista o erro e cai na leitura directa', async () => {
    tables.anew_entity_addresses = directa;
    mockAddressRpc({ data: null, error: { message: 'boom' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = await resolveQuotePdfClient({ entityId: 'e1', quoteId: 'q1' });
    expect(client?.client_addresses[0].street).toBe('Directa');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sem quoteId nao chama resolve_quote_address e usa a leitura directa', async () => {
    tables.anew_entity_addresses = directa;
    const { client } = await resolveQuotePdfClient({ entityId: 'e1' });
    expect(rpc).not.toHaveBeenCalledWith('resolve_quote_address', expect.anything());
    expect(client?.client_addresses[0].street).toBe('Directa');
  });
});

describe('sortEntityAddressLinks', () => {
  const link = (id: string, o: any = {}) => ({ id, is_primary: false, valid_to: null, created_at: '2024-01-01T00:00:00Z', ...o });

  it('activa vem antes de nao activa, e primaria antes de nao primaria', () => {
    const out = sortEntityAddressLinks([
      link('a', { is_primary: true, valid_to: '2999-01-01' }),
      link('b'),
      link('c', { is_primary: true }),
    ]);
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('entre iguais ganha a mais recente e nao muta a entrada', () => {
    const input = [
      link('velha', { is_primary: true, created_at: '2023-01-01T00:00:00Z' }),
      link('nova', { is_primary: true, created_at: '2025-01-01T00:00:00Z' }),
    ];
    const copy = [...input];
    expect(sortEntityAddressLinks(input).map((x) => x.id)).toEqual(['nova', 'velha']);
    expect(input).toEqual(copy);
  });

  it('lida com lista vazia, nula e created_at em falta', () => {
    expect(sortEntityAddressLinks([])).toEqual([]);
    expect(sortEntityAddressLinks(null)).toEqual([]);
    expect(sortEntityAddressLinks([link('x', { created_at: null }), link('y')]).map((x) => x.id)).toEqual(['y', 'x']);
  });

  it('o cliente do PDF traz a morada activa/primaria/mais recente primeiro', async () => {
    tables.anew_entity_addresses = [
      { is_primary: true, created_at: '2023-01-01T00:00:00Z', valid_to: null, anew_addresses: { street: 'Antiga' } },
      { is_primary: true, created_at: '2025-01-01T00:00:00Z', valid_to: null, anew_addresses: { street: 'Nova' } },
    ];
    const { client } = await resolveQuotePdfClient({ entityId: 'e1' });
    expect(client?.client_addresses[0].street).toBe('Nova');
  });
});

describe('buildQuotePreviewData', () => {
  const base = { formData: { title: 'T' }, quoteNumber: '', autoReference: 'AUTO', entityId: 'e1', obraEndereco: 'Rua' };

  it('passa o id do orcamento quando ja existe', () => {
    expect(buildQuotePreviewData({ ...base, quoteId: 'q1' }).id).toBe('q1');
  });
  it('rascunho nao gravado fica sem id', () => {
    expect(buildQuotePreviewData({ ...base, quoteId: null }).id).toBeUndefined();
  });
  it('usa a referencia automatica e a entidade', () => {
    const d = buildQuotePreviewData({ ...base, quoteId: null });
    expect(d.quote_number).toBe('AUTO');
    expect(d.entity_id).toBe('e1');
    expect(d.obra_endereco).toBe('Rua');
    expect(d.title).toBe('T');
  });
});
