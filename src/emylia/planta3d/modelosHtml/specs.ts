// Os dados dos modelos do HTML (as `*Specs`), sem three: a lista de produtos, a bancada e a escolha do modelo de um produto do catálogo usam-nos
// sem carregar o three (que só entra com o visualizador, por React.lazy). Os construtores (lavaLoicas.ts, lavaLoicasRodi.ts, placas.ts, torneiras.ts)
// reexportam-nos. Medidas em mm.
type Par = number[];

/* ------------------------------------------------------------------ lava-loiças Frasa e RODI Ambar */
export const VELAR_SPECS = [
  { id: "velar34", size: 34, innerWidth: 340, outerWidth: 380, cabinet: 450, reference: "FS200260" }, { id: "velar40", size: 40, innerWidth: 400, outerWidth: 440, cabinet: 500, reference: "FS200261" },
  { id: "velar45", size: 45, innerWidth: 450, outerWidth: 490, cabinet: 500, reference: "FS200269" }, { id: "velar50", size: 50, innerWidth: 500, outerWidth: 540, cabinet: 600, reference: "FS200262" },
  { id: "velar71", size: 71, innerWidth: 710, outerWidth: 750, cabinet: 800, reference: "FS200263" },
];
export const LODY_SPECS = [
  { id: "lody40", size: 40, innerWidth: 400, outerWidth: 440, cabinet: 500, radius: 15, drainZ: -70 }, { id: "lody50", size: 50, innerWidth: 500, outerWidth: 540, cabinet: 600, radius: 15, drainZ: -70 },
  { id: "lody70", size: 70, innerWidth: 700, outerWidth: 740, cabinet: 800, radius: 12, drainZ: -80 },
];
export interface BowlAmbar { w: number; d: number; depth: number; left: number; top: number; drainX: number; drainZ: number; r: number }
const ab = (w: number, d: number, depth: number, left: number, top: number, dx = 0, dz = -80): BowlAmbar => ({ w, d, depth, left, top, drainX: dx, drainZ: dz, r: 15 });
export interface SpecAmbar { id: string; size: string; outerWidth: number; outerDepth: number; cabinet: number; step: boolean; tapLedge?: boolean; drainer?: boolean; bowls: BowlAmbar[] }
export const AMBAR_SPECS: SpecAmbar[] = [
  { id: "ambar40", size: "40", outerWidth: 450, outerDepth: 452, cabinet: 500, step: true, bowls: [ab(400, 380, 200, 25, 36)] }, { id: "ambar40n", size: "40 N", outerWidth: 450, outerDepth: 430, cabinet: 500, step: false, bowls: [ab(390, 370, 200, 30, 30)] },
  { id: "ambar50", size: "50", outerWidth: 550, outerDepth: 452, cabinet: 600, step: true, bowls: [ab(500, 380, 200, 25, 36)] }, { id: "ambar50n", size: "50 N", outerWidth: 550, outerDepth: 430, cabinet: 600, step: false, bowls: [ab(490, 370, 200, 30, 30)] },
  { id: "ambar57", size: "57", outerWidth: 550, outerDepth: 520, cabinet: 600, step: true, tapLedge: true, bowls: [ab(500, 380, 200, 25, 105)] },
  { id: "ambar55", size: "55", outerWidth: 555, outerDepth: 450, cabinet: 600, step: true, bowls: [ab(370, 380, 200, 20, 35), ab(130, 380, 125, 405, 35)] },
  { id: "ambar70", size: "70", outerWidth: 750, outerDepth: 452, cabinet: 800, step: true, bowls: [ab(700, 380, 220, 25, 36)] }, { id: "ambar80", size: "80", outerWidth: 850, outerDepth: 452, cabinet: 900, step: true, bowls: [ab(800, 380, 220, 25, 36)] },
  { id: "ambar86", size: "86", outerWidth: 860, outerDepth: 500, cabinet: 600, step: true, drainer: true, bowls: [ab(452, 380, 200, 37, 60.6, 116, 0)] },
  { id: "ambar105", size: "105", outerWidth: 1000, outerDepth: 500, cabinet: 600, step: true, drainer: true, bowls: [ab(452, 380, 200, 37, 60.6, 116, 0)] },
  { id: "ambar100", size: "100", outerWidth: 1000, outerDepth: 500, cabinet: 600, step: true, drainer: true, bowls: [ab(302, 380, 200, 37, 60.6, 46, 0), ab(145, 320, 125, 364, 90.6, 0, 0)] },
  { id: "ambar116", size: "116", outerWidth: 1160, outerDepth: 500, cabinet: 900, step: true, drainer: true, bowls: [ab(340, 380, 200, 37, 60.6, 65, 0), ab(310, 320, 200, 402, 90.6, -40, 0)] },
];
/* ------------------------------------------------------------------ lava-loiças RODI (Keran, UNA, Cubas) */
export interface CubaKeran { w: number; d: number; depth: number; r: number; left: number; drainX: number }
export const KERAN_SPECS: { id: string; size: number; outerWidth: number; cabinet: number; bowls: CubaKeran[] }[] = [
  { id: "keran80", size: 80, outerWidth: 800, cabinet: 450, bowls: [{ w: 340, d: 400, depth: 160, r: 95, left: 45, drainX: 50 }] },
  { id: "keran86", size: 86, outerWidth: 860, cabinet: 450, bowls: [{ w: 340, d: 400, depth: 160, r: 95, left: 45, drainX: 50 }] },
  { id: "keran100", size: 100, outerWidth: 1000, cabinet: 600, bowls: [{ w: 340, d: 400, depth: 160, r: 95, left: 45, drainX: 50 }, { w: 160, d: 300, depth: 90, r: 75, left: 425, drainX: 0 }] },
  { id: "keran116", size: 116, outerWidth: 1160, cabinet: 800, bowls: [{ w: 340, d: 400, depth: 160, r: 95, left: 45, drainX: 50 }, { w: 340, d: 400, depth: 160, r: 95, left: 425, drainX: -50 }] },
];
export const UNA_SPECS = [
  { id: "una55", size: 55, outerWidth: 580, cabinet: 600, bowls: [{ w: 340, d: 400, depth: 200, left: 20 }, { w: 180, d: 400, depth: 150, left: 380 }] },
  { id: "una75", size: 75, outerWidth: 740, cabinet: 800, bowls: [{ w: 340, d: 400, depth: 200, left: 20 }, { w: 340, d: 400, depth: 200, left: 380 }] },
];
export interface CubaCubas { w: number; d: number; r: number; depth: number; left: number; top: number; drainX: number; drainZ: number }
const cb = (w: number, d: number, r: number, depth: number, left: number, top: number, drainX: number, drainZ: number): CubaCubas => ({ w, d, r, depth, left, top, drainX, drainZ });
export const CUBAS_SPECS: { id: string; title: string; outerWidth: number; outerDepth: number; outerRadius: number; cabinet: number; duo?: boolean; bowls: CubaCubas[] }[] = [
  { id: "brasilia", title: "Brasília", outerWidth: 380, outerDepth: 440, outerRadius: 90, cabinet: 450, bowls: [cb(340, 400, 70, 200, 20, 20, 0, -80)] },
  { id: "bahia", title: "Bahia", outerWidth: 440, outerDepth: 440, outerRadius: 90, cabinet: 500, bowls: [cb(400, 400, 70, 200, 20, 20, 0, -80)] },
  { id: "laguna", title: "Laguna", outerWidth: 490, outerDepth: 440, outerRadius: 90, cabinet: 600, bowls: [cb(450, 400, 70, 200, 20, 20, 0, -80)] },
  { id: "belem", title: "Belém", outerWidth: 540, outerDepth: 440, outerRadius: 90, cabinet: 600, bowls: [cb(500, 400, 70, 200, 20, 20, 0, -80)] },
  { id: "duo60", title: "Duo 60", outerWidth: 571, outerDepth: 450, outerRadius: 50, cabinet: 600, duo: true, bowls: [cb(340, 400, 70, 200, 25, 25, 50, 0), cb(146, 296, 50, 150, 400, 129, 0, 0)] },
  { id: "duo80", title: "Duo 80", outerWidth: 765, outerDepth: 450, outerRadius: 50, cabinet: 800, duo: true, bowls: [cb(340, 400, 70, 200, 25, 25, 50, 0), cb(340, 400, 70, 200, 400, 25, -50, 0)] },
];
/* ------------------------------------------------------------------ placas */
type Queimador = [number, number, number] | [number, number, number, boolean];
export interface SpecPlaca {
  id: string; nominalWidth: number; brand: string; title: string; kind: "induction" | "radiant" | "gas"; glass?: boolean; outerWidth: number; outerDepth: number; plate: number; under: number;
  above?: number; cut: [number, number]; radius: number; zones: number; grate?: "wire" | "individual" | "cast"; knobs?: number[]; burners?: Queimador[];
}
export const HOB_SPECS: SpecPlaca[] = [
  { id: "ib65b60", nominalWidth: 600, brand: "Indesit", title: "IB 65B60 NE", kind: "induction", outerWidth: 590, outerDepth: 510, plate: 4, under: 50, cut: [560, 480], radius: 10, zones: 4 },
  { id: "ri161", nominalWidth: 600, brand: "Indesit", title: "RI 161 C (ES)", kind: "radiant", outerWidth: 580, outerDepth: 510, plate: 4, under: 42, cut: [560, 490], radius: 1, zones: 4 },
  { id: "thp642", nominalWidth: 600, brand: "Indesit", title: "THP 642 IX/I 1", kind: "gas", outerWidth: 580, outerDepth: 510, plate: 13, under: 38, above: 56, cut: [560, 480], radius: 10, zones: 4, grate: "wire", knobs: [-84, -28, 28, 84],
    burners: [[-160, -130, 37.5], [160, -130, 50], [-160, 75, 37.5], [160, 75, 27.5]] },
  { id: "ing61t", nominalWidth: 600, brand: "Indesit", title: "ING 61T", kind: "gas", glass: true, outerWidth: 590, outerDepth: 510, plate: 7, under: 42, above: 57, cut: [560, 480], radius: 2, zones: 4, grate: "individual", knobs: [-90, -30, 30, 90],
    burners: [[-145, -130, 37.5], [145, -130, 50], [-145, 75, 37.5], [145, 75, 27.5]] },
  { id: "wlb1160", nominalWidth: 600, brand: "Whirlpool", title: "WL B1160 BF", kind: "induction", outerWidth: 590, outerDepth: 510, plate: 4, under: 50, cut: [560, 480], radius: 2, zones: 4 },
  { id: "akt8090", nominalWidth: 600, brand: "Whirlpool", title: "AKT 8090/NE", kind: "radiant", outerWidth: 580, outerDepth: 510, plate: 4, under: 42, cut: [560, 490], radius: 6, zones: 4 },
  { id: "gmal6422", nominalWidth: 600, brand: "Whirlpool", title: "GMAL 6422/IXL", kind: "gas", outerWidth: 590, outerDepth: 510, plate: 7, under: 39, above: 52, cut: [560, 480], radius: 4, zones: 4, grate: "cast", knobs: [25, 88, 151, 214],
    burners: [[-145, -130, 37.5], [145, -130, 37.5], [-145, 70, 62, true], [145, 70, 27.5]] },
  { id: "gmwl958", nominalWidth: 900, brand: "Whirlpool", title: "GMWL 958/IXL", kind: "gas", outerWidth: 860, outerDepth: 510, plate: 7, under: 40, above: 52, cut: [840, 480], radius: 8.5, zones: 5, grate: "cast", knobs: [-235, -70, 40, 205, 315],
    burners: [[-270, -20, 64, true], [0, -135, 37.5], [0, 85, 37.5], [270, -135, 50], [270, 85, 27.5]] },
];
/* ------------------------------------------------------------------ torneiras */
export type ModeloTorneira = "round" | "noah" | "smooth" | "stick" | "cira" | "alexia" | "granada";
/** As medidas principais de cada modelo (mm), as do catálogo de origem: altura total, alcance, altura de saída e diâmetro da base. */
export const MEDIDAS_TORNEIRA: Record<ModeloTorneira, { altura: number; alcance: number; saida: number; base: number }> = {
  round: { altura: 445, alcance: 224, saida: 245, base: 55 }, noah: { altura: 366, alcance: 210, saida: 291, base: 51.5 },
  smooth: { altura: 435, alcance: 213, saida: 242, base: 49 }, stick: { altura: 456, alcance: 230, saida: 231, base: 50 },
  cira: { altura: 490, alcance: 220, saida: 210, base: 48 }, alexia: { altura: 353, alcance: 201, saida: 259, base: 52 }, granada: { altura: 345, alcance: 195, saida: 285, base: 52 },
};
export const ehModeloTorneira = (id: string): id is ModeloTorneira => id in MEDIDAS_TORNEIRA;

/** `roundLoop` do HTML: um rectângulo de cantos arredondados (centro na origem), como lista de pontos (x, z). */
export function roundLoop(w: number, d: number, r: number, n = 24): Par[] {
  const points: Par[] = [], centers = [[w / 2 - r, d / 2 - r], [-w / 2 + r, d / 2 - r], [-w / 2 + r, -d / 2 + r], [w / 2 - r, -d / 2 + r]];
  centers.forEach(([x, z], corner) => { for (let i = 0; i <= n; i++) { const a = corner * Math.PI / 2 + (i / n) * Math.PI / 2; points.push([x + r * Math.cos(a), z + r * Math.sin(a)]); } });
  return points;
}
