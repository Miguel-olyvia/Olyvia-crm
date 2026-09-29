import { resolveGeoInputs } from "../../../supabase/functions/_shared/geolocationSwitch";

export interface SchedulingGeoStep {
  scheduling_postal_code_field_key?: string | null;
  scheduling_district_field_key?: string | null;
  scheduling_requires_location?: boolean | null;
}

export interface SchedulingGeoField {
  field_key: string;
  field_type?: string | null;
  contact_field_mapping?: string | null;
}

export interface SchedulingGeoValues {
  postalCode: string | undefined;
  districtId: string | undefined;
}

// Valores TAL COMO O VISITANTE OS ESCREVEU (chave do passo, ou campo com
// contact_field_mapping postal_code / tipo ref_district). Sao dados da lead:
// vao sempre ao book-slot, com o botao ligado ou desligado.
// Ao calendario so chegam depois do interruptor (forCalendar).
export function resolveSchedulingGeoValues(
  step: SchedulingGeoStep | null | undefined,
  fields: SchedulingGeoField[],
  formValues: Record<string, unknown>,
): { forBooking: SchedulingGeoValues; forCalendar: SchedulingGeoValues } {
  const postalKey = step?.scheduling_postal_code_field_key
    || fields.find(f => f.contact_field_mapping === 'postal_code')?.field_key;
  const districtKey = step?.scheduling_district_field_key
    || fields.find(f => f.field_type === 'ref_district')?.field_key;
  const raw: SchedulingGeoValues = {
    postalCode: postalKey ? (formValues[postalKey] as string | undefined) : undefined,
    districtId: districtKey ? (formValues[districtKey] as string | undefined) : undefined,
  };
  const geo = resolveGeoInputs({
    requiresLocation: step?.scheduling_requires_location,
    postalCode: raw.postalCode,
    districtId: raw.districtId,
  });
  return {
    forBooking: raw,
    forCalendar: { postalCode: geo.postalCode ?? undefined, districtId: geo.districtId ?? undefined },
  };
}
