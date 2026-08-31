/**
 * A ordem por que se faz o dia.
 *
 * Hoje as ordens de um técnico aparecem pela hora marcada. Se forem quatro em
 * pontos diferentes da cidade, ele decide o caminho de cabeça — e faz
 * quilómetros a mais sem nunca saber quantos.
 *
 * Tudo aqui são funções puras, e **nenhum serviço de fora**. A distância entre
 * dois pontos calcula-se com trigonometria, não com uma API paga.
 *
 * ⚠ O QUE ISTO MEDE, E O QUE NÃO MEDE
 *
 * Isto mede **distância em linha reta** — a que um pássaro faria. A estrada é
 * sempre mais comprida, e num sítio com um rio ou uma auto-estrada pelo meio
 * pode ser muito mais.
 *
 * Serve para **ordenar** paragens, que é para o que é usado: entre duas
 * hipóteses, a que tem menos linha reta tem quase sempre menos estrada. Não
 * serve para prometer "18 km" a ninguém, e por isso os números aparecem no
 * ecrã como aproximados.
 */

import { coordenadasValidas } from "./mapa";

export interface Paragem {
  id: string;
  latitude: number;
  longitude: number;
}

/* ────────────────────────── A distância ────────────────────────────────── */

/** O raio da Terra, em quilómetros. */
const RAIO_KM = 6371;

const emRadianos = (graus: number) => (graus * Math.PI) / 180;

/**
 * Quantos quilómetros há entre dois pontos, em linha reta.
 *
 * Fórmula de haversine. Usa-se esta e não a subtração simples das coordenadas
 * porque um grau de longitude vale 111 km no equador e 71 km em Lisboa — quem
 * ignora isso ordena as paragens ao contrário em cidades a norte.
 */
export function distanciaKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const dLat = emRadianos(b.latitude - a.latitude);
  const dLon = emRadianos(b.longitude - a.longitude);
  const lat1 = emRadianos(a.latitude);
  const lat2 = emRadianos(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * RAIO_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Só as paragens que são mesmo um sítio no mapa. */
export function comSitio<T extends { latitude: unknown; longitude: unknown }>(
  paragens: readonly T[]
): T[] {
  return paragens.filter((p) => coordenadasValidas(p.latitude, p.longitude));
}

/* ─────────────────────────── O caminho ─────────────────────────────────── */

/**
 * Os quilómetros de um caminho, na ordem em que está.
 *
 * Conta os saltos entre paragens. Não conta a viagem de casa para a primeira
 * nem da última para casa — ninguém sabe onde é a casa de quem quer que seja,
 * e inventá-la daria um número errado com ar de certo.
 */
export function quilometros(caminho: readonly Paragem[]): number {
  let total = 0;
  for (let i = 1; i < caminho.length; i += 1) {
    total += distanciaKm(caminho[i - 1], caminho[i]);
  }
  return total;
}

/**
 * O caminho reordenado: em cada ponto, segue-se para o mais perto que falta.
 *
 * É a heurística do vizinho mais próximo. Não dá garantidamente o melhor
 * caminho possível — esse problema não tem solução rápida conhecida — mas
 * corta quase sempre a maior parte do desperdício, e corre num instante para
 * as cinco ou dez paragens que um dia real tem.
 *
 * Começa na paragem que já é a primeira do dia. É de propósito: a primeira
 * hora costuma estar combinada com o cliente, e trocá-la seria resolver um
 * problema criando outro maior.
 */
export function ordenarPorProximidade(paragens: readonly Paragem[]): Paragem[] {
  if (paragens.length <= 2) return [...paragens];

  const porVisitar = [...paragens];
  const caminho: Paragem[] = [porVisitar.shift()!];

  while (porVisitar.length > 0) {
    const atual = caminho[caminho.length - 1];
    let melhor = 0;
    let melhorKm = Infinity;

    for (let i = 0; i < porVisitar.length; i += 1) {
      const km = distanciaKm(atual, porVisitar[i]);
      if (km < melhorKm) {
        melhorKm = km;
        melhor = i;
      }
    }

    caminho.push(porVisitar.splice(melhor, 1)[0]);
  }

  return caminho;
}

/* ────────────────────────── O que se mostra ────────────────────────────── */

export interface Comparacao {
  /** O caminho pela hora marcada, como está hoje. */
  atual: Paragem[];
  /** O caminho pela estrada. */
  melhor: Paragem[];
  kmAtual: number;
  kmMelhor: number;
  /** Quantos quilómetros se poupam. Nunca negativo. */
  poupanca: number;
  /** Se a ordem é diferente o suficiente para valer a pena dizer alguma coisa. */
  valeAPena: boolean;
}

/**
 * As duas hipóteses, lado a lado.
 *
 * `valeAPena` existe para o ecrã não andar a sugerir trocas de 300 metros. Um
 * técnico que reordena o dia por causa de meio quilómetro perde mais tempo a
 * pensar nisso do que a conduzir — por isso só se fala quando há pelo menos
 * **2 km e 15 %** para ganhar.
 */
export function compararCaminhos(paragens: readonly Paragem[]): Comparacao {
  const atual = [...paragens];
  const melhor = ordenarPorProximidade(paragens);
  const kmAtual = quilometros(atual);
  const kmMelhor = quilometros(melhor);
  const poupanca = Math.max(0, kmAtual - kmMelhor);

  return {
    atual,
    melhor,
    kmAtual,
    kmMelhor,
    poupanca,
    valeAPena: poupanca >= 2 && kmAtual > 0 && poupanca / kmAtual >= 0.15,
  };
}

/**
 * Os quilómetros como se dizem em voz alta.
 *
 * Abaixo de 1 km vai em metros — "0,4 km" lê-se pior do que "400 m". Acima,
 * uma casa decimal chega: a segunda seria precisão a fingir, num número que já
 * é uma estimativa em linha reta.
 */
export function comoDistancia(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/**
 * Quantas paragens ficariam fora da hora marcada, nesta ordem.
 *
 * Reordenar o dia pela estrada tem um preço que não se vê no mapa: as horas
 * deixam de estar por ordem, e cada uma dessas é um telefonema a um cliente.
 *
 * Sem este número, o ecrã parecia oferecer quilómetros de graça. Com ele, quem
 * coordena vê os dois lados e decide — que é o ponto.
 */
export function horasPorRemarcar(horas: readonly (string | null)[]): number {
  let n = 0;
  let ultima: string | null = null;
  for (const h of horas) {
    if (h === null) continue;
    if (ultima !== null && h < ultima) n += 1;
    else ultima = h;
  }
  return n;
}
