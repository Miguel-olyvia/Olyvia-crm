// Protótipo (visualizador 3D): a geometria das peças na planta, em cm (como o desenho de hoje, planta.ts). Funções puras e testáveis:
// encosto à parede (peças de parede), altura ao chão, rotação, limite dentro do polígono da divisão, sobreposição e capacidade.
// Uma peça é a caixa x,y,w,h SEM rodar (w ao longo da parede, h = profundidade), rodada `rot` graus em torno do centro; a frente (0 graus)
// aponta para baixo (+y); a frente aponta para (sin rot, cos rot).
import { cantos, faltaFechar, type PecaPlanta, type Planta, type Ponto } from "../planta";

const RAD = Math.PI / 180;
const arred1 = (n: number) => Math.round(n * 10) / 10;
export const MARGEM_CM = 1.5;

export const centroPeca = (p: Pick<PecaPlanta, "x" | "y" | "w" | "h">): Ponto => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
export const normalizarAngulo = (a: number): number => ((Math.round(a) % 360) + 360) % 360;

/** Os quatro cantos da peça, já rodados. */
export function cantosPeca(p: Pick<PecaPlanta, "x" | "y" | "w" | "h" | "rot">): Ponto[] {
  const c = centroPeca(p), a = (p.rot ?? 0) * RAD, cs = Math.cos(a), sn = Math.sin(a);
  return [[-p.w / 2, -p.h / 2], [p.w / 2, -p.h / 2], [p.w / 2, p.h / 2], [-p.w / 2, p.h / 2]].map(([dx, dy]) => ({ x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs }));
}

/** O polígono da divisão (cantos, cm), só com a planta fechada. */
export function poligonoDe(planta: Planta): Ponto[] | null {
  if (planta.paredes.length < 3 || faltaFechar(planta.paredes) > 1) return null;
  return cantos(planta.paredes, planta.o).slice(0, -1);
}
const areaSinal = (poly: readonly Ponto[]): number => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
export const areaCm2 = (poly: readonly Ponto[]): number => Math.abs(areaSinal(poly));

/** A normal da parede `i` virada para o interior da divisão. */
export function normalInteriorCm(poly: readonly Ponto[], i: number): Ponto {
  const a = poly[i], b = poly[(i + 1) % poly.length], c = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const tx = (b.x - a.x) / c, ty = (b.y - a.y) / c, lado = areaSinal(poly) >= 0 ? 1 : -1;
  return { x: -ty * lado + 0, y: tx * lado + 0 };
}

function pontoNoSegmento(p: Ponto, a: Ponto, b: Ponto): { q: Ponto; d: number; ao: number } {
  const c = Math.hypot(b.x - a.x, b.y - a.y) || 1, tx = (b.x - a.x) / c, ty = (b.y - a.y) / c;
  const ao = Math.min(c, Math.max(0, (p.x - a.x) * tx + (p.y - a.y) * ty));
  const q = { x: a.x + tx * ao, y: a.y + ty * ao };
  return { q, d: Math.hypot(p.x - q.x, p.y - q.y), ao };
}

/** A parede mais próxima de um ponto: o índice, a distância, a posição ao longo dela e o ponto da parede. */
export function paredeMaisPertoCm(poly: readonly Ponto[], pt: Ponto): { i: number; d: number; ao: number; q: Ponto } {
  let melhor = { i: 0, d: Infinity, ao: 0, q: poly[0] };
  poly.forEach((a, i) => {
    const r = pontoNoSegmento(pt, a, poly[(i + 1) % poly.length]);
    if (r.d < melhor.d) melhor = { i, d: r.d, ao: r.ao, q: r.q };
  });
  return melhor;
}

/** Ponto dentro do polígono (a fronteira conta, com `tol` cm de folga). */
export function pontoDentro(poly: readonly Ponto[], p: Ponto, tol = MARGEM_CM): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro || paredeMaisPertoCm(poly, p).d <= tol;
}
export const pecaDentro = (poly: readonly Ponto[], p: Pick<PecaPlanta, "x" | "y" | "w" | "h" | "rot">): boolean => cantosPeca(p).every((c) => pontoDentro(poly, c));

/** Uma peça que conta (não foi retirada de um conjunto e tem geometria). */
export const ativa = (p: Pick<PecaPlanta, "ret" | "semGeo">): boolean => !p.ret && !p.semGeo;
export const ehDeParede = (p: Pick<PecaPlanta, "mont">): boolean => p.mont === "parede";
/** Portas e janelas do desenho antigo (sem montagem nem rotação) não se encostam nem rodam. */
export const ehAbertura = (p: Pick<PecaPlanta, "tipo" | "rot">): boolean => (p.tipo === "porta" || p.tipo === "janela") && p.rot === undefined;

/**
 * Encosta uma peça de parede à parede dada (ou à mais próxima do centro): a traseira fica rente à parede, a largura corre ao longo dela, e a
 * posição fica entre os extremos. Devolve a peça com x, y, rot e a posição ao longo da parede (`ao`, cm do início da parede ao centro da peça).
 */
export function encostarParede(poly: readonly Ponto[], p: PecaPlanta, parede?: number, aoDesejado?: number): { peca: PecaPlanta; parede: number; ao: number } {
  const c = centroPeca(p);
  const i = parede ?? paredeMaisPertoCm(poly, c).i;
  const a = poly[i], b = poly[(i + 1) % poly.length], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, n = normalInteriorCm(poly, i);
  const bruto = aoDesejado ?? pontoNoSegmento(c, a, b).ao;
  const ao = len <= p.w ? len / 2 : Math.min(len - p.w / 2, Math.max(p.w / 2, bruto));
  const cx = a.x + t.x * ao + n.x * (p.h / 2), cy = a.y + t.y * ao + n.y * (p.h / 2);
  return { parede: i, ao: arred1(ao), peca: { ...p, x: arred1(cx - p.w / 2), y: arred1(cy - p.h / 2), rot: normalizarAngulo(Math.atan2(n.x, n.y) / RAD) } };
}

/** A parede à frente da peça (do outro lado da divisão): a primeira que o raio do centro, na direção da frente, encontra (ignora a parede actual). */
export function paredeOposta(poly: readonly Ponto[], p: PecaPlanta, actual: number): number | null {
  const c = centroPeca(p), a = (p.rot ?? 0) * RAD, d = { x: Math.sin(a), y: Math.cos(a) };
  let melhor = -1, tMelhor = Infinity;
  for (let i = 0; i < poly.length; i++) {
    if (i === actual) continue;
    const u = poly[i], v = poly[(i + 1) % poly.length], ex = v.x - u.x, ey = v.y - u.y, den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((u.x - c.x) * ey - (u.y - c.y) * ex) / den, s = ((u.x - c.x) * d.y - (u.y - c.y) * d.x) / den;
    if (t > 1 && s >= 0 && s <= 1 && t < tMelhor) { melhor = i; tMelhor = t; }
  }
  return melhor >= 0 ? melhor : null;
}

export type ResAjuste = { ok: true; peca: PecaPlanta } | { ok: false; erro: string };
export const FORA_DA_DIVISAO = "Fora da divisão: a peça não cabe nesse sítio.";

/** Põe uma peça dentro da divisão: se algum canto sai, encosta-a ao ponto mais próximo dentro. Falha (com mensagem) se a peça não couber. */
export function corrigirDentro(poly: readonly Ponto[], p: PecaPlanta): ResAjuste {
  let q = p;
  if (!pontoDentro(poly, centroPeca(q), 0)) {
    const r = paredeMaisPertoCm(poly, centroPeca(q)), n = normalInteriorCm(poly, r.i), m = Math.min(q.w, q.h) / 2;
    q = { ...q, x: r.q.x + n.x * m - q.w / 2, y: r.q.y + n.y * m - q.h / 2 };
  }
  for (let k = 0; k < 40; k++) {
    const fora = cantosPeca(q).filter((c) => !pontoDentro(poly, c));
    if (!fora.length) return { ok: true, peca: { ...q, x: arred1(q.x), y: arred1(q.y) } };
    const pior = fora.map((c) => ({ c, r: paredeMaisPertoCm(poly, c) })).sort((u, v) => v.r.d - u.r.d)[0];
    const n = normalInteriorCm(poly, pior.r.i);
    q = { ...q, x: q.x + (pior.r.q.x - pior.c.x) + n.x * 0.6, y: q.y + (pior.r.q.y - pior.c.y) + n.y * 0.6 };
  }
  return { ok: false, erro: FORA_DA_DIVISAO };
}

/** Ajusta uma peça acabada de largar ou mexer: as de parede encostam-se; todas ficam dentro da divisão. Sem planta fechada, fica como está. */
export function ajustarPeca(planta: Planta, p: PecaPlanta, o: { parede?: number; ao?: number; orientar?: boolean } = {}): ResAjuste {
  const poly = poligonoDe(planta);
  if (!poly || ehAbertura(p)) return { ok: true, peca: p };
  let q = p;
  if (ehDeParede(q)) {
    q = encostarParede(poly, q, o.parede, o.ao).peca;
  } else if (o.orientar) {
    const r = paredeMaisPertoCm(poly, centroPeca(q));
    if (r.d <= Math.max(q.w, q.h) / 2 + 60) { const n = normalInteriorCm(poly, r.i); q = { ...q, rot: normalizarAngulo(Math.atan2(n.x, n.y) / RAD) }; }
  }
  return corrigirDentro(poly, q);
}

/**
 * A peça levada para um ponto do chão (centro em METROS, como no 3D) com as regras da planta: a de chão fica dentro da divisão e, perto de
 * uma parede, vira-lhe as costas; a de parede encosta à parede mais próxima desse ponto (corre ao longo dela e passa o canto para a outra),
 * à altura dada (m, nunca abaixo de 0). Portas e janelas do desenho antigo não se mexem aqui.
 */
export function moverPara(planta: Planta, p: PecaPlanta, xm: number, ym: number, alturaM?: number): ResAjuste {
  if (ehAbertura(p)) return { ok: false, erro: "Portas e janelas mexem-se na planta." };
  const base: PecaPlanta = { ...p, x: arred1(xm * 100 - p.w / 2), y: arred1(ym * 100 - p.h / 2), ...(alturaM !== undefined && ehDeParede(p) ? { alt: Math.max(0, Math.round(alturaM * 100)) } : {}) };
  return ajustarPeca(planta, base, { orientar: !ehDeParede(p) });
}

/** Separa dois rectângulos rodados (SAT) com uma folga de `folga` cm: verdadeiro se se sobrepõem. */
export function sobrepoe(a: Pick<PecaPlanta, "x" | "y" | "w" | "h" | "rot">, b: Pick<PecaPlanta, "x" | "y" | "w" | "h" | "rot">, folga = 1): boolean {
  const encolher = (p: typeof a) => ({ ...p, x: p.x + folga, y: p.y + folga, w: Math.max(1, p.w - 2 * folga), h: Math.max(1, p.h - 2 * folga) });
  const A = cantosPeca(encolher(a)), B = cantosPeca(encolher(b));
  for (const pol of [A, B]) {
    for (let i = 0; i < 2; i++) {
      const u = pol[i], v = pol[i + 1], ax = -(v.y - u.y), ay = v.x - u.x;
      const proj = (pts: Ponto[]) => pts.map((p) => p.x * ax + p.y * ay);
      const pa = proj(A), pb = proj(B);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Pares de peças que se sobrepõem: as de chão entre si; as de parede se se tocam em planta e nas alturas. */
export function sobreposicoes(pecas: readonly PecaPlanta[]): [PecaPlanta, PecaPlanta][] {
  const lista = pecas.filter((p) => !ehAbertura(p) && ativa(p));
  const res: [PecaPlanta, PecaPlanta][] = [];
  const faixa = (p: PecaPlanta): [number, number] => { const a0 = p.alt ?? 0; return [a0, a0 + (p.dh ?? (ehDeParede(p) ? 30 : 200))]; };
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j], pa = ehDeParede(a), pb = ehDeParede(b);
      if (pa !== pb || (a.conj && a.conj === b.conj)) continue; // as peças do mesmo conjunto estão ligadas de propósito
      const [a0, a1] = faixa(a), [b0, b1] = faixa(b);
      if (a1 <= b0 || b1 <= a0) continue;
      if (sobrepoe(a, b)) res.push([a, b]);
    }
  }
  return res;
}

export const LIMITE_OCUPACAO = 0.6;
/** A fração do chão ocupada pelas peças de chão (0 a 1+), ou null sem planta fechada. */
export function ocupacao(planta: Planta): number | null {
  const poly = poligonoDe(planta);
  if (!poly) return null;
  const area = areaCm2(poly);
  const usado = planta.pecas.filter((p) => !ehAbertura(p) && ativa(p) && !ehDeParede(p) && (p.alt ?? 0) < 30).reduce((s, p) => s + p.w * p.h, 0);
  return area > 0 ? usado / area : null;
}

const nome = (p: PecaPlanta) => p.nome ?? p.tipo;
/** Os avisos em texto da planta (não bloqueiam): peças fora da divisão, sobrepostas, ou a mais do que a divisão comporta. */
export function avisosDaPlanta(planta: Planta): string[] {
  const poly = poligonoDe(planta), avisos: string[] = [];
  if (!poly) return avisos;
  for (const p of planta.pecas) if (!ehAbertura(p) && ativa(p) && !pecaDentro(poly, p)) avisos.push(`Fora da divisão: ${nome(p)}.`);
  for (const [a, b] of sobreposicoes(planta.pecas)) avisos.push(`Sobreposição: ${nome(a)} e ${nome(b)}.`);
  const o = ocupacao(planta);
  if (o !== null && o > LIMITE_OCUPACAO) avisos.push(`Peças a mais para esta divisão: ocupam ${Math.round(o * 100)} % do chão.`);
  return avisos;
}

/** Roda uma peça: de chão em torno do centro; de parede, passa para a parede do lado oposto (passos de 180 graus, sempre encostada). */
export function rodarPeca(planta: Planta, p: PecaPlanta, graus: number): ResAjuste {
  if (!ehDeParede(p)) return ajustarPeca(planta, { ...p, rot: normalizarAngulo((p.rot ?? 0) + graus) });
  const poly = poligonoDe(planta);
  if (!poly) return { ok: true, peca: { ...p, rot: normalizarAngulo((p.rot ?? 0) + 180) } };
  const actual = encostarParede(poly, p).parede, oposta = paredeOposta(poly, p, actual);
  if (oposta === null) return { ok: false, erro: "Não há parede do lado oposto." };
  return ajustarPeca(planta, p, { parede: oposta });
}
