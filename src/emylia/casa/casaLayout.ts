// 28/11 (Rúben, Schroeder: «é a casa toda, tem sala, cozinha, casa de banho etc. precisamos de ter tudo. uma planta 3d muito mais
// completa, em que conseguimos ter a casa toda, ou ver em destaque e isolado cada área de intervenção»). Escolhido: «Áreas encaixadas».
// Cada área desenha-se no seu Estúdio (a planta e o projeto dela); aqui só se diz onde fica na casa: a posição (cm) e a rotação
// (de 90 em 90°). Fica no negócio (f.casa_layout), pelo nome da área (o prefixo muda quando a principal muda; o nome não).
// Uma área sem lugar entra à direita das que já o têm. Ao largar, encaixa nas paredes das outras (até 30 cm).
import { cantos, faltaFechar, areaChaoM2, type PecaPlanta, type Planta, type Ponto } from "../planta";

export type Rotacao = 0 | 90 | 180 | 270;
export interface LugarArea { x: number; y: number; r?: Rotacao }
export type LayoutCasa = Record<string, LugarArea>;

/** A chave de uma área no layout (o nome, sem acentos nem maiúsculas). */
export const chaveDaArea = (nome: string): string => nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const ROT = new Set([0, 90, 180, 270]);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
export function lerLayout(json: string | undefined): LayoutCasa {
  try {
    const x = JSON.parse(json ?? "");
    if (!x || typeof x !== "object") return {};
    const out: LayoutCasa = {};
    for (const [k, v] of Object.entries(x as Record<string, { x?: unknown; y?: unknown; r?: unknown }>)) {
      const px = num(v?.x), py = num(v?.y);
      if (px === null || py === null) continue;
      out[k] = { x: px, y: py, ...(ROT.has(v?.r as number) && v.r ? { r: v.r as Rotacao } : {}) };
    }
    return out;
  } catch { return {}; }
}
export const gravarLayout = (l: LayoutCasa): string => JSON.stringify(l);

/** Uma área já rodada e encostada a (0,0): o contorno, as peças (as caixas rodadas) e a largura e a altura (cm). */
export interface FormaArea { pts: Ponto[]; fecha: boolean; pecas: (PecaPlanta & { cx: number; cy: number; rw: number; rh: number })[]; w: number; h: number }

const rodar = (q: Ponto, r: Rotacao): Ponto => (r === 90 ? { x: -q.y, y: q.x } : r === 180 ? { x: -q.x, y: -q.y } : r === 270 ? { x: q.y, y: -q.x } : { x: q.x, y: q.y });

/** A forma da planta de uma área, rodada `r` e encostada a (0,0). Sem paredes, uma caixa de 200 × 200 (a área ainda por desenhar). */
export function formaDaArea(pl: Planta | null, r: Rotacao = 0): FormaArea {
  if (!pl || pl.paredes.length < 2) return { pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }], fecha: false, pecas: [], w: 200, h: 200 };
  const fecha = faltaFechar(pl.paredes) <= 1;
  const base = cantos(pl.paredes, pl.o);
  const pts0 = (fecha ? base.slice(0, -1) : base).map((q) => rodar(q, r));
  const pecas0 = pl.pecas.map((pc) => {
    const c = rodar({ x: pc.x + pc.w / 2, y: pc.y + pc.h / 2 }, r), vira = r === 90 || r === 270;
    return { ...pc, cx: c.x, cy: c.y, rw: vira ? pc.h : pc.w, rh: vira ? pc.w : pc.h };
  });
  const xs = [...pts0.map((q) => q.x), ...pecas0.flatMap((p) => [p.cx - p.rw / 2, p.cx + p.rw / 2])];
  const ys = [...pts0.map((q) => q.y), ...pecas0.flatMap((p) => [p.cy - p.rh / 2, p.cy + p.rh / 2])];
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return {
    pts: pts0.map((q) => ({ x: q.x - x0, y: q.y - y0 })), fecha,
    pecas: pecas0.map((p) => ({ ...p, cx: p.cx - x0, cy: p.cy - y0 })),
    w: Math.max(1, Math.max(...xs) - x0), h: Math.max(1, Math.max(...ys) - y0),
  };
}

export interface AreaNaCasa { chave: string; nome: string; forma: FormaArea; lugar: LugarArea; m2: number | null }
/** O espaço entre uma área nova e as outras (cm). */
export const FOLGA = 60;

/** As áreas com o seu lugar: as que não têm lugar entram numa fila à direita das que têm. */
export function arrumarCasa(areas: readonly { nome: string; planta: Planta | null }[], L: LayoutCasa): AreaNaCasa[] {
  const out: AreaNaCasa[] = [];
  const comLugar = areas.filter((a) => L[chaveDaArea(a.nome)]);
  let x = 0;
  for (const a of comLugar) {
    const lg = L[chaveDaArea(a.nome)], f = formaDaArea(a.planta, lg.r ?? 0);
    x = Math.max(x, lg.x + f.w + FOLGA);
  }
  const porNome = new Map<string, AreaNaCasa>();
  for (const a of areas) {
    const k = chaveDaArea(a.nome), lg0 = L[k];
    const forma = formaDaArea(a.planta, lg0?.r ?? 0);
    const lugar = lg0 ?? { x, y: 0 };
    if (!lg0) x += forma.w + FOLGA;
    porNome.set(k, { chave: k, nome: a.nome, forma, lugar, m2: a.planta ? areaChaoM2(a.planta.paredes) : null });
  }
  for (const a of areas) out.push(porNome.get(chaveDaArea(a.nome))!);
  return out;
}

export interface Caixa { x: number; y: number; w: number; h: number }
export const caixaDe = (a: Pick<AreaNaCasa, "forma" | "lugar">): Caixa => ({ x: a.lugar.x, y: a.lugar.y, w: a.forma.w, h: a.forma.h });

/** O retângulo da casa toda (cm). */
export function limitesCasa(areas: readonly Pick<AreaNaCasa, "forma" | "lugar">[]): Caixa {
  if (!areas.length) return { x: 0, y: 0, w: 400, h: 300 };
  const cs = areas.map(caixaDe);
  const x = Math.min(...cs.map((c) => c.x)), y = Math.min(...cs.map((c) => c.y));
  return { x, y, w: Math.max(...cs.map((c) => c.x + c.w)) - x, h: Math.max(...cs.map((c) => c.y + c.h)) - y };
}

/** O lugar ao largar: de 5 em 5 cm, e encostado às paredes das outras quando passa a menos de `tol` cm delas (por fora, lado a lado,
 *  ou alinhado pelo mesmo lado). */
export function encaixar(m: Caixa, outras: readonly Caixa[], tol = 30): { x: number; y: number } {
  const melhor = (atual: number, alvos: number[]) => {
    let r = atual, d = tol + 1;
    for (const a of alvos) { const e = Math.abs(a - atual); if (e < d) { d = e; r = a; } }
    return d <= tol ? r : Math.round(atual / 5) * 5;
  };
  // só se encosta a quem está perto no outro eixo (sobrepõe-se, ou quase)
  const pertoY = outras.filter((o) => m.y < o.y + o.h + tol && m.y + m.h > o.y - tol);
  const pertoX = outras.filter((o) => m.x < o.x + o.w + tol && m.x + m.w > o.x - tol);
  const x = melhor(m.x, pertoY.flatMap((o) => [o.x + o.w, o.x - m.w, o.x, o.x + o.w - m.w]));
  const y = melhor(m.y, pertoX.flatMap((o) => [o.y + o.h, o.y - m.h, o.y, o.y + o.h - m.h]));
  return { x, y };
}

/** A rotação seguinte (90° no sentido dos ponteiros). */
export const rodarMais = (r: Rotacao | undefined): Rotacao => (((r ?? 0) + 90) % 360) as Rotacao;

/** A área total do chão das áreas desenhadas (m²), ou null sem nenhuma fechada. */
export function areaTotal(areas: readonly Pick<AreaNaCasa, "m2">[]): number | null {
  const ms = areas.map((a) => a.m2).filter((x): x is number => x !== null);
  return ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}
