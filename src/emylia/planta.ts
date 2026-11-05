// 5/11 (Rúben, a visita real: «reconstruir tudo o que está em papel, a planta da área»). A planta da divisão como a comercial a desenha
// na folha: as paredes à volta, cada uma com o comprimento em cm, e as peças lá dentro (base, sanita, móvel, porta…). Daqui saem os m²
// do chão e das paredes para as medidas. Só geometria (sem ecrã): cantos retos, começa no canto de cima à esquerda e anda para a direita.

export type Vira = "dir" | "esq";
/** Uma parede: o comprimento (cm) e para onde se vira no fim dela. */
export interface Parede { c: number; vira: Vira }
export type TipoPeca = "base" | "banheira" | "sanita" | "bide" | "movel" | "coluna" | "porta" | "janela";
/** Uma peça na planta: o canto de cima à esquerda e o tamanho, em cm. */
export interface PecaPlanta { id: string; tipo: TipoPeca; x: number; y: number; w: number; h: number }
export interface Planta { paredes: Parede[]; pecas: PecaPlanta[] }
export interface Ponto { x: number; y: number }

export const PECAS: Record<TipoPeca, { n: string; w: number; h: number; abertura?: boolean }> = {
  base: { n: "Base de duche", w: 120, h: 70 },
  banheira: { n: "Banheira", w: 170, h: 70 },
  sanita: { n: "Sanita", w: 36, h: 55 },
  bide: { n: "Bidé", w: 36, h: 55 },
  movel: { n: "Móvel", w: 80, h: 45 },
  coluna: { n: "Móvel coluna", w: 35, h: 35 },
  porta: { n: "Porta", w: 80, h: 8, abertura: true },
  janela: { n: "Janela", w: 100, h: 8, abertura: true },
};
/** O que uma porta e uma janela tiram às paredes, em m² (a altura de sempre: porta 2 m, janela 1 m). */
const ALTURA_ABERTURA: Partial<Record<TipoPeca, number>> = { porta: 2, janela: 1 };

export const retangulo = (largura: number, fundo: number): Parede[] =>
  [largura, fundo, largura, fundo].map((c) => ({ c, vira: "dir" as const }));

/** Em L: o retângulo de fora com um canto cortado em baixo à direita (o corte com a sua largura e altura). */
export function emL(largura: number, fundo: number, corteL: number, corteF: number): Parede[] {
  return [
    { c: largura, vira: "dir" }, { c: Math.max(0, fundo - corteF), vira: "dir" }, { c: corteL, vira: "esq" },
    { c: corteF, vira: "dir" }, { c: Math.max(0, largura - corteL), vira: "dir" }, { c: fundo, vira: "dir" },
  ];
}

/** Os cantos, a começar em (0,0) a andar para a direita; y cresce para baixo. Volta n+1 pontos (o último é onde a última parede acaba). */
export function cantos(paredes: readonly Parede[]): Ponto[] {
  let x = 0, y = 0, dx = 1, dy = 0;
  const pts: Ponto[] = [{ x, y }];
  for (const p of paredes) {
    x += dx * p.c; y += dy * p.c;
    pts.push({ x, y });
    [dx, dy] = p.vira === "dir" ? [-dy, dx] : [dy, -dx];
  }
  return pts;
}

/** Quanto falta para a última parede chegar ao início (cm); 0 quando fecha. */
export function faltaFechar(paredes: readonly Parede[]): number {
  const pts = cantos(paredes), f = pts[pts.length - 1];
  return paredes.length < 3 ? Infinity : Math.round(Math.hypot(f.x, f.y));
}

/** Área do chão em m² (só quando a planta fecha, com 1 cm de folga). */
export function areaChaoM2(paredes: readonly Parede[]): number | null {
  if (faltaFechar(paredes) > 1) return null;
  const pts = cantos(paredes).slice(0, -1);
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return Math.round((Math.abs(a) / 2 / 10000) * 100) / 100;
}

export const perimetroM = (paredes: readonly Parede[]): number => Math.round(paredes.reduce((s, p) => s + p.c, 0)) / 100;

/** Área das paredes em m²: perímetro × pé-direito, menos as portas e as janelas que estão na planta. */
export function areaParedesM2(planta: Planta, peDireitoM: number): number | null {
  if (areaChaoM2(planta.paredes) === null || !(peDireitoM > 0)) return null;
  const aberturas = planta.pecas.reduce((s, p) => s + (Math.max(p.w, p.h) / 100) * (ALTURA_ABERTURA[p.tipo] ?? 0), 0);
  return Math.round(Math.max(0, perimetroM(planta.paredes) * peDireitoM - aberturas) * 100) / 100;
}

/** O pé-direito do campo da visita («2,6 m», «3 m ou mais»); sem resposta, null. */
export function peDireitoDoCampo(v: string | undefined): number | null {
  const m = (v ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** O retângulo que contém a planta (para o desenho). */
export function limites(paredes: readonly Parede[]): { x: number; y: number; w: number; h: number } {
  const pts = cantos(paredes);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(0, ...xs), y = Math.min(0, ...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

export const PLANTA_VAZIA: Planta = { paredes: retangulo(200, 150), pecas: [] };

/** Lê a planta gravada no negócio (JSON em `f.planta`); o que não se perceber volta à planta vazia. */
export function lerPlanta(json: string | undefined): Planta | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json) as Partial<Planta>;
    const paredes = (Array.isArray(p.paredes) ? p.paredes : [])
      .filter((x): x is Parede => !!x && Number.isFinite(x.c) && x.c >= 0 && (x.vira === "dir" || x.vira === "esq"));
    const pecas = (Array.isArray(p.pecas) ? p.pecas : [])
      .filter((x): x is PecaPlanta => !!x && typeof x.id === "string" && x.tipo in PECAS && [x.x, x.y, x.w, x.h].every(Number.isFinite));
    return paredes.length >= 3 ? { paredes, pecas } : null;
  } catch {
    return null;
  }
}
export const gravarPlanta = (p: Planta): string => JSON.stringify(p);

/** Junta uma peça ao meio da planta (o comercial arrasta-a depois para o sítio). */
export function juntarPeca(p: Planta, tipo: TipoPeca, id: string): Planta {
  const b = limites(p.paredes), { w, h } = PECAS[tipo];
  return { ...p, pecas: [...p.pecas, { id, tipo, w, h, x: Math.round(b.x + (b.w - w) / 2), y: Math.round(b.y + (b.h - h) / 2) }] };
}
