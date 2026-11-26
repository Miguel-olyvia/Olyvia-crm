// 24/11 (fase 1): UM material por zona (copiado do `corpo`, não por malha) e a aparência de cada zona (cor, foto, realce). Aqui monta-se o genérico a sério (montarGenerico) sobre uma
// cena de caixas com os nomes das partes (o que o GLB tem), sem WebGL: o que se vê no ecrã está nas capturas.
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { categoriaPorId } from "./categoriasGlb";
import { montarGenerico } from "./modelosHtml/glb";
import { COR_REALCE, aplicarAparenciaDasZonas, aplicarRealceDasZonas, criarMateriaisDeZona } from "./zonasMateriais";
import type { ZonasDoProduto } from "./zonasGlb";

/** Uma cena como a do GLB da categoria: um nó por parte, com o nome e o material (userData.material), todos caixas unitárias. */
function cenaDe(id: string): THREE.Group {
  const c = categoriaPorId(id)!, cena = new THREE.Group();
  for (const p of c.partes) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); m.name = p.nome; m.userData.material = p.mat; cena.add(m); }
  return cena;
}
const montar = (id: string, o: Record<string, string | boolean> = {}, cor = "#cccccc") => {
  const c = categoriaPorId(id)!, m = montarGenerico(cenaDe(id), c, { w: 0.8, d: 0.45, h: 0.5, o }, cor);
  return { c, m, zm: criarMateriaisDeZona(m.grupo, c) };
};
const noDe = (g: THREE.Object3D, nome: string) => g.getObjectByName(nome) as THREE.Mesh;
const mat = (g: THREE.Object3D, nome: string) => noDe(g, nome).material as THREE.MeshStandardMaterial;

describe("criarMateriaisDeZona: um material por zona", () => {
  it("o móvel de lavatório com gavetas: as duas frentes partilham UM material; o corpo tem outro; são cópias do `corpo` (não o partilhado)", () => {
    const { m, zm } = montar("movel_lavatorio");
    expect([...zm.porZona.keys()].sort()).toEqual(["corpo", "frente"]);
    const frente = zm.porZona.get("frente")!, corpo = zm.porZona.get("corpo")!;
    expect(frente).not.toBe(corpo);
    expect(mat(m.grupo, "frente_cima")).toBe(frente);
    expect(mat(m.grupo, "frente_baixo")).toBe(frente);
    expect(mat(m.grupo, "caixa")).toBe(corpo);
    for (const z of [frente, corpo]) { expect(z.color.getHexString()).toBe("cccccc"); expect(z.name).toBe("corpo"); }
  });
  it("os materiais fixos (metal dos puxadores, branco do lavatório, interior) ficam como estão, partilhados", () => {
    const { m, zm } = montar("movel_lavatorio");
    const zonas = new Set<THREE.Material>(zm.porZona.values());
    for (const nome of ["puxador_1", "puxador_2", "lavatorio", "cuba"]) expect(zonas.has(mat(m.grupo, nome)), nome).toBe(false);
    expect(mat(m.grupo, "puxador_1")).toBe(mat(m.grupo, "puxador_2"));
  });
  it("o móvel de cozinha com gavetas: três frentes de gaveta, uma só zona de frente, e as portas escondidas também levam a zona (o material já está pronto se voltarem)", () => {
    const { m, zm } = montar("modulo_base", { frentes: "gavetas" });
    expect(mat(m.grupo, "gaveta_1")).toBe(zm.porZona.get("frente"));
    expect(mat(m.grupo, "gaveta_3")).toBe(zm.porZona.get("frente"));
    expect(mat(m.grupo, "porta_esq")).toBe(zm.porZona.get("frente"));
    expect(mat(m.grupo, "corpo")).toBe(zm.porZona.get("corpo"));
  });
  it("a mesa: corpo (o aro), tampo e pés (as pernas)", () => {
    const { m, zm } = montar("mesa");
    expect([...zm.porZona.keys()].sort()).toEqual(["corpo", "pes", "tampo"]);
    expect(mat(m.grupo, "perna_1")).toBe(zm.porZona.get("pes"));
    expect(mat(m.grupo, "perna_4")).toBe(zm.porZona.get("pes"));
    expect(mat(m.grupo, "tampo")).toBe(zm.porZona.get("tampo"));
  });
  it("o sofá: as almofadas são o estofo; a base, o assento e os braços são o corpo", () => {
    const { m, zm } = montar("sofa");
    expect(mat(m.grupo, "almofada_assento_1")).toBe(zm.porZona.get("estofo"));
    expect(mat(m.grupo, "almofada_costas_2")).toBe(zm.porZona.get("estofo"));
    expect(mat(m.grupo, "base")).toBe(zm.porZona.get("corpo"));
    expect(mat(m.grupo, "braco_esq")).toBe(zm.porZona.get("corpo"));
  });
  it("`libertar` larga só as cópias de zona (os materiais da montagem são de quem montou)", () => {
    const { m, zm } = montar("movel_lavatorio");
    const espiao = [...zm.porZona.values()].map((x) => vi.spyOn(x, "dispose"));
    const partilhado = vi.spyOn(mat(m.grupo, "puxador_1"), "dispose");
    zm.libertar();
    for (const e of espiao) expect(e).toHaveBeenCalledTimes(1);
    expect(partilhado).not.toHaveBeenCalled();
  });
});

describe("aplicarAparenciaDasZonas: a cor, a foto e o realce de cada zona", () => {
  const texturaA = new THREE.Texture(), texturaB = new THREE.Texture();
  const texs = new Map<string, THREE.Texture>([["u:a", texturaA], ["u:b", texturaB]]);
  const zonas: ZonasDoProduto = { porZona: true, zonas: { corpo: { atributo: "Cor do corpo", textura: { url: "u:a", ladoCm: 40 } }, frente: { atributo: "Cor da frente", textura: { url: "u:b", ladoCm: 40 } } } };

  it("a frente e o corpo levam fotos DIFERENTES (cada uma o seu mapa, a cor passa a branco)", () => {
    const { m, zm } = montar("movel_lavatorio");
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas, texturas: texs });
    const frente = mat(m.grupo, "frente_cima"), corpo = mat(m.grupo, "caixa");
    expect(frente.map).toBe(texturaB);
    expect(corpo.map).toBe(texturaA);
    expect(frente.map).not.toBe(corpo.map);
    expect(frente.color.getHexString()).toBe("ffffff");
  });
  it("uma zona sem aparência (ou com a foto ainda a carregar) fica na cor base; outra zona com hex leva o hex", () => {
    const { m, zm } = montar("mesa");
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas: { porZona: true, zonas: { tampo: { atributo: "Cor do tampo", cor: "#ff0000" }, pes: { atributo: "Cor dos pés", textura: { url: "u:ainda-nao", ladoCm: 40 } } } }, texturas: texs });
    expect(mat(m.grupo, "tampo").color.getHexString()).toBe("ff0000");
    expect(mat(m.grupo, "tampo").map).toBeNull();
    expect(mat(m.grupo, "perna_1").map).toBeNull();
    expect(mat(m.grupo, "perna_1").color.getHexString()).toBe("cccccc");
    expect(mat(m.grupo, "aro").color.getHexString()).toBe("cccccc");
  });
  it("mudar a aparência depois repõe o que estava: sem zonas, tudo volta à cor base e sem foto", () => {
    const { m, zm } = montar("movel_lavatorio");
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas, texturas: texs });
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: texs });
    for (const nome of ["frente_cima", "caixa"]) { expect(mat(m.grupo, nome).map, nome).toBeNull(); expect(mat(m.grupo, nome).color.getHexString(), nome).toBe("cccccc"); }
  });
  it("o caminho de hoje (zonas iguais, ou sem zonas): a foto única vai para TODAS as zonas, como ia para o `corpo` inteiro", () => {
    const { m, zm } = montar("movel_lavatorio");
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", texturas: texs, unica: { tex: texturaA, lado: 40 } });
    expect(mat(m.grupo, "frente_cima").map).toBe(texturaA);
    expect(mat(m.grupo, "caixa").map).toBe(texturaA);
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas: { porZona: false, zonas: {} }, texturas: texs, unica: { tex: texturaB, lado: 40 } });
    expect(mat(m.grupo, "caixa").map).toBe(texturaB);
  });
  it("o realce acende só a zona pedida (brilho) e apaga-se ao tirar", () => {
    const { m, zm } = montar("movel_lavatorio");
    aplicarRealceDasZonas(zm.porZona, "frente");
    expect(mat(m.grupo, "frente_cima").emissive.getHexString()).toBe(COR_REALCE.slice(1));
    expect(mat(m.grupo, "caixa").emissive.getHexString()).toBe("000000");
    aplicarRealceDasZonas(zm.porZona, null);
    expect(mat(m.grupo, "frente_cima").emissive.getHexString()).toBe("000000");
  });
  it("26/11: o realce aceita VÁRIAS zonas (o painel «Aspeto 3D» realça as zonas que uma regra pinta de facto); uma lista vazia apaga-o", () => {
    const { m, zm } = montar("movel_lavatorio");
    aplicarRealceDasZonas(zm.porZona, ["frente", "corpo"]);
    expect(mat(m.grupo, "frente_cima").emissive.getHexString()).toBe(COR_REALCE.slice(1));
    expect(mat(m.grupo, "caixa").emissive.getHexString()).toBe(COR_REALCE.slice(1));
    aplicarRealceDasZonas(zm.porZona, ["frente"]);
    expect(mat(m.grupo, "caixa").emissive.getHexString()).toBe("000000");
    aplicarRealceDasZonas(zm.porZona, []);
    expect(mat(m.grupo, "frente_cima").emissive.getHexString()).toBe("000000");
  });
  it("mudar só o realce mexe só no brilho: não retira nem volta a pôr a foto (o material não se recompila) e a aparência fica como estava", () => {
    const { m, zm } = montar("movel_lavatorio");
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas, texturas: texs });
    const frente = mat(m.grupo, "frente_cima"), corpo = mat(m.grupo, "caixa");
    const versoes = [frente.version, corpo.version];
    aplicarRealceDasZonas(zm.porZona, "frente");
    aplicarRealceDasZonas(zm.porZona, "corpo");
    aplicarRealceDasZonas(zm.porZona, null);
    expect([frente.version, corpo.version]).toEqual(versoes);
    expect(frente.map).toBe(texturaB);
    expect(corpo.map).toBe(texturaA);
    expect(frente.color.getHexString()).toBe("ffffff");
  });
  it("o realce que já estava aplicado sobrevive a uma nova aparência (a aparência não mexe no brilho)", () => {
    const { m, zm } = montar("movel_lavatorio");
    aplicarRealceDasZonas(zm.porZona, "frente");
    aplicarAparenciaDasZonas(zm.porZona, { corBase: "#cccccc", zonas, texturas: texs });
    expect(mat(m.grupo, "frente_cima").emissive.getHexString()).toBe(COR_REALCE.slice(1));
  });
});

describe("criarMateriaisDeZona: uma parte que o grupo não tem", () => {
  it("avisa uma vez (console.warn) com o nome da parte, e não volta a avisar na montagem seguinte; as outras zonas continuam a funcionar", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = categoriaPorId("movel_lavatorio")!;
    const falta = c.partes.find((p) => p.nome === "frente_baixo")!;
    const montarSem = () => {
      const m = montarGenerico(cenaDe("movel_lavatorio"), c, { w: 0.8, d: 0.45, h: 0.5, o: {} }, "#cccccc");
      m.grupo.getObjectByName(falta.nome)?.removeFromParent();
      return { m, zm: criarMateriaisDeZona(m.grupo, c) };
    };
    const a = montarSem();
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0].join(" "))).toContain("frente_baixo");
    montarSem();
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(mat(a.m.grupo, "frente_cima")).toBe(a.zm.porZona.get("frente"));
    aviso.mockRestore();
  });
});
