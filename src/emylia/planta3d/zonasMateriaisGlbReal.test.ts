// 25/11: o aspeto de metal tem de chegar a TODAS as malhas de `corpo` do GLB REAL da torneira. O GLB tem, por parte, um nó com o nome da parte (base, corpo, bica…) e, lá dentro, uma
// malha que também se chama «corpo»: procurar a parte «corpo» por nome apanhava a malha da base e a malha do corpo da torneira ficava sem a cópia da zona (metalness 0, cor de base).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { describe, expect, it } from "vitest";
import { categoriaPorId, opcoesComOmissao, urlDoGenerico } from "./categoriasGlb";
import { montarGenerico } from "./modelosHtml/glb";
import { corDoMetal } from "./metal3d";
import { INTENSIDADE_AMBIENTE_METAL, aplicarAparenciaDasZonas, criarMateriaisDeZona } from "./zonasMateriais";

async function carregar(id: string): Promise<THREE.Group> {
  const b = readFileSync(join(process.cwd(), "public", urlDoGenerico(id))), buf = new ArrayBuffer(b.byteLength);
  new Uint8Array(buf).set(b);
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  return (await l.parseAsync(buf, "")).scene;
}

describe("a torneira (GLB real): todas as malhas de `corpo` levam o material da zona", () => {
  it("nenhuma malha de `corpo` fica com o material partilhado do modelo e o metal chega a todas", async () => {
    const c = categoriaPorId("torneira")!, cena = await carregar("torneira");
    const m = montarGenerico(cena, c, { w: 0.06, d: 0.2, h: 0.3, o: opcoesComOmissao(c, "torneira", {}) }, "#cccccc");
    const zm = criarMateriaisDeZona(m.grupo, c);
    const daZona = new Set<THREE.Material>(zm.porZona.values());
    const corpos: THREE.Mesh[] = [];
    m.grupo.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh && (x.material as THREE.Material).name === "corpo") corpos.push(x); });
    expect(corpos.length).toBe(6);
    for (const x of corpos) expect(daZona.has(x.material as THREE.Material), x.name).toBe(true);
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: new Map(), zonas: { porZona: false, zonas: { corpo: { atributo: "x", cor: "#b87333", material: { roughness: 0.3, metalness: 1 } } } } });
    for (const x of corpos) expect((x.material as THREE.MeshStandardMaterial).metalness, x.name).toBe(1);
    m.libertar(); zm.libertar();
  });

  const montarTorneira = async () => {
    const c = categoriaPorId("torneira")!, cena = await carregar("torneira");
    const m = montarGenerico(cena, c, { w: 0.06, d: 0.2, h: 0.3, o: opcoesComOmissao(c, "torneira", {}) }, "#cccccc");
    const zm = criarMateriaisDeZona(m.grupo, c);
    const corpos: THREE.MeshStandardMaterial[] = [];
    m.grupo.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh && (x.material as THREE.Material).name === "corpo") corpos.push(x.material as THREE.MeshStandardMaterial); });
    return { m, zm, corpos };
  };
  const AMBIENTE = new THREE.Texture();

  it("o metal leva o ambiente com contraste e a cor de metal em todas as malhas, e só é pedido quando há metal", async () => {
    const { zm, corpos } = await montarTorneira();
    let pedidos = 0;
    const ambienteMetal = () => { pedidos++; return AMBIENTE; };
    const zonas = { porZona: true, zonas: { corpo: { atributo: "x", cor: "#FFBA6B", material: { roughness: 0.34, metalness: 1 } } } };
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: new Map(), zonas, ambienteMetal });
    expect(pedidos).toBeGreaterThan(0);
    for (const x of corpos) {
      expect(x.envMap).toBe(AMBIENTE); expect(x.envMapIntensity).toBe(INTENSIDADE_AMBIENTE_METAL);
      expect(x.roughness).toBe(0.34); expect(x.metalness).toBe(1);
      expect(`#${x.color.getHexString()}`).toBe(corDoMetal("#FFBA6B").toLowerCase());
    }
  });
  it("REGRESSÃO: um não metal fica exactamente como antes (sem ambiente próprio, intensidade 1, mesma cor e rugosidade) e nunca pede o ambiente dos metais", async () => {
    const { zm, corpos } = await montarTorneira();
    const ambienteMetal = () => { throw new Error("um não metal não pede o ambiente dos metais"); };
    const zonas = { porZona: true, zonas: { corpo: { atributo: "x", cor: "#F4F4F0", material: { roughness: 0.4 } } } };
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: new Map(), zonas, ambienteMetal });
    for (const x of corpos) {
      expect(x.envMap).toBeNull(); expect(x.envMapIntensity).toBe(1);
      expect(`#${x.color.getHexString()}`).toBe("#f4f4f0"); expect(x.roughness).toBe(0.4); expect(x.metalness).toBe(0);
    }
    // sem aspeto nenhum: a cor base e o material de origem, como antes
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: new Map(), ambienteMetal });
    for (const x of corpos) { expect(x.envMap).toBeNull(); expect(x.envMapIntensity).toBe(1); expect(`#${x.color.getHexString()}`).toBe("#cccccc"); expect(x.metalness).toBe(0); expect(x.roughness).toBe(0.4); }
  });
  it("tirar o metal (de metal para não metal) repõe o ambiente da cena", async () => {
    const { zm, corpos } = await montarTorneira();
    const ambienteMetal = () => AMBIENTE;
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: new Map(), zonas: { porZona: true, zonas: { corpo: { atributo: "x", cor: "#FFBA6B", material: { roughness: 0.3, metalness: 1 } } } }, ambienteMetal });
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: new Map(), zonas: { porZona: true, zonas: { corpo: { atributo: "x", cor: "#F4F4F0", material: { roughness: 0.4 } } } }, ambienteMetal });
    for (const x of corpos) { expect(x.envMap).toBeNull(); expect(x.envMapIntensity).toBe(1); expect(x.metalness).toBe(0); }
  });
});
