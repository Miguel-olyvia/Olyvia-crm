import { describe, expect, it } from 'vitest';
import { resolveKnownOwnerFromContact, resolveOwnerResourceIds } from '../knownOwner';

type Row = Record<string, any>;

// Supabase falso com filtros reais para eq / in / is / not(eq|in) -- o
// suficiente para provar QUEM e escolhido, nao so que a cadeia corre.
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const chain: any = {};
      chain.select = () => chain;
      chain.order = () => chain;
      chain.ilike = (col: string, pattern: string) => {
        const suffix = pattern.replace(/^%/, '');
        rows = rows.filter((r) => String(r[col] ?? '').replace(/\D/g, '').endsWith(suffix));
        return chain;
      };
      chain.eq = (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return chain; };
      chain.in = (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return chain; };
      chain.is = (col: string, val: unknown) => { rows = rows.filter((r) => (r[col] ?? null) === val); return chain; };
      chain.not = (col: string, op: string, val: unknown) => {
        if (op === 'eq') rows = rows.filter((r) => r[col] !== val);
        if (op === 'in') {
          const excluded = String(val).replace(/[()"]/g, '').split(',');
          rows = rows.filter((r) => !excluded.includes(r[col]));
        }
        return chain;
      };
      chain.limit = (n: number) => { rows = rows.slice(0, n); return chain; };
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return chain;
    },
  };
}

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const ENT = 'entity-1';

function baseTables(over: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    anew_entity_emails: [{ entity_id: ENT, email: 'ana@exemplo.pt' }],
    anew_entity_phones: [{ entity_id: ENT, phone_number: '+351912345678' }],
    anew_entity_org_links: [{ entity_id: ENT, organization_id: ORG }],
    anew_leads: [{ id: 'lead-1', entity_id: ENT, organization_id: ORG, status: 'new', assigned_to: 'user-lead', created_by: 'user-creator', deleted_at: null, created_at: '2026-01-01' }],
    anew_clients: [],
    schedule_resources: [
      { id: 'res-lead-a', user_id: 'user-lead', organization_id: ORG, is_active: true },
      { id: 'res-lead-b', user_id: 'user-lead', organization_id: ORG, is_active: true },
      { id: 'res-lead-off', user_id: 'user-lead', organization_id: ORG, is_active: false },
      { id: 'res-lead-otherorg', user_id: 'user-lead', organization_id: OTHER_ORG, is_active: true },
      { id: 'res-creator', user_id: 'user-creator', organization_id: ORG, is_active: true },
      { id: 'res-client', user_id: 'user-client', organization_id: ORG, is_active: true },
    ],
    ...over,
  } as Record<string, Row[]>;
}

const resolve = (tables: Record<string, Row[]>, contact: { email?: string; phone?: string }) =>
  resolveKnownOwnerFromContact({ supabase: fakeSupabase(tables), organizationId: ORG, ...contact });

describe('resolveKnownOwnerFromContact', () => {
  it('lead conhecida: devolve so os recursos ACTIVOS do dono, na mesma organizacao', async () => {
    const ids = await resolve(baseTables(), { email: 'ana@exemplo.pt' });
    expect(ids.sort()).toEqual(['res-lead-a', 'res-lead-b']);
  });

  it('cliente ganha a lead: usa o comercial do cliente', async () => {
    const tables = baseTables({
      anew_clients: [{ id: 'cli-1', entity_id: ENT, organization_id: ORG, status: 'active', assigned_to: 'user-client', created_by: null, deleted_at: null, created_at: '2026-01-02' }],
    });
    expect(await resolve(tables, { email: 'ana@exemplo.pt' })).toEqual(['res-client']);
  });

  it('assigned_to nulo cai no created_by', async () => {
    const tables = baseTables({
      anew_leads: [{ id: 'lead-1', entity_id: ENT, organization_id: ORG, status: 'new', assigned_to: null, created_by: 'user-creator', deleted_at: null, created_at: '2026-01-01' }],
    });
    expect(await resolve(tables, { email: 'ana@exemplo.pt' })).toEqual(['res-creator']);
  });

  it('sem entidade conhecida: [] (sem restricao)', async () => {
    expect(await resolve(baseTables(), { email: 'desconhecido@exemplo.pt' })).toEqual([]);
  });

  it('entidade de OUTRA organizacao nao conta', async () => {
    const tables = baseTables({ anew_entity_org_links: [{ entity_id: ENT, organization_id: OTHER_ORG }] });
    expect(await resolve(tables, { email: 'ana@exemplo.pt' })).toEqual([]);
  });

  it('dono sem nenhum recurso activo: [] (sem restricao, como hoje)', async () => {
    const tables = baseTables({
      schedule_resources: [{ id: 'res-x', user_id: 'user-lead', organization_id: ORG, is_active: false }],
    });
    expect(await resolve(tables, { email: 'ana@exemplo.pt' })).toEqual([]);
  });

  it('lead sem dono (nem assigned_to nem created_by): []', async () => {
    const tables = baseTables({
      anew_leads: [{ id: 'lead-1', entity_id: ENT, organization_id: ORG, status: 'new', assigned_to: null, created_by: null, deleted_at: null, created_at: '2026-01-01' }],
    });
    expect(await resolve(tables, { email: 'ana@exemplo.pt' })).toEqual([]);
  });

  it('lead convertida/perdida ou apagada nao conta', async () => {
    const lost = baseTables({
      anew_leads: [{ id: 'lead-1', entity_id: ENT, organization_id: ORG, status: 'lost', assigned_to: 'user-lead', created_by: null, deleted_at: null, created_at: '2026-01-01' }],
    });
    expect(await resolve(lost, { email: 'ana@exemplo.pt' })).toEqual([]);
    const deleted = baseTables({
      anew_leads: [{ id: 'lead-1', entity_id: ENT, organization_id: ORG, status: 'new', assigned_to: 'user-lead', created_by: null, deleted_at: '2026-02-01', created_at: '2026-01-01' }],
    });
    expect(await resolve(deleted, { email: 'ana@exemplo.pt' })).toEqual([]);
  });

  it('email e telefone de pessoas diferentes: o email ganha (igual ao create-lead)', async () => {
    const OTHER = 'entity-2';
    const tables = baseTables({
      anew_entity_phones: [{ entity_id: OTHER, phone_number: '+351911111111' }],
      anew_entity_org_links: [
        { entity_id: ENT, organization_id: ORG },
        { entity_id: OTHER, organization_id: ORG },
      ],
      anew_leads: [
        { id: 'lead-1', entity_id: ENT, organization_id: ORG, status: 'new', assigned_to: 'user-lead', created_by: null, deleted_at: null, created_at: '2026-01-01' },
        { id: 'lead-2', entity_id: OTHER, organization_id: ORG, status: 'new', assigned_to: 'user-client', created_by: null, deleted_at: null, created_at: '2026-01-01' },
      ],
    });
    const ids = await resolve(tables, { email: 'ana@exemplo.pt', phone: '911111111' });
    expect(ids.sort()).toEqual(['res-lead-a', 'res-lead-b']);
  });

  it('sem email nem telefone: [] sem consultar nada', async () => {
    expect(await resolve(baseTables(), {})).toEqual([]);
  });
});

describe('resolveOwnerResourceIds', () => {
  it('sem utilizador devolve []', async () => {
    expect(await resolveOwnerResourceIds(fakeSupabase(baseTables()), ORG, null)).toEqual([]);
  });
});
