// 6/11: o 3D do planeador da cozinha, sem bibliotecas (SVG). A cena são caixas (o corpo, o rodapé, cada frente, cada puxador, o tampo, o
// lava-loiça e a placa por cima, o exaustor) em camadas que se desenham por ordem: o chão e as paredes; a fila de baixo; o tampo e o que está
// em cima dele; a fila de cima. Dentro de cada camada, das caixas mais longe para as mais perto (o pintor). Os altos partem-se à altura da
// junta das portas, para cada parte entrar na sua camada. A câmara roda à volta e inclina, com uma perspetiva ligeira.
// Eixos (cm): x ao longo da parede (0 no canto da esquerda), y da parede para a frente, z para cima.
import { produto } from "../catalogoFake";
import { sombrear } from "../geometria3d";
import { ALTURA_TAMPO, MEDIDAS, MODELOS, acabamentoDe, postos, puxadorDe, puxadores, trocosDeTampo, type Cozinha, type Modulo } from "./modelo";

type V3 = [number, number, number];
/** `detalhe`: em cima de outra caixa (o puxador, o vidro do forno): desenha-se depois dela. */
export interface Caixa3 { id: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; cor: string; camada: number; semTopo?: boolean; brilho?: boolean; detalhe?: boolean }
export interface Linha3 { pts: V3[]; cor: string; largura: number; camada: number; fechada?: boolean }
export interface Plano3 { id: string; pts: V3[]; n: V3; cor: string; camada: number }
export interface CenaCozinha { caixas: Caixa3[]; linhas: Linha3[]; planos: Plano3[]; alvo: V3; raio: number }
export interface Camara { rumo: number; inclinacao: number; perto?: number }
export interface Poligono { pts: [number, number][]; cor: string; id?: string; linha?: boolean; largura?: number; fechada?: boolean; contorno?: string }
export interface Cota { a: [number, number]; b: [number, number]; meio: [number, number]; texto: string }

const T = ALTURA_TAMPO, M = MEDIDAS, FOLGA = 0.3;

/** O módulo e as caixas dele, com o x de começo. `soMovel`: sem o tampo (o tampo é por troços, à parte). */
export function caixasDoModulo(m: Modulo, x0: number, c: Pick<Cozinha, "acabamento" | "puxador">, linhas: Linha3[] = []): Caixa3[] {
  const info = MODELOS[m.modelo], ac = acabamentoDe(c), px = puxadorDe(c);
  const x1 = x0 + m.w, out: Caixa3[] = [];
  const corpo = sombrear(ac.hex, 0.93), frente = ac.hex, rodape = sombrear(ac.hex, 0.7);
  const id = m.id;
  const puxa = (z: number, xa: number, xb: number, y: number, camada: number) => {
    if (!px.hex) return;
    const l = Math.min(28, (xb - xa) * 0.55), cx = (xa + xb) / 2;
    out.push({ id, x0: cx - l / 2, x1: cx + l / 2, y0: y, y1: y + 2.2, z0: z - 0.7, z1: z + 0.7, cor: px.hex, camada, brilho: true, detalhe: true });
  };
  /** As frentes de uma faixa (z0..z1): uma, ou duas portas lado a lado nos largos. */
  const portas = (z0: number, z1: number, y: number, camada: number, duas = m.w > 60, cor = frente, puxEm: "cima" | "baixo" = "cima") => {
    const partes = duas ? [[x0, (x0 + x1) / 2], [(x0 + x1) / 2, x1]] : [[x0, x1]];
    for (const [a, b] of partes) {
      out.push({ id, x0: a + FOLGA, x1: b - FOLGA, y0: y, y1: y + M.frente, z0: z0 + FOLGA, z1: z1 - FOLGA, cor, camada });
      puxa(puxEm === "cima" ? z1 - 4 : z0 + 4, a, b, y + M.frente, camada);
    }
  };

  if (m.modelo === "vazio") return out;

  if (info.fila === "parede") {
    const z0 = M.paredeBase, z1 = M.paredeTopo, fy = M.fundoParede - M.frente;
    if (m.modelo === "exaustor") {
      const p = produto(m.produto), cor = p?.hex ?? "#9aa0a6", cx = (x0 + x1) / 2;
      out.push({ id, x0: x0 + 1, x1: x1 - 1, y0: 0, y1: 50, z0: 152, z1: 160, cor, camada: 4, brilho: true });
      out.push({ id, x0: x0 + 6, x1: x1 - 6, y0: 0, y1: 34, z0: 160, z1: 172, cor, camada: 4, brilho: true });
      out.push({ id, x0: cx - 13, x1: cx + 13, y0: 0, y1: 24, z0: 172, z1: 250, cor, camada: 4, brilho: true });
      return out;
    }
    out.push({ id, x0, x1, y0: 0, y1: fy, z0, z1, cor: corpo, camada: 4 });
    portas(z0, z1, fy, 4, m.w > 60, frente, "baixo");
    return out;
  }

  if (info.alto) {
    // os altos: o rodapé, o corpo partido à junta (150), e as frentes de cada parte
    const junta = 150;
    out.push({ id, x0: x0 + 0.5, x1: x1 - 0.5, y0: 4, y1: M.fundoBaixo - 4, z0: 0, z1: M.rodape, cor: rodape, camada: 1 });
    if (m.modelo === "frigorifico") {
      const p = produto(m.produto), cor = p?.hex ?? "#d9dcdf";
      out.push({ id, x0: x0 + 0.5, x1: x1 - 0.5, y0: 0, y1: 65, z0: 0, z1: 70, cor, camada: 1, brilho: true });
      out.push({ id, x0: x0 + 0.5, x1: x1 - 0.5, y0: 0, y1: 65, z0: 70.4, z1: junta, cor, camada: 1, brilho: true });
      out.push({ id, x0: x0 + 0.5, x1: x1 - 0.5, y0: 0, y1: 65, z0: junta, z1: 200, cor, camada: 4, brilho: true });
      for (const [za, zb, cam] of [[20, 60, 1], [95, 140, 1], [junta, 185, 4]] as const) out.push({ id, x0: x1 - 6, x1: x1 - 4.6, y0: 65, y1: 67.5, z0: za, z1: zb, cor: "#8d9196", camada: cam, brilho: true, detalhe: true });
      return out;
    }
    const fy = M.fundoBaixo;
    out.push({ id, x0, x1, y0: 0, y1: fy, z0: M.rodape, z1: junta, cor: corpo, camada: 1 });
    out.push({ id, x0, x1, y0: 0, y1: fy, z0: junta, z1: M.altoTopo, cor: corpo, camada: 4 });
    if (m.frente === "forno") {
      const p = produto(m.produto);
      portas(M.rodape, 50, fy, 1, false);
      portas(50.3, 90, fy, 1, false);
      out.push({ id, x0: x0 + FOLGA, x1: x1 - FOLGA, y0: fy, y1: fy + M.frente, z0: 90.3, z1: junta - FOLGA, cor: p?.hex ?? "#9aa0a6", camada: 1, brilho: true });
      out.push({ id, x0: x0 + 6, x1: x1 - 6, y0: fy + M.frente, y1: fy + M.frente + 0.3, z0: 96, z1: 132, cor: "#1d1f22", camada: 1, detalhe: true });
      puxa(junta - 5, x0, x1, fy + M.frente, 1);
    } else {
      portas(M.rodape, junta, fy, 1, false, frente, "cima");
    }
    portas(junta, M.altoTopo, fy, 4, false, frente, "baixo");
    return out;
  }

  // a fila de baixo: o rodapé recolhido, o corpo, e as frentes (o tampo vem por troços)
  const fy = M.fundoBaixo, zc = M.rodape + M.corpo;
  out.push({ id, x0: x0 + 0.2, x1: x1 - 0.2, y0: 4, y1: fy - 5, z0: 0, z1: M.rodape, cor: rodape, camada: 1, semTopo: true });
  out.push({ id, x0, x1, y0: 0, y1: fy, z0: M.rodape, z1: zc, cor: corpo, camada: 1, semTopo: true });
  const gavetas = (alturas: number[], zTopo: number) => {
    let z = zTopo;
    for (const h of alturas) { portas(z - h, z, fy, 1, false); z -= h; }
    return z;
  };
  if (m.frente === "3g") gavetas([18, 26, M.corpo - 44], zc);
  else if (m.frente === "gp") { const z = gavetas([18], zc); portas(M.rodape, z, fy, 1); }
  else if (m.frente === "p") portas(M.rodape, zc, fy, 1);
  else if (m.frente === "painel") portas(M.rodape, zc, fy, 1, false);
  else if (m.frente === "forno") {
    const forno = produto(m.extra);
    portas(M.rodape, M.rodape + 18, fy, 1, false);
    out.push({ id, x0: x0 + FOLGA, x1: x1 - FOLGA, y0: fy, y1: fy + M.frente, z0: M.rodape + 18.3, z1: zc - FOLGA, cor: forno?.hex ?? "#9aa0a6", camada: 1, brilho: true });
    out.push({ id, x0: x0 + 5, x1: x1 - 5, y0: fy + M.frente, y1: fy + M.frente + 0.3, z0: M.rodape + 24, z1: zc - 14, cor: "#1d1f22", camada: 1, detalhe: true });
    puxa(zc - 6, x0, x1, fy + M.frente, 1);
  }

  // em cima do tampo: o lava-loiça (a cuba e a torneira) e a placa (o vidro e as zonas)
  if (m.modelo === "lava") {
    const lava = produto(m.produto), tor = produto(m.extra), cx = (x0 + x1) / 2, lw = Math.min(m.w - 12, 70);
    out.push({ id, x0: cx - lw / 2, x1: cx + lw / 2, y0: 9, y1: 52, z0: T, z1: T + 0.25, cor: sombrear(lava?.hex ?? "#c9ccd0", 0.92), camada: 3, brilho: true });
    out.push({ id, x0: cx - lw / 2 + 3, x1: cx + lw / 2 - (m.w >= 80 ? 22 : 3), y0: 12, y1: 49, z0: T + 0.25, z1: T + 0.4, cor: sombrear(lava?.hex ?? "#c9ccd0", 0.6), camada: 3 });
    const tc = tor?.hex ?? "#a9adb1", tx = cx + (m.w >= 80 ? 8 : 0);
    out.push({ id, x0: tx - 2.2, x1: tx + 2.2, y0: 3.5, y1: 8, z0: T, z1: T + 32, cor: tc, camada: 3, brilho: true });
    out.push({ id, x0: tx - 1.6, x1: tx + 1.6, y0: 3.5, y1: 24, z0: T + 28, z1: T + 31.5, cor: tc, camada: 3, brilho: true });
  }
  if (m.modelo === "placa") {
    const pl = produto(m.produto), cx = (x0 + x1) / 2, pw = Math.min(m.w - 4, pl?.w ?? 60);
    out.push({ id, x0: cx - pw / 2, x1: cx + pw / 2, y0: 6, y1: 58, z0: T, z1: T + 0.5, cor: pl?.hex ?? "#2f3136", camada: 3, brilho: true });
    const zonas: [number, number, number][] = pw >= 75 ? [[-24, 18, 8], [0, 30, 10], [24, 18, 8], [-18, 44, 7], [18, 44, 9]] : [[-14, 18, 8], [14, 18, 7], [-14, 42, 7], [14, 42, 9]];
    for (const [dx, y, r] of zonas) {
      const pts: V3[] = Array.from({ length: 20 }, (_, k) => [cx + dx + r * Math.cos((k / 20) * 2 * Math.PI), y + r * Math.sin((k / 20) * 2 * Math.PI), T + 0.55]);
      linhas.push({ pts, cor: "rgba(255,255,255,0.45)", largura: 0.7, camada: 3, fechada: true });
    }
  }
  return out;
}

/** A cena inteira: a divisão (o chão de tábuas, a parede do fundo e as dos lados), as duas filas e os troços de tampo. */
export function cenaDaCozinha(c: Cozinha, comDivisao = true): CenaCozinha {
  const caixas: Caixa3[] = [], linhas: Linha3[] = [], planos: Plano3[] = [];
  const W = c.parede, D = c.fundo, H = c.altura;
  if (comDivisao) {
    planos.push({ id: "chao", pts: [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]], n: [0, 0, 1], cor: "#d9b98c", camada: 0 });
    for (let y = 18; y < D; y += 18) linhas.push({ pts: [[0, y, 0.05], [W, y, 0.05]], cor: "rgba(120,80,40,0.18)", largura: 0.6, camada: 0 });
    planos.push({ id: "parede", pts: [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], n: [0, 1, 0], cor: "#ebe9e4", camada: 0 });
    planos.push({ id: "parede-esq", pts: [[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]], n: [1, 0, 0], cor: "#e4e2dc", camada: 0 });
    planos.push({ id: "parede-dir", pts: [[W, 0, 0], [W, 0, H], [W, D, H], [W, D, 0]], n: [-1, 0, 0], cor: "#e4e2dc", camada: 0 });
  }
  for (const p of postos(c.baixo)) caixas.push(...caixasDoModulo(p.m, p.x0, c, linhas));
  for (const p of postos(c.cima)) caixas.push(...caixasDoModulo(p.m, p.x0, c, linhas));
  const tampo = produto(c.tampo);
  for (const t of trocosDeTampo(c)) {
    // o tampo encosta à parede e passa um pouco à frente das portas; nas pontas junto a um alto, sem o lado
    caixas.push({ id: "tampo", x0: t.x0, x1: t.x1, y0: 0, y1: M.fundoTampo, z0: M.rodape + M.corpo, z1: T, cor: tampo?.hex ?? "#c79a6a", camada: 2 });
  }
  const largura = Math.max(W, 120);
  return { caixas, linhas, planos, alvo: [largura / 2, D * 0.18, 110], raio: Math.max(largura, H) * 1.6 };
}

// ---------------------------------------------------------------- a câmara e o desenho
const LUZ: V3 = (() => { const v: V3 = [-0.35, 0.6, 0.72]; const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; })();

export function projetor(cena: Pick<CenaCozinha, "alvo" | "raio">, cam: Camara) {
  const [tx, ty, tz] = cena.alvo, a = cam.rumo, p = cam.inclinacao, dist = cena.raio * (cam.perto ?? 1), F = dist;
  const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
  const olho: V3 = [tx + dist * cp * sa, ty + dist * cp * ca, tz + dist * sp];
  const ver = ([x, y, z]: V3): { u: number; v: number; d: number } => {
    const dx = x - tx, dy = y - ty, dz = z - tz;
    const X = dx * ca - dy * sa, Y = dx * sa + dy * ca;
    const d = Y * cp + dz * sp, up = dz * cp - Y * sp;
    const s = F / Math.max(1, dist - d);
    return { u: X * s, v: -up * s, d };
  };
  const visivel = (centro: V3, n: V3) => n[0] * (olho[0] - centro[0]) + n[1] * (olho[1] - centro[1]) + n[2] * (olho[2] - centro[2]) > 0;
  return { ver, visivel, olho };
}

const luz = (n: V3) => 0.7 + 0.3 * Math.max(0, n[0] * LUZ[0] + n[1] * LUZ[1] + n[2] * LUZ[2]);

/** As faces e as linhas, já na ordem do desenho, e o retângulo que ocupam. */
export function desenhar(cena: CenaCozinha, cam: Camara): { poligonos: Poligono[]; caixa: { x: number; y: number; w: number; h: number } } {
  const { ver, visivel } = projetor(cena, cam);
  const camadas: { prof: number; polys: Poligono[] }[][] = [[], [], [], [], []];
  const pt = (v: V3): [number, number] => { const q = ver(v); return [q.u, q.v]; };

  for (const pl of cena.planos) {
    const centro = pl.pts.reduce<V3>((s, q) => [s[0] + q[0] / pl.pts.length, s[1] + q[1] / pl.pts.length, s[2] + q[2] / pl.pts.length], [0, 0, 0]);
    if (!visivel(centro, pl.n)) continue;
    camadas[pl.camada].push({ prof: pl.id === "chao" ? -1e9 : -1e8, polys: [{ pts: pl.pts.map(pt), cor: sombrear(pl.cor, luz(pl.n)), id: pl.id, contorno: "rgba(0,0,0,0.08)" }] });
  }
  for (const b of cena.caixas) {
    const centro: V3 = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
    const faces: { n: V3; c: V3[] }[] = [
      { n: [0, 1, 0], c: [[b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]] },
      { n: [0, -1, 0], c: [[b.x0, b.y0, b.z0], [b.x0, b.y0, b.z1], [b.x1, b.y0, b.z1], [b.x1, b.y0, b.z0]] },
      { n: [1, 0, 0], c: [[b.x1, b.y0, b.z0], [b.x1, b.y0, b.z1], [b.x1, b.y1, b.z1], [b.x1, b.y1, b.z0]] },
      { n: [-1, 0, 0], c: [[b.x0, b.y0, b.z0], [b.x0, b.y1, b.z0], [b.x0, b.y1, b.z1], [b.x0, b.y0, b.z1]] },
      { n: [0, 0, 1], c: [[b.x0, b.y0, b.z1], [b.x0, b.y1, b.z1], [b.x1, b.y1, b.z1], [b.x1, b.y0, b.z1]] },
      { n: [0, 0, -1], c: [[b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0], [b.x1, b.y1, b.z0], [b.x0, b.y1, b.z0]] },
    ];
    const polys: Poligono[] = [];
    for (const f of faces) {
      if (b.semTopo && f.n[2] === 1) continue;
      const fc: V3 = [(f.c[0][0] + f.c[2][0]) / 2, (f.c[0][1] + f.c[2][1]) / 2, (f.c[0][2] + f.c[2][2]) / 2];
      if (!visivel(fc, f.n)) continue;
      const brilho = b.brilho && f.n[2] === 1 ? 1.12 : 1;
      polys.push({ pts: f.c.map(pt), cor: sombrear(b.cor, luz(f.n) * brilho), id: b.id });
    }
    camadas[b.camada].push({ prof: ver(centro).d + (b.detalhe ? 6 : 0), polys });
  }
  for (const l of cena.linhas) camadas[l.camada].push({ prof: 1e7, polys: [{ pts: l.pts.map(pt), cor: l.cor, linha: true, largura: l.largura, fechada: l.fechada }] });
  // dentro da camada, de longe para perto (as linhas da camada no fim)
  const poligonos = camadas.flatMap((cm) => cm.sort((x, y) => x.prof - y.prof).flatMap((x) => x.polys));
  // o enquadramento é o dos móveis (o chão, as tábuas e as paredes ficam à volta)
  const todos = poligonos.filter((q) => !q.linha && q.id && q.id !== "chao" && !q.id.startsWith("parede")).flatMap((q) => q.pts);
  const base = todos.length ? todos : poligonos.flatMap((q) => q.pts);
  const xs = base.map((q) => q[0]), ys = base.map((q) => q[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { poligonos, caixa: { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) } };
}

/** As cotas: o comprimento da fila de baixo (por trás, por cima do tampo), a altura e a fundura do tampo na ponta, e a largura do escolhido. */
export function cotas(c: Cozinha, cena: CenaCozinha, cam: Camara, escolhido?: string | null): Cota[] {
  const { ver } = projetor(cena, cam);
  const pt = (v: V3): [number, number] => { const q = ver(v); return [q.u, q.v]; };
  const out: Cota[] = [];
  const cota = (a: V3, b: V3, texto: string) => { const pa = pt(a), pb = pt(b); out.push({ a: pa, b: pb, meio: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], texto }); };
  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-PT");
  const ps = postos(c.baixo);
  if (ps.length) {
    const x1 = ps[ps.length - 1].x1, topo = Math.max(T, ...ps.map((p) => (MODELOS[p.m.modelo].alto ? M.altoTopo : T)));
    cota([0, 0, topo + 14], [x1, 0, topo + 14], fmt(x1));
    cota([x1 + 10, M.fundoTampo, 0], [x1 + 10, M.fundoTampo, T], fmt(T));
    cota([x1 + 10, 0, 0], [x1 + 10, M.fundoTampo, 0], fmt(M.fundoTampo));
  }
  const sel = escolhido ? [...postos(c.baixo), ...postos(c.cima)].find((p) => p.m.id === escolhido) : null;
  if (sel) {
    const emCima = MODELOS[sel.m.modelo].fila === "parede";
    cota([sel.x0, emCima ? M.fundoParede + 4 : M.fundoTampo + 6, emCima ? M.paredeBase - 6 : 0], [sel.x1, emCima ? M.fundoParede + 4 : M.fundoTampo + 6, emCima ? M.paredeBase - 6 : 0], fmt(sel.m.w));
  }
  return out;
}

/** A miniatura de um módulo (para o painel): só ele, com o tampo por cima se for da fila de baixo. */
export function cenaDoModulo(m: Modulo, c: Pick<Cozinha, "acabamento" | "puxador" | "tampo">): CenaCozinha {
  const linhas: Linha3[] = [];
  const caixas = caixasDoModulo(m, 0, c, linhas);
  const info = MODELOS[m.modelo];
  if (info.fila === "baixo" && !info.alto && m.modelo !== "vazio") caixas.push({ id: "tampo", x0: 0, x1: m.w, y0: 0, y1: M.fundoTampo, z0: M.rodape + M.corpo, z1: T, cor: produto(c.tampo)?.hex ?? "#c79a6a", camada: 2 });
  const zs = caixas.flatMap((b) => [b.z0, b.z1]);
  const zMeio = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 50;
  return { caixas, linhas, planos: [], alvo: [m.w / 2, 30, zMeio], raio: 400 };
}

export { puxadores };
