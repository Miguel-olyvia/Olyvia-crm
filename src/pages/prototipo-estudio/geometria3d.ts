// 5/11 (Rúben: «a planta está em 2D… vira para 3D e diz: é isto que você queria»). Um 3D simples e sem bibliotecas: a planta do depois em
// volume (o chão, as paredes com a cor do revestimento, cada peça como uma caixa com a cor e a altura do produto), vista de cima e de
// lado, a rodar com o dedo. As paredes da frente ficam cortadas para se ver lá dentro. Aqui só a geometria; o desenho é Vista3D.tsx (o nome é outro porque o Windows não distingue maiúsculas).
import type { Ponto } from "@/emylia/planta";

/** `naParede`: está numa parede (porta, janela, espelho, toalheiro): nas paredes da frente, cortadas, também se corta. */
/** `rot`: graus em torno do centro (x, y, w, h é a caixa sem rodar), como as peças da planta (planta.ts). */
export interface Caixa { id: string; x: number; y: number; w: number; h: number; z0: number; z1: number; cor: string; nome: string; vidro?: boolean; naParede?: boolean; rot?: number }
export interface Cena { chao: Ponto[]; altura: number; corParede: string; corChao: string; caixas: Caixa[] }
export interface Face { pts: [number, number][]; cor: string; prof: number; tipo: "chao" | "parede" | "peca"; id?: string; nome?: string; opacidade?: number }

/** Mistura uma cor com branco (f > 1) ou com preto (f < 1). */
export function sombrear(hex: string, f: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f));
  return `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

/** A luz vem de cima à esquerda, de trás: cada lado tem a sua sombra. */
const luz = (nx: number, ny: number) => 0.78 + 0.22 * (-0.6 * nx - 0.8 * ny);

/**
 * Projeta a cena: `rumo` roda à volta do centro (radianos), `inclinacao` é o ângulo de cima (0 de lado, π/2 de cima). Volta as faces já
 * pela ordem de desenho (as de trás primeiro) e o retângulo que ocupam.
 */
export function projetar(cena: Cena, rumo: number, inclinacao: number, cortar = true): { faces: Face[]; caixa: { x: number; y: number; w: number; h: number } } {
  const xs = cena.chao.map((p) => p.x), ys = cena.chao.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cr = Math.cos(rumo), sr = Math.sin(rumo), si = Math.sin(inclinacao), ci = Math.cos(inclinacao);
  const rod = (x: number, y: number) => { const dx = x - cx, dy = y - cy; return { xr: dx * cr - dy * sr, yr: dx * sr + dy * cr }; };
  const ecra = (x: number, y: number, z: number): [number, number] => { const { xr, yr } = rod(x, y); return [xr, yr * si - z * ci]; };
  const perto = (x: number, y: number, z: number) => rod(x, y).yr * ci + z * si;
  const faces: Face[] = [];

  // o chão
  if (cena.chao.length >= 3) faces.push({ pts: cena.chao.map((p) => ecra(p.x, p.y, 0)), cor: cena.corChao, prof: -1e9, tipo: "chao" });

  // as paredes: as da frente ficam cortadas a 25 cm para se ver lá dentro
  const n = cena.chao.length;
  for (let i = 0; i < n; i++) {
    const a = cena.chao[i], z = cena.chao[(i + 1) % n];
    const mx = (a.x + z.x) / 2, my = (a.y + z.y) / 2;
    const frente = rod(mx, my).yr > 0;
    const h = cortar && frente ? Math.min(25, cena.altura) : cena.altura;
    // a normal para dentro da divisão (a planta anda no sentido dos ponteiros do relógio, com y para baixo)
    const len = Math.hypot(z.x - a.x, z.y - a.y) || 1;
    const nx = -(z.y - a.y) / len, ny = (z.x - a.x) / len;
    faces.push({
      pts: [ecra(a.x, a.y, 0), ecra(z.x, z.y, 0), ecra(z.x, z.y, h), ecra(a.x, a.y, h)],
      cor: sombrear(cena.corParede, luz(nx * cr - ny * sr, nx * sr + ny * cr)), prof: perto(mx, my, h / 2) - (frente ? 0 : 1e6), tipo: "parede",
      opacidade: cortar && frente ? 0.9 : 1,
    });
  }

  // as peças: o tampo e os lados virados para quem vê
  for (const caixaOriginal of cena.caixas) {
    let b = caixaOriginal;
    if (cortar && b.naParede && rod(b.x + b.w / 2, b.y + b.h / 2).yr > 0) {
      if (b.z0 >= 25) continue;
      b = { ...b, z1: Math.min(b.z1, 25) };
    }
    // 11/11: as peças rodadas (nas paredes em diagonal) rodam os cantos e as normais dos lados em torno do centro
    const ra = ((b.rot ?? 0) * Math.PI) / 180, rc = Math.cos(ra), rs = Math.sin(ra), mx = b.x + b.w / 2, my = b.y + b.h / 2;
    const girar = (x: number, y: number): [number, number] => [mx + (x - mx) * rc - (y - my) * rs, my + (x - mx) * rs + (y - my) * rc];
    const c = [girar(b.x, b.y), girar(b.x + b.w, b.y), girar(b.x + b.w, b.y + b.h), girar(b.x, b.y + b.h)] as const;
    const lados: { i: number; j: number; nx: number; ny: number }[] = [
      { i: 0, j: 1, nx: 0, ny: -1 }, { i: 1, j: 2, nx: 1, ny: 0 }, { i: 2, j: 3, nx: 0, ny: 1 }, { i: 3, j: 0, nx: -1, ny: 0 },
    ].map((l) => ({ ...l, nx: l.nx * rc - l.ny * rs, ny: l.nx * rs + l.ny * rc }));
    for (const l of lados) {
      const nyr = l.nx * sr + l.ny * cr; // a normal rodada: > 0 está virada para quem vê
      if (nyr <= 0.001) continue;
      const [x1, y1] = c[l.i], [x2, y2] = c[l.j];
      faces.push({
        pts: [ecra(x1, y1, b.z0), ecra(x2, y2, b.z0), ecra(x2, y2, b.z1), ecra(x1, y1, b.z1)],
        cor: sombrear(b.cor, luz(l.nx * cr - l.ny * sr, nyr) * 0.92), prof: perto((x1 + x2) / 2, (y1 + y2) / 2, (b.z0 + b.z1) / 2), tipo: "peca", id: b.id, nome: b.nome,
        opacidade: b.vidro ? 0.45 : 1,
      });
    }
    faces.push({ pts: c.map(([x, y]) => ecra(x, y, b.z1)), cor: sombrear(b.cor, 1.08), prof: perto(b.x + b.w / 2, b.y + b.h / 2, b.z1) + 0.5, tipo: "peca", id: b.id, nome: b.nome, opacidade: b.vidro ? 0.45 : 1 });
  }

  faces.sort((f, g) => f.prof - g.prof);
  const todos = faces.flatMap((f) => f.pts);
  const sx = todos.map((p) => p[0]), sy = todos.map((p) => p[1]);
  const x = Math.min(...sx), y = Math.min(...sy);
  return { faces, caixa: { x, y, w: Math.max(1, Math.max(...sx) - x), h: Math.max(1, Math.max(...sy) - y) } };
}
