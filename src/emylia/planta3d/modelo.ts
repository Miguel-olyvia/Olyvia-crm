// Protótipo (visualizador 3D): o modelo GENÉRICO de uma planta, em metros, para qualquer espaço desenhado à mão (casa de banho, cozinha, quarto,
// sala, qualquer área de intervenção). Só tipos e funções puras (sem ecrã, sem three), para se testarem. O desenho de hoje (planta.ts, em cm,
// só paredes retas E/S/W/N) converte-se para este modelo em `deLegado` (ligacao.ts); a normalização do desenho à mão (grelha, ângulos, fecho,
// auto-intersecções) vive aqui para servir também um desenho livre.

export interface Ponto { x: number; y: number }
export type TipoEspaco = "casa_banho" | "cozinha" | "quarto" | "sala" | "outro";
export type TipoAbertura = "porta" | "janela";

export interface Parede { id: string; a: Ponto; b: Ponto; espessura: number }
/** `posicao`: distância (m) do início da parede ao início da abertura. */
export interface Abertura { id: string; tipo: TipoAbertura; parede: string; posicao: number; largura: number; altura: number; peitoril: number }
/** Uma peça: UM produto do catálogo (pelo id). `x`,`y`: centro (m); `rotacao`: graus (frente da peça para o interior = 0 quando encosta a uma parede horizontal em cima). */
export interface PecaProduto { id: string; produtoId: string; x: number; y: number; rotacao: number; paredeEncosto: string | null; largura: number; profundidade: number }
export interface Revestimentos { pavimento: string; parede: string }
export interface Espaco {
  tipo: TipoEspaco; nome: string; peDireito: number; unidade: "m";
  paredes: Parede[]; aberturas: Abertura[]; pecas: PecaProduto[]; revestimentos: Revestimentos;
}

export const PE_DIREITO_OMISSAO = 2.4;
export const ESPESSURA_OMISSAO = 0.1;
export const GRELHA = 0.05;
export const TOLERANCIA_ANGULO = 5;
export const FUNDIR_ATE = 0.1;
export const ALTURA_PORTA = 2.1;
export const ALTURA_JANELA = 1.2;
export const PEITORIL_JANELA = 0.9;

export const espacoVazio = (tipo: TipoEspaco = "outro", nome = "Espaço"): Espaco => ({
  tipo, nome, peDireito: PE_DIREITO_OMISSAO, unidade: "m", paredes: [], aberturas: [], pecas: [],
  revestimentos: { pavimento: "ceramico_claro", parede: "tinta_branca" },
});

const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0; // + 0: o -0 vira 0
export const ajustarGrelha = (v: number, passo = GRELHA): number => r3(Math.round(v / passo) * passo);
export const distancia = (a: Ponto, b: Ponto): number => Math.hypot(b.x - a.x, b.y - a.y);
export const comprimento = (p: Pick<Parede, "a" | "b">): number => r3(distancia(p.a, p.b));

/** Área de um polígono (m²), pela fórmula do laço. */
export function areaPoligono(pts: readonly Ponto[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; }
  return r3(Math.abs(s) / 2);
}
export function perimetro(pts: readonly Ponto[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += distancia(pts[i], pts[(i + 1) % pts.length]);
  return r3(s);
}
const areaComSinal = (pts: readonly Ponto[]): number => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; }
  return s / 2;
};

/** Os cruzamentos de dois segmentos (sem contar o toque nos extremos partilhados). */
function cruzam(a: Ponto, b: Ponto, c: Ponto, d: Ponto): boolean {
  const o = (p: Ponto, q: Ponto, r: Ponto) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  const eps = 1e-9;
  if (Math.abs(d1) < eps || Math.abs(d2) < eps || Math.abs(d3) < eps || Math.abs(d4) < eps) {
    // colinear ou a tocar: conta só se se sobrepõem (não só nos extremos)
    const dentro = (p: Ponto, q: Ponto, r: Ponto) => Math.abs(o(p, q, r)) < eps && Math.min(p.x, q.x) - eps <= r.x && r.x <= Math.max(p.x, q.x) + eps && Math.min(p.y, q.y) - eps <= r.y && r.y <= Math.max(p.y, q.y) + eps;
    const igual = (p: Ponto, q: Ponto) => distancia(p, q) < eps;
    const tocaExtremo = igual(a, c) || igual(a, d) || igual(b, c) || igual(b, d);
    if (tocaExtremo) return false;
    return dentro(a, b, c) || dentro(a, b, d) || dentro(c, d, a) || dentro(c, d, b);
  }
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Em que lado do contorno há cruzamentos: devolve o par de paredes (1.ª base) que se cruzam, ou null. */
export function autoIntersecao(pts: readonly Ponto[]): [number, number] | null {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // vizinhas
      if (cruzam(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return [i + 1, j + 1];
    }
  }
  return null;
}

export type ResContorno = { ok: true; pontos: Ponto[] } | { ok: false; erro: string };

/**
 * Normaliza um contorno desenhado à mão (lista de pontos, o último junto ao primeiro = fechado): ajusta à grelha de 5 cm, alinha à horizontal
 * ou à vertical as paredes quase retas (5 graus), funde pontos a menos de 10 cm, fecha o contorno e recusa auto-intersecções.
 */
export function normalizarContorno(brutos: readonly Ponto[]): ResContorno {
  if (brutos.length < 3) return { ok: false, erro: "Faltam pontos: uma área precisa de pelo menos três cantos." };
  // 1. à grelha
  let pts = brutos.map((p) => ({ x: ajustarGrelha(p.x), y: ajustarGrelha(p.y) }));
  // 2. fundir pontos seguidos a menos de 10 cm
  const fundido: Ponto[] = [];
  for (const p of pts) { if (!fundido.length || distancia(fundido[fundido.length - 1], p) >= FUNDIR_ATE) fundido.push(p); }
  // 3. fechar: o último junto ao primeiro é o mesmo canto
  while (fundido.length > 1 && distancia(fundido[fundido.length - 1], fundido[0]) < FUNDIR_ATE) fundido.pop();
  pts = fundido;
  if (pts.length < 3) return { ok: false, erro: "Depois de juntar os pontos muito próximos sobram menos de três cantos." };
  // 4. alinhar ângulos quase retos: cada ponto (a partir do 2.º) acompanha o anterior no eixo mais próximo
  const tol = (TOLERANCIA_ANGULO * Math.PI) / 180;
  const alinhado: Ponto[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = alinhado[i - 1], p = pts[i];
    const ang = Math.atan2(Math.abs(p.y - a.y), Math.abs(p.x - a.x)); // 0 = horizontal, pi/2 = vertical
    if (ang <= tol) alinhado.push({ x: p.x, y: a.y });
    else if (Math.PI / 2 - ang <= tol) alinhado.push({ x: a.x, y: p.y });
    else alinhado.push(p);
  }
  // a parede de fecho também se alinha: o primeiro ponto não se mexe, por isso confere-se a última parede
  pts = alinhado.map((p) => ({ x: ajustarGrelha(p.x), y: ajustarGrelha(p.y) }));
  const x = autoIntersecao(pts);
  if (x) return { ok: false, erro: `As paredes ${x[0]} e ${x[1]} cruzam-se: o contorno não pode cortar-se a si próprio.` };
  if (pts.length < 3 || areaPoligono(pts) < 0.01) return { ok: false, erro: "A área ficou sem superfície: os pontos estão em linha." };
  return { ok: true, pontos: pts };
}

/** As paredes de um contorno fechado (ids p1, p2…). */
export const paredesDoContorno = (pts: readonly Ponto[], espessura = ESPESSURA_OMISSAO): Parede[] =>
  pts.map((a, i) => ({ id: `p${i + 1}`, a, b: pts[(i + 1) % pts.length], espessura }));

export const contornoDe = (paredes: readonly Parede[]): Ponto[] => paredes.map((p) => p.a);

/** A normal da parede a apontar para o interior da área (contorno fechado). */
export function normalInterior(paredes: readonly Parede[], i: number): Ponto {
  const p = paredes[i], c = comprimento(p) || 1;
  const tx = (p.b.x - p.a.x) / c, ty = (p.b.y - p.a.y) / c;
  // com y para baixo e área com sinal > 0 (sentido horário no ecrã) o interior fica à direita do sentido da parede
  const lado = areaComSinal(contornoDe(paredes)) >= 0 ? 1 : -1;
  return { x: -ty * lado + 0, y: tx * lado + 0 };
}

/** Uma abertura recortada ao que cabe na parede (nunca sai dos seus extremos). */
export function abrirNaParede(parede: Parede, a: Abertura): Abertura {
  const c = comprimento(parede);
  const largura = Math.min(Math.max(0.1, a.largura), c);
  const posicao = Math.min(Math.max(0, a.posicao), Math.max(0, c - largura));
  return { ...a, largura: r3(largura), posicao: r3(posicao) };
}

/** Um bloco sólido de parede: ao longo dela de `de` a `ate` (m) e em altura de `z0` a `z1` (m). */
export interface Troco { de: number; ate: number; z0: number; z1: number }

/**
 * Os troços sólidos de uma parede com aberturas, sem CSG: esquerda, verga (por cima), peitoril (por baixo) e direita de cada abertura.
 * Aberturas que se sobrepõem fundem-se na mais larga que as cobre; fora dos limites da parede são recortadas.
 */
export function trocosDeParede(parede: Parede, aberturas: readonly Abertura[], peDireito: number): Troco[] {
  const c = comprimento(parede);
  const lista = aberturas.filter((a) => a.parede === parede.id).map((a) => abrirNaParede(parede, a)).sort((x, y) => x.posicao - y.posicao);
  const trocos: Troco[] = [];
  let cursor = 0;
  for (const a of lista) {
    const de = Math.max(a.posicao, cursor), ate = a.posicao + a.largura;
    if (ate <= cursor + 1e-6) continue;
    if (de > cursor + 1e-6) trocos.push({ de: r3(cursor), ate: r3(de), z0: 0, z1: peDireito });
    const z0 = Math.min(Math.max(0, a.peitoril), peDireito), z1 = Math.min(peDireito, a.peitoril + a.altura);
    if (z0 > 1e-6) trocos.push({ de: r3(de), ate: r3(ate), z0: 0, z1: r3(z0) });
    if (z1 < peDireito - 1e-6) trocos.push({ de: r3(de), ate: r3(ate), z0: r3(z1), z1: peDireito });
    cursor = ate;
  }
  if (cursor < c - 1e-6) trocos.push({ de: r3(cursor), ate: r3(c), z0: 0, z1: peDireito });
  return trocos;
}

export const areaPavimento = (e: Espaco): number => areaPoligono(contornoDe(e.paredes));

/** Área das paredes (m²): perímetro × pé-direito, menos as aberturas. */
export function areaParedes(e: Espaco): number {
  const bruta = perimetro(contornoDe(e.paredes)) * e.peDireito;
  const aberturas = e.aberturas.reduce((s, a) => s + a.largura * a.altura, 0);
  return r3(Math.max(0, bruta - aberturas));
}

/** Descrição em texto (alternativa ao 3D para quem usa teclado ou leitor de ecrã): uma linha por parede e por peça. */
export function descreverEspaco(e: Espaco, nomeDe: (produtoId: string) => string = (id) => id): string[] {
  const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
  const linhas = e.paredes.map((p, i) => {
    const ab = e.aberturas.filter((a) => a.parede === p.id).map((a) => `${a.tipo === "porta" ? "porta" : "janela"} de ${nf(a.largura)} m`);
    return `Parede ${i + 1}: ${nf(comprimento(p))} m${ab.length ? `, com ${ab.join(" e ")}` : ""}.`;
  });
  for (const pc of e.pecas) linhas.push(`${nomeDe(pc.produtoId)}: ${nf(pc.largura * 100)} por ${nf(pc.profundidade * 100)} cm${pc.paredeEncosto ? `, encostada à parede ${pc.paredeEncosto.replace("p", "")}` : ""}.`);
  return linhas;
}
