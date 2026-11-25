// 25/11: o aspeto (rugosidade e metal) de cada zona no 3D, e os puxadores de metal que só se pintam com ligação explícita. Mesma montagem de zonasMateriais.test.ts (sem WebGL).
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { categoriaPorId } from "./categoriasGlb";
import { montarGenerico } from "./modelosHtml/glb";
import { aplicarAparenciaDasZonas, criarMateriaisDeZona } from "./zonasMateriais";
import type { ZonaGlb, ZonasDoProduto } from "./zonasGlb";

function cenaDe(id: string): THREE.Group {
  const c = categoriaPorId(id)!, cena = new THREE.Group();
  for (const p of c.partes) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); m.name = p.nome; m.userData.material = p.mat; cena.add(m); }
  return cena;
}
const montar = (id: string, ligadas?: readonly ZonaGlb[]) => {
  const c = categoriaPorId(id)!, m = montarGenerico(cenaDe(id), c, { w: 0.8, d: 0.45, h: 0.5, o: {} }, "#cccccc");
  return { c, m, zm: criarMateriaisDeZona(m.grupo, c, ligadas) };
};
const mat = (g: THREE.Object3D, nome: string) => (g.getObjectByName(nome) as THREE.Mesh).material as THREE.MeshStandardMaterial;
const texs = new Map<string, THREE.Texture>();

describe("o aspeto por zona: rugosidade e metal aplicam-se e repõem-se", () => {
  it("a zona com `material` leva a rugosidade e o metal; as outras ficam como estavam; tirar o material repõe o original", () => {
    const { m, zm } = montar("movel_lavatorio");
    const antes = { r: mat(m.grupo, "caixa").roughness, m: mat(m.grupo, "caixa").metalness };
    const zonas: ZonasDoProduto = { porZona: true, zonas: { frente: { atributo: "Cor da frente", cor: "#ffffff", material: { roughness: 0.15, metalness: 1 } }, corpo: { atributo: "Cor do corpo", cor: "#000000", material: { roughness: 0.8 } } } };
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas, texturas: texs });
    expect(mat(m.grupo, "frente_cima").roughness).toBe(0.15);
    expect(mat(m.grupo, "frente_cima").metalness).toBe(1);
    expect(mat(m.grupo, "caixa").roughness).toBe(0.8);
    expect(mat(m.grupo, "caixa").metalness).toBe(antes.m); // sem `metalness` no material: não se mexe
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: texs });
    expect(mat(m.grupo, "frente_cima").roughness).toBe(antes.r);
    expect(mat(m.grupo, "frente_cima").metalness).toBe(antes.m);
    expect(mat(m.grupo, "caixa").roughness).toBe(antes.r);
  });
  it("o aspeto vale também com as zonas iguais (porZona false): a superfície não depende de o desenho por zona estar ligado", () => {
    const { m, zm } = montar("movel_lavatorio");
    const zonas: ZonasDoProduto = { porZona: false, zonas: { frente: { atributo: "", material: { roughness: 0.4 } }, corpo: { atributo: "", material: { roughness: 0.4 } } } };
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas, texturas: texs });
    expect(mat(m.grupo, "caixa").roughness).toBe(0.4);
    expect(mat(m.grupo, "frente_cima").roughness).toBe(0.4);
  });
});

describe("os puxadores de metal: só são uma zona pintável com ligação explícita", () => {
  it("REGRESSÃO: sem ligação, os puxadores continuam a partilhar o metal do modelo e não há materiais fixos", () => {
    const { m, zm } = montar("movel_lavatorio");
    expect(zm.fixas.size).toBe(0);
    expect(mat(m.grupo, "puxador_1")).toBe(mat(m.grupo, "puxador_2"));
    const original = mat(m.grupo, "puxador_1");
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas: { porZona: true, zonas: { puxadores: { atributo: "Cor", cor: "#ff0000" } } }, texturas: texs, fixas: zm.fixas });
    expect(original.color.getHexString()).toBe("c9ced1");
  });
  it("com `puxadores` ligada: um material próprio para os dois puxadores (cópia do metal), e o original fica intacto", () => {
    const { m, zm } = montar("movel_lavatorio", ["puxadores"]);
    const fixo = zm.fixas.get("puxadores")!;
    expect(fixo).toBeDefined();
    expect(mat(m.grupo, "puxador_1")).toBe(fixo);
    expect(mat(m.grupo, "puxador_2")).toBe(fixo);
    expect(fixo.metalness).toBe(1);
    expect(fixo.color.getHexString()).toBe("c9ced1");
  });
  it("com ligação mas sem nada a pintar nessa zona, o puxador fica como era (cor e metal do modelo)", () => {
    const { m, zm } = montar("movel_lavatorio", ["puxadores"]);
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas: { porZona: true, zonas: { frente: { atributo: "Cor da frente", cor: "#ffffff" } } }, texturas: texs, fixas: zm.fixas });
    expect(mat(m.grupo, "puxador_1").color.getHexString()).toBe("c9ced1");
    expect(mat(m.grupo, "puxador_1").metalness).toBe(1);
  });
  it("a cor e o aspeto da zona chegam ao puxador; ao tirar, repõe-se a cor e o metal de origem", () => {
    const { m, zm } = montar("movel_lavatorio", ["puxadores"]);
    const zonas: ZonasDoProduto = { porZona: true, zonas: { puxadores: { atributo: "Cor dos puxadores", cor: "#222222", material: { roughness: 0.8, metalness: 0 } } } };
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas, texturas: texs, fixas: zm.fixas });
    const p = mat(m.grupo, "puxador_1");
    expect(p.color.getHexString()).toBe("222222");
    expect(p.roughness).toBe(0.8);
    expect(p.metalness).toBe(0);
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: texs, fixas: zm.fixas });
    expect(p.color.getHexString()).toBe("c9ced1");
    expect(p.metalness).toBe(1);
  });
  it("a foto única de hoje (zonas iguais) nunca vai para os puxadores fixos", () => {
    const { m, zm } = montar("movel_lavatorio", ["puxadores"]);
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: texs, unica: { tex: new THREE.Texture(), lado: 40 }, fixas: zm.fixas });
    expect(mat(m.grupo, "puxador_1").map).toBeNull();
  });
  it("`libertar` larga também as cópias fixas, nunca o metal do modelo", () => {
    const { m, zm } = montar("movel_lavatorio", ["puxadores"]);
    const fixo = vi.spyOn(zm.fixas.get("puxadores")!, "dispose");
    const lavatorio = vi.spyOn(mat(m.grupo, "lavatorio"), "dispose");
    zm.libertar();
    expect(fixo).toHaveBeenCalledTimes(1);
    expect(lavatorio).not.toHaveBeenCalled();
  });
  it("só o material `metal` é de uma zona ligada: o vidro e a porcelana da mesma zona ficam como estão", () => {
    const { m, zm } = montar("movel_lavatorio", ["puxadores", "frente", "corpo"]);
    const fixos = new Set<THREE.Material>(zm.fixas.values());
    expect(fixos.has(mat(m.grupo, "lavatorio"))).toBe(false);
    expect(fixos.has(mat(m.grupo, "cuba"))).toBe(false);
  });
});
