// 11/11 (Rúben: «a transcrição falha muito»): a segunda passagem da transcrição. Além das falas soltas (a pré-visualização em direto), o
// gravador guarda o som contínuo e manda-o em blocos de ~45 a 55 s, cortados no ponto mais calado; cada bloco volta transcrito pelo modelo
// maior, com quem fala, e substitui as falas provisórias desse intervalo. Só lógica, sem imports: corre nos testes e no Node.

export const TAXA_BLOCOS = 16000;
/** Um bloco corta-se entre estes segundos (no ponto mais calado); ao chegar ao máximo, corta-se de certeza. */
export const BLOCO_MIN_S = 35, BLOCO_MAX_S = 55;

/** O início (em amostras) da janela de 0,3 s mais calada entre `de` e `ate`. */
export function pontoCalado(pcm: Float32Array, de: number, ate: number, taxa = TAXA_BLOCOS): number {
  const jan = Math.round(taxa * 0.02), largura = 15; // 15 janelas de 20 ms
  const energias: number[] = [];
  for (let i = de; i + jan <= ate; i += jan) {
    let e = 0;
    for (let k = 0; k < jan; k++) e += pcm[i + k] * pcm[i + k];
    energias.push(e);
  }
  if (energias.length <= largura) return Math.round((de + ate) / 2);
  let soma = 0;
  for (let i = 0; i < largura; i++) soma += energias[i];
  let melhor = 0, menor = soma;
  for (let i = largura; i < energias.length; i++) {
    soma += energias[i] - energias[i - largura];
    if (soma < menor) { menor = soma; melhor = i - largura + 1; }
  }
  // o corte fica a meio da janela calada
  return de + (melhor + Math.floor(largura / 2)) * jan;
}

/** Corta um áudio inteiro (um ficheiro, ou o fim de uma gravação) em blocos, em amostras [ini, fim). */
export function cortarEmBlocos(pcm: Float32Array, taxa = TAXA_BLOCOS, minS = BLOCO_MIN_S, maxS = BLOCO_MAX_S): { ini: number; fim: number }[] {
  const out: { ini: number; fim: number }[] = [];
  let ini = 0;
  while (pcm.length - ini > maxS * taxa) {
    const corte = pontoCalado(pcm, ini + minS * taxa, ini + maxS * taxa, taxa);
    out.push({ ini, fim: corte });
    ini = corte;
  }
  // um resto muito curto junta-se ao bloco anterior (até 10 s acima do máximo)
  if (out.length && pcm.length - ini < 10 * taxa) out[out.length - 1].fim = pcm.length;
  else if (pcm.length - ini > 0) out.push({ ini, fim: pcm.length });
  return out;
}

/** A raiz da média dos quadrados da janela de 1 s mais forte (para saber se um bloco tem alguma coisa). */
export function rmsMaximo(pcm: Float32Array, taxa = TAXA_BLOCOS): number {
  const jan = taxa;
  let melhor = 0;
  for (let i = 0; i < pcm.length; i += Math.round(jan / 2)) {
    const ate = Math.min(pcm.length, i + jan);
    let e = 0;
    for (let k = i; k < ate; k++) e += pcm[k] * pcm[k];
    melhor = Math.max(melhor, Math.sqrt(e / Math.max(1, ate - i)));
  }
  return melhor;
}

/** Sobe o volume de um bloco baixo (o cliente pelo altifalante, alguém longe do telemóvel): o pico vai a 0,9, no máximo 4 vezes mais. */
export function normalizar(pcm: Float32Array): Float32Array {
  // o pico sem os estalos: o percentil 99,9 dos valores absolutos, por amostragem
  const passo = Math.max(1, Math.floor(pcm.length / 20000));
  const abs: number[] = [];
  for (let i = 0; i < pcm.length; i += passo) abs.push(Math.abs(pcm[i]));
  abs.sort((a, b) => a - b);
  const pico = abs[Math.floor(abs.length * 0.999)] ?? 0;
  if (pico <= 0.001) return pcm;
  const ganho = Math.min(4, 0.9 / pico);
  if (ganho <= 1.05) return pcm;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-1, Math.min(1, pcm[i] * ganho));
  return out;
}

/** Junta partes int16 num float32. */
export function juntarInt16(partes: Int16Array[]): Float32Array {
  const n = partes.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let k = 0;
  for (const p of partes) for (let i = 0; i < p.length; i++) out[k++] = p[i] / 32768;
  return out;
}

interface ComTempo { inicio: number; revista?: boolean }

/** Põe as frases revistas de um bloco [iniS, fimS) no lugar das falas provisórias desse intervalo (as revistas de outros blocos ficam). */
export function juntarBloco<T extends ComTempo>(falas: readonly T[], novas: readonly T[], iniS: number, fimS: number): T[] {
  const dentro = (f: T) => f.inicio >= iniS - 0.5 && f.inicio < fimS;
  return [...falas.filter((f) => f.revista || !dentro(f)), ...novas].sort((a, b) => a.inicio - b.inicio);
}

/** Uma fala provisória que chega depois do seu intervalo já estar revisto não entra. */
export const jaRevisto = (inicio: number, revistos: readonly [number, number][]) => revistos.some(([a, b]) => inicio >= a - 0.5 && inicio < b);

/** 11/11 (Rúben: «aprende e melhora»): uma gravação carregada transcrevia-se bloco a bloco, um de cada vez (uma visita de 35 min levava
 *  ~10 min). Corre `fn` para os índices 0..total-1 com até `n` ao mesmo tempo: o primeiro sozinho (dá as vozes e o assunto aos outros, como
 *  contexto) e depois os restantes em paralelo, pela ordem. Devolve os resultados pela ordem dos índices. */
export async function correrEmParalelo<T>(total: number, n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out = new Array<T>(total);
  if (!total) return out;
  out[0] = await fn(0);
  let prox = 1;
  const trabalhador = async () => { while (prox < total) { const i = prox++; out[i] = await fn(i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, total - 1)) }, trabalhador));
  return out;
}
