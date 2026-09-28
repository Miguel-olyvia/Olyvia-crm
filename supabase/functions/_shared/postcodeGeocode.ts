// Geocodifica um código postal português via a API interna Olyvia
// (https://fidelidadeapi.quickflowai.com/Olyvia/postcodes/{cp7}), a mesma
// fonte já usada por import-postal-codes/index.ts para carregar a tabela
// postal_codes. Devolve coordenadas exactas ao nível do código postal
// completo (CP7, "XXXX-XXX"), não só o prefixo de 4 dígitos.
//
// Usado em vez do Google Maps para as regras 4/5/13: dá coordenadas reais
// sem precisar de morada por extenso nem de chave paga -- a distância entre
// pontos continua a ser calculada por nós (Haversine/linha recta), nunca
// tempo real de estrada/trânsito.
export interface PostcodeGeocodeResult {
  district: string;
  municipality: string;
  locality: string;
  street: string;
  doorNo: string;
  latitude: number | null;
  longitude: number | null;
}

const OLYVIA_POSTCODES_BASE = "https://fidelidadeapi.quickflowai.com/Olyvia/postcodes";

/** Normaliza para "XXXX-XXX" (CP7 com traço) a partir de qualquer formato de entrada. */
function normalizeCp7(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 7) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/**
 * Devolve as coordenadas/morada normalizada para um código postal completo
 * (CP7). Devolve null se o código não tiver 7 dígitos ou não existir na
 * fonte (404) -- nunca lança, para o chamador decidir o fallback (ex.:
 * degradar para o prefixo de 4 dígitos já carregado em postal_codes).
 */
export async function geocodePostalCode(rawPostalCode: string): Promise<PostcodeGeocodeResult | null> {
  const cp7 = normalizeCp7(rawPostalCode);
  if (!cp7) return null;

  try {
    const res = await fetch(`${OLYVIA_POSTCODES_BASE}/${encodeURIComponent(cp7)}`);
    if (!res.ok) return null;

    const data = await res.json();
    return {
      district: data.district ?? "",
      municipality: data.municipality ?? "",
      locality: data.locality ?? "",
      street: data.address?.street ?? "",
      doorNo: data.address?.doorNo ?? "",
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
    };
  } catch {
    return null;
  }
}
