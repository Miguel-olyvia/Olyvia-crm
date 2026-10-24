// O botao 'Exigir codigo postal completo antes de agendar'
// (form_steps.scheduling_requires_location) e o interruptor da geolocalizacao
// no agendamento. Desligado: codigo postal e distrito nao fazem nada no
// calendario nem na marcacao, mesmo que o formulario tenha esses campos.
// Ligado: passam como estao. Puro e sem imports: serve o servidor e o frontend.
export interface GeoInputs {
  postalCode: string | null;
  districtId: string | null;
}

export function resolveGeoInputs(input: {
  requiresLocation?: boolean | null;
  postalCode?: string | null;
  districtId?: string | null;
}): GeoInputs {
  if (input.requiresLocation !== true) return { postalCode: null, districtId: null };
  return { postalCode: input.postalCode || null, districtId: input.districtId || null };
}
