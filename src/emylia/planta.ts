// 5/11 (Rúben, a visita real: «reconstruir tudo o que está em papel, a planta da área»; e depois: «o desenho deve ser simples: desenhar no
// ecrã as retas com as medidas em overlay e depois arrastar as coisas»). A planta da divisão como a comercial a desenha na folha: paredes
// retas (só na horizontal ou na vertical), cada uma com o comprimento em cm, e as peças lá dentro (base, sanita, banheira…). Daqui saem os
// m² do chão e das paredes para as medidas. Só geometria e regras do desenho (sem ecrã). Tudo em cm; x para a direita, y para baixo.

/** Para onde vai a parede: este (direita), sul (baixo), oeste (esquerda), norte (cima). 9/11 (Rúben, a visita real: «paredes na planta
 *  diagonais»): e as quatro diagonais a 45°, para os cantos cortados (NE = para a direita e para cima). */
export type Rumo = "E" | "S" | "W" | "N" | "NE" | "SE" | "SW" | "NW";
export const RUMOS: readonly Rumo[] = ["E", "S", "W", "N", "NE", "SE", "SW", "NW"];
export const ehDiagonal = (r: Rumo) => r.length === 2;
export interface Parede { c: number; r: Rumo }
export type TipoPeca = "base" | "banheira" | "sanita" | "bide" | "movel" | "coluna" | "espelho" | "toalheiro" | "porta" | "janela"
  // 6/11 (Rúben: «adicionar também coisas para cozinha»)
  | "bancada" | "lava" | "placa" | "forno" | "frigorifico" | "maquina" | "exaustor" | "armario";
/** Uma peça na planta: o canto de cima à esquerda e o tamanho, em cm. */
// 9/11: os campos do 3D do Miguel (planta3d/) entram na peça; o Estúdio e a Visita ignoram os que não usam.
export interface PecaPlanta { id: string; tipo: TipoPeca; x: number; y: number; w: number; h: number; /** Protótipo 3D: o id do produto do catálogo que esta peça é (planta3d/). Sem ele, é uma peça genérica. */ produto?: string;
  /** Protótipo 3D (planta3d/pecas3d.ts): `x`,`y`,`w`,`h` são a caixa SEM rodar (largura ao longo da parede × profundidade) e `rot` o ângulo (graus, em torno do centro; 0 = frente para baixo). Sem `rot`, é uma peça do desenho antigo (caixa já orientada). */
  rot?: number; /** altura ao chão (cm), peças de parede */ alt?: number; mont?: "chao" | "parede"; esp?: boolean; nome?: string; /** altura da peça (cm) */ dh?: number;
  /** Famílias e conjuntos (planta3d/familias.ts, conjuntos.ts): a família, a medida e o acabamento escolhidos (variante). */
  fam?: string; med?: string; acab?: string;
  /** Conjunto: a instância, a definição, o papel do componente, se é a âncora, o lugar local (cm) na âncora, se foi retirado, se não tem geometria. */
  conj?: string; conjId?: string; papel?: string; ancora?: boolean; lx?: number; ly?: number; ret?: boolean; semGeo?: boolean;
  /** Opções da peça (por exemplo a montagem de um lava-loiça: por baixo ou por cima). */
  opc?: import("./planta3d/modelo").OpcoesPeca;
  /** Bancada composta (planta3d/bancada.ts): a chapa, os equipamentos e as posições, como na aba «Bancadas» do catálogo 3D. `w`/`h` = comprimento/profundidade. */
  banc?: import("./planta3d/bancada").ConfigBancada;
  /** Composição modular de cozinha (planta3d/composicaoCozinha.ts): a fila de módulos. `w` = a soma das larguras. */
  coz?: import("./planta3d/composicaoCozinha").ComposicaoCozinha }
export interface Ponto { x: number; y: number }
/** `o`: onde começa a primeira parede (o primeiro toque no desenho). */
export interface Planta { o: Ponto; paredes: Parede[]; pecas: PecaPlanta[] }

export const PECAS: Record<TipoPeca, { n: string; w: number; h: number; abertura?: boolean }> = {
  base: { n: "Base de duche", w: 120, h: 70 },
  banheira: { n: "Banheira", w: 170, h: 70 },
  sanita: { n: "Sanita", w: 36, h: 55 },
  bide: { n: "Bidé", w: 36, h: 55 },
  movel: { n: "Móvel", w: 80, h: 45 },
  coluna: { n: "Móvel coluna", w: 35, h: 35 },
  espelho: { n: "Espelho", w: 80, h: 4 },
  toalheiro: { n: "Toalheiro", w: 50, h: 6 },
  porta: { n: "Porta", w: 80, h: 8, abertura: true },
  janela: { n: "Janela", w: 100, h: 8, abertura: true },
  bancada: { n: "Bancada", w: 120, h: 60 },
  lava: { n: "Lava-loiça", w: 80, h: 50 },
  placa: { n: "Placa", w: 60, h: 52 },
  forno: { n: "Forno", w: 60, h: 56 },
  frigorifico: { n: "Frigorífico", w: 60, h: 65 },
  maquina: { n: "Máquina da loiça", w: 60, h: 60 },
  exaustor: { n: "Exaustor", w: 60, h: 45 },
  armario: { n: "Armário alto", w: 60, h: 60 },
};
/** 6/11: as peças de cada divisão (a barra da planta e os produtos a juntar). */
export const TIPOS_WC: TipoPeca[] = ["base", "banheira", "sanita", "bide", "movel", "coluna", "espelho", "toalheiro"];
export const TIPOS_COZINHA: TipoPeca[] = ["bancada", "lava", "placa", "forno", "frigorifico", "maquina", "exaustor", "armario"];
export const ehCozinha = (divisao?: string) => /cozinha/i.test(divisao ?? "");
export const tiposDaDivisao = (divisao?: string): TipoPeca[] => (ehCozinha(divisao) ? TIPOS_COZINHA : TIPOS_WC);
/** O que uma porta e uma janela tiram às paredes, em m² (a altura de sempre: porta 2 m, janela 1 m). */
const ALTURA_ABERTURA: Partial<Record<TipoPeca, number>> = { porta: 2, janela: 1 };
const R2 = Math.SQRT1_2;
const VETOR: Record<Rumo, Ponto> = {
  E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 }, N: { x: 0, y: -1 },
  NE: { x: R2, y: -R2 }, SE: { x: R2, y: R2 }, SW: { x: -R2, y: R2 }, NW: { x: -R2, y: -R2 },
};
const DIREITA: Record<Rumo, Rumo> = { E: "S", S: "W", W: "N", N: "E", NE: "SE", SE: "SW", SW: "NW", NW: "NE" };
const ESQUERDA: Record<Rumo, Rumo> = { E: "N", N: "W", W: "S", S: "E", NE: "NW", NW: "SW", SW: "SE", SE: "NE" };
const OPOSTO: Record<Rumo, Rumo> = { E: "W", W: "E", N: "S", S: "N", NE: "SW", SW: "NE", SE: "NW", NW: "SE" };
/** As coordenadas com uma casa decimal (as diagonais dão raízes de 2; assim os cantos não acumulam erros). */
const dec = (n: number) => Math.round(n * 10) / 10;
/** As peças andam e as paredes desenham-se de 5 em 5 cm. */
export const PASSO = 5;
/** Uma parede mais curta do que isto foi um toque, não um traço. */
const MINIMO = 10;
/** A esta distância do canto de partida, o traço fecha a planta. */
const ATRACAO = 25;

const ORIGEM: Ponto = { x: 0, y: 0 };
const arred = (n: number) => Math.round(n / PASSO) * PASSO;

export const retangulo = (largura: number, fundo: number): Parede[] =>
  [{ c: largura, r: "E" }, { c: fundo, r: "S" }, { c: largura, r: "W" }, { c: fundo, r: "N" }];

/** Em L: o retângulo de fora com um canto cortado em baixo à direita (o corte com a sua largura e altura). */
export function emL(largura: number, fundo: number, corteL: number, corteF: number): Parede[] {
  return [
    { c: largura, r: "E" }, { c: Math.max(0, fundo - corteF), r: "S" }, { c: corteL, r: "W" },
    { c: corteF, r: "S" }, { c: Math.max(0, largura - corteL), r: "W" }, { c: fundo, r: "N" },
  ];
}

/** Paredes dadas por viragens (a folha lida pelo Gemini: a 1.ª para a direita, e no fim de cada uma vira-se à direita ou à esquerda). */
export function deViragens(lista: readonly { c: number; vira: string }[]): Parede[] {
  let r: Rumo = "E";
  return lista.map((p) => { const parede = { c: p.c, r }; r = p.vira === "esq" ? ESQUERDA[r] : DIREITA[r]; return parede; });
}

/** Os cantos, a começar em `o`. Volta n+1 pontos (o último é onde a última parede acaba). */
export function cantos(paredes: readonly Parede[], o: Ponto = ORIGEM): Ponto[] {
  const pts: Ponto[] = [{ ...o }];
  for (const p of paredes) { const u = pts[pts.length - 1], v = VETOR[p.r]; pts.push({ x: dec(u.x + v.x * p.c), y: dec(u.y + v.y * p.c) }); }
  return pts;
}

/** Quanto falta para a última parede chegar ao início (cm); 0 quando fecha. */
export function faltaFechar(paredes: readonly Parede[]): number {
  if (paredes.length < 3) return Infinity;
  const f = cantos(paredes)[paredes.length];
  return Math.round(Math.hypot(f.x, f.y));
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

/** 11/11: os quatro cantos de uma peça na planta: a caixa, rodada `rot` graus em torno do centro (sem `rot`, a caixa como está).
 *  `recuo` encolhe a caixa (cm) antes de rodar (para os alertas não contarem um toque como sobreposição). */
export function cantosDaPeca(pc: Pick<PecaPlanta, "x" | "y" | "w" | "h" | "rot">, recuo = 0): Ponto[] {
  const cx = pc.x + pc.w / 2, cy = pc.y + pc.h / 2, hw = Math.max(0, pc.w / 2 - recuo), hh = Math.max(0, pc.h / 2 - recuo);
  const a = ((pc.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
}
/** A caixa direita que contém a peça (rodada ou não). */
export function caixaDaPeca(pc: Pick<PecaPlanta, "x" | "y" | "w" | "h" | "rot">, recuo = 0): { x0: number; y0: number; x1: number; y1: number } {
  const q = cantosDaPeca(pc, recuo), xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** O retângulo que contém as paredes e as peças (para o desenho). */
export function limites(p: Planta): { x: number; y: number; w: number; h: number } {
  const pts = [...cantos(p.paredes, p.o), ...p.pecas.flatMap((x) => cantosDaPeca(x))];
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

/**
 * O traço do dedo, de `de` até `ate`, como parede reta, de 5 em 5 cm: na horizontal ou na vertical; 9/11, ou a 45° quando o traço vai
 * claramente em diagonal (entre 30° e 60°; um traço só um pouco torto continua reto). Perto do canto de partida (`inicio`), na mesma
 * direção, acaba nele. Um traço muito curto (um toque) não é parede.
 */
export function rumoDoTraco(dx: number, dy: number): Rumo {
  const ang = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI; // 0 = horizontal, 90 = vertical
  if (ang < 30) return dx >= 0 ? "E" : "W";
  if (ang > 60) return dy >= 0 ? "S" : "N";
  return ((dy < 0 ? "N" : "S") + (dx >= 0 ? "E" : "W")) as Rumo;
}
export function paredeDoTraco(de: Ponto, ate: Ponto, inicio?: Ponto): Parede | null {
  const dx = ate.x - de.x, dy = ate.y - de.y;
  const r = rumoDoTraco(dx, dy), v = VETOR[r];
  const ao = dx * v.x + dy * v.y; // quanto o dedo andou na direção da parede
  let c = arred(Math.max(0, ao));
  if (inicio) {
    // o canto de partida está nesta direção (a menos de 1,5 cm de lado) e perto de onde o dedo parou: a parede acaba nele
    const ix = inicio.x - de.x, iy = inicio.y - de.y, ateInicio = ix * v.x + iy * v.y, deLado = Math.abs(ix * v.y - iy * v.x);
    if (ateInicio > 0 && deLado < 1.5 && Math.abs(ateInicio - ao) <= ATRACAO) c = dec(ateInicio);
    // 9/11: numa reta, acabar alinhado com o canto de partida (a parede seguinte fecha a direito)
    else if (!ehDiagonal(r)) {
      const alinha = v.x !== 0 ? ix * v.x : iy * v.y;
      if (alinha >= MINIMO && Math.abs(alinha - c) <= ATRACAO * 0.6) c = dec(alinha);
    }
  }
  return c >= MINIMO ? { c, r } : null;
}

/** Juntar a parede: a seguir a uma no mesmo rumo, soma-se a ela (o dedo parou a meio de uma reta). 9/11 (a visita real: o dedo passou
 *  do canto e voltou para trás): no rumo contrário, desconta-se (e se voltar mais do que andou, a parede vira). */
export function juntarParede(paredes: readonly Parede[], nova: Parede): Parede[] {
  const ultima = paredes[paredes.length - 1];
  if (ultima && ultima.r === nova.r) return [...paredes.slice(0, -1), { ...ultima, c: dec(ultima.c + nova.c) }];
  if (ultima && OPOSTO[ultima.r] === nova.r) {
    const resto = dec(ultima.c - nova.c);
    if (Math.abs(resto) < MINIMO) return paredes.slice(0, -1);
    return [...paredes.slice(0, -1), resto > 0 ? { ...ultima, c: resto } : { c: -resto, r: nova.r }];
  }
  return [...paredes, nova];
}

/**
 * 9/11 (Rúben: «a criação de paredes é muito complicada no telemóvel»): fechar a planta com as paredes que faltam até ao canto de
 * partida. Se o canto está numa direção certa (reta ou a 45°), é uma parede; senão, duas: `primeiro` diz se fecha com cantos a 90°
 * («reto») ou com um canto cortado a 45° («diagonal»). Com menos de duas paredes, ou já fechada, nada.
 */
export function paredesParaFechar(p: { o: Ponto; paredes: readonly Parede[] }, primeiro: "reto" | "diagonal" = "reto"): Parede[] {
  if (p.paredes.length < 2 || faltaFechar(p.paredes) <= 1) return [];
  const pts = cantos(p.paredes, p.o), f = pts[pts.length - 1];
  const dx = dec(p.o.x - f.x), dy = dec(p.o.y - f.y), ax = Math.abs(dx), ay = Math.abs(dy);
  const sx: Rumo = dx >= 0 ? "E" : "W", sy: Rumo = dy >= 0 ? "S" : "N";
  if (ay < 1) return [{ c: ax, r: sx }];
  if (ax < 1) return [{ c: ay, r: sy }];
  const diag = (sy + sx) as Rumo;
  if (Math.abs(ax - ay) < 1) return [{ c: dec(Math.hypot(ax, ay)), r: diag }];
  if (primeiro === "diagonal") {
    // a diagonal primeiro, até ficar alinhado com o canto; depois a reta
    const m = Math.min(ax, ay), resto: Parede = ax > ay ? { c: dec(ax - m), r: sx } : { c: dec(ay - m), r: sy };
    return [{ c: dec(m * Math.SQRT2), r: diag }, resto];
  }
  // duas retas: começa pela que continua a última parede (completa o retângulo); nunca pela que volta para trás sobre ela
  const ultima = p.paredes[p.paredes.length - 1].r;
  const primeiroX = ultima === sx || (ultima !== sy && OPOSTO[ultima] !== sx);
  return primeiroX ? [{ c: ax, r: sx }, { c: ay, r: sy }] : [{ c: ay, r: sy }, { c: ax, r: sx }];
}

/** O rumo de um vetor (só os 8 de sempre: retas e 45°). */
const rumoDe = (x: number, y: number): Rumo =>
  Math.abs(x) < 0.01 ? (y > 0 ? "S" : "N") : Math.abs(y) < 0.01 ? (x > 0 ? "E" : "W") : (((y < 0 ? "N" : "S") + (x > 0 ? "E" : "W")) as Rumo);

/**
 * 9/11 (Rúben: «paredes na planta diagonais»): cortar o canto `k` (onde acaba a parede k-1 e começa a k) a 45°, `t` cm para cada lado.
 * As duas paredes encurtam `t` e entra entre elas uma diagonal. Só num canto entre duas retas a 90°, e com as paredes maiores do que o corte.
 */
export function cortarCanto(p: { o: Ponto; paredes: readonly Parede[] }, k: number, t: number): { o: Ponto; paredes: Parede[] } | null {
  const n = p.paredes.length;
  if (n < 3 || faltaFechar(p.paredes) > 1 || !(t >= MINIMO / 2)) return null;
  const ia = (k - 1 + n) % n, ib = k % n, a = p.paredes[ia], b = p.paredes[ib];
  if (ehDiagonal(a.r) || ehDiagonal(b.r) || a.r === b.r || OPOSTO[a.r] === b.r || a.c - t < 0 || b.c - t < 0) return null;
  const va = VETOR[a.r], vb = VETOR[b.r];
  const diag: Parede = { c: dec(t * Math.SQRT2), r: rumoDe(va.x + vb.x, va.y + vb.y) };
  const paredes = p.paredes.map((w) => ({ ...w }));
  paredes[ia] = { ...a, c: dec(a.c - t) };
  paredes[ib] = { ...b, c: dec(b.c - t) };
  // o canto 0 é o ponto de partida: a diagonal fica no fim e o ponto de partida anda para o fim dela
  if (ib === 0) return { o: { x: dec(p.o.x + vb.x * t), y: dec(p.o.y + vb.y * t) }, paredes: [...paredes, diag].filter((w) => w.c > 0) };
  paredes.splice(ib, 0, diag);
  return { o: { ...p.o }, paredes: paredes.filter((w) => w.c > 0) };
}

/** 9/11: juntar as paredes que fecham a planta (ver `paredesParaFechar`). */
export function fecharPlanta<T extends { o: Ponto; paredes: readonly Parede[] }>(p: T, primeiro: "reto" | "diagonal" = "reto"): T {
  return { ...p, paredes: paredesParaFechar(p, primeiro).reduce<Parede[]>((ps, w) => juntarParede(ps, w), [...p.paredes]) };
}

/** Mudar o comprimento de uma parede (o número escrito por cima dela). As outras não mudam; a planta pode deixar de fechar. */
export const mudarComprimento = (paredes: readonly Parede[], i: number, c: number): Parede[] =>
  paredes.map((p, j) => (j === i ? { ...p, c: Math.max(0, Math.round(c)) } : p));

export const PLANTA_VAZIA: Planta = { o: { x: 50, y: 50 }, paredes: [], pecas: [] };

/** Lê a planta gravada no negócio (JSON em `f.planta`). Aceita a forma antiga, com viragens. O que não se perceber dá null. */
export function lerPlanta(json: string | undefined): Planta | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json) as { o?: Ponto; paredes?: unknown[]; pecas?: unknown[] };
    const brutas = (Array.isArray(p.paredes) ? p.paredes : []) as { c?: unknown; r?: unknown; vira?: unknown }[];
    const comRumo = brutas.every((x) => !!x && (RUMOS as readonly string[]).includes(String(x.r)));
    const paredes: Parede[] = (comRumo
      ? brutas.map((x) => ({ c: Number(x.c), r: x.r as Rumo }))
      : deViragens(brutas.filter((x) => !!x && (x.vira === "dir" || x.vira === "esq")).map((x) => ({ c: Number(x.c), vira: String(x.vira) }))))
      .filter((x) => Number.isFinite(x.c) && x.c >= 0);
    const pecas = (Array.isArray(p.pecas) ? p.pecas : []).filter((x): x is PecaPlanta => {
      const q = x as Partial<PecaPlanta> | null;
      return !!q && typeof q.id === "string" && !!q.tipo && q.tipo in PECAS && [q.x, q.y, q.w, q.h].every((n) => Number.isFinite(n));
    });
    const o = p.o && Number.isFinite(p.o.x) && Number.isFinite(p.o.y) ? { x: p.o.x, y: p.o.y } : { x: 0, y: 0 };
    return paredes.length || pecas.length ? { o, paredes, pecas } : null;
  } catch {
    return null;
  }
}
export const gravarPlanta = (p: Planta): string => JSON.stringify(p);

/** Junta uma peça com o centro no ponto dado, ou ao meio da planta. */
export function juntarPeca(p: Planta, tipo: TipoPeca, id: string, centro?: Ponto): Planta {
  const { w, h } = PECAS[tipo];
  const b = p.paredes.length || p.pecas.length ? limites(p) : { x: p.o.x, y: p.o.y, w: 300, h: 200 };
  const c = centro ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return { ...p, pecas: [...p.pecas, { id, tipo, w, h, x: arred(c.x - w / 2), y: arred(c.y - h / 2) }] };
}

/** 5/11: a planta que a foto da folha deu (visita-folha): paredes por viragens. As peças sem posição nem tamanho ficam ao meio. */
export interface PlantaLida { paredes: { c: number; vira: string }[]; pecas: { tipo: string; x?: number; y?: number; w?: number; h?: number }[]; confianca: number }
export function plantaDaFolha(l: PlantaLida): Planta {
  let p: Planta = { o: { x: 0, y: 0 }, paredes: deViragens(l.paredes.map((x) => ({ c: Math.max(0, Math.round(x.c)), vira: x.vira }))), pecas: [] };
  l.pecas.forEach((x, i) => {
    if (!(x.tipo in PECAS)) return;
    const tipo = x.tipo as TipoPeca, id = `folha${i + 1}`;
    const temSitio = [x.x, x.y, x.w, x.h].every((n) => Number.isFinite(n)) && (x.w ?? 0) > 0 && (x.h ?? 0) > 0;
    p = temSitio ? { ...p, pecas: [...p.pecas, { id, tipo, x: Math.round(x.x!), y: Math.round(x.y!), w: Math.round(x.w!), h: Math.round(x.h!) }] } : juntarPeca(p, tipo, id);
  });
  return p;
}

/** O vetor de uma parede (para mover outras com ela). */
export const vetorDe = (r: Rumo): Ponto => ({ ...VETOR[r] });

/**
 * 5/11 (Rúben: «ao clicar numa parede consegue alterar o seu comprimento e posição»). Mover a parede `i` pelo vetor `s` (só a parte
 * perpendicular a ela conta): as duas paredes vizinhas esticam ou encolhem para a acompanhar, e a planta continua fechada. Se uma vizinha
 * ficasse com comprimento negativo (ou for paralela à parede), não se mexe (null). Mover a primeira parede mexe também o ponto de partida.
 * 9/11: vale também com paredes a 45° (cada canto corre ao longo da vizinha; a própria parede pode crescer ou encolher).
 */
export function moverParede(p: { o: Ponto; paredes: readonly Parede[] }, i: number, s: Ponto): { o: Ponto; paredes: Parede[] } | null {
  const n = p.paredes.length;
  if (n < 3 || i < 0 || i >= n) return null;
  const v = VETOR[p.paredes[i].r], nrm = { x: -v.y, y: v.x };
  const dot = (a: Ponto, b: Ponto) => a.x * b.x + a.y * b.y;
  // só o que é perpendicular à parede (andar ao longo dela não a muda)
  const desloc = dot(s, nrm);
  if (Math.abs(desloc) < 0.05) return { o: { ...p.o }, paredes: p.paredes.map((w) => ({ ...w })) };
  const ant = (i - 1 + n) % n, seg = (i + 1) % n;
  const va = VETOR[p.paredes[ant].r], vs = VETOR[p.paredes[seg].r];
  const ka = dot(va, nrm), ks = dot(vs, nrm);
  if (Math.abs(ka) < 0.1 || Math.abs(ks) < 0.1) return null; // vizinha paralela: não há canto que corra
  const ta = desloc / ka, ts = desloc / ks; // quanto cada canto anda ao longo da vizinha
  const paredes = p.paredes.map((w) => ({ ...w }));
  paredes[ant] = { ...paredes[ant], c: dec(paredes[ant].c + ta) };
  paredes[seg] = { ...paredes[seg], c: dec(paredes[seg].c - ts) };
  paredes[i] = { ...paredes[i], c: dec(paredes[i].c + dot({ x: vs.x * ts - va.x * ta, y: vs.y * ts - va.y * ta }, v)) };
  if (paredes[ant].c < 0 || paredes[seg].c < 0 || paredes[i].c < 0) return null;
  return { o: i === 0 ? { x: dec(p.o.x + va.x * ta), y: dec(p.o.y + va.y * ta) } : { ...p.o }, paredes };
}

/**
 * Mudar o comprimento da parede `i` sem abrir a planta: a parede seguinte anda com a ponta dela (e a do outro lado estica ou encolhe).
 * Numa planta que ainda não fecha (a desenhar), muda só esta parede.
 */
export function mudarComprimentoFechada(p: { o: Ponto; paredes: readonly Parede[] }, i: number, c: number): { o: Ponto; paredes: Parede[] } | null {
  const novo = Math.max(0, Math.round(c));
  if (faltaFechar(p.paredes) > 1) return { o: { ...p.o }, paredes: mudarComprimento(p.paredes, i, novo) };
  const delta = novo - p.paredes[i].c, v = VETOR[p.paredes[i].r];
  const n = p.paredes.length, seg = (i + 1) % n;
  // mover a seguinte com a ponta desta: esta estica (é a anterior da seguinte) e a do outro lado acompanha
  return moverParede(p, seg, { x: v.x * delta, y: v.y * delta });
}

/** O segmento a–z passa pela caixa? (Liang–Barsky) */
function segmentoNaCaixa(a: Ponto, z: Ponto, c: { x0: number; y0: number; x1: number; y1: number }): boolean {
  let t0 = 0, t1 = 1;
  const dx = z.x - a.x, dy = z.y - a.y;
  for (const [p, q] of [[-dx, a.x - c.x0], [dx, c.x1 - a.x], [-dy, a.y - c.y0], [dy, c.y1 - a.y]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/**
 * 5/11 (Rúben: «não pode haver overlap de medidas»). Onde pôr a medida de cada parede sem tapar outra medida nem uma parede: cada uma
 * procura, por ordem, por fora da parede a meio, mais para os lados, por dentro, e depois mais afastada. As paredes mais compridas
 * escolhem primeiro. `larg` e `alt` são o tamanho da etiqueta (nas unidades da planta). Volta o centro de cada etiqueta, pela ordem das paredes.
 */
export function etiquetasSemSobrepor(paredes: readonly Parede[], o: Ponto, larg: number, alt: number): Ponto[] {
  const pts = cantos(paredes, o), n = paredes.length;
  // o sentido da planta: «por fora» é à esquerda de quem anda no sentido dos ponteiros do relógio (y para baixo)
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p.x * q.y - q.x * p.y; }
  const fora = area >= 0 ? 1 : -1;
  const folga = alt * 0.25;
  type Caixa = { x0: number; y0: number; x1: number; y1: number };
  const caixa = (c: Ponto): Caixa => ({ x0: c.x - larg / 2, y0: c.y - alt / 2, x1: c.x + larg / 2, y1: c.y + alt / 2 });
  const cruza = (a: Caixa, b: Caixa) => a.x0 < b.x1 + folga && b.x0 < a.x1 + folga && a.y0 < b.y1 + folga && b.y0 < a.y1 + folga;
  // uma parede atravessa a caixa? (9/11: também as diagonais, pelo corte do segmento com a caixa)
  const tapaParede = (c: Caixa) => paredes.some((_w, j) => segmentoNaCaixa(pts[j], pts[j + 1], c));
  const ordem = paredes.map((w, i) => ({ i, c: w.c })).sort((a, b) => b.c - a.c).map((x) => x.i);
  const postas: Caixa[] = [];
  const centros: Ponto[] = new Array(n);
  for (const i of ordem) {
    const a = pts[i], z = pts[i + 1], v = VETOR[paredes[i].r];
    const nx = v.y * fora, ny = -v.x * fora; // a normal para fora
    const meiaLarg = Math.abs(nx) * larg / 2 + Math.abs(ny) * alt / 2; // meia etiqueta na direção da normal
    const candidatos: Ponto[] = [];
    for (const k of [0, 1, 2]) {
      for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        for (const lado of [1, -1]) {
          const d = (meiaLarg + alt * 0.35 + k * (meiaLarg * 2 + alt * 0.3)) * lado;
          candidatos.push({ x: a.x + (z.x - a.x) * t + nx * d, y: a.y + (z.y - a.y) * t + ny * d });
        }
      }
    }
    const livre = candidatos.find((c) => { const b = caixa(c); return !tapaParede(b) && !postas.some((x) => cruza(x, b)); })
      ?? candidatos.find((c) => !postas.some((x) => cruza(x, caixa(c))))
      ?? candidatos[0];
    centros[i] = livre;
    postas.push(caixa(livre));
  }
  return centros;
}

/**
 * 5/11 (Rúben: «ao trocar produtos, os produtos deviam estar na mesma posição»). Dar a uma peça o tamanho de um produto sem a tirar do
 * sítio: `largura` é a frente do produto e `fundo` a profundidade. Encostada a uma parede, a frente fica ao longo da parede, o lado
 * encostado não se mexe e o meio ao longo da parede também não. Solta no meio da divisão, fica com o mesmo centro e a mesma orientação.
 */
export function encaixar(pc: PecaPlanta, largura: number, fundo: number, planta: { o: Ponto; paredes: readonly Parede[] }): PecaPlanta {
  // 6/11: encostada é até um passo da grelha (5 cm); num canto (duas paredes), ganha a parede que deixa a peça virada como estava,
  // e a peça continua no canto (encostada também à outra)
  const pts = cantos(planta.paredes, planta.o), ENCOSTA = PASSO;
  const cx = pc.x + pc.w / 2, cy = pc.y + pc.h / 2;
  type Opcao = { p: PecaPlanta; eixo: "x" | "y"; lado: "min" | "max"; em: number };
  const opcoes: Opcao[] = [];
  for (let i = 0; i < planta.paredes.length; i++) {
    const a = pts[i], z = pts[i + 1];
    if (a.x !== z.x && a.y !== z.y) continue; // 9/11: as diagonais não seguram peças
    if (a.x === z.x) { // parede vertical: a frente fica na vertical, o fundo na horizontal
      const y0 = Math.min(a.y, z.y), y1 = Math.max(a.y, z.y);
      if (pc.y >= y1 || pc.y + pc.h <= y0) continue;
      if (Math.abs(pc.x - a.x) <= ENCOSTA) opcoes.push({ p: { ...pc, w: fundo, h: largura, x: a.x, y: Math.round(cy - largura / 2) }, eixo: "x", lado: "min", em: a.x });
      else if (Math.abs(pc.x + pc.w - a.x) <= ENCOSTA) opcoes.push({ p: { ...pc, w: fundo, h: largura, x: a.x - fundo, y: Math.round(cy - largura / 2) }, eixo: "x", lado: "max", em: a.x });
    } else { // parede horizontal
      const x0 = Math.min(a.x, z.x), x1 = Math.max(a.x, z.x);
      if (pc.x >= x1 || pc.x + pc.w <= x0) continue;
      if (Math.abs(pc.y - a.y) <= ENCOSTA) opcoes.push({ p: { ...pc, w: largura, h: fundo, y: a.y, x: Math.round(cx - largura / 2) }, eixo: "y", lado: "min", em: a.y });
      else if (Math.abs(pc.y + pc.h - a.y) <= ENCOSTA) opcoes.push({ p: { ...pc, w: largura, h: fundo, y: a.y - fundo, x: Math.round(cx - largura / 2) }, eixo: "y", lado: "max", em: a.y });
    }
  }
  if (opcoes.length) {
    const deitada = pc.w >= pc.h;
    const igual = opcoes.find((o) => (o.p.w >= o.p.h) === deitada) ?? opcoes[0];
    const canto = opcoes.find((o) => o.eixo !== igual.eixo);
    if (!canto) return igual.p;
    const r = { ...igual.p };
    if (canto.eixo === "x") r.x = canto.lado === "min" ? canto.em : canto.em - r.w;
    else r.y = canto.lado === "min" ? canto.em : canto.em - r.h;
    return r;
  }
  // solta: o mesmo centro, e a frente para o lado mais comprido que a peça já tinha
  const deitada = pc.w >= pc.h;
  const [w, h] = deitada === (largura >= fundo) ? [largura, fundo] : [fundo, largura];
  return { ...pc, w, h, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2) };
}

/* ------------------------------------------------------------------ 9/11: as regras da planta (Rúben, no Estúdio) */
/** O espaço mínimo entre a sanita e o bidé (cm). */
export const ESPACO_SANITA_BIDE = 20;

/**
 * 9/11 (Rúben: «as janelas e portas grudadas à parede»): uma porta ou uma janela fica sempre na parede mais perto, ao longo dela e com o
 * meio na linha da parede; o resto das peças fica como está. 11/11 (Rúben: «permitir também portas em diagonal»): também nas paredes a
 * 45°, rodada com a parede (`rot`, em torno do centro; a caixa sem rodar é o comprimento ao longo da parede × a espessura).
 */
export function colarAParede(pc: PecaPlanta, planta: { o: Ponto; paredes: readonly Parede[] }): PecaPlanta {
  if (!PECAS[pc.tipo]?.abertura || !planta.paredes.length) return pc;
  const pts = cantos(planta.paredes, planta.o);
  const cx = pc.x + pc.w / 2, cy = pc.y + pc.h / 2, comp = Math.max(pc.w, pc.h), esp = Math.min(pc.w, pc.h);
  const { rot: _rot, ...semRot } = pc; void _rot;
  let melhor: { d: number; r: PecaPlanta } | null = null;
  for (let i = 0; i < planta.paredes.length; i++) {
    const a = pts[i], z = pts[i + 1];
    if (a.x !== z.x && a.y !== z.y) {
      // a diagonal: o ponto da parede mais perto do meio da peça, sem a peça sair da parede
      const L = Math.hypot(z.x - a.x, z.y - a.y);
      if (L < 1) continue;
      const ux = (z.x - a.x) / L, uy = (z.y - a.y) / L;
      const t = L <= comp ? L / 2 : Math.min(L - comp / 2, Math.max(comp / 2, (cx - a.x) * ux + (cy - a.y) * uy));
      const tq = Math.min(L, Math.max(0, (cx - a.x) * ux + (cy - a.y) * uy));
      const d = Math.hypot(cx - (a.x + ux * tq), cy - (a.y + uy * tq));
      const mx = a.x + ux * t, my = a.y + uy * t;
      // o ângulo da parede, entre -90° e 90° (a porta não fica de pernas para o ar)
      let ang = (Math.atan2(uy, ux) * 180) / Math.PI;
      if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
      if (!melhor || d < melhor.d) melhor = { d, r: { ...semRot, w: comp, h: esp, x: Math.round(mx - comp / 2), y: Math.round(my - esp / 2), rot: Math.round(ang) } };
      continue;
    }
    if (a.x === z.x) {
      const y0 = Math.min(a.y, z.y), y1 = Math.max(a.y, z.y);
      const ny = y1 - y0 <= comp ? (y0 + y1) / 2 : Math.min(y1 - comp / 2, Math.max(y0 + comp / 2, cy));
      const d = Math.hypot(cx - a.x, cy - Math.min(y1, Math.max(y0, cy)));
      if (!melhor || d < melhor.d) melhor = { d, r: { ...semRot, w: esp, h: comp, x: Math.round(a.x - esp / 2), y: Math.round(ny - comp / 2) } };
    } else {
      const x0 = Math.min(a.x, z.x), x1 = Math.max(a.x, z.x);
      const nx = x1 - x0 <= comp ? (x0 + x1) / 2 : Math.min(x1 - comp / 2, Math.max(x0 + comp / 2, cx));
      const d = Math.hypot(cy - a.y, cx - Math.min(x1, Math.max(x0, cx)));
      if (!melhor || d < melhor.d) melhor = { d, r: { ...semRot, w: comp, h: esp, y: Math.round(a.y - esp / 2), x: Math.round(nx - comp / 2) } };
    }
  }
  return melhor?.r ?? pc;
}

/** 11/11: o segmento a–z corta o polígono convexo `q` (uma peça rodada): uma ponta dentro, ou cruza um dos lados. */
function cortaPoligono(a: Ponto, z: Ponto, q: readonly Ponto[]): boolean {
  if (dentroDoPoligono(a, q) || dentroDoPoligono(z, q)) return true;
  const lado = (p: Ponto, r: Ponto, s: Ponto) => (r.x - p.x) * (s.y - p.y) - (r.y - p.y) * (s.x - p.x);
  for (let i = 0; i < q.length; i++) {
    const c = q[i], d = q[(i + 1) % q.length];
    if (lado(a, z, c) * lado(a, z, d) < 0 && lado(c, d, a) * lado(c, d, z) < 0) return true;
  }
  return false;
}

/** O ponto está dentro do polígono (raio para a direita). */
function dentroDoPoligono(q: Ponto, poli: readonly Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const a = poli[i], b = poli[j];
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

export interface AvisoPlanta { texto: string; pecas: string[] }
/**
 * 9/11 (Rúben: «dar alertas quando os produtos não cabem na planta, e um espaçamento mínimo entre sanita e bidé»). Numa planta fechada:
 * a peça que sai da planta (ou que uma parede atravessa), as peças umas em cima das outras e a sanita e o bidé sem o espaço mínimo.
 * As portas e as janelas não contam (estão na parede).
 */
export function avisosDaPlanta(planta: Planta): AvisoPlanta[] {
  const out: AvisoPlanta[] = [];
  const pecas = planta.pecas.filter((x) => !PECAS[x.tipo]?.abertura);
  const nome = (x: PecaPlanta) => PECAS[x.tipo]?.n ?? x.tipo;
  if (planta.paredes.length >= 3 && faltaFechar(planta.paredes) <= 1) {
    const pts = cantos(planta.paredes, planta.o), poli = pts.slice(0, -1);
    for (const x of pecas) {
      // 11/11: a peça rodada conta pelos cantos dela (encostada a uma diagonal, a caixa direita sairia da planta)
      const fora = cantosDaPeca(x, 1).some((q) => !dentroDoPoligono(q, poli));
      const atravessa = !fora && (x.rot ? pts.slice(0, -1).some((a, i) => cortaPoligono(a, pts[i + 1], cantosDaPeca(x, 1)))
        : pts.slice(0, -1).some((a, i) => segmentoNaCaixa(a, pts[i + 1], caixaDaPeca(x, 1))));
      if (fora || atravessa) out.push({ texto: `${nome(x)} (${Math.round(x.w)} × ${Math.round(x.h)} cm) não cabe: sai da planta. Mude de sítio ou escolha uma mais pequena.`, pecas: [x.id] });
    }
  }
  for (let i = 0; i < pecas.length; i++) for (let j = i + 1; j < pecas.length; j++) {
    const a = pecas[i], b = pecas[j];
    // 11/11: com uma peça rodada, a caixa direita dela (aproximado, do lado de dentro)
    const A = caixaDaPeca(a), Bx = caixaDaPeca(b);
    const dx = Math.max(Bx.x0 - A.x1, A.x0 - Bx.x1), dy = Math.max(Bx.y0 - A.y1, A.y0 - Bx.y1);
    if (dx < -1 && dy < -1) { out.push({ texto: `${nome(a)} e ${nome(b)} estão uma em cima da outra.`, pecas: [a.id, b.id] }); continue; }
    const par = [a.tipo, b.tipo].sort().join("+");
    if (par === "bide+sanita") {
      const gap = Math.round(Math.hypot(Math.max(0, dx), Math.max(0, dy)));
      if (gap < ESPACO_SANITA_BIDE) out.push({ texto: `Entre a sanita e o bidé ${gap <= 0 ? "não há espaço" : `ficam ${gap} cm`}: o mínimo é ${ESPACO_SANITA_BIDE} cm.`, pecas: [a.id, b.id] });
    }
  }
  return out;
}
