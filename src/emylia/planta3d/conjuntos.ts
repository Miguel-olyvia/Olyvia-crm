// Protótipo (visualizador 3D): CONJUNTOS (kits) cujos componentes também se vendem à parte. Um conjunto é uma lista de componentes
// (família, papel, obrigatório, vendível separadamente), com o preço do conjunto contra a soma. Ao pôr um conjunto na planta, os componentes
// ficam ligados no sítio certo (lava-loiça embutido no tampo com recorte, torneira sobre o lava-loiça, placa no tampo); cada um pode ser retirado
// ou trocado (outra torneira, outro acabamento) e a lista de peças mostra cada componente como linha vendável. Funções puras (cm, como planta.ts).
import type { PecaPlanta, Planta } from "../planta";
import { ESPEC, TIPO_LEGADO, type ProdutoModelo3D } from "./catalogo3d";
import { FAMILIAS, TAMPO_TOPO_CM, alturaLavaLoicaCm, familiaPorId, modeloDaFamilia, resolverVariante, type Familia } from "./familias";
import type { TipoEspaco } from "./modelo";

export interface ComponenteConj {
  papel: string; rotulo: string; familiaId: string; medidaId?: string; acabId?: string; obrigatorio: boolean; vendivelSeparado: true;
}
export interface Conjunto {
  id: string; nome: string; descricao: string; espacos: TipoEspaco[]; /** o papel que ancora o conjunto à planta */ ancora: string;
  componentes: ComponenteConj[]; /** desconto do conjunto (0 a 1) sobre a soma, só com todos os obrigatórios */ desconto: number;
}
const C = (papel: string, rotulo: string, familiaId: string, obrigatorio: boolean, medidaId?: string, acabId?: string): ComponenteConj => ({ papel, rotulo, familiaId, medidaId, acabId, obrigatorio, vendivelSeparado: true });
export const CONJUNTOS: Conjunto[] = [
  { id: "bancada_cozinha", nome: "Bancada de cozinha (demo)", descricao: "Tampo, lava-loiça, torneira e placa; móvel e sifão à parte.", espacos: ["cozinha", "outro"], ancora: "tampo", desconto: 0.08, componentes: [
    C("tampo", "Tampo", "tampo", true, "unica", "canela-beige"), C("movel", "Móvel base", "movel_base", false, "unica", "blanco"), C("lavaloica", "Lava-loiça", "velar", true, "velar50", "inox"),
    C("torneira", "Torneira", "noah", true, "unica", "brushed"), C("placa", "Placa", "placa_inducao", true, "ib65b60", "negro"), C("sifao", "Sifão e válvula", "sifao", false, "unica", "chrome")] },
  { id: "conjunto_duche", nome: "Conjunto de duche (demo)", descricao: "Base, resguardo, misturadora e coluna.", espacos: ["casa_banho", "outro"], ancora: "base", desconto: 0.06, componentes: [
    C("base", "Base de duche", "base_duche_f", true, "80×120", "blanco"), C("resguardo", "Resguardo", "resguardo_f", true, "w120", "vidro"), C("misturadora", "Misturadora", "misturadora_duche", true, "unica", "chrome"), C("coluna", "Coluna de duche", "coluna_duche_f", false, "unica", "chrome")] },
  { id: "movel_lavatorio", nome: "Móvel de lavatório (demo)", descricao: "Móvel, lavatório de pousar, torneira e espelho.", espacos: ["casa_banho", "outro"], ancora: "movel", desconto: 0.05, componentes: [
    C("movel", "Móvel", "movel_lav_f", true, "w80", "blanco"), C("lavatorio", "Lavatório", "lavatorio_f", true, "w60", "blanco"), C("torneira", "Torneira", "torneira_lav", true, "unica", "chrome"), C("espelho", "Espelho", "espelho_f", false, "80×80", "negro")] },
];
export const conjuntoPorId = (id: string): Conjunto | undefined => CONJUNTOS.find((c) => c.id === id);

/* ------------------------------------------------------------------ posicionamento relativo (no referencial da peça âncora) */
export interface Ancora { x: number; y: number; w: number; h: number; rot: number }
/** Um ponto local da âncora (lx a partir da esquerda, ly a partir das costas, cm) passado para a planta, com a rotação da âncora. */
export function localParaPlano(a: Ancora, lx: number, ly: number): { x: number; y: number } {
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2, r = (a.rot * Math.PI) / 180, dx = a.x + lx - cx, dy = a.y + ly - cy;
  return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
}
/** O inverso: um ponto da planta passado para o referencial local da âncora. */
export function planoParaLocal(a: Ancora, px: number, py: number): { lx: number; ly: number } {
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2, r = (-a.rot * Math.PI) / 180, dx = px - cx, dy = py - cy;
  return { lx: cx + dx * Math.cos(r) - dy * Math.sin(r) - a.x, ly: cy + dx * Math.sin(r) + dy * Math.cos(r) - a.y };
}

interface Lugar { lx: number; ly: number; alt?: number; w?: number; h?: number }
export interface OpcoesConjunto { sinkX?: number; hobX?: number; montagem?: "baixo" | "cima" }
/** Onde fica cada componente, no referencial da âncora (centro do componente), e a altura ao chão (cm) quando difere da de omissão. */
export function lugarDoComponente(c: Conjunto, papel: string, anc: { w: number; h: number }, m: ProdutoModelo3D, o: OpcoesConjunto = {}): Lugar {
  const [w, d] = [m.dimensoes.larguraCm, m.dimensoes.profundidadeCm];
  if (c.id === "bancada_cozinha") {
    const sinkX = o.sinkX ?? Math.min(65, anc.w / 2), hobX = o.hobX ?? Math.max(sinkX + 60, anc.w - 60);
    switch (papel) {
      case "tampo": return { lx: anc.w / 2, ly: anc.h / 2 };
      case "movel": return { lx: anc.w / 2, ly: 30, w: anc.w, h: 60, alt: 0 };
      case "lavaloica": return { lx: sinkX, ly: anc.h - d / 2 - 4, alt: alturaLavaLoicaCm(m.dimensoes.alturaCm, o.montagem ?? "baixo") };
      case "torneira": return { lx: sinkX, ly: d / 2 + 1, alt: TAMPO_TOPO_CM };
      case "placa": return { lx: hobX, ly: anc.h / 2, alt: TAMPO_TOPO_CM };
      default: return { lx: anc.w / 2, ly: anc.h / 2 };
    }
  }
  if (c.id === "conjunto_duche") {
    switch (papel) {
      case "base": return { lx: anc.w / 2, ly: anc.h / 2 };
      case "resguardo": return { lx: anc.w / 2, ly: anc.h + d / 2 };
      case "misturadora": return { lx: anc.w * 0.3, ly: d / 2, alt: 100 };
      case "coluna": return { lx: anc.w * 0.7, ly: d / 2, alt: 90 };
      default: return { lx: anc.w / 2, ly: anc.h / 2 };
    }
  }
  switch (papel) { // movel_lavatorio
    case "movel": return { lx: anc.w / 2, ly: anc.h / 2 };
    case "lavatorio": return { lx: anc.w / 2, ly: anc.h / 2, alt: 55 };
    case "torneira": return { lx: anc.w / 2, ly: Math.max(8, anc.h * 0.2), alt: 55 + 12 };
    case "espelho": return { lx: anc.w / 2, ly: d / 2, alt: 110 };
    default: return { lx: anc.w / 2, ly: anc.h / 2 };
  }
}

/** Os campos de uma peça da planta para uma variante de família (tamanho, tipo, altura, SKU...), mantendo o que o utilizador já decidiu. */
export function camposDaVariante(m: ProdutoModelo3D): Pick<PecaPlanta, "tipo" | "w" | "h" | "dh" | "nome" | "fam" | "med" | "acab" | "produto"> {
  return {
    tipo: TIPO_LEGADO[m.tipo], w: Math.round(m.dimensoes.larguraCm * 10) / 10, h: Math.round(m.dimensoes.profundidadeCm * 10) / 10, dh: Math.round(m.dimensoes.alturaCm * 10) / 10, nome: m.nome,
    fam: m.fam?.familiaId, med: m.fam?.medidaId, acab: m.fam?.acabId, produto: m.fam?.familiaId,
  };
}
const FLEXIVEIS = new Set(["tampo", "movel_base"]);

/**
 * Expande um conjunto em peças ligadas, à volta da âncora (já ajustada à divisão). O tampo e o móvel levam o comprimento da âncora; cada componente
 * guarda o conjunto (`conj`), o papel e o seu lugar local (`lx`,`ly`) para o conjunto se mover e rodar de uma vez.
 */
export function expandirConjunto(c: Conjunto, instId: string, ancora: PecaPlanta, escolhas: Record<string, { familiaId?: string; medidaId?: string; acabId?: string }> = {}, o: OpcoesConjunto = {}, idPeca: (papel: string) => string = (p) => `${instId}-${p}`): PecaPlanta[] {
  const anc: Ancora = { x: ancora.x, y: ancora.y, w: ancora.w, h: ancora.h, rot: ancora.rot ?? 0 };
  return c.componentes.map((comp) => {
    const esc = escolhas[comp.papel] ?? {}, fam = familiaPorId(esc.familiaId ?? comp.familiaId) as Familia;
    const m = modeloDaFamilia(fam, esc.medidaId ?? comp.medidaId, esc.acabId ?? comp.acabId);
    const lugar = lugarDoComponente(c, comp.papel, { w: anc.w, h: anc.h }, m, o);
    const base = camposDaVariante(m);
    const w = comp.papel === c.ancora || FLEXIVEIS.has(fam.id) ? anc.w : lugar.w ?? base.w, h = lugar.h ?? base.h;
    const p = localParaPlano(anc, lugar.lx, lugar.ly);
    const alt = lugar.alt ?? Math.round(m.alturaOmissao * 1000) / 10;
    const peca: PecaPlanta = {
      ...base, id: idPeca(comp.papel), w, h, x: Math.round((p.x - w / 2) * 10) / 10, y: Math.round((p.y - h / 2) * 10) / 10, rot: anc.rot, mont: m.montagem, alt: m.montagem === "parede" ? lugar.alt ?? alt : alt, esp: false,
      conj: instId, conjId: c.id, papel: comp.papel, lx: Math.round(lugar.lx * 10) / 10, ly: Math.round(lugar.ly * 10) / 10,
      ...(comp.papel === c.ancora ? { ancora: true } : {}), ...(fam.geo === false ? { semGeo: true } : {}),
      ...(m.tipo === "lava_loica" ? { opc: { montagem: o.montagem ?? "baixo" } } : {}),
    };
    return peca;
  });
}

/** Recalcula o sítio dos componentes a partir do lugar local de cada um, depois de a âncora se mexer ou rodar. */
export function reposicionarConjunto(planta: Planta, instId: string): Planta {
  const anc = planta.pecas.find((p) => p.conj === instId && p.ancora);
  if (!anc) return planta;
  const a: Ancora = { x: anc.x, y: anc.y, w: anc.w, h: anc.h, rot: anc.rot ?? 0 };
  return {
    ...planta, pecas: planta.pecas.map((p) => {
      if (p.conj !== instId || p.ancora || p.lx === undefined || p.ly === undefined) return p;
      const q = localParaPlano(a, p.lx, p.ly);
      return { ...p, x: Math.round((q.x - p.w / 2) * 10) / 10, y: Math.round((q.y - p.h / 2) * 10) / 10, rot: a.rot };
    }),
  };
}
/** Depois de se largar um componente noutro sítio, guarda o novo lugar local (o conjunto passa a mover-se com ele nesse sítio). */
export function guardarLugarLocal(planta: Planta, pid: string): Planta {
  const p = planta.pecas.find((x) => x.id === pid);
  const anc = p?.conj ? planta.pecas.find((x) => x.conj === p.conj && x.ancora) : undefined;
  if (!p || !anc || p.ancora) return planta;
  const l = planoParaLocal({ x: anc.x, y: anc.y, w: anc.w, h: anc.h, rot: anc.rot ?? 0 }, p.x + p.w / 2, p.y + p.h / 2);
  return { ...planta, pecas: planta.pecas.map((x) => (x.id === pid ? { ...x, lx: Math.round(l.lx * 10) / 10, ly: Math.round(l.ly * 10) / 10 } : x)) };
}

/* ------------------------------------------------------------------ retirar, repor e trocar um componente */
/** Retira um componente do conjunto (fica na lista como «retirado»); uma peça solta sai da planta. */
export function retirarComponente(planta: Planta, pid: string): Planta {
  const p = planta.pecas.find((x) => x.id === pid);
  if (!p) return planta;
  if (!p.conj || p.ancora) return { ...planta, pecas: planta.pecas.filter((x) => (p.ancora && p.conj ? x.conj !== p.conj : x.id !== pid)) };
  return { ...planta, pecas: planta.pecas.map((x) => (x.id === pid ? { ...x, ret: true } : x)) };
}
export const reporComponente = (planta: Planta, pid: string): Planta => ({ ...planta, pecas: planta.pecas.map((x) => (x.id === pid ? { ...x, ret: false } : x)) });

/** Muda a variante de uma peça de família (outro acabamento, outra medida, ou outra família do mesmo tipo), mantendo o centro, a rotação e o lugar no conjunto. */
export function aplicarVariante(p: PecaPlanta, familiaId: string, medidaId?: string, acabId?: string): PecaPlanta {
  const fam = familiaPorId(familiaId);
  if (!fam) return p;
  const m = modeloDaFamilia(fam, medidaId, acabId), campos = camposDaVariante(m);
  const flex = FLEXIVEIS.has(fam.id);
  const w = flex ? p.w : campos.w, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const montagem = p.opc?.montagem === "cima" ? "cima" : "baixo";
  return {
    ...p, ...campos, w, x: Math.round((cx - w / 2) * 10) / 10, y: Math.round((cy - campos.h / 2) * 10) / 10,
    alt: m.tipo === "lava_loica" ? alturaLavaLoicaCm(m.dimensoes.alturaCm, montagem) : p.conj ? p.alt : Math.round(m.alturaOmissao * 1000) / 10,
  };
}
/** Muda a montagem (por baixo ou por cima) de um lava-loiça e ajusta a altura do rebordo. */
export function mudarMontagem(p: PecaPlanta, montagem: "baixo" | "cima"): PecaPlanta {
  const fam = p.fam ? familiaPorId(p.fam) : undefined;
  if (!fam || fam.tipo !== "lava_loica") return p;
  const m = modeloDaFamilia(fam, p.med, p.acab);
  return { ...p, opc: { ...p.opc, montagem }, alt: alturaLavaLoicaCm(m.dimensoes.alturaCm, montagem) };
}
/** As famílias que podem substituir a de uma peça do conjunto (as do mesmo tipo de mockup). */
export const familiasSubstitutas = (p: PecaPlanta): Familia[] => {
  const f = p.fam ? familiaPorId(p.fam) : undefined;
  return f ? FAMILIAS_DO_TIPO(f.tipo) : [];
};
const FAMILIAS_DO_TIPO = (tipo: Familia["tipo"]): Familia[] => FAMILIAS.filter((f) => f.tipo === tipo);

/* ------------------------------------------------------------------ recortes do tampo */
export interface Recorte { x: number; z: number; w: number; d: number }
/**
 * Os recortes de um tampo (metros, relativos ao centro do tampo, no referencial dele): as cubas do lava-loiça e o recorte da placa dos componentes do
 * mesmo conjunto que não foram retirados.
 */
export function recortesDeTampo(tampo: PecaPlanta, pecas: readonly PecaPlanta[]): Recorte[] {
  if (!tampo.conj) return [];
  const anc: Ancora = { x: tampo.x, y: tampo.y, w: tampo.w, h: tampo.h, rot: tampo.rot ?? 0 }, res: Recorte[] = [];
  for (const p of pecas) {
    if (p.conj !== tampo.conj || p.id === tampo.id || p.ret || !p.fam) continue;
    const fam = familiaPorId(p.fam);
    if (!fam) continue;
    const v = resolverVariante(fam, p.med, p.acab), s = v.medida.spec;
    const c = planoParaLocal(anc, p.x + p.w / 2, p.y + p.h / 2); // centro do componente no referencial do tampo (a partir do canto das costas à esquerda)
    const cx = c.lx - tampo.w / 2, cz = c.ly - tampo.h / 2;
    if (fam.tipo === "lava_loica" && s?.cubas) {
      const ext = v.medida.dim;
      for (const cb of s.cubas) res.push({ x: (cx + cb.left / 10 + cb.w / 20 - ext[0] / 2) / 100, z: (cz + cb.top / 10 + cb.d / 20 - ext[1] / 2) / 100, w: cb.w / 1000, d: cb.d / 1000 });
    } else if (fam.tipo === "placa" && s?.placa) {
      res.push({ x: cx / 100, z: cz / 100, w: s.placa.recorte[0] / 1000, d: s.placa.recorte[1] / 1000 });
    }
  }
  return res;
}

/* ------------------------------------------------------------------ preço do conjunto e linhas vendáveis */
export interface PrecoConjunto { soma: number; total: number; poupanca: number; faltam: string[]; completo: boolean; nome: string }
const arred2 = (n: number) => Math.round(n * 100) / 100;
/** O preço de uma instância de conjunto: a soma dos componentes presentes; com todos os obrigatórios, aplica-se o desconto do conjunto. */
export function precoConjunto(planta: Planta, instId: string): PrecoConjunto | null {
  const pecas = planta.pecas.filter((p) => p.conj === instId);
  const def = pecas[0]?.conjId ? conjuntoPorId(pecas[0].conjId) : undefined;
  if (!def) return null;
  const presentes = new Set(pecas.filter((p) => !p.ret).map((p) => p.papel));
  const faltam = def.componentes.filter((c) => c.obrigatorio && !presentes.has(c.papel)).map((c) => c.rotulo);
  const soma = pecas.filter((p) => !p.ret && p.fam).reduce((s, p) => { const f = familiaPorId(p.fam as string); return s + (f ? resolverVariante(f, p.med, p.acab).preco : 0); }, 0);
  const completo = faltam.length === 0, total = completo ? soma * (1 - def.desconto) : soma;
  return { soma: arred2(soma), total: arred2(total), poupanca: arred2(soma - total), faltam, completo, nome: def.nome };
}

export interface LinhaVenda {
  id: string; nome: string; sku?: string; preco?: number; categoria: string; conjId?: string; conjNome?: string; papel?: string; retirado: boolean; vendivelSeparado: boolean;
}
/** Uma linha vendável por peça com produto: o preço e o SKU da variante, e o conjunto a que pertence (ou se foi retirada dele). Portas e janelas contam como peças. */
export function linhasVendaveis(planta: Planta): LinhaVenda[] {
  return planta.pecas.filter((p) => p.fam || p.produto).map((p) => {
    const f = p.fam ? familiaPorId(p.fam) : undefined, v = f ? resolverVariante(f, p.med, p.acab) : undefined;
    const def = p.conjId ? conjuntoPorId(p.conjId) : undefined;
    return {
      id: p.id, nome: v?.nome ?? p.nome ?? p.tipo, sku: v?.sku, preco: v?.preco, categoria: f ? ESPEC[f.tipo].rotulo : "Catálogo", conjId: p.conj, conjNome: def?.nome, papel: p.papel, retirado: !!p.ret, vendivelSeparado: true,
    };
  });
}
/** Total das linhas que contam (não retiradas) com preço: peças soltas à soma; as de um conjunto completo com o desconto do conjunto. */
export function totalDasLinhas(planta: Planta): number {
  const conjs = [...new Set(planta.pecas.filter((p) => p.conj).map((p) => p.conj as string))];
  const soltas = planta.pecas.filter((p) => !p.conj && !p.ret && p.fam).reduce((s, p) => { const f = familiaPorId(p.fam as string); return s + (f ? resolverVariante(f, p.med, p.acab).preco : 0); }, 0);
  return arred2(soltas + conjs.reduce((s, id) => s + (precoConjunto(planta, id)?.total ?? 0), 0));
}
