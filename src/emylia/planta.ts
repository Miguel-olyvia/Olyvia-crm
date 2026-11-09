// 5/11 (Rúben, a visita real: «reconstruir tudo o que está em papel, a planta da área»; e depois: «o desenho deve ser simples: desenhar no
// ecrã as retas com as medidas em overlay e depois arrastar as coisas»). A planta da divisão como a comercial a desenha na folha: paredes
// retas (só na horizontal ou na vertical), cada uma com o comprimento em cm, e as peças lá dentro (base, sanita, banheira…). Daqui saem os
// m² do chão e das paredes para as medidas. Só geometria e regras do desenho (sem ecrã). Tudo em cm; x para a direita, y para baixo.

/** Para onde vai a parede: este (direita), sul (baixo), oeste (esquerda), norte (cima). */
export type Rumo = "E" | "S" | "W" | "N";
export interface Parede { c: number; r: Rumo }
export type TipoPeca = "base" | "banheira" | "sanita" | "bide" | "movel" | "coluna" | "espelho" | "toalheiro" | "porta" | "janela"
  // 6/11 (Rúben: «adicionar também coisas para cozinha»)
  | "bancada" | "lava" | "placa" | "forno" | "frigorifico" | "maquina" | "exaustor" | "armario";
/** Uma peça na planta: o canto de cima à esquerda e o tamanho, em cm. */
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
const VETOR: Record<Rumo, Ponto> = { E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 }, N: { x: 0, y: -1 } };
const DIREITA: Record<Rumo, Rumo> = { E: "S", S: "W", W: "N", N: "E" };
const ESQUERDA: Record<Rumo, Rumo> = { E: "N", N: "W", W: "S", S: "E" };
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
  for (const p of paredes) { const u = pts[pts.length - 1], v = VETOR[p.r]; pts.push({ x: u.x + v.x * p.c, y: u.y + v.y * p.c }); }
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

/** O retângulo que contém as paredes e as peças (para o desenho). */
export function limites(p: Planta): { x: number; y: number; w: number; h: number } {
  const pts = [...cantos(p.paredes, p.o), ...p.pecas.flatMap((x) => [{ x: x.x, y: x.y }, { x: x.x + x.w, y: x.y + x.h }])];
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

/**
 * O traço do dedo, de `de` até `ate`, como parede reta: na horizontal ou na vertical (a que for maior), de 5 em 5 cm. Perto do canto de
 * partida (`inicio`), no mesmo eixo, acaba nele. Um traço muito curto (um toque) não é parede.
 */
export function paredeDoTraco(de: Ponto, ate: Ponto, inicio?: Ponto): Parede | null {
  const dx = ate.x - de.x, dy = ate.y - de.y;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  let c = arred(Math.abs(horiz ? dx : dy));
  const r: Rumo = horiz ? (dx >= 0 ? "E" : "W") : (dy >= 0 ? "S" : "N");
  if (inicio && (horiz ? Math.abs(inicio.y - de.y) < 1 : Math.abs(inicio.x - de.x) < 1)) {
    const ateInicio = horiz ? (inicio.x - de.x) * (r === "E" ? 1 : -1) : (inicio.y - de.y) * (r === "S" ? 1 : -1);
    if (ateInicio > 0 && Math.abs(ateInicio - Math.abs(horiz ? dx : dy)) <= ATRACAO) c = Math.round(ateInicio);
  }
  return c >= MINIMO ? { c, r } : null;
}

/** Juntar a parede: a seguir a uma no mesmo rumo, soma-se a ela (o dedo parou a meio de uma reta). */
export function juntarParede(paredes: readonly Parede[], nova: Parede): Parede[] {
  const ultima = paredes[paredes.length - 1];
  return ultima && ultima.r === nova.r ? [...paredes.slice(0, -1), { ...ultima, c: ultima.c + nova.c }] : [...paredes, nova];
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
    const comRumo = brutas.every((x) => !!x && ["E", "S", "W", "N"].includes(String(x.r)));
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
 * ficasse com comprimento negativo, não se mexe (null). Mover a primeira parede mexe também o ponto de partida.
 */
export function moverParede(p: { o: Ponto; paredes: readonly Parede[] }, i: number, s: Ponto): { o: Ponto; paredes: Parede[] } | null {
  const n = p.paredes.length;
  if (n < 3 || i < 0 || i >= n) return null;
  const v = VETOR[p.paredes[i].r];
  // só o que é perpendicular à parede (andar ao longo dela não a muda)
  const d = { x: v.x === 0 ? s.x : 0, y: v.y === 0 ? s.y : 0 };
  if (!d.x && !d.y) return { o: { ...p.o }, paredes: p.paredes.map((w) => ({ ...w })) };
  const ant = (i - 1 + n) % n, seg = (i + 1) % n;
  const dot = (a: Ponto, b: Ponto) => a.x * b.x + a.y * b.y;
  const paredes = p.paredes.map((w) => ({ ...w }));
  paredes[ant] = { ...paredes[ant], c: paredes[ant].c + dot(d, VETOR[paredes[ant].r]) };
  paredes[seg] = { ...paredes[seg], c: paredes[seg].c - dot(d, VETOR[paredes[seg].r]) };
  if (paredes[ant].c < 0 || paredes[seg].c < 0) return null;
  return { o: i === 0 ? { x: p.o.x + d.x, y: p.o.y + d.y } : { ...p.o }, paredes };
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
  // uma parede (reta horizontal ou vertical) atravessa a caixa?
  const tapaParede = (c: Caixa) => paredes.some((_w, j) => {
    const a = pts[j], z = pts[j + 1];
    const sx0 = Math.min(a.x, z.x), sx1 = Math.max(a.x, z.x), sy0 = Math.min(a.y, z.y), sy1 = Math.max(a.y, z.y);
    return sx0 <= c.x1 && sx1 >= c.x0 && sy0 <= c.y1 && sy1 >= c.y0;
  });
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
