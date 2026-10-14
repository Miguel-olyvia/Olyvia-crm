/**
 * Fluxo 5 (Picagem): localizacao SIMULADA. Na apresentacao nunca se pede localizacao ao navegador: a
 * pessoa escolhe «Estou no local» ou «Estou fora do local» e daqui saem coordenadas de exemplo. Mais de
 * 200 m do local de trabalho grava na mesma e marca «fora do local» para o RH ver no alerta.
 */
export const LIMITE_FORA_DO_LOCAL_METROS = 200;

export type EscolhaLocalizacao = "no_local" | "fora_do_local";

export interface Ponto {
  latitude: number;
  longitude: number;
}

/** Ponto de referencia quando o local de trabalho nao tem coordenadas (Lisboa). */
export const REFERENCIA_EXEMPLO: Ponto = { latitude: 38.7223, longitude: -9.1393 };

/** Distancias de exemplo de cada escolha, em metros. */
export const DISTANCIA_DE_EXEMPLO: Record<EscolhaLocalizacao, number> = { no_local: 35, fora_do_local: 640 };

const METROS_POR_GRAU = 111_195;
const RAIO_TERRA_METROS = 6_371_000;

export function referenciaDoLocal(local: { latitude: number | null; longitude: number | null } | null | undefined): Ponto {
  if (local && local.latitude !== null && local.longitude !== null) {
    return { latitude: local.latitude, longitude: local.longitude };
  }
  return REFERENCIA_EXEMPLO;
}

const radianos = (graus: number): number => (graus * Math.PI) / 180;

/** Distancia em linha recta entre dois pontos (haversine), arredondada ao metro. */
export function distanciaMetros(a: Ponto, b: Ponto): number {
  const dLat = radianos(b.latitude - a.latitude);
  const dLon = radianos(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(radianos(a.latitude)) * Math.cos(radianos(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * RAIO_TERRA_METROS * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function foraDoLocal(distanciaM: number): boolean {
  return distanciaM > LIMITE_FORA_DO_LOCAL_METROS;
}

export interface LocalizacaoSimulada extends Ponto {
  distanciaM: number;
  fora: boolean;
}

/** As coordenadas de exemplo de uma escolha, a norte do local de referencia. */
export function localizacaoDeExemplo(escolha: EscolhaLocalizacao, referencia: Ponto): LocalizacaoSimulada {
  const alvo: Ponto = {
    latitude: referencia.latitude + DISTANCIA_DE_EXEMPLO[escolha] / METROS_POR_GRAU,
    longitude: referencia.longitude,
  };
  const distanciaM = distanciaMetros(referencia, alvo);
  return { ...alvo, distanciaM, fora: foraDoLocal(distanciaM) };
}

/** Picar exige localizacao: sem escolha recusa, com a mesma chave que o ecra usa. */
export function avaliarPicagem(
  escolha: EscolhaLocalizacao | null,
  referencia: Ponto,
): { ok: true; localizacao: LocalizacaoSimulada } | { ok: false; erro: string } {
  if (!escolha) return { ok: false, erro: "rhExemplo.pic.erro.semLocalizacao" };
  return { ok: true, localizacao: localizacaoDeExemplo(escolha, referencia) };
}

/** A distancia de uma picagem ja gravada ao local de trabalho; `null` se a picagem nao tem coordenadas. */
export function distanciaDaPicagem(
  picagem: { latitude: number | null; longitude: number | null },
  referencia: Ponto,
): number | null {
  if (picagem.latitude === null || picagem.longitude === null) return null;
  return distanciaMetros(referencia, { latitude: picagem.latitude, longitude: picagem.longitude });
}
