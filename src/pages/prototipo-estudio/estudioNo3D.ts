// 9/11 (Rúben: «meter os modelos 3D do Miguel no Estúdio»). A planta do Estúdio (o antes ou o depois) no visualizador do Miguel
// (emylia/planta3d): a ponte dele (deLegado) passa a planta para o espaço 3D; aqui cada peça com produto escolhido leva um modelo do tipo
// dela com a medida e a cor do produto, e o revestimento e o pavimento escolhidos dão o das paredes e do chão (o mais parecido da lista
// dele). Os modelos detalhados (torneiras, lava-loiças, placas) entram quando os produtos do Estúdio forem os do Catálogo verdadeiro.
import { cantos, type PecaPlanta, type Planta } from "@/emylia/planta";
import { centroPeca, normalInteriorCm, paredeMaisPertoCm, poligonoDe } from "@/emylia/planta3d/pecas3d";
import { deLegado, modeloGenerico, type ResLegado } from "@/emylia/planta3d/ligacao";
import { ESPEC, type ProdutoModelo3D, type TipoMockup } from "@/emylia/planta3d/catalogo3d";
import type { PecaProduto, Revestimentos } from "@/emylia/planta3d/modelo";
import type { Revestimento, Superficie } from "@/emylia/planta3d/revestimentos";
import { medidasDoTexto, semAcento } from "./pesquisaEstudio";
import { produto, type Produto } from "./catalogoFake";
import { alturaFinalCm, type Projeto } from "./necessidadesEstudio";

/** O pavimento e a parede do visualizador: o id da lista dele mais parecido (para quem só lê o id) e, com produto escolhido, o material
 *  desse produto (18/11, Rúben: «os pavimentos estão sem render 3D»: o chão saía sempre o «Cerâmico claro» da lista, com a cor e a
 *  medida de outro; agora o chão e as paredes têm a cor e a peça do produto, seja ele do catálogo de teste ou do da empresa). */
export function revestimentosDe(p: Pick<Projeto, "revestimento" | "pavimento">): Revestimentos {
  const pav = produto(p.pavimento), rev = produto(p.revestimento);
  const corPav = pav?.cores[0], corRev = rev?.cores[0];
  const pavimento = !pav ? "ceramico_claro" : corPav === "madeira" ? "madeira_carvalho" : corPav === "preto" || /antracite/i.test(pav.n) ? "ceramico_escuro" : "ceramico_claro";
  const parede = !rev ? "tinta_branca" : corRev === "madeira" ? "madeira_parede" : corRev === "cinza" || corRev === "preto" ? "tinta_cinza" : "azulejo_branco";
  const materiais: NonNullable<Revestimentos["materiais"]> = {};
  if (pav) materiais.pavimento = materialDoProduto(pav, "pavimento");
  if (rev) materiais.parede = materialDoProduto(rev, "parede");
  return { pavimento, parede, ...(pav || rev ? { materiais } : {}) };
}

/** Palavras de um produto com aspeto de madeira (soalho, vinílico, cerâmico efeito madeira). */
const MADEIRA = /\b(madeir|soalho|parquet|parque\b|tabua|tablon|carvalh|roble|oak|wood|nogal|nogueir|freixo|fresno|pinho|olmo|teca|wengue|walnut)/;
/** Palavras de um acabamento contínuo, sem juntas. */
const CONTINUO = /\b(microciment|microcement|resina|epoxi|betonilha)/;

/** Uma cor `hex` escurecida (`f` de 0 a 1), para as juntas. */
function escurecer(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#b8b4ab";
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - f)).toString(16).padStart(2, "0"));
  return `#${c.join("")}`;
}

/** O material 3D de um pavimento ou de um revestimento do Estúdio: a cor dele, e madeira (tábuas), peças (azulejo com a medida do nome,
 *  «45x45», «30x60», «120 x 20») ou contínuo (microcimento). A maior medida fica na horizontal; sem medida, a peça de sempre da lista. */
export function materialDoProduto(prod: Pick<Produto, "id" | "n" | "hex" | "cores"> & { destaque?: string }, superficie: Superficie): Revestimento {
  const texto = semAcento(`${prod.n} ${prod.destaque ?? ""}`);
  const md = medidasDoTexto(prod.n)?.slice(0, 2).map((x) => x / 100).filter((x) => x >= 0.05 && x <= 3.2);
  const [maior, menor] = md && md.length === 2 ? [Math.max(...md), Math.min(...md)] : [null, null];
  const base = { id: `estudio:${prod.id}`, nome: prod.n, cor: prod.hex };
  if (CONTINUO.test(texto)) return { ...base, tipo: "tinta", modulo: 1 };
  if (prod.cores[0] === "madeira" || MADEIRA.test(texto)) return { ...base, tipo: "madeira", modulo: menor ?? (superficie === "pavimento" ? 0.18 : 0.12) };
  const lado = superficie === "pavimento" ? 0.6 : 0.3;
  return { ...base, tipo: "azulejo", junta: escurecer(prod.hex, 0.25), modulo: maior ?? lado, ...(maior && menor && maior !== menor ? { moduloAlto: menor } : {}) };
}

/** O modelo de uma peça com produto: o genérico do tipo, com a medida, o nome e a cor do produto. */
function modeloDoProduto(tipo: Planta["pecas"][number]["tipo"], prod: Produto, wCm: number, hCm: number): ProdutoModelo3D {
  const g = modeloGenerico(tipo, prod.w ?? wCm, prod.h ?? hCm), e = ESPEC[g.tipo];
  const alto = prod.z1 !== undefined && prod.z0 !== undefined ? (prod.z1 - prod.z0) / 100 : g.mockup3d.altura;
  return {
    ...g, produtoId: `estudio:${prod.id}`, nome: prod.n, categoria: "Estúdio", montagem: e.mont, alturaOmissao: (prod.z0 ?? 0) / 100 || e.alt, demo: true,
    mockup3d: { ...g.mockup3d, altura: alto, cor: prod.hex },
  } as ProdutoModelo3D;
}

/** 23/11: o que o 3D do depois mostra a mais do que a planta (o Estúdio da obra). */
export interface Mais3D {
  /** As paredes e o chão como estavam (o revestimento e o pavimento ainda por fazer). */
  semRevestimento?: boolean; semPavimento?: boolean;
  /** Produtos do contrato que a planta não tem como peça: o espelho fica por cima do móvel; a porta e a janela dão a cor às aberturas. */
  espelho?: Produto; porta?: Produto; janela?: Produto;
}

/** Os ids das peças a mais que o 3D do depois junta à planta (para marcar o que está feito). */
export const idResguardo = (base: string) => `${base}-resguardo`;
export const idColunaDuche = (base: string) => `${base}-coluna-duche`;
export const ID_ESPELHO_CONTRATO = "contrato-espelho";

/** O espaço 3D do Estúdio: `depois` com os produtos escolhidos (e o que vai com a base: o resguardo e a coluna de duche); o antes, como está. */
export function espacoDoEstudio(p: Projeto, qual: "antes" | "depois", mais: Mais3D = {}): ResLegado {
  const base3d = espacoSoDaPlanta(p, qual, mais);
  if (qual === "antes" || "erro" in base3d || !base3d.ok) return base3d;
  const pecas = [...base3d.espaco.pecas], modelos = { ...base3d.modelos };
  const juntar = (pc: PecaProduto, m: ProdutoModelo3D) => { pecas.push(pc); modelos[m.produtoId] = m; };
  for (const pc of p.depois.pecas) {
    if (pc.tipo !== "base" && pc.tipo !== "banheira") continue;
    const ac = p.acompanha[pc.id] ?? {};
    const resg = pc.tipo === "base" ? produto(ac.resguardo) : undefined, col = produto(ac.coluna_duche);
    if (resg) { const r = resguardoNo3D(pc, p.depois, resg); juntar(r.pc, r.m); }
    if (col) { const r = colunaNo3D(pc, p.depois, col); juntar(r.pc, r.m); }
  }
  if (mais.espelho && !p.depois.pecas.some((x) => x.tipo === "espelho")) {
    const movel = p.depois.pecas.find((x) => x.tipo === "movel" || x.tipo === "lava");
    if (movel) { const r = espelhoNo3D(movel, p.depois, mais.espelho); juntar(r.pc, r.m); }
  }
  const corDe = (a: { tipo: string }) => (a.tipo === "porta" ? mais.porta?.hex : a.tipo === "janela" ? mais.janela?.hex : undefined);
  const aberturas = base3d.espaco.aberturas.map((a) => { const cor = corDe(a); return cor ? { ...a, cor } : a; });
  return { ...base3d, modelos, espaco: { ...base3d.espaco, pecas, aberturas } };
}

/** Um modelo do tipo `tipo` com o nome, a medida (cm) e a cor do produto. */
function modeloDe(tipo: TipoMockup, prod: Produto, larguraCm: number, profundidadeCm: number, alturaCm: number): ProdutoModelo3D {
  const e = ESPEC[tipo];
  return {
    produtoId: `estudio:${prod.id}`, nome: prod.n, tipo, categoria: "Estúdio", montagem: e.mont, alturaOmissao: e.alt, demo: true,
    dimensoes: { larguraCm, profundidadeCm, alturaCm, deNome: false },
    mockup3d: { tipo, largura: larguraCm / 100, profundidade: profundidadeCm / 100, altura: alturaCm / 100, cor: tipo === "resguardo" ? e.cor : prod.hex },
  };
}

/** Os lados de uma peça da planta (cm): o meio de cada lado, a direção para fora e o comprimento, já com a rotação da peça. */
function ladosDe(pc: PecaPlanta): { meio: { x: number; y: number }; n: { x: number; y: number }; c: number }[] {
  const cx = pc.x + pc.w / 2, cy = pc.y + pc.h / 2, a = ((pc.rot ?? 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const rodar = (x: number, y: number) => ({ x: x * cos - y * sin, y: x * sin + y * cos });
  return [
    { o: { x: 0, y: -pc.h / 2 }, n: { x: 0, y: -1 }, c: pc.w }, { o: { x: 0, y: pc.h / 2 }, n: { x: 0, y: 1 }, c: pc.w },
    { o: { x: -pc.w / 2, y: 0 }, n: { x: -1, y: 0 }, c: pc.h }, { o: { x: pc.w / 2, y: 0 }, n: { x: 1, y: 0 }, c: pc.h },
  ].map((l) => { const o = rodar(l.o.x, l.o.y); return { meio: { x: cx + o.x, y: cy + o.y }, n: rodar(l.n.x, l.n.y), c: l.c }; });
}
/** O lado virado para o meio da divisão (o aberto) e o do lado contrário (o da parede). */
function ladoAbertoEFundo(pc: PecaPlanta, pl: Planta) {
  const pts = cantos(pl.paredes, pl.o).slice(0, -1);
  const m = { x: pts.reduce((s, q) => s + q.x, 0) / (pts.length || 1), y: pts.reduce((s, q) => s + q.y, 0) / (pts.length || 1) };
  const L = ladosDe(pc).map((l) => ({ ...l, d: Math.hypot(l.meio.x - m.x, l.meio.y - m.y) })).sort((a, b) => a.d - b.d);
  const aberto = L[0], fundo = L.find((l) => Math.abs(l.n.x + aberto.n.x) < 1e-6 && Math.abs(l.n.y + aberto.n.y) < 1e-6) ?? L[3];
  return { aberto, fundo };
}
/** O ângulo do 3D de uma peça cuja frente olha para `n` (a mesma conta de deLegado: atan2(nx, ny)). */
const anguloDe = (n: { x: number; y: number }) => Math.round((Math.atan2(n.x, n.y) * 180) / Math.PI);

/** O resguardo: um painel no lado aberto da base, com a largura do nome do produto (a medida até 1,6 m) ou o lado todo. */
function resguardoNo3D(pc: PecaPlanta, pl: Planta, prod: Produto): { pc: PecaProduto; m: ProdutoModelo3D } {
  const { aberto } = ladoAbertoEFundo(pc, pl);
  const md = medidasDoTexto(prod.n) ?? [];
  const alto = md.find((x) => x >= 180 && x <= 220) ?? ESPEC.resguardo.dim[2];
  const largo = Math.min(aberto.c, md.find((x) => x >= 30 && x <= 160) ?? aberto.c);
  // um painel mais curto do que o lado fica encostado à ponta do lado (a outra fica livre para entrar)
  const t = { x: -aberto.n.y, y: aberto.n.x }, desvio = (aberto.c - largo) / 2;
  const x = aberto.meio.x - t.x * desvio - aberto.n.x * 1, y = aberto.meio.y - t.y * desvio - aberto.n.y * 1;
  const m = modeloDe("resguardo", prod, largo, 2, alto);
  return { m, pc: { id: idResguardo(pc.id), produtoId: m.produtoId, x: x / 100, y: y / 100, rotacao: anguloDe(aberto.n), paredeEncosto: null, largura: largo / 100, profundidade: 0.02, montagem: "chao", altura: 0.03, espelhada: false, nome: prod.n } };
}
/** A coluna de duche: na parede do fundo da base, ao meio. */
function colunaNo3D(pc: PecaPlanta, pl: Planta, prod: Produto): { pc: PecaProduto; m: ProdutoModelo3D } {
  const { fundo } = ladoAbertoEFundo(pc, pl);
  const [w, d, h] = ESPEC.coluna_duche.dim;
  const m = modeloDe("coluna_duche", prod, w, d, h);
  const x = fundo.meio.x - fundo.n.x * (d / 2), y = fundo.meio.y - fundo.n.y * (d / 2);
  return { m, pc: { id: idColunaDuche(pc.id), produtoId: m.produtoId, x: x / 100, y: y / 100, rotacao: anguloDe({ x: -fundo.n.x, y: -fundo.n.y }), paredeEncosto: null, largura: w / 100, profundidade: d / 100, montagem: "parede", altura: ESPEC.coluna_duche.alt, espelhada: false, nome: prod.n } };
}
/** O espelho do contrato: na parede do móvel, por cima dele, com a largura do nome (ou a do móvel). */
function espelhoNo3D(movel: PecaPlanta, pl: Planta, prod: Produto): { pc: PecaProduto; m: ProdutoModelo3D } {
  const poly = poligonoDe(pl), c = centroPeca(movel);
  // o fundo do móvel é o lado virado para a parede mais perto (sem planta fechada, o do lado contrário ao meio da divisão)
  let n = ladoAbertoEFundo(movel, pl).aberto.n;
  if (poly) { const ni = normalInteriorCm(poly, paredeMaisPertoCm(poly, c).i); n = { x: ni.x, y: ni.y }; }
  const lados = ladosDe(movel), fundo = lados.reduce((b, l) => (l.n.x * -n.x + l.n.y * -n.y > b.n.x * -n.x + b.n.y * -n.y ? l : b), lados[0]);
  const md = medidasDoTexto(prod.n) ?? [];
  const largo = md.length >= 2 ? Math.min(md[0], fundo.c + 40) : (prod.w ?? fundo.c);
  const alto = md.length >= 2 ? md[1] : ESPEC.espelho.dim[2];
  const m = modeloDe("espelho", prod, largo, 3, alto);
  const x = fundo.meio.x + n.x * 1.5, y = fundo.meio.y + n.y * 1.5;
  const z0 = prod.z0 ?? Math.max(105, 190 - alto);
  return { m, pc: { id: ID_ESPELHO_CONTRATO, produtoId: m.produtoId, x: x / 100, y: y / 100, rotacao: anguloDe(n), paredeEncosto: null, largura: largo / 100, profundidade: 0.03, montagem: "parede", altura: z0 / 100, espelhada: false, nome: prod.n } };
}

/** O espaço 3D só com as peças da planta. */
function espacoSoDaPlanta(p: Projeto, qual: "antes" | "depois", mais: Mais3D): ResLegado {
  const planta = qual === "antes" ? p.antes : p.depois;
  const produtos: Record<string, ProdutoModelo3D> = {};
  const pecas = planta.pecas.map((pc) => {
    if (qual === "antes") return pc;
    const prod = produto(p.escolhas[pc.id]);
    if (!prod) return pc;
    const m = modeloDoProduto(pc.tipo, prod, pc.w, pc.h);
    produtos[m.produtoId] = m;
    return { ...pc, produto: m.produtoId };
  });
  const pe = alturaFinalCm(qual === "antes" ? { peDireito: p.alturas.peDireito, tetoFalso: null } : p.alturas) / 100;
  const res = deLegado({ ...planta, pecas: pecas.map((pc) => rodadaNo3D(pc, planta)) }, {
    tipo: p.divisao === "Cozinha" ? "cozinha" : "casa_banho", nome: p.nome ?? "Estúdio", peDireito: pe, produtos,
    revestimentos: qual === "depois" ? revestimentosDe({ revestimento: mais.semRevestimento ? undefined : p.revestimento, pavimento: mais.semPavimento ? undefined : p.pavimento }) : undefined,
  });
  if ("erro" in res || !res.ok) return res;
  // as peças de parede (o espelho, o toalheiro, o exaustor) ficam na parede, à altura do produto (ou à de sempre), não no chão
  // e os móveis suspensos (o móvel e a coluna com o produto acima do chão) à altura do produto
  const naParede = new Map(planta.pecas.flatMap((pc) => {
    const prod = qual === "depois" ? produto(p.escolhas[pc.id]) : undefined;
    if (pc.tipo in ALTURA_PAREDE) return [[pc.id, (prod?.z0 ?? ALTURA_PAREDE[pc.tipo]!) / 100] as const];
    if ((pc.tipo === "movel" || pc.tipo === "coluna") && (prod?.z0 ?? 0) > 5) return [[pc.id, prod!.z0! / 100] as const];
    return [];
  }));
  return { ...res, espaco: { ...res.espaco, pecas: res.espaco.pecas.map((x) => (naParede.has(x.id) ? { ...x, montagem: "parede", altura: naParede.get(x.id)! } : x)) } };
}

/**
 * 11/11 (Rúben: «as peças rodadas nas paredes em diagonal aparecem direitas no 3D»). No desenho do Estúdio (EditorPlanta), `rot` roda a
 * caixa como está desenhada (SVG rotate: a caixa gira `rot` graus em torno do meio) e a frente pode ser qualquer um dos 4 lados. O 3D do
 * Miguel lê `rot` como a direção da frente (sin, cos) e gira a caixa ao contrário (three.js). Aqui passa-se uma à outra: o ângulo do 3D é
 * −rot mais o quarto de volta que deixa a frente virada para dentro da divisão (pela parede mais perto), e a largura e a profundidade
 * trocam quando é um quarto ímpar (o meio da peça fica onde está). As portas e as janelas não mudam (o 3D põe-nas pela parede).
 */
export function rodadaNo3D(pc: PecaPlanta, planta: Planta): PecaPlanta {
  if (pc.rot === undefined || pc.tipo === "porta" || pc.tipo === "janela") return pc;
  const poly = poligonoDe(planta);
  const c = centroPeca(pc);
  let k = 0;
  if (poly) {
    const n = normalInteriorCm(poly, paredeMaisPertoCm(poly, c).i);
    k = [0, 1, 2, 3].reduce((b, q) => {
      const a = ((-pc.rot! + 90 * q) * Math.PI) / 180, s = Math.sin(a) * n.x + Math.cos(a) * n.y;
      return s > b.s + 1e-6 ? { q, s } : b;
    }, { q: 0, s: -Infinity }).q;
  }
  const rot = (((Math.round(-pc.rot + 90 * k)) % 360) + 360) % 360;
  const [w, h] = k % 2 ? [pc.h, pc.w] : [pc.w, pc.h];
  return { ...pc, rot, w, h, x: c.x - w / 2, y: c.y - h / 2 };
}

/** A altura ao chão (cm) das peças de parede sem produto escolhido. */
const ALTURA_PAREDE: Partial<Record<Planta["pecas"][number]["tipo"], number>> = { espelho: 110, toalheiro: 90, exaustor: 150 };
