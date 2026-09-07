/**
 * @vitest-environment node
 *
 * "Voltou a contactar" — QUEM leva o carimbo de `last_activity_at`, e quem nao.
 *
 * Isto guarda uma mudanca de comportamento real: antes so se carimbava a lead
 * que nao tinha comercial nenhum atribuido, e por isso o aviso nunca chegava a
 * quem ja tem comercial — 8 das 11 leads da nike que receberam segunda
 * submissao ficaram sem marca nenhuma. Agora carimba-se QUALQUER lead activa,
 * incluindo a de quem ja e cliente.
 *
 * O `classifyEntityInOrg` corre a serio contra um Supabase falso que APLICA
 * mesmo os filtros (`eq`, `is`, `not`) as linhas que lhe damos. E isso que faz
 * a diferenca entre provar a regra e so repeti-la: se alguem tirar o filtro
 * dos estados `converted`/`lost`/`rejected`, ou o de `deleted_at`, os testes
 * de baixo passam a vermelho.
 */
import { describe, expect, it, vi } from 'vitest';
import { classifyEntityInOrg } from '../_shared/entityScopedLookup.ts';
import { resolveLeadToStamp, stampLeadActivity } from './leadActivityStamp.ts';

const ORG = 'b6ffce4f-f630-4933-833a-008649757a33';
const OUTRA_ORG = '00000000-0000-0000-0000-0000000000ff';
const ENTIDADE = '11111111-1111-1111-1111-111111111111';
const COMERCIAL = '22222222-2222-2222-2222-222222222222';

type Row = Record<string, unknown>;

/**
 * Supabase falso do tamanho exacto do que `classifyEntityInOrg` usa, mas que
 * FILTRA a serio: `.eq`, `.is` e `.not` (nas duas formas que a funcao usa)
 * sao aplicados as linhas antes de `.limit(1)` devolver o resultado.
 */
function fakeSupabase(rows: { leads?: Row[]; clients?: Row[] }) {
  const tables: Record<string, Row[]> = {
    anew_leads: rows.leads ?? [],
    anew_clients: rows.clients ?? [],
  };

  const parseInList = (raw: string): string[] =>
    raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));

  function builder(table: string) {
    let current = [...(tables[table] ?? [])];
    const chain = {
      select: () => chain,
      eq: (col: string, value: unknown) => {
        current = current.filter((r) => r[col] === value);
        return chain;
      },
      is: (col: string, value: unknown) => {
        if (value === null) current = current.filter((r) => r[col] === null || r[col] === undefined);
        return chain;
      },
      not: (col: string, op: string, value: string) => {
        if (op === 'in') {
          const excluded = parseInList(value);
          current = current.filter((r) => !excluded.includes(String(r[col])));
        } else if (op === 'eq') {
          current = current.filter((r) => r[col] !== value);
        } else {
          throw new Error(`operador .not("${op}") nao suportado no falso`);
        }
        return chain;
      },
      order: () => chain,
      limit: (n: number) => Promise.resolve({ data: current.slice(0, n), error: null }),
    };
    return chain;
  }

  return { from: (table: string) => builder(table) };
}

/** A pergunta que o create-lead faz: esta submissao carimba alguma lead? */
async function leadCarimbada(rows: { leads?: Row[]; clients?: Row[] }): Promise<string | null> {
  const summary = await classifyEntityInOrg({
    supabase: fakeSupabase(rows),
    entityId: ENTIDADE,
    organizationId: ORG,
  });
  return resolveLeadToStamp(summary);
}

const leadBase = {
  entity_id: ENTIDADE,
  organization_id: ORG,
  deleted_at: null,
  status: 'new',
  assigned_to: null,
  created_by: null,
};

const clienteBase = {
  entity_id: ENTIDADE,
  organization_id: ORG,
  deleted_at: null,
  status: 'active',
  assigned_to: null,
  created_by: null,
};

describe('quem leva o carimbo de "voltou a contactar"', () => {
  it('lead activa COM comercial atribuido — carimba (era este o caso que ficava de fora)', async () => {
    const carimbada = await leadCarimbada({
      leads: [{ ...leadBase, id: 'lead-com-comercial', assigned_to: COMERCIAL }],
    });
    expect(carimbada).toBe('lead-com-comercial');
  });

  it('lead activa SEM comercial nenhum — carimba', async () => {
    const carimbada = await leadCarimbada({
      leads: [{ ...leadBase, id: 'lead-sem-comercial' }],
    });
    expect(carimbada).toBe('lead-sem-comercial');
  });

  it('a pessoa ja e CLIENTE e tem lead activa — carimba a LEAD, que e a que aparece na lista', async () => {
    const carimbada = await leadCarimbada({
      leads: [{ ...leadBase, id: 'lead-do-cliente', assigned_to: COMERCIAL }],
      clients: [{ ...clienteBase, id: 'cliente-1', assigned_to: COMERCIAL }],
    });
    // O `targetType` do classify da o CLIENTE como vencedor; o carimbo tem de
    // ir na mesma para a lead, senao o aviso nunca aparece na lista de Leads.
    expect(carimbada).toBe('lead-do-cliente');
  });

  it('a pessoa e CLIENTE e nao tem lead activa nenhuma — nao ha onde carimbar', async () => {
    const carimbada = await leadCarimbada({
      leads: [{ ...leadBase, id: 'lead-fechada', status: 'converted' }],
      clients: [{ ...clienteBase, id: 'cliente-2' }],
    });
    expect(carimbada).toBeNull();
  });

  it.each(['converted', 'lost', 'rejected'])(
    'lead em "%s" — NAO carimba: o assunto ja esta fechado',
    async (status) => {
      const carimbada = await leadCarimbada({
        leads: [{ ...leadBase, id: 'lead-fechada', status, assigned_to: COMERCIAL }],
      });
      expect(carimbada).toBeNull();
    },
  );

  it('lead apagada — NAO carimba, mesmo com estado activo', async () => {
    const carimbada = await leadCarimbada({
      leads: [{ ...leadBase, id: 'lead-apagada', deleted_at: '2026-01-01T00:00:00.000Z' }],
    });
    expect(carimbada).toBeNull();
  });

  it('a lead activa e de OUTRA organizacao — NAO carimba', async () => {
    const carimbada = await leadCarimbada({
      leads: [{ ...leadBase, id: 'lead-de-outra-org', organization_id: OUTRA_ORG }],
    });
    expect(carimbada).toBeNull();
  });

  it('entidade reaproveitada sem lead nem cliente — nao carimba nada, nasce a primeira lead', async () => {
    const carimbada = await leadCarimbada({ leads: [], clients: [] });
    expect(carimbada).toBeNull();
  });

  it('pessoa que nao existia antes — nao ha classificacao nenhuma, logo nao ha carimbo', () => {
    // Sem entidade reconhecida o create-lead nem chega a classificar: segue
    // direito para a criacao da lead nova.
    expect(resolveLeadToStamp(null)).toBeNull();
    expect(resolveLeadToStamp(undefined)).toBeNull();
  });
});

describe('o que o carimbo escreve', () => {
  it('toca SO em last_activity_at, e so na lead indicada', async () => {
    const updates: Array<{ table: string; payload: Row; whereId: unknown }> = [];
    const supabase = {
      from: (table: string) => ({
        update: (payload: Row) => ({
          eq: (col: string, value: unknown) => {
            expect(col).toBe('id');
            updates.push({ table, payload, whereId: value });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };

    const ok = await stampLeadActivity(supabase, 'lead-1', '2026-09-06T10:00:00.000Z');

    expect(ok).toBe(true);
    expect(updates).toEqual([
      {
        table: 'anew_leads',
        payload: { last_activity_at: '2026-09-06T10:00:00.000Z' },
        whereId: 'lead-1',
      },
    ]);
    // Nada mais da ficha e tocado: nem o estado, nem o comercial, nem as notas.
    expect(Object.keys(updates[0].payload)).toEqual(['last_activity_at']);
  });

  it('sem data explicita usa o instante actual, em ISO', async () => {
    let escrito: Row | null = null;
    const supabase = {
      from: () => ({
        update: (payload: Row) => ({ eq: () => { escrito = payload; return Promise.resolve({ error: null }); } }),
      }),
    };

    const antes = Date.now();
    await stampLeadActivity(supabase, 'lead-1');
    const depois = Date.now();

    const carimbo = Date.parse(String((escrito as unknown as Row).last_activity_at));
    expect(Number.isNaN(carimbo)).toBe(false);
    expect(carimbo).toBeGreaterThanOrEqual(antes - 1000);
    expect(carimbo).toBeLessThanOrEqual(depois + 1000);
  });

  it('se a coluna ainda nao existir no remoto, falha em silencio e nao rebenta a submissao', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = {
      from: () => ({
        update: () => ({
          eq: () => Promise.resolve({
            error: { code: 'PGRST204', message: "Could not find the 'last_activity_at' column" },
          }),
        }),
      }),
    };

    await expect(stampLeadActivity(supabase, 'lead-1')).resolves.toBe(false);
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
