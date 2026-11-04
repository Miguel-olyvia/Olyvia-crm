// Distância em linha recta (Haversine) entre dois pontos, em km. Mesma
// fórmula que calculate_distance_km() já usa em SQL (regras 4/5) -- versão
// JS para comparar coordenadas obtidas em tempo real (ex.: postcodeGeocode.ts,
// regra 13), sem precisar de uma chamada à base de dados.
const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
