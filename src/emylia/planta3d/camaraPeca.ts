// Protótipo (visualizador 3D): a câmara que se aproxima da peça escolhida (perspetiva ¾, do lado virado para o meio da divisão). Função pura.
//
// O problema que isto resolve («o armário fugiu»): a câmara ficava a 1,05 × o tamanho da peça à frente dela; numa peça larga (lavatório de
// 120 cm) isso dava 2,4 m, e a câmara caía FORA da divisão ou DENTRO de outra peça (um móvel ou armário à frente). Dentro de uma peça, as faces
// dela viram as costas à câmara e não se desenham: a peça desaparece e só a sombra fica. Agora a câmara fica dentro da divisão e, se cair
// dentro da caixa de outra peça, sobe acima dela.
import type { ProdutoModelo3D } from "./catalogo3d";
import type { Espaco } from "./modelo";

export interface CamaraPedida { chave: string; pos: [number, number, number]; alvo: [number, number, number] }
/** A folga (m) da câmara às paredes e por cima de uma peça em que tenha caído. */
const FOLGA = 0.15;

export function camaraDaPeca(espaco: Espaco, modelos: Readonly<Record<string, ProdutoModelo3D>>, id: string): CamaraPedida | null {
  const p = espaco.pecas.find((x) => x.id === id), m = p && modelos[p.produtoId];
  if (!p || !m) return null;
  const h = m.mockup3d.altura, s = Math.max(p.largura, p.profundidade, h) * 1.7 + 0.25, a = (p.rotacao * Math.PI) / 180, base = p.altura;
  const mundo = (x: number, y: number, z: number): [number, number, number] => [p.x + x * Math.cos(a) + z * Math.sin(a), y, p.y - x * Math.sin(a) + z * Math.cos(a)];
  const xs = espaco.paredes.map((w) => w.a.x), zs = espaco.paredes.map((w) => w.a.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // o lado da perspetiva ¾ é o que fica virado para o meio da divisão
  const [d, e] = [mundo(s * 0.32, 0, s * 1.05), mundo(-s * 0.32, 0, s * 1.05)];
  const lado = Math.hypot(d[0] - cx, d[2] - cz) <= Math.hypot(e[0] - cx, e[2] - cz) ? 1 : -1;
  let [px, py, pz] = mundo(lado * s * 0.32, base + h * 0.5 + s * 0.55, s * 1.05);
  // dentro da divisão (na caixa das paredes, com folga) e abaixo do tecto
  px = Math.min(x1 - FOLGA, Math.max(x0 + FOLGA, px)); pz = Math.min(z1 - FOLGA, Math.max(z0 + FOLGA, pz));
  py = Math.min(espaco.peDireito - FOLGA, py);
  // se caiu dentro da caixa de outra peça, sobe acima dela (sem passar o tecto)
  for (const q of espaco.pecas) {
    if (q.id === p.id) continue;
    const mq = modelos[q.produtoId]; if (!mq) continue;
    const b = (q.rotacao * Math.PI) / 180, dx = px - q.x, dz = pz - q.y, lx = dx * Math.cos(b) - dz * Math.sin(b), lz = dx * Math.sin(b) + dz * Math.cos(b);
    const topo = q.altura + mq.mockup3d.altura;
    if (Math.abs(lx) <= q.largura / 2 + 0.05 && Math.abs(lz) <= q.profundidade / 2 + 0.05 && py >= q.altura - 0.05 && py <= topo + 0.05) py = Math.min(espaco.peDireito - 0.05, topo + FOLGA);
  }
  return { chave: `peca-${p.id}-${p.x.toFixed(2)}-${p.y.toFixed(2)}-${p.rotacao}-${m.produtoId}`, pos: [px, py, pz], alvo: mundo(0, base + h * 0.42, 0) };
}
