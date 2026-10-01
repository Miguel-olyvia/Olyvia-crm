import { describe, expect, it } from 'vitest';
import { resolveGeoInputs } from '../geolocationSwitch';

const CP = '4700-123';
const DIST = '11111111-1111-4111-8111-111111111111';

describe('resolveGeoInputs (botao = interruptor da geolocalizacao)', () => {
  it('ligado com codigo postal e distrito: passam iguais', () => {
    expect(resolveGeoInputs({ requiresLocation: true, postalCode: CP, districtId: DIST }))
      .toEqual({ postalCode: CP, districtId: DIST });
  });
  it('desligado com codigo postal e distrito: null/null', () => {
    expect(resolveGeoInputs({ requiresLocation: false, postalCode: CP, districtId: DIST }))
      .toEqual({ postalCode: null, districtId: null });
  });
  it('desligado sem nada: null/null', () => {
    expect(resolveGeoInputs({ requiresLocation: false })).toEqual({ postalCode: null, districtId: null });
  });
  it('ligado sem nada: null/null', () => {
    expect(resolveGeoInputs({ requiresLocation: true })).toEqual({ postalCode: null, districtId: null });
  });
  it('strings vazias contam como ausentes', () => {
    expect(resolveGeoInputs({ requiresLocation: true, postalCode: '', districtId: '' }))
      .toEqual({ postalCode: null, districtId: null });
  });
  it('requiresLocation undefined ou null conta como desligado', () => {
    expect(resolveGeoInputs({ postalCode: CP, districtId: DIST })).toEqual({ postalCode: null, districtId: null });
    expect(resolveGeoInputs({ requiresLocation: null, postalCode: CP, districtId: DIST }))
      .toEqual({ postalCode: null, districtId: null });
  });
});
