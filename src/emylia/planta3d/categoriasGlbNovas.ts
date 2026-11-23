// Os 7 genéricos NOVOS para os produtos que hoje ficam sem modelo (quadro «subcategoria → modelo genérico 3D», 23/11): tampo de WC, lava-loiça
// de encastrar, máquina de roupa, termoacumulador/esquentador, aplique LED, garrafeira e acessório pequeno de parede.
//
// LIGADOS À APP (aprovados pelo dono, 23/11): CATEGORIAS_GLB (categoriasGlb.ts) junta-os no fim, depois dos 28, para nada do que já casava mudar;
// o classificador (catalogo3d.ts) põe as medidas de omissão de cada um (`medidasDeOmissaoNovas`); os GLB estão em
// public/modelos3d/genericos/<id>.glb, gerados por scripts/gerar-modelos-glb-novos.mjs a partir desta tabela. Todos são `soComProduto`: só os
// escolhe um produto do catálogo (pelo nome); as peças sem nome (antigas, do Estúdio, das famílias) não mudam. Os tipos usados (`bancada`,
// `tampo`, `lava_loica`, `eletro`, `candeeiro`, `acessorio`) já existiam em TipoMockup.
//
// As mesmas convenções da tabela principal: metros; origem no centro da base (x de −w/2 a w/2, y de 0 a h, z de −d/2 a d/2, a frente em +z e as
// costas, encostadas à parede, em −z); cada parte é uma peça unitária (±0,5) escalada por `esc`, rodada por `rot` (Euler XYZ) e posta em `pos`;
// o cilindro tem o eixo em y. Tudo o que não deve deformar fica fixo em metros (espessuras, rebordos, paredes, botões, diâmetros), com um limite
// para nunca passar da medida da peça. Sem React nem three.
import type { CategoriaGlb, Colocacao, MaterialGlb, ParamsGenerico, ParteGlb, V3 } from "./categoriasGlb";

const min = Math.min, max = Math.max;
const limitar = (x: number, a: number, b: number): number => min(b, max(a, x));
type Colocar = ParteGlb["colocar"];
type Ver = ParteGlb["ver"];
const parte = (nome: string, forma: ParteGlb["forma"], mat: MaterialGlb, colocar: Colocar, ver?: Ver): ParteGlb => ({ nome, forma, mat, colocar, ...(ver ? { ver } : {}) });
const caixa = (nome: string, mat: MaterialGlb, colocar: Colocar, ver?: Ver): ParteGlb => parte(nome, "caixa", mat, colocar, ver);
const cilindro = (nome: string, mat: MaterialGlb, colocar: Colocar, ver?: Ver): ParteGlb => parte(nome, "cilindro", mat, colocar, ver);
/** Rodar o cilindro: com o eixo para a frente (z) ou deitado ao longo da largura (x). */
const PARA_A_FRENTE: V3 = [Math.PI / 2, 0, 0];
const AO_COMPRIDO: V3 = [0, 0, Math.PI / 2];
const e = (id: string, v: string): NonNullable<Ver> => (p) => p.o[id] === v;
const ligado = (id: string): NonNullable<Ver> => (p) => p.o[id] !== false;
const desligado = (id: string): NonNullable<Ver> => (p) => p.o[id] === false;
/** Uma caixa de x0 a x1, de y0 a y1 e de z0 a z1 (m). */
const entre = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Colocacao => ({ pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], esc: [x1 - x0, y1 - y0, z1 - z0] });

/** As medidas de cada genérico (m, [largura, profundidade, altura]): o intervalo aceite e os três tamanhos típicos (para a página e os testes). */
export interface MedidasGenerico { min: V3; max: V3; tamanhos: { pequeno: V3; mediano: V3; grande: V3 } }

/* ------------------------------------------------------------------ tampo de WC (e de cozinha), com ou sem cuba integrada */
/** A cuba integrada no tampo: centro (x, z), tamanho (cw, cd) e fundo do rebaixo (m). Fica sempre com placa à volta. */
function cubaDoTampo({ w, d, h, o }: ParamsGenerico): { x: number; z: number; cw: number; cd: number; prof: number } {
  const cw = min(0.5, w * 0.6, w - 0.1), cd = min(0.36, d * 0.62, d - 0.12);
  // a cuba puxa para a frente (atrás fica o lugar da torneira); à esquerda ou à direita, com pelo menos 8 cm de placa do lado
  const frente = max(0.05, (d - cd) * 0.35), livre = max(0, w / 2 - cw / 2 - 0.08);
  const x = o.posicao === "esquerda" ? -livre : o.posicao === "direita" ? livre : 0;
  return { x, z: d / 2 - frente - cd / 2, cw, cd, prof: h * 0.7 };
}
const comCuba = ligado("cuba");
const TAMPO_WC: CategoriaGlb = {
  id: "tampo_wc", rotulo: "Tampo ou bancada (com ou sem cuba)", tipos: ["bancada", "tampo"], soComProduto: true,
  opcoes: [
    { id: "cuba", rotulo: "Com cuba integrada", tipo: "sim", omissao: (_t, n) => /lavabo|lavat|cuba|bacia/i.test(n) && !/s(em|in) (lavabo|cuba)/i.test(n) },
    {
      id: "posicao", rotulo: "Posição da cuba", tipo: "lista", valores: [{ id: "centrada", rotulo: "Centrada" }, { id: "esquerda", rotulo: "À esquerda" }, { id: "direita", rotulo: "À direita" }],
      omissao: (_t, n) => (/\bizq|\besq/i.test(n) ? "esquerda" : /\bdcha|\bder(echa)?\b|\bdir(eita)?\b/i.test(n) ? "direita" : "centrada"),
    },
    { id: "furo", rotulo: "Furo da torneira", tipo: "sim", omissao: true },
  ],
  partes: [
    caixa("placa", "corpo", ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] }), desligado("cuba")),
    // com cuba: a placa à volta do buraco (quatro peças) e o rebaixo, com o fundo à vista
    caixa("placa_esq", "corpo", (p) => { const c = cubaDoTampo(p); return entre(-p.w / 2, c.x - c.cw / 2, 0, p.h, -p.d / 2, p.d / 2); }, comCuba),
    caixa("placa_dir", "corpo", (p) => { const c = cubaDoTampo(p); return entre(c.x + c.cw / 2, p.w / 2, 0, p.h, -p.d / 2, p.d / 2); }, comCuba),
    caixa("placa_tras", "corpo", (p) => { const c = cubaDoTampo(p); return entre(c.x - c.cw / 2, c.x + c.cw / 2, 0, p.h, -p.d / 2, c.z - c.cd / 2); }, comCuba),
    caixa("placa_frente", "corpo", (p) => { const c = cubaDoTampo(p); return entre(c.x - c.cw / 2, c.x + c.cw / 2, 0, p.h, c.z + c.cd / 2, p.d / 2); }, comCuba),
    caixa("cuba_fundo", "interior", (p) => { const c = cubaDoTampo(p); return entre(c.x - c.cw / 2, c.x + c.cw / 2, 0, p.h - c.prof, c.z - c.cd / 2, c.z + c.cd / 2); }, comCuba),
    cilindro("cuba_ralo", "metal", (p) => { const c = cubaDoTampo(p), r = min(0.05, c.cw * 0.3); return { pos: [c.x, p.h - c.prof + 0.002, c.z + c.cd * 0.1], esc: [r, 0.004, r] }; }, comCuba),
    cilindro("furo_torneira", "escuro", (p) => { const c = cubaDoTampo(p); return { pos: [c.x, p.h - 0.001, (-p.d / 2 + c.z - c.cd / 2) / 2], esc: [0.035, 0.004, 0.035] }; }, (p) => p.o.cuba !== false && p.o.furo !== false),
  ],
};

/* ------------------------------------------------------------------ lava-loiça de encastrar: 1 ou 2 cubas, escorredor, rebordo */
/** A espessura da chapa do rebordo e a das paredes da cuba (m). */
const CHAPA = 0.006, PAREDE_CUBA = 0.008;
interface LayoutLava { cubas: { x0: number; x1: number }[]; esc: { x0: number; x1: number } | null; z0: number; z1: number }
/** Onde ficam as cubas e o escorredor ao longo da largura, e a profundidade das cubas. `n` força o número de cubas. */
function layoutLava({ w, d, o }: ParamsGenerico, n = o.cubas === "2" ? 2 : 1): LayoutLava {
  const margem = o.rebordo === false ? 0.012 : 0.045, tras = margem + (o.rebordo === false ? 0 : 0.035), folga = 0.04;
  const util = w - 2 * margem, comEsc = o.escorredor === true, larguraEsc = comEsc ? util * 0.38 : 0;
  const zona = util - larguraEsc - (comEsc ? folga : 0), escEsq = o.lado === "esquerda";
  let x = -w / 2 + margem + (comEsc && escEsq ? larguraEsc + folga : 0);
  const larguras = n === 2 ? [zona * 0.58 - folga / 2, zona * 0.42 - folga / 2] : [zona];
  const cubas = larguras.map((l) => { const c = { x0: x, x1: x + l }; x += l + folga; return c; });
  const esc = comEsc ? (escEsq ? { x0: -w / 2 + margem, x1: -w / 2 + margem + larguraEsc } : { x0: w / 2 - margem - larguraEsc, x1: w / 2 - margem }) : null;
  return { cubas, esc, z0: -d / 2 + tras, z1: d / 2 - margem };
}
/** As peças de uma cuba (fundo, quatro paredes e o ralo): um rebaixo verdadeiro, que se vê de cima. */
function pecasDaCuba(i: 0 | 1, ver: NonNullable<Ver>): ParteGlb[] {
  const pre = `cuba${i + 1}_`, n = i === 1 ? 2 : undefined;
  const c = (p: ParamsGenerico) => { const l = layoutLava(p, n ?? (p.o.cubas === "2" ? 2 : 1)); return { ...l.cubas[i], z0: l.z0, z1: l.z1 }; };
  return [
    caixa(`${pre}fundo`, "corpo", (p) => { const k = c(p); return entre(k.x0, k.x1, 0, PAREDE_CUBA, k.z0, k.z1); }, ver),
    caixa(`${pre}frente`, "corpo", (p) => { const k = c(p); return entre(k.x0, k.x1, 0, p.h, k.z1 - PAREDE_CUBA, k.z1); }, ver),
    caixa(`${pre}tras`, "corpo", (p) => { const k = c(p); return entre(k.x0, k.x1, 0, p.h, k.z0, k.z0 + PAREDE_CUBA); }, ver),
    caixa(`${pre}esq`, "corpo", (p) => { const k = c(p); return entre(k.x0, k.x0 + PAREDE_CUBA, 0, p.h, k.z0, k.z1); }, ver),
    caixa(`${pre}dir`, "corpo", (p) => { const k = c(p); return entre(k.x1 - PAREDE_CUBA, k.x1, 0, p.h, k.z0, k.z1); }, ver),
    cilindro(`${pre}ralo`, "metal", (p) => { const k = c(p), r = min(0.09, (k.x1 - k.x0) * 0.5, (k.z1 - k.z0) * 0.5); return { pos: [(k.x0 + k.x1) / 2, PAREDE_CUBA + 0.002, (k.z0 + k.z1) / 2], esc: [r, 0.004, r] }; }, ver),
  ];
}
const duasCubas = e("cubas", "2");
const LAVA_LOICA: CategoriaGlb = {
  id: "lava_loica", rotulo: "Lava-loiça de encastrar (cuba)", tipos: ["lava_loica"], soComProduto: true,
  opcoes: [
    { id: "cubas", rotulo: "Cubas", tipo: "lista", valores: [{ id: "1", rotulo: "Uma cuba" }, { id: "2", rotulo: "Duas cubas" }], omissao: (_t, n) => (/\b2 cubas|duas cubas|dupla|1[,.]5 cubas|cuba e meia/i.test(n) ? "2" : "1") },
    { id: "escorredor", rotulo: "Com escorredor", tipo: "sim", omissao: (_t, n) => /escorr/i.test(n) },
    { id: "lado", rotulo: "Escorredor do lado", tipo: "lista", valores: [{ id: "direita", rotulo: "Direito" }, { id: "esquerda", rotulo: "Esquerdo" }], omissao: (_t, n) => (/\besq|\bizq/i.test(n) ? "esquerda" : "direita") },
    { id: "rebordo", rotulo: "Rebordo sobre a bancada", tipo: "sim", omissao: (_t, n) => !/bajo|sob (a )?bancada|submont|enrasad|flush/i.test(n) },
  ],
  partes: [
    // a chapa do rebordo à volta das cubas: atrás e à frente a toda a largura, e os pedaços entre as cubas
    caixa("rebordo_tras", "corpo", (p) => { const l = layoutLava(p); return entre(-p.w / 2, p.w / 2, p.h - CHAPA, p.h, -p.d / 2, l.z0); }),
    caixa("rebordo_frente", "corpo", (p) => { const l = layoutLava(p); return entre(-p.w / 2, p.w / 2, p.h - CHAPA, p.h, l.z1, p.d / 2); }),
    caixa("rebordo_esq", "corpo", (p) => { const l = layoutLava(p); return entre(-p.w / 2, l.cubas[0].x0, p.h - CHAPA, p.h, l.z0, l.z1); }),
    caixa("rebordo_meio", "corpo", (p) => { const l = layoutLava(p, 2); return entre(l.cubas[0].x1, l.cubas[1].x0, p.h - CHAPA, p.h, l.z0, l.z1); }, duasCubas),
    caixa("rebordo_dir", "corpo", (p) => { const l = layoutLava(p); return entre(l.cubas[l.cubas.length - 1].x1, p.w / 2, p.h - CHAPA, p.h, l.z0, l.z1); }),
    ...pecasDaCuba(0, () => true),
    ...pecasDaCuba(1, duasCubas),
    // o escorredor: cinco estrias marcadas na chapa
    ...[0, 1, 2, 3, 4].map((i) => caixa(`escorredor_${i + 1}`, "escuro", (p) => {
      const l = layoutLava({ ...p, o: { ...p.o, escorredor: true } }), z = l.esc ?? { x0: 0, x1: 0.1 }, passo = (z.x1 - z.x0) / 5, prof = l.z1 - l.z0;
      return { pos: [z.x0 + passo * (i + 0.5), p.h - 0.0005, (l.z0 + l.z1) / 2], esc: [min(0.008, passo * 0.4), 0.002, prof * 0.8] };
    }, (p) => p.o.escorredor === true)),
  ],
};

/* ------------------------------------------------------------------ máquina de lavar / lavar e secar / secar roupa */
/** O tampo de cima (m), a espessura disponível à frente para porta e painel, e a altura do painel. */
const TAMPO_MAQ = 0.02, FRENTE_MAQ = 0.012;
const painelMaq = (h: number): number => min(0.1, h * 0.13);
const corpoMaq = ({ h, o }: ParamsGenerico): number => h - (o.encastre === true ? 0 : TAMPO_MAQ);
/** A porta redonda: centro em y e diâmetro (cabe entre o rodapé e o painel, e na largura). */
function portaMaq(p: ParamsGenerico): { y: number; dia: number } {
  const baixo = 0.08, cima = corpoMaq(p) - painelMaq(p.h) - 0.02;
  return { y: (baixo + cima) / 2, dia: min(p.w * 0.72, (cima - baixo) * 0.92) };
}
/** Uma peça na frente da máquina, com a espessura `t` (≤ FRENTE_MAQ) a sair da face. */
const naFrenteMaq = (nome: string, forma: ParteGlb["forma"], mat: MaterialGlb, f: (p: ParamsGenerico) => [number, number, number, number], t: number, ver?: Ver): ParteGlb =>
  parte(nome, forma, mat, (p) => {
    const [x, y, l, a] = f(p), z = p.d / 2 - FRENTE_MAQ + t / 2;
    return forma === "cilindro" ? { pos: [x, y, z], esc: [l, t, a], rot: PARA_A_FRENTE } : { pos: [x, y, z], esc: [l, a, t] };
  }, ver);
const naoSecar = (p: ParamsGenerico): boolean => p.o.tipo !== "secar";
const MAQUINA_ROUPA: CategoriaGlb = {
  id: "maquina_roupa", rotulo: "Máquina de lavar ou secar roupa", tipos: ["eletro"], nome: /m[áa]quina.*(roupa)|secar roupa|lavar roupa/i, soComProduto: true,
  opcoes: [
    {
      id: "tipo", rotulo: "Máquina de", tipo: "lista", valores: [{ id: "lavar", rotulo: "Lavar" }, { id: "lavar_secar", rotulo: "Lavar e secar" }, { id: "secar", rotulo: "Secar" }],
      omissao: (_t, n) => (/secar/i.test(n) ? (/lavar/i.test(n) ? "lavar_secar" : "secar") : "lavar"),
    },
    { id: "encastre", rotulo: "De encastrar (sem tampo à vista)", tipo: "sim", omissao: (_t, n) => /encastr|integr/i.test(n) },
  ],
  partes: [
    caixa("corpo", "corpo", (p) => entre(-p.w / 2, p.w / 2, 0, corpoMaq(p), -p.d / 2, p.d / 2 - FRENTE_MAQ)),
    caixa("tampo", "corpo", ({ w, d, h }) => entre(-w / 2, w / 2, h - TAMPO_MAQ, h, -d / 2, d / 2), (p) => p.o.encastre !== true),
    // o painel: gaveta do detergente à esquerda, o mostrador ao meio e o selector de programas à direita
    naFrenteMaq("gaveta", "caixa", "interior", (p) => [-p.w * 0.32, corpoMaq(p) - painelMaq(p.h) / 2, p.w * 0.3, painelMaq(p.h) * 0.7], 0.008, naoSecar),
    naFrenteMaq("painel", "caixa", "plastico", (p) => [p.w * 0.06, corpoMaq(p) - painelMaq(p.h) / 2, p.w * 0.34, painelMaq(p.h) * 0.6], 0.006),
    naFrenteMaq("mostrador", "caixa", "luz", (p) => [p.w * 0.02, corpoMaq(p) - painelMaq(p.h) / 2, p.w * (p.o.tipo === "lavar_secar" ? 0.18 : 0.12), painelMaq(p.h) * 0.25], 0.009),
    naFrenteMaq("selector", "cilindro", "metal", (p) => { const r = min(0.06, painelMaq(p.h) * 0.75); return [p.w * 0.34, corpoMaq(p) - painelMaq(p.h) / 2, r, r]; }, 0.012),
    // a porta redonda: o aro de metal, o vidro escuro (ou a porta cega da máquina de secar) e o puxador
    naFrenteMaq("aro_porta", "cilindro", "metal", (p) => { const k = portaMaq(p); return [0, k.y, k.dia, k.dia]; }, 0.006),
    naFrenteMaq("vidro_porta", "cilindro", "vidroEscuro", (p) => { const k = portaMaq(p); return [0, k.y, k.dia * 0.74, k.dia * 0.74]; }, 0.01, naoSecar),
    naFrenteMaq("porta_cega", "cilindro", "plastico", (p) => { const k = portaMaq(p); return [0, k.y, k.dia * 0.74, k.dia * 0.74]; }, 0.01, (p) => p.o.tipo === "secar"),
    naFrenteMaq("puxador_porta", "caixa", "plastico", (p) => { const k = portaMaq(p); return [k.dia * 0.42, k.y, 0.02, k.dia * 0.25]; }, 0.012),
    naFrenteMaq("rodape", "caixa", "escuro", (p) => [0, 0.02, p.w * 0.96, 0.03], 0.006),
  ],
};

/* ------------------------------------------------------------------ termoacumulador e esquentador (de parede) */
/** O espaço por baixo para os tubos (m). */
const tubosTermo = (h: number): number => min(0.06, h * 0.1);
/** A altura da chaminé do esquentador (m). */
const chamineTermo = (h: number): number => min(0.1, h * 0.15);
const ehCaixa = e("forma", "caixa"), ehCilindro = (p: ParamsGenerico): boolean => p.o.forma !== "caixa";
const deitado = (p: ParamsGenerico): boolean => p.o.orientacao === "horizontal";
/** O depósito cilíndrico: diâmetro, centro (y, z), comprimento e o tamanho das tampas arredondadas (m). */
function deposito(p: ParamsGenerico): { dia: number; y: number; z: number; comp: number; tampa: number } {
  const t = tubosTermo(p.h);
  if (deitado(p)) { const dia = min(p.h - t, p.d); return { dia, y: p.h - dia / 2, z: -p.d / 2 + dia / 2, comp: p.w, tampa: min(dia * 0.15, p.w * 0.15) }; }
  const dia = min(p.w, p.d), comp = p.h - t;
  return { dia, y: t + comp / 2, z: -p.d / 2 + dia / 2, comp, tampa: min(dia * 0.15, comp * 0.15) };
}
/** A caixa (esquentador ou termo plano): de onde a onde, em y. */
const caixaTermo = (p: ParamsGenerico): [number, number] => [tubosTermo(p.h), p.h - (p.o.chamine === true ? chamineTermo(p.h) : 0)];
/** Onde fica o painel do termóstato (x, y) e a face da frente (z), conforme a forma e a orientação. */
function painelTermo(p: ParamsGenerico): { x: number; y: number; z: number } {
  if (p.o.forma === "caixa") { const [y0, y1] = caixaTermo(p); return { x: 0, y: y0 + (y1 - y0) * 0.22, z: p.d / 2 }; }
  const k = deposito(p);
  return deitado(p) ? { x: p.w * 0.3, y: k.y - k.dia * 0.15, z: k.z + k.dia / 2 } : { x: 0, y: k.y - k.comp * 0.3, z: k.z + k.dia / 2 };
}
const TERMOACUMULADOR: CategoriaGlb = {
  id: "termoacumulador", rotulo: "Termoacumulador ou esquentador", tipos: ["eletro"], nome: /termoacumul|esquentador|cilindro.*(l\b|litros)/i, parede: { alt: 1.2 }, soComProduto: true,
  opcoes: [
    { id: "forma", rotulo: "Forma", tipo: "lista", valores: [{ id: "cilindro", rotulo: "Cilindro" }, { id: "caixa", rotulo: "Caixa" }], omissao: (_t, n) => (/esquentador|slim|plano|flat|rectang/i.test(n) ? "caixa" : "cilindro") },
    { id: "orientacao", rotulo: "Montagem", tipo: "lista", valores: [{ id: "vertical", rotulo: "Vertical" }, { id: "horizontal", rotulo: "Horizontal" }], omissao: (_t, n) => (/horiz/i.test(n) ? "horizontal" : "vertical") },
    { id: "chamine", rotulo: "Com chaminé (esquentador a gás)", tipo: "sim", omissao: (_t, n) => /esquentador/i.test(n) },
  ],
  partes: [
    cilindro("cilindro", "corpo", (p) => { const k = deposito(p), l = k.comp - 2 * k.tampa; return deitado(p) ? { pos: [0, k.y, k.z], esc: [k.dia, l, k.dia], rot: AO_COMPRIDO } : { pos: [0, k.y, k.z], esc: [k.dia, l, k.dia] }; }, ehCilindro),
    ...[-1, 1].map((s, i) => parte(i === 0 ? "tampa_1" : "tampa_2", "elipsoide", "corpo", (p) => {
      const k = deposito(p), a = k.comp / 2 - k.tampa;
      return deitado(p) ? { pos: [s * a, k.y, k.z], esc: [2 * k.tampa, k.dia, k.dia] } : { pos: [0, k.y + s * a, k.z], esc: [k.dia, 2 * k.tampa, k.dia] };
    }, ehCilindro)),
    parte("caixa", "caixaR", "corpo", (p) => { const [y0, y1] = caixaTermo(p); return entre(-p.w / 2, p.w / 2, y0, y1, -p.d / 2, p.d / 2); }, ehCaixa),
    cilindro("chamine", "metal", (p) => { const c = chamineTermo(p.h), r = min(0.13, p.w * 0.4, p.d * 0.8); return { pos: [0, p.h - c / 2, 0], esc: [r, c, r] }; }, (p) => p.o.forma === "caixa" && p.o.chamine === true),
    // o termóstato: painel, botão e luz piloto, rente à frente
    caixa("painel", "plastico", (p) => { const k = painelTermo(p); return { pos: [k.x, k.y, k.z - 0.009], esc: [min(0.1, p.w * 0.25), min(0.06, p.h * 0.08), 0.02] }; }),
    cilindro("botao", "metal", (p) => { const k = painelTermo(p), r = min(0.03, p.w * 0.08, p.h * 0.05); return { pos: [k.x - min(0.03, p.w * 0.08), k.y, k.z - 0.004], esc: [r, 0.008, r], rot: PARA_A_FRENTE }; }),
    caixa("luz_piloto", "luz", (p) => { const k = painelTermo(p); return { pos: [k.x + min(0.035, p.w * 0.1), k.y, k.z - 0.003], esc: [min(0.025, p.w * 0.08), min(0.012, p.h * 0.03), 0.006] }; }),
    // os tubos da água quente e fria, por baixo
    ...[-1, 1].map((s, i) => cilindro(i === 0 ? "tubo_frio" : "tubo_quente", "metal", (p) => {
      const caixaSim = p.o.forma === "caixa", k = deposito(p), base = caixaSim ? tubosTermo(p.h) : deitado(p) ? k.y - k.dia / 2 : tubosTermo(p.h) + k.tampa;
      const r = min(0.022, p.w * 0.08), x = caixaSim ? s * p.w * 0.2 : s * min(k.dia, p.w) * 0.2, z = caixaSim ? 0 : k.z;
      return { pos: [x, (base + 0.01) / 2, z], esc: [r, base + 0.01, r] };
    })),
  ],
};

/* ------------------------------------------------------------------ aplique LED (barra de luz de parede) */
/** A fixação à parede e o difusor (m). */
const fixacaoAplique = (d: number): number => min(0.02, d * 0.3);
const DIFUSOR = 0.004;
const pontaAplique = (p: ParamsGenerico): number => (p.o.pontas === false ? 0 : min(0.012, p.w * 0.05));
const APLIQUE: CategoriaGlb = {
  id: "aplique", rotulo: "Aplique LED (barra de luz)", tipos: ["candeeiro"], nome: /aplique|barra (de )?led|led bar/i, parede: { alt: 1.9, prof: 0.06 }, soComProduto: true,
  opcoes: [
    { id: "luz", rotulo: "A luz sai", tipo: "lista", valores: [{ id: "frente", rotulo: "Para a frente" }, { id: "baixo", rotulo: "Para baixo" }], omissao: "frente" },
    { id: "pontas", rotulo: "Pontas metálicas", tipo: "sim", omissao: true },
  ],
  partes: [
    caixa("fixacao", "metal", ({ w, d, h }) => { const f = fixacaoAplique(d); return { pos: [0, h / 2, -d / 2 + f / 2], esc: [min(0.08, w * 0.4), h * 0.8, f] }; }),
    parte("barra", "caixaR", "corpo", (p) => {
      const f = fixacaoAplique(p.d), k = pontaAplique(p), baixo = p.o.luz === "baixo";
      return entre(-p.w / 2 + k, p.w / 2 - k, baixo ? DIFUSOR : 0, p.h, -p.d / 2 + f, p.d / 2 - (baixo ? 0 : DIFUSOR));
    }),
    caixa("difusor", "luz", (p) => {
      const f = fixacaoAplique(p.d), k = pontaAplique(p);
      return p.o.luz === "baixo"
        ? { pos: [0, DIFUSOR / 2, f / 2], esc: [p.w - 2 * k - 0.004, DIFUSOR, (p.d - f) * 0.6] }
        : { pos: [0, p.h / 2, p.d / 2 - DIFUSOR / 2], esc: [p.w - 2 * k - 0.004, p.h * 0.6, DIFUSOR] };
    }),
    ...[-1, 1].map((s, i) => caixa(i === 0 ? "ponta_esq" : "ponta_dir", "metal", (p) => {
      const f = fixacaoAplique(p.d), k = min(0.012, p.w * 0.05);
      return entre(s < 0 ? -p.w / 2 : p.w / 2 - k, s < 0 ? -p.w / 2 + k : p.w / 2, 0, p.h, -p.d / 2 + f, p.d / 2);
    }, ligado("pontas"))),
  ],
};

/* ------------------------------------------------------------------ garrafeira (porta de vidro, prateleiras com garrafas) */
/** Medidas fixas (m): pés ou grelha em baixo, paredes do móvel, porta, zona do puxador, aro da porta, prateleiras e garrafas. */
const BASE_G = 0.07, PAREDE_G = 0.02, PORTA_G = 0.03, PUXADOR_G = 0.02, ARO_G = 0.035, PASSO_G = 0.1, GARRAFA = 0.075, PRAT_G = 0.012;
const MAX_PRATELEIRAS = 12, MAX_GARRAFAS = 6;
const fundoG = (d: number): number => d - PORTA_G - PUXADOR_G;
const painelG = (h: number): number => min(0.07, (h - BASE_G) * 0.12);
/** O interior: largura e altura úteis, quantas prateleiras e quantas garrafas por prateleira cabem. */
function interiorG(p: ParamsGenerico): { wi: number; y0: number; hi: number; nPrat: number; nGarr: number } {
  const wi = p.w - 2 * PAREDE_G, y0 = BASE_G + PAREDE_G, hi = p.h - PAREDE_G - 0.012 - y0;
  const nPrat = limitar(Math.floor((hi - (GARRAFA + 2 * PRAT_G)) / PASSO_G) + 1, 1, MAX_PRATELEIRAS);
  return { wi, y0, hi, nPrat, nGarr: limitar(Math.floor(wi / 0.085), 1, MAX_GARRAFAS) };
}
const zPortaG = (d: number): number => -d / 2 + fundoG(d) + PORTA_G / 2;
const GARRAFEIRA: CategoriaGlb = {
  id: "garrafeira", rotulo: "Garrafeira (porta de vidro)", tipos: ["eletro"], nome: /garrafeira|wine|vinho|sommelier/i, soComProduto: true,
  opcoes: [
    { id: "encastre", rotulo: "De encastrar (grelha em baixo)", tipo: "sim", omissao: (_t, n) => /encastr|integr/i.test(n) },
    { id: "garrafas", rotulo: "Mostrar as garrafas", tipo: "sim", omissao: true },
  ],
  partes: [
    // o móvel: costas escuras, lados, tampo e base (o interior vê-se pela porta)
    caixa("costas", "escuro", ({ w, d, h }) => entre(-w / 2, w / 2, BASE_G, h, -d / 2, -d / 2 + PAREDE_G)),
    caixa("lado_esq", "corpo", ({ w, d, h }) => entre(-w / 2, -w / 2 + PAREDE_G, BASE_G, h, -d / 2, -d / 2 + fundoG(d))),
    caixa("lado_dir", "corpo", ({ w, d, h }) => entre(w / 2 - PAREDE_G, w / 2, BASE_G, h, -d / 2, -d / 2 + fundoG(d))),
    caixa("topo", "corpo", ({ w, d, h }) => entre(-w / 2 + PAREDE_G, w / 2 - PAREDE_G, h - PAREDE_G, h, -d / 2, -d / 2 + fundoG(d))),
    caixa("base", "corpo", ({ w, d }) => entre(-w / 2 + PAREDE_G, w / 2 - PAREDE_G, BASE_G, BASE_G + PAREDE_G, -d / 2, -d / 2 + fundoG(d))),
    caixa("luz_interior", "luz", ({ w, d, h }) => ({ pos: [0, h - PAREDE_G - 0.004, -d / 2 + fundoG(d) * 0.6], esc: [w * 0.6, 0.006, 0.02] })),
    // a porta: aro (quatro peças, com o painel em cima), o vidro, o mostrador e o puxador
    caixa("porta_esq", "corpo", ({ w, d, h }) => ({ pos: [-w / 2 + ARO_G / 2, (BASE_G + h) / 2, zPortaG(d)], esc: [ARO_G, h - BASE_G, PORTA_G] })),
    caixa("porta_dir", "corpo", ({ w, d, h }) => ({ pos: [w / 2 - ARO_G / 2, (BASE_G + h) / 2, zPortaG(d)], esc: [ARO_G, h - BASE_G, PORTA_G] })),
    caixa("porta_cima", "corpo", ({ w, d, h }) => ({ pos: [0, h - painelG(h) / 2, zPortaG(d)], esc: [w - 2 * ARO_G, painelG(h), PORTA_G] })),
    caixa("porta_baixo", "corpo", ({ w, d }) => ({ pos: [0, BASE_G + ARO_G / 2, zPortaG(d)], esc: [w - 2 * ARO_G, ARO_G, PORTA_G] })),
    caixa("vidro", "vidro", ({ w, d, h }) => entre(-w / 2 + ARO_G, w / 2 - ARO_G, BASE_G + ARO_G, h - painelG(h), zPortaG(d) - 0.004, zPortaG(d) + 0.004)),
    caixa("mostrador", "luz", ({ w, d, h }) => ({ pos: [0, h - painelG(h) / 2, zPortaG(d) + PORTA_G / 2 + 0.002], esc: [min(0.08, w * 0.25), painelG(h) * 0.35, 0.004] })),
    caixa("puxador", "metal", ({ w, d, h }) => ({ pos: [w / 2 - ARO_G / 2, (BASE_G + h) / 2, d / 2 - PUXADOR_G / 2], esc: [0.014, min(0.5, (h - BASE_G) * 0.5), PUXADOR_G] })),
    // em baixo: a grelha de ventilação (de encastrar) ou quatro pés (livre)
    caixa("grelha", "escuro", ({ w, d }) => ({ pos: [0, BASE_G * 0.5, zPortaG(d)], esc: [w, BASE_G * 0.8, PORTA_G] }), (p) => p.o.encastre === true),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => caixa(`pe_${i + 1}`, "escuro", ({ w, d }) => {
      const z = sz < 0 ? -d / 2 + 0.04 : -d / 2 + fundoG(d) - 0.04;
      return { pos: [sx * (w / 2 - 0.04), BASE_G / 2, z], esc: [0.04, BASE_G, 0.04] };
    }, (p) => p.o.encastre !== true)),
    // as prateleiras de arame e as garrafas deitadas, com o gargalo para a porta (só as que cabem)
    ...Array.from({ length: MAX_PRATELEIRAS }, (_, i) => caixa(`prateleira_${i + 1}`, "metal", (p) => {
      const k = interiorG(p), y = k.y0 + i * PASSO_G + PRAT_G / 2;
      return { pos: [0, y, -p.d / 2 + PAREDE_G + (fundoG(p.d) - PAREDE_G) / 2], esc: [k.wi, PRAT_G, fundoG(p.d) - PAREDE_G - 0.005] };
    }, (p) => i < interiorG(p).nPrat)),
    ...Array.from({ length: MAX_PRATELEIRAS * MAX_GARRAFAS }, (_, n) => {
      const i = Math.floor(n / MAX_GARRAFAS), j = n % MAX_GARRAFAS;
      return cilindro(`garrafa_${i + 1}_${j + 1}`, "vidroEscuro", (p) => {
        const k = interiorG(p), l = min(0.3, fundoG(p.d) - PAREDE_G - 0.02), y = k.y0 + i * PASSO_G + PRAT_G + GARRAFA / 2;
        return { pos: [-k.wi / 2 + ((j + 0.5) * k.wi) / k.nGarr, y, -p.d / 2 + fundoG(p.d) - 0.01 - l / 2], esc: [GARRAFA, l, GARRAFA], rot: PARA_A_FRENTE };
      }, (p) => { const k = interiorG(p); return p.o.garrafas !== false && i < k.nPrat && j < k.nGarr; });
    }),
  ],
};

/* ------------------------------------------------------------------ acessório pequeno de parede: barra de apoio, cabide, piaçaba, porta-rolos */
/** A espessura da roseta (a base redonda que aparafusa à parede, m). */
const roseta = (d: number): number => min(0.01, d * 0.2);
const forma = (f: string): NonNullable<Ver> => e("forma", f);
/**
 * Os acessórios que NÃO levam este genérico (ficam na caixa de reserva, como estavam): sifões e válvulas, bancos, cadeiras, nichos, escovas,
 * cestos e os auxiliares de pé. O resto do tipo `acessorio` (kits, cabides, piaçabas, porta-rolos, pegas de segurança) leva-o.
 */
const NAO_ACESSORIO = /sif[ãa]o|sif[õo]es|v[áa]lvula|\bbancos?\b|cadeira|nicho|escova|\bcestos?\b|auxiliar/i;
const ACESSORIO: CategoriaGlb = {
  id: "acessorio", rotulo: "Acessório de parede (barra, cabide, piaçaba, porta-rolos)", tipos: ["acessorio"], parede: { alt: 0.9, prof: 0.1 }, soComProduto: true,
  nome: new RegExp(`^(?!.*(?:${NAO_ACESSORIO.source}))`, "i"),
  opcoes: [{
    id: "forma", rotulo: "Forma", tipo: "lista",
    valores: [{ id: "barra", rotulo: "Barra ou pega de segurança" }, { id: "cabide", rotulo: "Cabide" }, { id: "piacaba", rotulo: "Piaçaba" }, { id: "porta_rolos", rotulo: "Porta-rolos" }],
    omissao: (_t, n) => (/pia[çc]aba|escobill/i.test(n) ? "piacaba" : /rolo|rollo/i.test(n) ? "porta_rolos" : /pega|barra|asidero|seguran/i.test(n) ? "barra" : "cabide"),
  }],
  partes: [
    // barra: duas rosetas, dois suportes e o tubo, à frente
    ...[-1, 1].map((s, i) => cilindro(`barra_roseta_${i + 1}`, "corpo", ({ w, d, h }) => { const r = min(0.07, h, w / 3), t = roseta(d); return { pos: [s * (w / 2 - r / 2), h / 2, -d / 2 + t / 2], esc: [r, t, r], rot: PARA_A_FRENTE }; }, forma("barra"))),
    ...[-1, 1].map((s, i) => cilindro(`barra_suporte_${i + 1}`, "corpo", ({ w, d, h }) => {
      const r = min(0.07, h, w / 3), t = roseta(d), b = min(0.032, h * 0.6, d * 0.4), l = d - t - b / 2;
      return { pos: [s * (w / 2 - r / 2), h / 2, -d / 2 + t + l / 2], esc: [b * 0.8, l, b * 0.8], rot: PARA_A_FRENTE };
    }, forma("barra"))),
    cilindro("barra_tubo", "corpo", ({ w, d, h }) => { const r = min(0.07, h, w / 3), b = min(0.032, h * 0.6, d * 0.4); return { pos: [0, h / 2, d / 2 - b / 2], esc: [b, w - r, b], rot: AO_COMPRIDO }; }, forma("barra")),
    // cabide: roseta, braço para a frente, a ponta que sobe e a bola
    cilindro("cabide_roseta", "corpo", ({ w, d, h }) => { const r = min(0.05, h * 0.8, w), t = roseta(d); return { pos: [0, h * 0.45, -d / 2 + t / 2], esc: [r, t, r], rot: PARA_A_FRENTE }; }, forma("cabide")),
    cilindro("cabide_braco", "corpo", ({ w, d, h }) => { const a = min(0.016, min(0.05, h * 0.8, w) * 0.4), t = roseta(d), l = d - t - a; return { pos: [0, h * 0.45, -d / 2 + t + l / 2], esc: [a, l, a], rot: PARA_A_FRENTE }; }, forma("cabide")),
    cilindro("cabide_ponta", "corpo", ({ w, d, h }) => {
      const a = min(0.016, min(0.05, h * 0.8, w) * 0.4), s = max(0.002, min(0.035, h * 0.55 - a));
      return { pos: [0, h * 0.45 + s / 2, d / 2 - 0.65 * a], esc: [a, s, a] };
    }, forma("cabide")),
    parte("cabide_bola", "elipsoide", "corpo", ({ w, d, h }) => {
      const a = min(0.016, min(0.05, h * 0.8, w) * 0.4), s = max(0.002, min(0.035, h * 0.55 - a));
      return { pos: [0, min(h * 0.45 + s, h - 0.65 * a), d / 2 - 0.65 * a], esc: [1.3 * a, 1.3 * a, 1.3 * a] };
    }, forma("cabide")),
    // piaçaba: o copo em baixo, preso por um aro e um braço à parede; a tampa, o cabo e a pega em cima
    caixa("piacaba_suporte", "corpo", ({ w, d, h }) => ({ pos: [0, h * 0.28, -d / 2 + roseta(d) / 2], esc: [min(0.04, w), min(0.06, h * 0.4), roseta(d)] }), forma("piacaba")),
    caixa("piacaba_braco", "corpo", ({ w, d, h }) => {
      const c = min(0.1, w, d * 0.75), t = roseta(d), l = max(0.002, d - c - t);
      return { pos: [0, h * 0.28, -d / 2 + t + l / 2], esc: [min(0.02, w * 0.5), min(0.012, h * 0.05), l] };
    }, forma("piacaba")),
    cilindro("piacaba_aro", "corpo", ({ w, d, h }) => { const c = min(0.1, w, d * 0.75); return { pos: [0, h * 0.28, d / 2 - c / 2], esc: [c, min(0.015, h * 0.06), c] }; }, forma("piacaba")),
    cilindro("piacaba_copo", "corpo", ({ w, d, h }) => { const c = min(0.1, w, d * 0.75); return { pos: [0, h * 0.2, d / 2 - c / 2], esc: [c * 0.94, h * 0.4, c * 0.94] }; }, forma("piacaba")),
    cilindro("piacaba_tampa", "corpo", ({ w, d, h }) => { const c = min(0.1, w, d * 0.75), t = min(0.012, h * 0.04); return { pos: [0, h * 0.4 + t / 2, d / 2 - c / 2], esc: [c * 0.98, t, c * 0.98] }; }, forma("piacaba")),
    cilindro("piacaba_cabo", "corpo", ({ w, d, h }) => {
      const c = min(0.1, w, d * 0.75), y0 = h * 0.4 + min(0.012, h * 0.04), y1 = h - min(0.03, h * 0.1);
      return { pos: [0, (y0 + y1) / 2, d / 2 - c / 2], esc: [min(0.012, c * 0.2), y1 - y0, min(0.012, c * 0.2)] };
    }, forma("piacaba")),
    cilindro("piacaba_pega", "corpo", ({ w, d, h }) => { const c = min(0.1, w, d * 0.75), a = min(0.03, h * 0.1), r = min(0.025, c * 0.4); return { pos: [0, h - a / 2, d / 2 - c / 2], esc: [r, a, r] }; }, forma("piacaba")),
    // porta-rolos: roseta à esquerda, um suporte para a frente, o braço deitado e o rolo
    cilindro("rolos_roseta", "corpo", ({ w, d, h }) => { const r = min(0.05, h, w * 0.3), t = roseta(d); return { pos: [-w / 2 + r / 2, h / 2, -d / 2 + t / 2], esc: [r, t, r], rot: PARA_A_FRENTE }; }, forma("porta_rolos")),
    cilindro("rolos_suporte", "corpo", ({ w, d, h }) => {
      const r = min(0.05, h, w * 0.3), t = roseta(d), dr = min(0.11, h, d - t - 0.005), l = d - dr / 2 - t, a = min(0.018, r * 0.5);
      return { pos: [-w / 2 + r / 2, h / 2, -d / 2 + t + l / 2], esc: [a, l, a], rot: PARA_A_FRENTE };
    }, forma("porta_rolos")),
    cilindro("rolos_braco", "corpo", ({ w, d, h }) => {
      const r = min(0.05, h, w * 0.3), t = roseta(d), dr = min(0.11, h, d - t - 0.005), a = min(0.014, dr * 0.3), x0 = -w / 2 + r / 2;
      return { pos: [(x0 + w / 2) / 2, h / 2, d / 2 - dr / 2], esc: [a, w / 2 - x0, a], rot: AO_COMPRIDO };
    }, forma("porta_rolos")),
    cilindro("rolos_rolo", "branco", ({ w, d, h }) => {
      // o rolo deixa à vista a ponta do braço (1,2 cm), para se perceber que está pendurado
      const t = roseta(d), dr = min(0.11, h, d - t - 0.005), l = min(0.1, w * 0.65), ponta = min(0.012, w * 0.06);
      return { pos: [w / 2 - ponta - l / 2, h / 2, d / 2 - dr / 2], esc: [dr, l, dr], rot: AO_COMPRIDO };
    }, forma("porta_rolos")),
  ],
};

/** Os genéricos novos, por ordem de produtos que servem (ligados no fim de CATEGORIAS_GLB: ver o comentário no topo). */
export const CATEGORIAS_GLB_NOVAS: CategoriaGlb[] = [TAMPO_WC, LAVA_LOICA, MAQUINA_ROUPA, TERMOACUMULADOR, APLIQUE, GARRAFEIRA, ACESSORIO];

/** O intervalo aceite e os tamanhos típicos de cada genérico novo (m, [largura, profundidade, altura]). */
export const MEDIDAS_GENERICOS_NOVOS: Record<string, MedidasGenerico> = {
  tampo_wc: { min: [0.3, 0.35, 0.012], max: [2, 0.7, 0.15], tamanhos: { pequeno: [0.35, 0.46, 0.08], mediano: [0.8, 0.46, 0.08], grande: [1.6, 0.46, 0.12] } },
  lava_loica: { min: [0.35, 0.4, 0.12], max: [1.2, 0.6, 0.3], tamanhos: { pequeno: [0.45, 0.44, 0.18], mediano: [0.8, 0.5, 0.2], grande: [1.16, 0.5, 0.2] } },
  maquina_roupa: { min: [0.4, 0.4, 0.6], max: [0.7, 0.7, 0.95], tamanhos: { pequeno: [0.5, 0.45, 0.82], mediano: [0.6, 0.6, 0.85], grande: [0.6, 0.65, 0.9] } },
  termoacumulador: { min: [0.25, 0.18, 0.3], max: [0.7, 0.7, 1.6], tamanhos: { pequeno: [0.36, 0.36, 0.6], mediano: [0.45, 0.45, 0.8], grande: [0.56, 0.56, 1.25] } },
  aplique: { min: [0.12, 0.03, 0.02], max: [1.2, 0.15, 0.12], tamanhos: { pequeno: [0.18, 0.06, 0.04], mediano: [0.3, 0.07, 0.05], grande: [0.6, 0.08, 0.05] } },
  garrafeira: { min: [0.25, 0.4, 0.45], max: [0.7, 0.7, 1.85], tamanhos: { pequeno: [0.3, 0.5, 0.82], mediano: [0.4, 0.55, 0.84], grande: [0.6, 0.57, 1.27] } },
  acessorio: { min: [0.03, 0.04, 0.03], max: [0.9, 0.2, 0.5], tamanhos: { pequeno: [0.05, 0.06, 0.07], mediano: [0.16, 0.1, 0.12], grande: [0.6, 0.09, 0.07] } },
};

/** No acessório, a medida típica de cada forma (m): a página põe-na quando se muda a forma. */
export const MEDIDAS_ACESSORIO_POR_FORMA: Record<string, V3> = {
  barra: [0.3, 0.08, 0.07], cabide: [0.05, 0.06, 0.07], piacaba: [0.1, 0.13, 0.38], porta_rolos: [0.16, 0.1, 0.12],
};

/** O esquentador a gás de parede típico (m, [largura, profundidade, altura]): 11 a 15 litros por minuto. */
const ESQUENTADOR: V3 = [0.31, 0.22, 0.58];
/** A profundidade de um termoacumulador plano («slim»), m. */
const PROF_SLIM = 0.3;
/** Até quantas garrafas a garrafeira é a média (acima, a grande). */
const GARRAFAS_MEDIA = 24;
/** Um número seguido de «cm» no nome («Aplique LED Beatriz 60CM», «Pega De Segurança 30cm»): a largura, em metros. */
function larguraDoNome(nome: string): number | undefined {
  const m = nome.match(/(\d{2,3}(?:[.,]\d)?)\s*cm\b/i);
  return m ? Number(m[1].replace(",", ".")) / 100 : undefined;
}
/** Um número seguido de «L» ou «litros» no nome («Termoacumulador VULCANO 150L»). */
function litrosDoNome(nome: string): number | undefined {
  const m = nome.match(/(\d{1,3})\s*(?:l|litros)\b/i);
  return m ? Number(m[1]) : undefined;
}
/**
 * As medidas de omissão (m, [largura, profundidade, altura]) de um produto que usa um genérico novo, quando o nome não traz as três: pelas
 * opções já resolvidas e pelo nome (a largura «NNcm», os litros do termoacumulador, as garrafas da garrafeira, a forma do acessório).
 * O esquentador não fica com os 60×60×85 do tipo `eletro`; o tampo não fica com os 90 cm de altura do tipo `bancada`. Nenhuma se o id não é novo.
 */
export function medidasDeOmissaoNovas(id: string, o: Readonly<Record<string, string | boolean>>, nome: string): V3 | undefined {
  const m = MEDIDAS_GENERICOS_NOVOS[id];
  if (!m) return undefined;
  const dentro = (v: V3): V3 => [limitar(v[0], m.min[0], m.max[0]), limitar(v[1], m.min[1], m.max[1]), limitar(v[2], m.min[2], m.max[2])];
  const largura = larguraDoNome(nome), t = m.tamanhos;
  switch (id) {
    case "tampo_wc": return dentro([largura ?? t.mediano[0], t.mediano[1], 0.12]);
    case "lava_loica": return dentro(o.cubas === "2" ? t.mediano : [0.5, 0.44, 0.2]);
    case "termoacumulador": {
      if (o.chamine === true) return dentro(ESQUENTADOR);
      const l = litrosDoNome(nome) ?? 80, v = l <= 50 ? t.pequeno : l <= 100 ? t.mediano : t.grande;
      return dentro(o.forma === "caixa" ? [v[0], PROF_SLIM, v[2]] : v);
    }
    case "aplique": return dentro([largura ?? t.mediano[0], t.mediano[1], t.mediano[2]]);
    case "garrafeira": {
      const g = nome.match(/(\d{1,3})\s*garrafas/i);
      return g && Number(g[1]) > GARRAFAS_MEDIA ? t.grande : t.mediano;
    }
    case "acessorio": {
      const v = MEDIDAS_ACESSORIO_POR_FORMA[String(o.forma)] ?? t.mediano;
      return dentro(o.forma === "barra" && largura ? [largura, v[1], v[2]] : v);
    }
    default: return dentro(t.mediano);
  }
}
