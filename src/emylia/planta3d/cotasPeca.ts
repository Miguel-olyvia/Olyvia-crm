// 24/11 (fase 1): a geometria das cotas da peça (largura, profundidade, altura) nas arestas da caixa, e quando uma cota se mostra. Funções puras, sem three nem React (o desenho
// é do Visualizador3D, `Cotas`). A caixa vai de -w/2 a w/2, -d/2 a d/2 e 0 a h (m).
import { textoDeCm } from "./eixosMedida";

type V3 = [number, number, number];
export interface CotaPeca { chave: "largura" | "profundidade" | "altura"; rotulo: string; /** a chaveta: a linha de chamada sai da aresta, corre ao longo dela e volta */ pontos: V3[]; /** onde vai o rótulo */ meio: V3 }

/** A direcção de onde a câmara olha na vista de partida da pré-visualização (de frente e de lado, um pouco por cima): a mesma de previaProduto3d.ts. */
export const DIRECAO_VISTA: V3 = [1, 0.6, 1];

/**
 * Onde um ponto da peça cai no ecrã na vista de partida (m, projecção ortográfica: x para a direita, y para cima). Serve para saber se dois rótulos vão ficar um em cima do outro;
 * a câmara pode rodar depois, por isso é só a escolha da posição de partida.
 */
export function ecranDeVistaPadrao(p: readonly [number, number, number]): [number, number] {
  const [dx, dy, dz] = DIRECAO_VISTA;
  // a câmara está em +DIRECAO_VISTA e olha para a origem: frente = -DIRECAO_VISTA; direita = frente × (0,1,0); cima = direita × frente
  const nd = Math.hypot(dx, dy, dz), nr = Math.hypot(dz, dx);
  const rx = dz / nr, rz = -dx / nr;
  const fx = -dx / nd, fy = -dy / nd, fz = -dz / nd;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  return [p[0] * rx + p[2] * rz, p[0] * ux + p[1] * uy + p[2] * uz];
}

/** Quanto cabe um rótulo, em fracção da maior medida da peça (a câmara enquadra sempre a peça, por isso o rótulo ocupa uma fracção parecida em qualquer tamanho). */
const LARGURA_ROTULO = 0.5, ALTURA_ROTULO = 0.12;
/** A distância entre dois rótulos em «tamanhos de rótulo»: abaixo de 1 sobrepõem-se; 1 ou mais, não. */
export function sobreposicao(a: readonly [number, number], b: readonly [number, number], escala: number): number {
  return Math.max(Math.abs(a[0] - b[0]) / (LARGURA_ROTULO * escala), Math.abs(a[1] - b[1]) / (ALTURA_ROTULO * escala));
}

/**
 * As três cotas da peça. A largura vai no topo da frente, a profundidade em baixo à direita e a altura na aresta vertical da frente, à esquerda. Numa peça deitada (quase tão
 * baixa como larga) o rótulo da altura cairia quase em cima do da largura na vista de partida: aí passa para a aresta do canto oposto (à direita), se ficar mais afastado dos outros dois.
 */
export function cotasDaPeca(w: number, d: number, h: number): CotaPeca[] {
  const grande = Math.max(w, d, h);
  const off = Math.min(0.3, Math.max(0.07, grande * 0.1));
  const xE = -w / 2 - off, xD = w / 2 + off, zF = d / 2 + off;
  const largura: CotaPeca = { chave: "largura", rotulo: `Largura ${textoDeCm(w * 100)} cm`, pontos: [[-w / 2, h, d / 2], [-w / 2, h, zF], [w / 2, h, zF], [w / 2, h, d / 2]], meio: [0, h, zF] };
  const profundidade: CotaPeca = { chave: "profundidade", rotulo: `Profundidade ${textoDeCm(d * 100)} cm`, pontos: [[w / 2, 0, -d / 2], [xD, 0, -d / 2], [xD, 0, d / 2], [w / 2, 0, d / 2]], meio: [xD, 0, 0] };
  const altura = (x: number, ladoPeca: number): CotaPeca => ({ chave: "altura", rotulo: `Altura ${textoDeCm(h * 100)} cm`, pontos: [[ladoPeca, 0, d / 2], [x, 0, d / 2], [x, h, d / 2], [ladoPeca, h, d / 2]], meio: [x, h / 2, d / 2] });
  const esquerda = altura(xE, -w / 2), direita = altura(xD, w / 2);
  const folga = (c: CotaPeca) => Math.min(...[largura, profundidade].map((o) => sobreposicao(ecranDeVistaPadrao(c.meio), ecranDeVistaPadrao(o.meio), grande)));
  const fe = folga(esquerda);
  return [largura, profundidade, fe >= 1 || fe >= folga(direita) ? esquerda : direita];
}

/** Um ponto já projectado (coordenadas normalizadas do ecrã: -1 a 1, e a profundidade -1 a 1 à frente da câmara). */
export interface PontoNdc { x: number; y: number; z: number }
/** Uma cota só se mostra se o ponto do rótulo está dentro do ecrã (com `margem` de folga, em coordenadas normalizadas) e à frente da câmara: ao zoom máximo os rótulos saem do enquadramento. */
export function noEcra(p: PontoNdc, margem = 0.05): boolean {
  const lim = 1 - margem;
  return Math.abs(p.x) <= lim && Math.abs(p.y) <= lim && Math.abs(p.z) <= 1;
}
