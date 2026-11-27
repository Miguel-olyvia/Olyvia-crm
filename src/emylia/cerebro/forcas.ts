// 27/11: a disposição do grafo do Cérebro, por forças (como o Obsidian): os nós repelem-se, as ligações puxam como molas e tudo cai
// devagar para o centro. Feita aqui (sem biblioteca nova, sem eval: a CSP da app não o deixa) e determinística (os testes repetem-se).
// Para até ~400 nós chega o cálculo direto par a par.

export interface Corpo {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  /** o raio (o desenho) */
  r: number;
  /** 27/11: o raio das colisões (o nó e o nome escrito ao lado) e o peso da repulsão (os temas afastam mais) */
  c: number; w: number;
  /** preso (a ser arrastado) */
  fx?: number | null; fy?: number | null;
}
interface Mola { a: number; b: number; comprimento: number; forca: number }

export interface OpcoesForcas {
  /** a repulsão entre os nós */
  carga?: number;
  /** o comprimento de repouso das ligações */
  comprimento?: number;
  /** a força para o centro */
  gravidade?: number;
}

const ANGULO_DOURADO = Math.PI * (3 - Math.sqrt(5));

export class Simulacao {
  corpos: Corpo[];
  private molas: Mola[];
  private carga: number;
  private gravidade: number;
  alpha = 1;
  alphaAlvo = 0;
  private readonly alphaMin = 0.004;
  private readonly decaimento = 1 - Math.pow(0.004, 1 / 300);
  private readonly atrito = 0.55;

  constructor(nos: { id: string; r: number; folga?: number; peso?: number }[], ligacoes: { de: string; para: string }[], op: OpcoesForcas = {}, antes?: Map<string, { x: number; y: number }>) {
    this.carga = op.carga ?? 38;
    this.gravidade = op.gravidade ?? 0.035;
    const L = op.comprimento ?? 46;
    // posições iniciais em espiral (phyllotaxis, como o d3), ou as de antes quando os dados se atualizam
    this.corpos = nos.map((n, i) => {
      const p = antes?.get(n.id);
      const c = n.r + (n.folga ?? 0), w = n.peso ?? 1;
      if (p) return { id: n.id, x: p.x, y: p.y, vx: 0, vy: 0, r: n.r, c, w };
      const raio = 12 * Math.sqrt(0.5 + i), ang = i * ANGULO_DOURADO;
      return { id: n.id, x: raio * Math.cos(ang), y: raio * Math.sin(ang), vx: 0, vy: 0, r: n.r, c, w };
    });
    const idx = new Map(this.corpos.map((c, i) => [c.id, i]));
    const grau = new Map<number, number>();
    const M: Mola[] = [];
    for (const e of ligacoes) {
      const a = idx.get(e.de), b = idx.get(e.para);
      if (a == null || b == null || a === b) continue;
      M.push({ a, b, comprimento: L, forca: 0 });
      grau.set(a, (grau.get(a) ?? 0) + 1); grau.set(b, (grau.get(b) ?? 0) + 1);
    }
    // como o d3: a mola é mais fraca nos nós com muitas ligações (os temas não esmagam o grafo)
    for (const m of M) {
      m.forca = 1 / Math.min(grau.get(m.a) ?? 1, grau.get(m.b) ?? 1);
      m.comprimento = L + (this.corpos[m.a].r + this.corpos[m.b].r);
    }
    this.molas = M;
  }

  /** Um passo da simulação. Devolve o alpha (abaixo de alphaMin, parou). */
  passo(): number {
    const C = this.corpos, n = C.length, a = this.alpha;
    // repulsão (e colisão suave)
    for (let i = 0; i < n; i++) {
      const p = C[i];
      for (let j = i + 1; j < n; j++) {
        const q = C[j];
        let dx = q.x - p.x, dy = q.y - p.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) { dx = ((i * 7 + j * 13) % 10) / 10 - 0.5 || 0.3; dy = ((i * 11 + j * 3) % 10) / 10 - 0.5 || -0.3; d2 = dx * dx + dy * dy; }
        if (d2 > 640000) continue; // longe demais para contar
        const d = Math.sqrt(d2);
        // como o d3 (forceManyBody): a força cai com a distância (1/d)
        let f = (this.carga * a * Math.sqrt(p.w * q.w)) / Math.max(d, 6);
        // a colisão (com o nome): empurra o que falta para não se tocarem
        const toque = p.c + q.c + 4;
        if (d < toque) f += (toque - d) * 0.3;
        const ux = (dx / d) * f, uy = (dy / d) * f;
        p.vx -= ux; p.vy -= uy; q.vx += ux; q.vy += uy;
      }
    }
    // molas
    for (const m of this.molas) {
      const p = C[m.a], q = C[m.b];
      const dx = q.x + q.vx - p.x - p.vx, dy = q.y + q.vy - p.y - p.vy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = ((d - m.comprimento) / d) * a * m.forca * 0.7;
      const ux = dx * k, uy = dy * k;
      q.vx -= ux * 0.5; q.vy -= uy * 0.5; p.vx += ux * 0.5; p.vy += uy * 0.5;
    }
    // gravidade para o centro, atrito e mexer
    for (const c of C) {
      c.vx -= c.x * this.gravidade * a;
      c.vy -= c.y * this.gravidade * a;
      if (c.fx != null && c.fy != null) { c.x = c.fx; c.y = c.fy; c.vx = 0; c.vy = 0; continue; }
      c.vx *= this.atrito; c.vy *= this.atrito;
      c.x += c.vx; c.y += c.vy;
    }
    this.alpha += (this.alphaAlvo - this.alpha) * this.decaimento;
    return this.alpha;
  }

  get parada(): boolean { return this.alpha < this.alphaMin && this.alphaAlvo === 0; }

  /** Volta a aquecer (ao arrastar, ou quando os dados mudam). */
  aquecer(alpha = 0.3): void { this.alpha = Math.max(this.alpha, alpha); }

  /** Corre n passos de seguida (a disposição inicial, antes de desenhar). */
  correr(n: number): void { for (let i = 0; i < n && !this.parada; i++) this.passo(); }

  corpo(id: string): Corpo | undefined { return this.corpos.find((c) => c.id === id); }

  /** O retângulo que contém todos os nós (para enquadrar). */
  limites(): { x0: number; y0: number; x1: number; y1: number } {
    if (!this.corpos.length) return { x0: -100, y0: -100, x1: 100, y1: 100 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.corpos) { x0 = Math.min(x0, c.x - c.r); y0 = Math.min(y0, c.y - c.r); x1 = Math.max(x1, c.x + c.r); y1 = Math.max(y1, c.y + c.r); }
    return { x0, y0, x1, y1 };
  }
}

/** O raio de um nó pelo número de ligações (os temas e as obras com muita coisa crescem). */
export const raioDoNo = (grau: number, base = 5) => base + Math.min(14, Math.sqrt(grau) * 2.2);

/** O enquadramento (zoom e deslocação) para o retângulo caber na janela com margem. */
export function enquadrar(l: { x0: number; y0: number; x1: number; y1: number }, largura: number, altura: number, margem = 40): { k: number; x: number; y: number } {
  const w = Math.max(1, l.x1 - l.x0), h = Math.max(1, l.y1 - l.y0);
  const k = Math.max(0.2, Math.min(2.2, Math.min((largura - 2 * margem) / w, (altura - 2 * margem) / h)));
  return { k, x: largura / 2 - k * (l.x0 + w / 2), y: altura / 2 - k * (l.y0 + h / 2) };
}

/** 27/11: o corpo de cada nó do Cérebro. Os nós com o nome sempre escrito (temas, agentes, obras, o resumo) ocupam mais espaço, para os
 *  nomes não se tocarem; os temas afastam mais (são os centros dos grupos). */
export function corpoDoNo(n: { id: string; tipo: string; grau: number }): { id: string; r: number; folga: number; peso: number } {
  if (n.tipo === "tema") return { id: n.id, r: raioDoNo(n.grau, 9), folga: 26, peso: 4 };
  if (n.tipo === "agente") return { id: n.id, r: 11, folga: 20, peso: 1.6 };
  if (n.tipo === "obra" || n.tipo === "resumo") return { id: n.id, r: raioDoNo(n.grau), folga: 18, peso: 1.4 };
  return { id: n.id, r: raioDoNo(n.grau), folga: 2, peso: 1 };
}
