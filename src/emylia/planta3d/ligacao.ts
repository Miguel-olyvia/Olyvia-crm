// Protótipo (visualizador 3D): a ponte entre o desenho de hoje (planta.ts: cm, paredes E/S/W/N, peças com caixa) e o modelo genérico em metros
// (modelo.ts), mais a peça que nasce de um PRODUTO DO CATÁLOGO. Funções puras.
import { PASSO, cantos, faltaFechar, limites, type PecaPlanta, type Planta, type Ponto as PontoCm, type TipoPeca } from "../planta";
import { COR_MOCKUP, OMISSOES_CM, type ProdutoModelo3D, type TipoMockup } from "./catalogo3d";
import {
  ALTURA_JANELA, ALTURA_PORTA, PEITORIL_JANELA, abrirNaParede, comprimento, distancia, espacoVazio, normalInterior, normalizarContorno, paredesDoContorno,
  type Abertura, type Espaco, type Ponto, type Parede, type PecaProduto, type TipoEspaco,
} from "./modelo";

/** O tipo de peça do desenho de hoje que corresponde a um tipo de mockup (as portas e janelas do desenho são aberturas, não produtos). */
export const TIPO_LEGADO: Record<TipoMockup, TipoPeca> = {
  base_duche: "base", banheira: "banheira", sanita: "sanita", bide: "bide", lavatorio: "movel", movel: "movel", roupeiro: "coluna", cama: "movel",
  bancada: "movel", eletro: "movel", caixa: "movel", porta: "porta", janela: "janela",
};
const MOCKUP_DO_LEGADO: Record<TipoPeca, TipoMockup> = { base: "base_duche", banheira: "banheira", sanita: "sanita", bide: "bide", movel: "movel", coluna: "movel", porta: "porta", janela: "janela" };

const arred = (n: number) => Math.round(n / PASSO) * PASSO;

/** A peça do desenho que é um produto do catálogo: o tamanho vem das dimensões reais (cm), o centro no ponto dado ou ao meio da planta. */
export function pecaDeProduto(p: Planta, m: ProdutoModelo3D, id: string, centro?: PontoCm): PecaPlanta {
  const w = Math.max(5, Math.round(m.dimensoes.larguraCm)), h = Math.max(5, Math.round(m.dimensoes.profundidadeCm));
  const b = p.paredes.length || p.pecas.length ? limites(p) : { x: p.o.x, y: p.o.y, w: 300, h: 200 };
  const c = centro ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return { id, tipo: TIPO_LEGADO[m.tipo], w, h, x: arred(c.x - w / 2), y: arred(c.y - h / 2), produto: m.produtoId };
}

/** A parede mais próxima de um ponto (m): o índice, a distância ao segmento e a posição ao longo dela. */
export function paredeMaisPerto(paredes: readonly Parede[], pt: Ponto): { indice: number; distancia: number; ao: number } | null {
  let melhor: { indice: number; distancia: number; ao: number } | null = null;
  paredes.forEach((w, i) => {
    const c = comprimento(w);
    if (c <= 0) return;
    const tx = (w.b.x - w.a.x) / c, ty = (w.b.y - w.a.y) / c;
    const ao = Math.min(c, Math.max(0, (pt.x - w.a.x) * tx + (pt.y - w.a.y) * ty));
    const d = distancia(pt, { x: w.a.x + tx * ao, y: w.a.y + ty * ao });
    if (!melhor || d < melhor.distancia) melhor = { indice: i, distancia: d, ao };
  });
  return melhor;
}

export interface OpcoesLegado {
  tipo: TipoEspaco; nome: string; peDireito: number;
  /** Os produtos do catálogo por id (para as peças com `produto`). */
  produtos: Readonly<Record<string, ProdutoModelo3D>>;
  revestimentos?: Espaco["revestimentos"];
}
export type ResLegado = { ok: true; espaco: Espaco; modelos: Record<string, ProdutoModelo3D> } | { ok: false; erro: string };

/** Uma peça genérica (sem produto do catálogo) com a forma do tipo antigo. */
export function modeloGenerico(tipo: TipoPeca, wCm: number, hCm: number): ProdutoModelo3D {
  const t = MOCKUP_DO_LEGADO[tipo], [, , al] = OMISSOES_CM[t];
  const d = { larguraCm: Math.max(wCm, hCm), profundidadeCm: Math.min(wCm, hCm), alturaCm: al, deNome: false };
  return { produtoId: `generico:${tipo}`, nome: tipo === "coluna" ? "Móvel coluna" : tipo.charAt(0).toUpperCase() + tipo.slice(1), tipo: t, dimensoes: d,
    mockup3d: { tipo: t, largura: d.larguraCm / 100, profundidade: d.profundidadeCm / 100, altura: d.alturaCm / 100, cor: COR_MOCKUP[t] }, categoria: "Peça genérica" };
}

/**
 * O desenho de hoje passado ao modelo genérico. Só com a planta fechada (senão há erro). O contorno passa por `normalizarContorno`.
 * Portas e janelas do desenho viram aberturas na parede mais próxima (a menos de 40 cm); as outras peças ficam encostadas à parede mais próxima.
 */
export function deLegado(planta: Planta, o: OpcoesLegado): ResLegado {
  if (planta.paredes.length < 3) return { ok: false, erro: "Desenhe pelo menos três paredes para ver em 3D." };
  if (faltaFechar(planta.paredes) > 1) return { ok: false, erro: "Feche a planta para ver em 3D." };
  const cm = cantos(planta.paredes, planta.o).slice(0, -1);
  const res = normalizarContorno(cm.map((q) => ({ x: q.x / 100, y: q.y / 100 })));
  if (!res.ok) return res;
  const paredes = paredesDoContorno(res.pontos);
  const aberturas: Abertura[] = [];
  const pecas: PecaProduto[] = [];
  const modelos: Record<string, ProdutoModelo3D> = {};
  for (const pc of planta.pecas) {
    const centro = { x: (pc.x + pc.w / 2) / 100, y: (pc.y + pc.h / 2) / 100 };
    const w = paredeMaisPerto(paredes, centro);
    if (pc.tipo === "porta" || pc.tipo === "janela") {
      if (!w || w.distancia > 0.4) continue;
      const largura = Math.max(pc.w, pc.h) / 100, ab: Abertura = {
        id: pc.id, tipo: pc.tipo, parede: paredes[w.indice].id, posicao: w.ao - largura / 2, largura,
        altura: pc.tipo === "porta" ? ALTURA_PORTA : ALTURA_JANELA, peitoril: pc.tipo === "porta" ? 0 : PEITORIL_JANELA,
      };
      aberturas.push(abrirNaParede(paredes[w.indice], ab));
      continue;
    }
    const m = (pc.produto && o.produtos[pc.produto]) || modeloGenerico(pc.tipo, pc.w, pc.h);
    modelos[m.produtoId] = m;
    // a largura da peça corre ao longo da parede a que encosta
    const n = w ? normalInterior(paredes, w.indice) : { x: 0, y: 1 };
    const aoLongoDeX = Math.abs(n.y) >= Math.abs(n.x);
    pecas.push({
      id: pc.id, produtoId: m.produtoId, x: centro.x, y: centro.y, rotacao: Math.round((Math.atan2(n.x, n.y) * 180) / Math.PI) + 0,
      paredeEncosto: w ? paredes[w.indice].id : null,
      largura: (aoLongoDeX ? pc.w : pc.h) / 100, profundidade: (aoLongoDeX ? pc.h : pc.w) / 100,
    });
  }
  const base = espacoVazio(o.tipo, o.nome);
  return { ok: true, modelos, espaco: { ...base, peDireito: o.peDireito, paredes, aberturas, pecas, revestimentos: o.revestimentos ?? base.revestimentos } };
}
