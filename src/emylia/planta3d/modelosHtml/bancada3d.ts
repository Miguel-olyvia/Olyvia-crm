// A bancada composta em 3D, portada do compositor de bancadas do HTML (`counterStone`, `counterUpstands`, `counterEquipment`): mm, +Z é a frente,
// o topo da chapa é Y0. A chapa de 12 mm é um sólido furado (lava-loiça, placa e furo da torneira), com a imagem da chapa do fabricante à escala
// (sem repetir: as coordenadas são as da chapa física, `counterUV`), o rodatampo com o mesmo desenho, e os equipamentos são os modelos detalhados
// (lava-loiça por baixo ou por cima, placa, torneira). Por baixo, os móveis até ao chão (a bancada fica a 90 cm). Sem React; a textura carrega-se fora.
import * as THREE from "three";
import { TOPO_BANCADA_MM, colocacao, selecaoChapa, type ConfigBancada } from "../bancada";
import { construirLavaLoica } from "./index";
import { caminhoForma, caminhoFuro, roundLoop } from "./lavaLoicas";
import { construirPlaca } from "./placas";
import { construirTorneira, ehModeloTorneira } from "./torneiras";
import { libertarMateriais } from "./util";

export interface BancadaHtml { grupo: THREE.Group; libertar: () => void }

/** `counterUV`: a posição (x, z) na chapa física (largura × comprimento), com a faixa e o sentido dos veios. */
function uvDaChapa(x: number, z: number, c: ConfigBancada, slab: [number, number]): [number, number] {
  const [width, length] = slab;
  let u = (z + c.depth / 2 + 40 + ((width - c.depth - 80) * c.textureOffset) / 100) / width, v = (x + length / 2) / length;
  if (c.direction === 180) { u = 1 - u; v = 1 - v; }
  return [u, v];
}
function mapearUV(g: THREE.BufferGeometry, c: ConfigBancada, slab: [number, number], projetar: (x: number, y: number, z: number) => [number, number] = (x, _y, z) => [x, z]): void {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const [x, z] = projetar(p.getX(i), p.getY(i), p.getZ(i)); const [u, v] = uvDaChapa(x, z, c, slab); uv.setXY(i, u, v); }
  uv.needsUpdate = true;
}

/** Os móveis por baixo (do chão até à face de baixo da chapa): módulos iguais de ~60 cm, frentes com folgas, puxador cavado e rodapé recuado. */
function moveis(c: ConfigBancada, livres: [number, number][], parent: THREE.Group, mats: THREE.Material[], geos: THREE.BufferGeometry[]): void {
  const corpo = new THREE.MeshStandardMaterial({ color: "#d9d6cf", roughness: 0.7, envMapIntensity: 0.5 }), frente = new THREE.MeshStandardMaterial({ color: "#e2dfd8", roughness: 0.55, envMapIntensity: 0.5 });
  const sombra = new THREE.MeshStandardMaterial({ color: "#3f403f", roughness: 0.8, envMapIntensity: 0.4 });
  mats.push(corpo, frente, sombra);
  const caixa = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d); geos.push(g);
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o);
  };
  const topo = -12, chao = -TOPO_BANCADA_MM, rodape = 100, fundo = 580, z0 = -c.depth / 2 + 2, golaH = 34, e = 18;
  const L = c.length, n = Math.max(1, Math.round(L / 600)), lw = L / n, hc = topo - chao - rodape, yc = (topo + chao + rodape) / 2, dc = fundo - 20;
  // o corpo é aberto em cima (o lava-loiça por baixo e a caixa da placa entram nele): laterais, divisórias, fundo, costas
  // as divisórias não passam por baixo do lava-loiça nem da placa (`livres`: os intervalos em x ocupados por eles)
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + 2 + e / 2 + i * ((L - 4 - e) / n);
    if (i === 0 || i === n || !livres.some(([a, b]) => x > a - e && x < b + e)) caixa(e, hc, dc, x, yc, z0 + dc / 2, corpo);
  }
  caixa(L - 4, e, dc, 0, chao + rodape + e / 2, z0 + dc / 2, corpo);
  caixa(L - 4, hc, 8, 0, yc, z0 + 4, corpo);
  caixa(L - 40, rodape, 18, 0, chao + rodape / 2, z0 + fundo - 80, sombra);
  caixa(L - 4, golaH, 18, 0, topo - golaH / 2, z0 + fundo - 40, sombra);
  const hFrente = topo - golaH - (chao + rodape) - 6;
  for (let i = 0; i < n; i++) caixa(lw - 4, hFrente, 18, -L / 2 + lw * (i + 0.5), chao + rodape + 3 + hFrente / 2, z0 + fundo - 11, frente);
}

/** Constrói a bancada (em mm). `textura`: a imagem da chapa (pode ainda não ter carregado; o material actualiza-se quando chegar). */
export function construirBancada(c: ConfigBancada, textura: THREE.Texture | null): BancadaHtml | null {
  const p = colocacao(c), { series, tone, finish } = selecaoChapa(c);
  if (!p || !series || !tone || !finish) return null;
  const grupo = new THREE.Group(); grupo.name = `Bancada · ${series.label} · ${tone.label}`;
  const mats: THREE.Material[] = [], geos: THREE.BufferGeometry[] = [], libertos: (() => void)[] = [];
  const mat = new THREE.MeshPhysicalMaterial({ map: textura, color: textura ? 0xffffff : tone.edge, metalness: 0, roughness: finish.roughness, clearcoat: finish.clearcoat, clearcoatRoughness: 0.28, envMapIntensity: c.surface === "seda" ? 0.48 : 0.28 });
  const edge = new THREE.MeshStandardMaterial({ color: tone.edge, roughness: 0.7, metalness: 0 });
  mats.push(mat, edge);
  const t = c.thickness;

  // a chapa: o contorno com cantos de 4 mm e os recortes abertos
  const forma = caminhoForma(roundLoop(c.length, c.depth, 4));
  forma.holes = p.holes.map((l) => caminhoFuro(l));
  const geo = new THREE.ExtrudeGeometry(forma, { depth: t, bevelEnabled: false, steps: 1, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, -t, 0); geo.computeVertexNormals(); mapearUV(geo, c, series.slab); geos.push(geo);
  const chapa = new THREE.Mesh(geo, [mat, edge]); chapa.name = "Bancada · 12 mm · recortes abertos"; chapa.castShadow = true; chapa.receiveShadow = true; grupo.add(chapa);

  // o rodatampo (traseiro, esquerdo, direito), com o mesmo desenho da chapa
  if (c.upstand > 0) {
    const h = c.upstand;
    const peca = (w: number, d: number, x: number, z: number, nome: string, projetar: (x: number, y: number, z: number) => [number, number]) => {
      const g = new THREE.BoxGeometry(w, h, d); g.translate(x, h / 2 + 0.15, z); mapearUV(g, c, series.slab, projetar); geos.push(g);
      const o = new THREE.Mesh(g, nome === "traseiro" ? [edge, edge, edge, edge, mat, edge] : [mat, mat, edge, edge, edge, edge]); o.name = `Rodatampo · ${nome} · ${h} mm`; o.castShadow = true; o.receiveShadow = true; grupo.add(o);
    };
    if (c.back) peca(c.length, t, 0, -c.depth / 2 + t / 2, "traseiro", (x, y) => [x, -c.depth / 2 + y]);
    const d = c.depth - (c.back ? t : 0), z = c.back ? t / 2 : 0;
    if (c.left) peca(t, d, -c.length / 2 + t / 2, z, "esquerdo", (_x, y, zz) => [-c.length / 2 + y, zz]);
    if (c.right) peca(t, d, c.length / 2 - t / 2, z, "direito", (_x, y, zz) => [c.length / 2 - y, zz]);
  }

  // os equipamentos: os modelos detalhados do HTML
  const sink = construirLavaLoica(c.sink, c.sinkFinish);
  sink.grupo.position.set(p.sx, c.mount === "under" ? -t - 0.4 : p.sink.ambar ? 10.4 : 1.4, p.sz); sink.grupo.rotation.y = c.reverse ? Math.PI : 0;
  grupo.add(sink.grupo); libertos.push(() => sink.materiais.forEach((m) => m.dispose()));
  const hob = construirPlaca(c.hob, c.hobFinish);
  hob.grupo.position.set(p.hx, 0, 0); grupo.add(hob.grupo); libertos.push(() => hob.materiais.forEach((m) => m.dispose()));
  if (ehModeloTorneira(c.tap)) {
    const tap = construirTorneira(c.tap, c.tapFinish);
    tap.grupo.position.set(p.tx, 0, p.tz); grupo.add(tap.grupo); libertos.push(() => libertarMateriais(tap.materiais));
  }
  if (c.cabinet) moveis(c, [[p.sx - p.sink.outerWidth / 2, p.sx + p.sink.outerWidth / 2], [p.hx - p.hob.outerWidth / 2, p.hx + p.hob.outerWidth / 2]], grupo, mats, geos);
  grupo.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  grupo.position.y = TOPO_BANCADA_MM;
  return { grupo, libertar: () => { geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); libertos.forEach((f) => f()); } };
}
