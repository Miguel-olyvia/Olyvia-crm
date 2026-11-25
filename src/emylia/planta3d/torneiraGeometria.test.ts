// 25/11: a GEOMETRIA da torneira (GLB real). Cada parte do GLB é um nó (base, corpo, bica…) com uma malha lá dentro que também se chama como o material («corpo»); o GLTFLoader dá nomes
// únicos, e o nó da parte «corpo» passa a «corpo_1». Procurar a parte por `getObjectByName` apanhava a malha da base: a escala do «corpo» ia para a malha errada e o nó ficava com a escala 1
// (um cilindro de 1 m): a torneira saía enorme em vez de ter as proporções do catálogo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { describe, expect, it } from "vitest";
import { categoriaPorId, opcoesComOmissao, urlDoGenerico } from "./categoriasGlb";
import { montarGenerico } from "./modelosHtml/glb";

async function carregar(id: string): Promise<THREE.Group> {
  const b = readFileSync(join(process.cwd(), "public", urlDoGenerico(id))), buf = new ArrayBuffer(b.byteLength);
  new Uint8Array(buf).set(b);
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  return (await l.parseAsync(buf, "")).scene;
}

describe("a torneira (GLB real): as medidas de cada parte vão para o nó da parte", () => {
  const medidas = { w: 0.06, d: 0.2, h: 0.3 };

  it("a caixa envolvente tem proporções de torneira (cerca de 30 cm de altura), e não um cilindro de 1 m", async () => {
    const c = categoriaPorId("torneira")!, cena = await carregar("torneira");
    const m = montarGenerico(cena, c, { ...medidas, o: opcoesComOmissao(c, "torneira", {}) }, "#cccccc");
    m.grupo.updateMatrixWorld(true);
    const tamanho = new THREE.Box3().setFromObject(m.grupo).getSize(new THREE.Vector3());
    expect(tamanho.y).toBeGreaterThan(0.28); expect(tamanho.y).toBeLessThan(0.36);
    expect(tamanho.x).toBeLessThan(0.15);
    expect(tamanho.z).toBeGreaterThan(0.1); expect(tamanho.z).toBeLessThan(0.25);
    m.libertar();
  });

  it("cada parte do catálogo põe a sua escala num nó que NÃO é uma malha (o nó da parte), incluindo o «corpo»", async () => {
    const c = categoriaPorId("torneira")!, cena = await carregar("torneira");
    const o = opcoesComOmissao(c, "torneira", {});
    const m = montarGenerico(cena, c, { ...medidas, o }, "#cccccc");
    const nos: THREE.Object3D[] = [];
    m.grupo.traverse((x) => { if (x !== m.grupo && !(x as THREE.Mesh).isMesh) nos.push(x); });
    for (const parte of c.partes) {
      const esc = parte.colocar({ ...medidas, o }).esc;
      const com = nos.filter((n) => n.scale.toArray().every((v, i) => Math.abs(v - esc[i]) < 1e-9) && (n.name === parte.nome || n.name.startsWith(`${parte.nome}_`)));
      expect(com.length, `${parte.nome}: nenhum nó da parte levou a escala ${esc.join(",")}`).toBeGreaterThan(0);
    }
    m.libertar();
  });
});
