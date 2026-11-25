// 25/11: escolher a zona NO 3D: que zona está debaixo do ponteiro (a malha mais próxima e visível; a zona vem marcada na malha por criarMateriaisDeZona) e se o gesto foi um clique ou o arrastar da câmara.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { categoriaPorId } from "./categoriasGlb";
import { montarGenerico } from "./modelosHtml/glb";
import { LIMITE_ARRASTO_PX, foiClique, zonaDaPrimeiraIntersecao, zonaDoObjeto } from "./zonaDoClique";
import { criarMateriaisDeZona } from "./zonasMateriais";

const malha = (zona?: string, visivel = true, pai?: THREE.Object3D): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  if (zona) m.userData.zona = zona;
  m.visible = visivel;
  pai?.add(m);
  return m;
};

describe("foiClique: só conta se o ponteiro quase não se moveu entre premir e largar", () => {
  it("parado, ou a tremer um pouco, é clique", () => {
    expect(foiClique(0)).toBe(true);
    expect(foiClique(LIMITE_ARRASTO_PX)).toBe(true);
  });
  it("mais do que o limite é arrastar a câmara, não é clique", () => {
    expect(foiClique(LIMITE_ARRASTO_PX + 1)).toBe(false);
    expect(foiClique(120)).toBe(false);
  });
});

describe("zonaDoObjeto e zonaDaPrimeiraIntersecao", () => {
  it("a malha com zona dá a zona", () => { expect(zonaDoObjeto(malha("frente"))).toBe("frente"); });
  it("uma malha sem zona (o chão, o interior, a água) não dá nenhuma", () => { expect(zonaDoObjeto(malha())).toBeNull(); });
  it("uma zona que o código não conhece não vale", () => { expect(zonaDoObjeto(malha("lateral"))).toBeNull(); });
  it("uma malha escondida, ou dentro de um grupo escondido (uma parte que as opções tiraram), não conta", () => {
    expect(zonaDoObjeto(malha("frente", false))).toBeNull();
    const grupo = new THREE.Group(); grupo.visible = false;
    expect(zonaDoObjeto(malha("frente", true, grupo))).toBeNull();
  });
  it("a primeira intersecção visível decide: uma porta à frente de um corpo dá a frente, e uma parede à frente da peça não dá zona", () => {
    expect(zonaDaPrimeiraIntersecao([{ object: malha("frente") }, { object: malha("corpo") }])).toBe("frente");
    expect(zonaDaPrimeiraIntersecao([{ object: malha() }, { object: malha("corpo") }])).toBeNull();
  });
  it("salta as partes escondidas (o raio atravessa-as) e vai à seguinte", () => {
    expect(zonaDaPrimeiraIntersecao([{ object: malha("frente", false) }, { object: malha("corpo") }])).toBe("corpo");
  });
  it("só aceita as zonas que o modelo tem (as `validas`); sem intersecções não dá nenhuma", () => {
    expect(zonaDaPrimeiraIntersecao([{ object: malha("puxadores") }], new Set(["frente", "corpo"]))).toBeNull();
    expect(zonaDaPrimeiraIntersecao([])).toBeNull();
  });
});

describe("criarMateriaisDeZona marca em cada malha a zona da sua parte (é daí que o clique a lê)", () => {
  const cena = (id: string): THREE.Group => {
    const c = categoriaPorId(id)!, g = new THREE.Group();
    for (const p of c.partes) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); m.name = p.nome; m.userData.material = p.mat; g.add(m); }
    return g;
  };
  it("o móvel de lavatório: as frentes são frente, a caixa é corpo, os pés são pés, o puxador de metal é puxadores, e o lavatório (sem zona) fica sem marca", () => {
    const c = categoriaPorId("movel_lavatorio")!, m = montarGenerico(cena("movel_lavatorio"), c, { w: 0.8, d: 0.45, h: 0.5, o: {} }, "#cccccc");
    criarMateriaisDeZona(m.grupo, c);
    const zona = (n: string) => (m.grupo.getObjectByName(n) as THREE.Mesh).userData.zona;
    expect(zona("frente_cima")).toBe("frente");
    expect(zona("caixa")).toBe("corpo");
    expect(zona("pe_1")).toBe("pes");
    expect(zona("puxador_1")).toBe("puxadores");
    expect(zona("lavatorio")).toBeUndefined();
  });
});
