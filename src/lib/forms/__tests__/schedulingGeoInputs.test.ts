import { describe, expect, it } from 'vitest';
import { resolveSchedulingGeoValues } from '../schedulingGeoInputs';

const CP = '4700-123';
const DIST = '11111111-1111-4111-8111-111111111111';
const fields = [
  { field_key: 'cp', field_type: 'text', contact_field_mapping: 'postal_code' },
  { field_key: 'dist', field_type: 'ref_district', contact_field_mapping: null },
];
const values = { cp: CP, dist: DIST };

describe('resolveSchedulingGeoValues (o que vai ao book-slot e o que vai ao calendario)', () => {
  it('botao desligado: book-slot recebe os dados da lead, calendario nao recebe nada', () => {
    const r = resolveSchedulingGeoValues({ scheduling_requires_location: false }, fields, values);
    expect(r.forBooking).toEqual({ postalCode: CP, districtId: DIST });
    expect(r.forCalendar).toEqual({ postalCode: undefined, districtId: undefined });
  });
  it('botao ligado: ambos recebem os valores', () => {
    const r = resolveSchedulingGeoValues({ scheduling_requires_location: true }, fields, values);
    expect(r.forBooking).toEqual({ postalCode: CP, districtId: DIST });
    expect(r.forCalendar).toEqual({ postalCode: CP, districtId: DIST });
  });
  it('a chave do passo tem prioridade sobre o campo mapeado', () => {
    const r = resolveSchedulingGeoValues(
      { scheduling_requires_location: false, scheduling_postal_code_field_key: 'outro', scheduling_district_field_key: 'outroD' },
      fields, { ...values, outro: '1000-001', outroD: 'abc' });
    expect(r.forBooking).toEqual({ postalCode: '1000-001', districtId: 'abc' });
  });
  it('sem campos: undefined em ambos', () => {
    const r = resolveSchedulingGeoValues({ scheduling_requires_location: true }, [], {});
    expect(r.forBooking).toEqual({ postalCode: undefined, districtId: undefined });
    expect(r.forCalendar).toEqual({ postalCode: undefined, districtId: undefined });
  });
});
