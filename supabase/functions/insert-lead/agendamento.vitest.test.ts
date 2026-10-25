// insert-lead: o auto_schedule volta a funcionar, agora sobre a ENTIDADE
// (entity_id), sem lead_id.
import { describe, expect, it } from 'vitest';
import { montarPedidoAutoSchedule } from './agendamento.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';

describe('montarPedidoAutoSchedule', () => {
  it('liga a visita a entidade e nao leva lead_id nem client_id', () => {
    const p = montarPedidoAutoSchedule({
      entityId: ENT, organizationId: ORG, fullLocation: 'Rua A, 1000-001, Lisboa',
      lead: { first_name: 'Ana', last_name: 'Silva', postal_code: '1000-001', notes: 'nota' },
    });
    expect(p).toMatchObject({
      entity_id: ENT, organization_id: ORG, location: 'Rua A, 1000-001, Lisboa', postal_code: '1000-001',
      title: 'Visita - Ana Silva', description: 'nota', duration_minutes: 60, auto_assign: true, use_proximity: true,
    });
    expect(p).not.toHaveProperty('lead_id');
    expect(p).not.toHaveProperty('client_id');
  });

  it('usa as opcoes do pedido quando vem e so liga a proximidade com codigo postal', () => {
    const p = montarPedidoAutoSchedule({
      entityId: ENT, organizationId: ORG, fullLocation: undefined,
      lead: { first_name: 'Ana', last_name: 'Silva' },
      options: { title: 'T', duration_minutes: 90, board_id: 'b1', use_proximity: true, tags: ['x'] },
    });
    expect(p).toMatchObject({ title: 'T', duration_minutes: 90, board_id: 'b1', tags: ['x'], use_proximity: false });
  });

  it('use_proximity false explicito desliga mesmo com codigo postal', () => {
    const p = montarPedidoAutoSchedule({
      entityId: ENT, organizationId: ORG, fullLocation: 'x',
      lead: { first_name: 'A', last_name: 'B', postal_code: '1000-001' },
      options: { use_proximity: false },
    });
    expect(p.use_proximity).toBe(false);
  });
});
