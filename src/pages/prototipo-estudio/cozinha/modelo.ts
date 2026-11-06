// 6/11 (Rúben: «serias capaz de criar algo como o planner do IKEA com os produtos que temos?» … «fazer um à parte»). O planeador da cozinha:
// uma parede com a fila de baixo (armários baixos e altos, encostados uns aos outros, da esquerda para a direita) e a fila de cima (armários
// de parede e o exaustor). O tampo cobre os baixos seguidos. Os eletrodomésticos, o lava-loiça, a torneira e o tampo são os produtos do
// catálogo do Estúdio (catalogoFake.ts); os corpos e as frentes têm preços de teste. Só regras; o 3D é cena.ts e o ecrã PlaneadorCozinha.tsx.
import { CATALOGO, SERVICOS, produto, type Categoria, type Produto } from "../catalogoFake";
import { IVA } from "../necessidadesEstudio";

export type Fila = "baixo" | "parede";
/** O modelo do módulo: o que é e o que leva. */
export type Modelo = "normal" | "lava" | "placa" | "maquina" | "alto" | "alto_forno" | "alto_frigorifico" | "frigorifico" | "parede" | "exaustor" | "vazio";
/** A disposição da frente: 3 gavetas; gaveta em cima e porta; porta(s); 2 portas (alto); forno com gavetas; o painel da máquina. */
export type Frente = "3g" | "gp" | "p" | "2p" | "forno" | "painel";

export interface Modulo {
  id: string;
  modelo: Modelo;
  /** Largura (cm). */
  w: number;
  frente: Frente;
  /** O produto que o módulo leva (o lava-loiça, a placa, a máquina, o frigorífico, o exaustor). */
  produto?: string;
  /** O que vai com ele: a torneira do lava-loiça, o forno debaixo da placa. */
  extra?: string;
}
export interface Acabamento { id: string; n: string; hex: string; delta: number }
export interface Puxador { id: string; n: string; hex?: string; preco: number }
export interface Cozinha {
  /** A parede: comprimento e altura (cm); a profundidade da divisão (para o chão). */
  parede: number;
  altura: number;
  fundo: number;
  baixo: Modulo[];
  cima: Modulo[];
  acabamento: string;
  puxador: string;
  /** O tampo: um produto «bancada» do catálogo (o preço por metro sai do produto de 1,20 m). */
  tampo: string;
}

// ---------------------------------------------------------------- as medidas de sempre (cm)
export const MEDIDAS = {
  rodape: 10, corpo: 78, tampo: 3.8, fundoBaixo: 58, frente: 2, fundoTampo: 63.5,
  altoTopo: 220, paredeBase: 150, paredeTopo: 220, fundoParede: 35,
} as const;
export const ALTURA_TAMPO = MEDIDAS.rodape + MEDIDAS.corpo + MEDIDAS.tampo; // 91,8

// ---------------------------------------------------------------- acabamentos e puxadores (preços de teste)
export const ACABAMENTOS: Acabamento[] = [
  { id: "branco", n: "Branco mate", hex: "#f2f2ef", delta: 0 },
  { id: "pedra", n: "Cinza pedra", hex: "#c9c7c2", delta: 0.05 },
  { id: "carvalho", n: "Carvalho", hex: "#c79a6a", delta: 0.15 },
  { id: "salva", n: "Verde salva", hex: "#a7b5a0", delta: 0.1 },
  { id: "antracite", n: "Antracite", hex: "#3b3d40", delta: 0.1 },
];
export const PUXADORES: Puxador[] = [
  { id: "inox", n: "Barra inox", hex: "#a9adb1", preco: 9 },
  { id: "preto", n: "Barra preta", hex: "#2a2b2d", preco: 11 },
  { id: "gola", n: "Sem puxador (gola)", preco: 0 },
];

// ---------------------------------------------------------------- os modelos
export interface ModeloInfo {
  n: string; fila: Fila; larguras: number[]; frentes: Frente[]; alto?: boolean;
  /** A categoria do produto que leva (e a do que vai com ele). */
  leva?: Categoria; extra?: Categoria;
  /** O grupo no painel. */
  grupo: "Normal" | "Lava-loiça" | "Com placa e forno" | "Máquina da loiça" | "Altos" | "Frigorífico" | "De parede" | "Exaustor" | "Espaço livre";
}
export const MODELOS: Record<Modelo, ModeloInfo> = {
  normal: { n: "Armário baixo", fila: "baixo", larguras: [30, 40, 60, 80], frentes: ["3g", "gp", "p"], grupo: "Normal" },
  lava: { n: "Armário do lava-loiça", fila: "baixo", larguras: [60, 80], frentes: ["p", "gp"], leva: "lava", extra: "torneira", grupo: "Lava-loiça" },
  placa: { n: "Armário da placa", fila: "baixo", larguras: [60, 80], frentes: ["forno", "3g"], leva: "placa", extra: "forno", grupo: "Com placa e forno" },
  maquina: { n: "Máquina da loiça", fila: "baixo", larguras: [60], frentes: ["painel"], leva: "maquina", grupo: "Máquina da loiça" },
  alto: { n: "Armário alto", fila: "baixo", larguras: [40, 60], frentes: ["2p"], alto: true, grupo: "Altos" },
  alto_forno: { n: "Armário alto do forno", fila: "baixo", larguras: [60], frentes: ["forno"], alto: true, leva: "forno", grupo: "Altos" },
  alto_frigorifico: { n: "Armário do frigorífico", fila: "baixo", larguras: [60], frentes: ["2p"], alto: true, leva: "frigorifico", grupo: "Frigorífico" },
  frigorifico: { n: "Frigorífico", fila: "baixo", larguras: [60], frentes: ["2p"], alto: true, leva: "frigorifico", grupo: "Frigorífico" },
  parede: { n: "Armário de parede", fila: "parede", larguras: [30, 40, 60, 80], frentes: ["p"], grupo: "De parede" },
  exaustor: { n: "Exaustor", fila: "parede", larguras: [60, 90], frentes: ["painel"], leva: "exaustor", grupo: "Exaustor" },
  vazio: { n: "Espaço livre", fila: "baixo", larguras: [10, 20, 30, 40, 60], frentes: ["p"], grupo: "Espaço livre" },
};
export const NOME_FRENTE: Record<Frente, string> = { "3g": "3 gavetas", gp: "Gaveta e porta", p: "Porta", "2p": "2 portas", forno: "Forno e gaveta", painel: "Painel" };

/** Corpos (por largura) e frentes (por cm), € sem IVA, de teste. */
const CORPO: Record<"baixo" | "alto" | "parede", Record<number, number>> = {
  baixo: { 10: 0, 20: 0, 30: 70, 40: 80, 60: 95, 80: 115, 90: 0 },
  alto: { 40: 190, 60: 230 },
  parede: { 30: 55, 40: 60, 60: 75, 80: 90, 90: 0 },
};
const FRENTE_CM: Record<Frente, number> = { "3g": 2.4, gp: 1.9, p: 1.3, "2p": 3.2, forno: 1.6, painel: 1.4 };
const GAVETAS: Partial<Record<Frente, number>> = { "3g": 45, gp: 15, forno: 15 };

/** Quantos puxadores leva a frente. */
export function puxadores(m: Pick<Modulo, "modelo" | "frente" | "w">): number {
  if (m.modelo === "vazio" || m.modelo === "exaustor" || m.modelo === "frigorifico") return 0;
  const portas = m.w > 60 ? 2 : 1;
  return ({ "3g": 3, gp: 1 + portas, p: portas, "2p": 2, forno: 1, painel: 1 } as Record<Frente, number>)[m.frente];
}

export const acabamentoDe = (c: Pick<Cozinha, "acabamento">) => ACABAMENTOS.find((a) => a.id === c.acabamento) ?? ACABAMENTOS[0];
export const puxadorDe = (c: Pick<Cozinha, "puxador">) => PUXADORES.find((a) => a.id === c.puxador) ?? PUXADORES[0];

/** O preço do móvel (corpo + frente com o acabamento + gavetas + puxadores), sem os produtos que leva. */
export function precoDoMovel(m: Modulo, c: Pick<Cozinha, "acabamento" | "puxador">): number {
  const info = MODELOS[m.modelo];
  if (m.modelo === "vazio" || m.modelo === "frigorifico" || m.modelo === "exaustor") return 0;
  const corpo = (info.fila === "parede" ? CORPO.parede : info.alto ? CORPO.alto : CORPO.baixo)[m.w] ?? 0;
  const frente = m.w * FRENTE_CM[m.frente] * (1 + acabamentoDe(c).delta);
  return Math.round(corpo + frente + (GAVETAS[m.frente] ?? 0) + puxadores(m) * puxadorDe(c).preco);
}

// ---------------------------------------------------------------- os produtos do catálogo para cada modelo
export const produtosDe = (cat: Categoria): Produto[] => CATALOGO.filter((p) => p.cat === cat);
/** Os produtos que servem este módulo (os frigoríficos de encastrar só no armário; os livres, sozinhos). */
export function produtosPara(modelo: Modelo, qual: "leva" | "extra" = "leva"): Produto[] {
  const cat = MODELOS[modelo][qual];
  if (!cat) return [];
  const todos = produtosDe(cat);
  if (cat === "torneira") return todos.filter((p) => /cozinha|bica/i.test(p.n));
  if (cat === "frigorifico") return todos.filter((p) => (modelo === "alto_frigorifico") === /encastrar/i.test(p.n));
  return todos;
}

let seq = 0;
const novoId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Um módulo novo deste modelo e largura, com os produtos de omissão (o primeiro que serve). */
export function novoModulo(modelo: Modelo, w?: number, frente?: Frente): Modulo {
  const info = MODELOS[modelo];
  const larg = w && info.larguras.includes(w) ? w : info.larguras.includes(60) ? 60 : info.larguras[0];
  const m: Modulo = { id: novoId(), modelo, w: larg, frente: frente && info.frentes.includes(frente) ? frente : info.frentes[0] };
  const leva = produtosPara(modelo).find((p) => !p.w || p.w <= larg) ?? produtosPara(modelo)[0];
  if (leva) m.produto = leva.id;
  const extra = produtosPara(modelo, "extra")[0];
  if (extra && m.frente === "forno") m.extra = extra.id;
  else if (extra && modelo === "lava") m.extra = extra.id;
  return m;
}

// ---------------------------------------------------------------- a fila: onde está cada módulo
export interface Posto { m: Modulo; x0: number; x1: number }
/** As posições da fila, da esquerda para a direita, a começar no canto (x = 0). */
export function postos(fila: readonly Modulo[]): Posto[] {
  let x = 0;
  return fila.map((m) => { const p = { m, x0: x, x1: x + m.w }; x += m.w; return p; });
}
export const comprimento = (fila: readonly Modulo[]) => fila.reduce((s, m) => s + m.w, 0);

/** Os troços de tampo: os baixos seguidos (o alto, o frigorífico e o espaço livre cortam o tampo). */
export function trocosDeTampo(c: Pick<Cozinha, "baixo">): { x0: number; x1: number }[] {
  const out: { x0: number; x1: number }[] = [];
  for (const p of postos(c.baixo)) {
    const cobre = !MODELOS[p.m.modelo].alto && p.m.modelo !== "vazio";
    const ultimo = out[out.length - 1];
    if (!cobre) continue;
    if (ultimo && Math.abs(ultimo.x1 - p.x0) < 0.01) ultimo.x1 = p.x1;
    else out.push({ x0: p.x0, x1: p.x1 });
  }
  return out;
}
export const metrosDeTampo = (c: Pick<Cozinha, "baixo">) => Math.round(trocosDeTampo(c).reduce((s, t) => s + (t.x1 - t.x0), 0)) / 100;

/** O que se diz da parede: quanto sobra ou quanto passa, em cada fila. */
export function avisos(c: Cozinha): string[] {
  const out: string[] = [];
  const b = comprimento(c.baixo), a = comprimento(c.cima);
  if (b > c.parede) out.push(`A fila de baixo passa ${b - c.parede} cm da parede.`);
  if (a > c.parede) out.push(`A fila de cima passa ${a - c.parede} cm da parede.`);
  if (c.baixo.some((m) => m.modelo === "placa") && !c.cima.some((m) => m.modelo === "exaustor") && !c.baixo.some((m) => /exaust/i.test(produto(m.produto)?.n ?? "")))
    out.push("Há placa sem exaustor por cima.");
  if (!c.baixo.some((m) => m.modelo === "lava")) out.push("Falta o lava-loiça.");
  return out;
}

// ---------------------------------------------------------------- mexer na cozinha
/** Juntar à fila do modelo (o espaço livre vai para a fila que se disser), a seguir ao módulo dado ou no fim. */
export function juntar(c: Cozinha, m: Modulo, depoisDe?: string, emCima?: boolean): Cozinha {
  const fila: "baixo" | "cima" = emCima ?? MODELOS[m.modelo].fila === "parede" ? "cima" : "baixo";
  const lista = [...c[fila]];
  const i = depoisDe ? lista.findIndex((x) => x.id === depoisDe) : -1;
  lista.splice(i >= 0 ? i + 1 : lista.length, 0, m);
  return { ...c, [fila]: lista };
}
const naFila = (c: Cozinha, id: string): "baixo" | "cima" | null => (c.baixo.some((x) => x.id === id) ? "baixo" : c.cima.some((x) => x.id === id) ? "cima" : null);
export const moduloDe = (c: Cozinha, id: string | null) => (id ? [...c.baixo, ...c.cima].find((x) => x.id === id) ?? null : null);
export function mudar(c: Cozinha, id: string, mud: Partial<Modulo>): Cozinha {
  const f = naFila(c, id);
  if (!f) return c;
  return { ...c, [f]: c[f].map((x) => (x.id === id ? { ...x, ...mud } : x)) };
}
export function tirar(c: Cozinha, id: string): Cozinha {
  const f = naFila(c, id);
  return f ? { ...c, [f]: c[f].filter((x) => x.id !== id) } : c;
}
export function mover(c: Cozinha, id: string, passo: -1 | 1): Cozinha {
  const f = naFila(c, id);
  if (!f) return c;
  const lista = [...c[f]], i = lista.findIndex((x) => x.id === id), j = i + passo;
  if (j < 0 || j >= lista.length) return c;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return { ...c, [f]: lista };
}
export function duplicar(c: Cozinha, id: string): Cozinha {
  const m = moduloDe(c, id);
  return m ? juntar(c, { ...m, id: novoId() }, id, naFila(c, id) === "cima") : c;
}

// ---------------------------------------------------------------- o resumo e os preços
export interface LinhaCozinha { id: string; grupo: "Móveis" | "Tampo" | "Eletrodomésticos" | "Montagem"; n: string; q: number; un: string; unit: number; total: number; cat?: Categoria }
const r2 = (n: number) => Math.round(n * 100) / 100;

export function linhasDaCozinha(c: Cozinha): LinhaCozinha[] {
  const out: LinhaCozinha[] = [];
  const linha = (l: Omit<LinhaCozinha, "total">) => out.push({ ...l, total: r2(l.q * l.unit) });
  const ac = acabamentoDe(c), px = puxadorDe(c);
  for (const m of [...c.baixo, ...c.cima]) {
    const info = MODELOS[m.modelo], movel = precoDoMovel(m, c);
    if (movel > 0) linha({ id: `coz-mod-${m.id}`, grupo: "Móveis", n: `${info.n} ${m.w} cm · ${NOME_FRENTE[m.frente].toLowerCase()}, ${ac.n.toLowerCase()}${puxadores(m) && px.id !== "gola" ? `, ${px.n.toLowerCase()}` : ""}`, q: 1, un: "un", unit: movel });
    for (const [qual, id] of [["leva", m.produto], ["extra", m.extra]] as const) {
      const p = produto(id);
      if (!p) continue;
      if (qual === "extra" && m.modelo === "placa" && m.frente !== "forno") continue;
      linha({ id: `coz-apar-${m.id}-${qual}`, grupo: "Eletrodomésticos", n: p.n, q: 1, un: "un", unit: p.preco, cat: p.cat });
    }
  }
  const tampo = produto(c.tampo), metros = metrosDeTampo(c);
  if (tampo && metros > 0) {
    const porMetro = r2(tampo.preco / 1.2);
    linha({ id: "coz-tampo", grupo: "Tampo", n: `Tampo ${tampo.colecao.toLowerCase()} · ${tampo.n.split(",").pop()?.trim() ?? ""}`, q: metros, un: "m", unit: porMetro, cat: "bancada" });
  }
  // a montagem: por módulo, os recortes, o circuito, a conduta e a ligação (os serviços do Estúdio)
  const sv = (id: string) => SERVICOS.find((x) => x.id === id)!;
  const mods = [...c.baixo, ...c.cima].filter((m) => precoDoMovel(m, c) > 0).length;
  if (mods) linha({ id: "serv-sv-montagem-cozinha", grupo: "Montagem", n: sv("sv-montagem-cozinha").n, q: mods, un: "un", unit: sv("sv-montagem-cozinha").preco });
  const recortes = c.baixo.filter((m) => m.modelo === "lava" || m.modelo === "placa").length;
  if (recortes) linha({ id: "serv-sv-recortes", grupo: "Montagem", n: sv("sv-recortes").n, q: recortes, un: "un", unit: sv("sv-recortes").preco });
  if (c.baixo.some((m) => m.modelo === "placa" || m.modelo === "alto_forno")) linha({ id: "serv-sv-circuito-placa", grupo: "Montagem", n: sv("sv-circuito-placa").n, q: 1, un: "un", unit: sv("sv-circuito-placa").preco });
  if (c.cima.some((m) => m.modelo === "exaustor")) linha({ id: "serv-sv-conduta", grupo: "Montagem", n: sv("sv-conduta").n, q: 1, un: "un", unit: sv("sv-conduta").preco });
  if (c.baixo.some((m) => m.modelo === "maquina")) linha({ id: "serv-sv-ligacao-maquina", grupo: "Montagem", n: sv("sv-ligacao-maquina").n, q: 1, un: "un", unit: sv("sv-ligacao-maquina").preco });
  // a instalação dos eletrodomésticos e do lava-loiça (a mão de obra do produto)
  const inst = [...c.baixo, ...c.cima].flatMap((m) => [m.produto, m.modelo === "placa" && m.frente !== "forno" ? undefined : m.extra]).map((id) => produto(id)).filter((p): p is Produto => !!p);
  const maoDeObra = r2(inst.reduce((s, p) => s + p.inst, 0));
  if (maoDeObra) linha({ id: "coz-inst", grupo: "Montagem", n: "Instalação dos eletrodomésticos, do lava-loiça e da torneira", q: 1, un: "un", unit: maoDeObra });
  return out;
}

export function totalDaCozinha(c: Cozinha): { semIva: number; comIva: number } {
  const semIva = r2(linhasDaCozinha(c).reduce((s, l) => s + l.total, 0));
  return { semIva, comIva: r2(semIva * (1 + IVA)) };
}

// ---------------------------------------------------------------- de omissão, e a partir do Estúdio
export function cozinhaDeExemplo(parede = 330): Cozinha {
  return {
    parede, altura: 250, fundo: 320, acabamento: "branco", puxador: "inox", tampo: "ban-carvalho",
    baixo: [novoModulo("alto_frigorifico"), novoModulo("normal", 40, "3g"), novoModulo("lava", 80), novoModulo("maquina"), novoModulo("placa", 60), novoModulo("normal", 30, "p")],
    // por cima do frigorífico (alto) fica um espaço livre; o exaustor por cima da placa
    cima: [novoModulo("vazio", 60), novoModulo("parede", 40), novoModulo("parede", 80), novoModulo("parede", 60), novoModulo("exaustor", 60), novoModulo("parede", 30)],
  };
}

/**
 * Uma cozinha que cabe na parede: o frigorífico alto (com 2,80 m ou mais), o lava-loiça, a máquina e a placa com o forno, e o resto
 * com armários baixos (80, 60, 40, 30). Em cima, a mesma largura de cada um: armários de parede, o exaustor por cima da placa e um
 * espaço livre por cima dos altos.
 */
export function cozinhaParaParede(parede: number): Cozinha {
  const baixo: Modulo[] = [];
  let livre = parede;
  const por = (m: Modulo) => { if (m.w <= livre) { baixo.push(m); livre -= m.w; } };
  if (parede >= 280) por(novoModulo("alto_frigorifico"));
  por(novoModulo("lava", parede >= 240 ? 80 : 60));
  if (parede >= 200) por(novoModulo("maquina"));
  por(novoModulo("placa", 60, "forno"));
  for (const w of [80, 60, 40, 30]) while (livre >= w && baixo.length < 12) por(novoModulo("normal", w, w >= 60 ? "3g" : w === 40 ? "3g" : "p"));
  const cima = baixo.map((m) => (MODELOS[m.modelo].alto ? novoModulo("vazio", m.w) : m.modelo === "placa" ? novoModulo("exaustor", m.w) : MODELOS.parede.larguras.includes(m.w) ? novoModulo("parede", m.w) : novoModulo("vazio", m.w)))
    .map((m, i) => ({ ...m, w: baixo[i].w }));
  return { ...cozinhaDeExemplo(parede), baixo, cima };
}

/** O acabamento que combina com o estilo do Estúdio (a madeira, o branco, o preto). */
export function acabamentoDoEstilo(cores: readonly string[] | undefined): string {
  const c = cores?.[0];
  return c === "madeira" ? "carvalho" : c === "preto" ? "antracite" : c === "cinza" ? "pedra" : c === "bege" ? "pedra" : "branco";
}

/** Lida de qualquer sítio (o browser, o Estúdio): só uma cozinha com as filas. */
export function lerCozinha(x: unknown): Cozinha | null {
  const c = x as Cozinha | null;
  return c && Array.isArray(c.baixo) && Array.isArray(c.cima) && typeof c.parede === "number" ? c : null;
}
