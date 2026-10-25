// queueSchedulingInviteRecovery: o convite aponta a entidade e a submissao a retomar.
// Supabase simulado; nada toca na base.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queueSchedulingInviteRecovery } from './formEmails.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORM = 'ffffffff-0000-4000-8000-000000000003';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const SUB = '99999999-0000-4000-8000-000000000007';

function makeSupabase(opts: { covered: boolean }) {
  const inserts: Array<{ table: string; row: any }> = [];
  const byTable: Record<string, any> = {
    form_steps: { step_number: 3, scheduling_board_id: 'board-1', scheduling_district_field_key: 'distrito', scheduling_duration_minutes: 60 },
    form_branding: null,
    anew_memberships: { user_id: 'user-1' },
    anew_organizations: { name: 'Org' },
  };
  const from = (table: string) => {
    const b: any = {
      select: () => b, eq: () => b, order: () => b, limit: () => b,
      insert: (row: any) => { inserts.push({ table, row }); return b; },
      maybeSingle: () => Promise.resolve({ data: byTable[table] ?? null, error: null }),
      single: () => Promise.resolve({ data: table === 'scheduling_invites' ? { token: 'tok' } : null, error: null }),
      then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
    };
    return b;
  };
  const rpc = () => Promise.resolve({ data: opts.covered ? [{ id: 'r1' }] : [], error: null });
  return { client: { from, rpc }, inserts };
}

const params = (over: Record<string, unknown> = {}) => ({
  organizationId: ORG, formId: FORM, entityId: ENT, submissionId: SUB,
  leadName: 'Ana', leadEmail: 'ana@x.pt', leadLocale: null,
  fieldValues: { distrito: 'd-1' }, needsManualScheduling: true, ...over,
});

describe('queueSchedulingInviteRecovery', () => {
  beforeEach(() => {
    (globalThis as any).Deno = { env: { get: () => undefined } };
  });
  afterEach(() => {
    delete (globalThis as any).Deno;
    vi.restoreAllMocks();
  });

  it('o convite leva entity_id e submission_id e nunca lead_id', async () => {
    const s = makeSupabase({ covered: true });
    await queueSchedulingInviteRecovery(s.client, params());
    const invite = s.inserts.find((i) => i.table === 'scheduling_invites')!;
    expect(invite.row).toMatchObject({ entity_id: ENT, submission_id: SUB, form_id: FORM, organization_id: ORG });
    expect(invite.row).not.toHaveProperty('lead_id');
  });

  it('o email agendado usa a entidade como entityId', async () => {
    const s = makeSupabase({ covered: true });
    await queueSchedulingInviteRecovery(s.client, params());
    const mail = s.inserts.find((i) => i.table === 'scheduled_emails')!;
    expect(mail.row).toMatchObject({ entity_type: 'lead_scheduling_invite', entity_id: ENT });
  });

  it('sem distrito coberto nao insere nada', async () => {
    const s = makeSupabase({ covered: false });
    await queueSchedulingInviteRecovery(s.client, params());
    expect(s.inserts).toHaveLength(0);
  });

  it('sem needsManualScheduling nao faz nada', async () => {
    const s = makeSupabase({ covered: true });
    await queueSchedulingInviteRecovery(s.client, params({ needsManualScheduling: false }));
    expect(s.inserts).toHaveLength(0);
  });
});
