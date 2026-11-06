import { describe, expect, it } from "vitest";
import { CATEGORIAS_FAMILIA, FAMILIAS, acabamentosDaMedida, alturaLavaLoicaCm, familiaPorId, familiasDaCategoria, modeloDaFamilia, resolverVariante, variantesDe } from "./familias";

const fam = (id: string) => familiaPorId(id)!;

describe("o catálogo de famílias (dados do HTML de origem)", () => {
  it("7 torneiras, cada uma com os acabamentos do catálogo: uma família com 7 acabamentos é um só produto", () => {
    const t = familiasDaCategoria("torneiras");
    expect(t.map((f) => f.id)).toEqual(["round", "noah", "smooth", "cira", "alexia", "granada", "stick"]);
    expect(Object.fromEntries(t.map((f) => [f.id, f.acabamentos.length]))).toEqual({ round: 6, noah: 5, smooth: 7, cira: 4, alexia: 2, granada: 2, stick: 1 });
    expect(variantesDe(fam("smooth"))).toHaveLength(7);
  });
  it("32 modelos de lava-loiça em 6 famílias e 8 placas em 3 famílias", () => {
    const l = familiasDaCategoria("lavaloicas");
    expect(l.map((f) => f.medidas.length)).toEqual([5, 4, 2, 6, 3, 12]);
    expect(l.reduce((s, f) => s + f.medidas.length, 0)).toBe(32);
    expect(familiasDaCategoria("placas").reduce((s, f) => s + f.medidas.length, 0)).toBe(8);
  });
  it("os separadores de categoria existem para a cozinha e para o banho", () => {
    expect(CATEGORIAS_FAMILIA.map((c) => c.id)).toEqual(["torneiras", "lavaloicas", "placas", "tampos", "cozinha", "banho"]);
  });
  it("todas as variantes têm SKU único e nome «(demo)»", () => {
    const todas = FAMILIAS.flatMap((f) => variantesDe(f));
    expect(new Set(todas.map((v) => v.sku)).size).toBe(todas.length);
    expect(todas.every((v) => v.nome.endsWith("(demo)"))).toBe(true);
  });
});

describe("resolver uma variante: material, preço e SKU", () => {
  it("o acabamento dá a cor e o material, e a diferença de preço", () => {
    const v = resolverVariante(fam("smooth"), "unica", "negro");
    expect(v).toMatchObject({ sku: "RUB-SMO-NE", preco: 239, material: { cor: "#151617", metalness: 0.05, roughness: 0.5 } });
    expect(resolverVariante(fam("smooth"), "unica", "oro")).toMatchObject({ sku: "RUB-SMO-OR", preco: 259 });
    expect(resolverVariante(fam("smooth"), "unica", "chrome").preco).toBe(219);
  });
  it("o nome do acabamento vem dos dados (Cromo, Preto Mate, PVD Gold)", () => {
    expect(resolverVariante(fam("smooth"), "unica", "chrome").acabamento.nome).toBe("Cromo");
    expect(resolverVariante(fam("stick"), "unica", "negro").acabamento.nome).toBe("Preto Mate");
    expect(resolverVariante(fam("lody"), "lody50", "oro").acabamento.nome).toBe("PVD Gold");
  });
  it("a medida muda o preço, o SKU, as dimensões e o nome", () => {
    const a = resolverVariante(fam("velar"), "velar34", "inox"), b = resolverVariante(fam("velar"), "velar71", "inox");
    expect([a.preco, b.preco, a.sku, b.sku]).toEqual([89, 159, "FS200260-IX", "FS200263-IX"]);
    expect(b.nome).toBe("Lava-loiça Velar 71 cm (demo)");
    expect(b.medida.dim).toEqual([75, 44, 20]);
  });
  it("um id desconhecido cai na primeira medida e no primeiro acabamento", () => {
    const v = resolverVariante(fam("round"), "nada", "nada");
    expect([v.medida.id, v.acabamento.id]).toEqual(["unica", "brushed"]);
  });
  it("cada medida tem os seus acabamentos (a ING 61T é de vidro; as outras placas a gás, de inox)", () => {
    const g = fam("placa_gas");
    expect(acabamentosDaMedida(g, "ing61t").map((a) => a.id)).toEqual(["negro", "blanco"]);
    expect(acabamentosDaMedida(g, "thp642").map((a) => a.id)).toEqual(["inox"]);
    expect(variantesDe(g)).toHaveLength(2 + 1 + 1 + 1);
    expect(resolverVariante(g, "ing61t", "inox").acabamento.id).toBe("negro");
  });
  it("a Ambar: Midnight, Concrete e Ice (mate)", () => {
    expect(variantesDe(fam("ambar"))).toHaveLength(12 * 3);
    expect(resolverVariante(fam("ambar"), "ambar50", "gunmetal").material).toMatchObject({ cor: "#858988", metalness: 0 });
  });
});

describe("o produto 3D de uma variante", () => {
  it("lava-loiça: dimensões, cubas em metros e altura do rebordo rente ao tampo", () => {
    const m = modeloDaFamilia(fam("velar"), "velar50", "inox");
    expect(m.fam).toMatchObject({ familiaId: "velar", medidaId: "velar50", sku: "FS200262-IX", preco: 119 });
    expect(m.dimensoes).toMatchObject({ larguraCm: 54, profundidadeCm: 44, alturaCm: 20 });
    expect(m.mockup3d.params).toMatchObject({ k: "lava_loica", escorredor: false });
    expect((m.mockup3d.params as { cubas: { w: number }[] }).cubas[0].w).toBeCloseTo(0.5, 5);
    expect(m.alturaOmissao).toBeCloseTo(0.688, 3);
    expect(alturaLavaLoicaCm(20, "baixo")).toBeCloseTo(68.8, 5);
    expect(alturaLavaLoicaCm(20, "cima")).toBe(70);
  });
  it("torneira: parâmetros em metros e estilo", () => {
    const m = modeloDaFamilia(fam("cira"), "unica", "oro");
    expect(m.mockup3d.params).toMatchObject({ k: "torneira", estilo: "cira", altura: 0.49, saida: 0.21, alcance: 0.22, base: 0.048 });
    expect(m.mockup3d.cor).toBe("#c6ab64");
    expect(m.tipo).toBe("torneira_cozinha");
  });
  it("placa: recorte e queimadores; a de 90 cm tem 5", () => {
    const m = modeloDaFamilia(fam("placa_gas"), "gmwl958", "inox");
    expect(m.mockup3d.params).toMatchObject({ k: "placa", tipo: "gas", recorte: [0.84, 0.48] });
    expect((m.mockup3d.params as { queimadores: unknown[] }).queimadores).toHaveLength(5);
    expect(m.dimensoes.larguraCm).toBe(86);
  });
  it("o sifão não tem geometria e o tampo leva as 11 cores do catálogo", () => {
    expect(fam("sifao").geo).toBe(false);
    expect(fam("tampo").acabamentos).toHaveLength(11);
  });
  it("as torneiras com modelo detalhado do HTML (Round, Noah, Smooth, Stick) ligam o modelo e o acabamento; as outras ficam no mockup simples", () => {
    expect(modeloDaFamilia(fam("stick"), "unica", "negro").mockup3d.params).toMatchObject({ k: "torneira", html: { modelo: "stick", acab: "negro" } });
    expect(modeloDaFamilia(fam("round"), "unica", "oro").mockup3d.params).toMatchObject({ html: { modelo: "round", acab: "oro" } });
    expect(modeloDaFamilia(fam("cira"), "unica", "oro").mockup3d.params).toMatchObject({ html: { modelo: "cira", acab: "oro" } });
    expect(modeloDaFamilia(fam("granada"), "unica", "blanco").mockup3d.params).toMatchObject({ html: { modelo: "granada", acab: "blanco" } });
    expect(fam("round").opcoes).toEqual(["bica", "extraida"]);
    expect(fam("noah").opcoes).toEqual(["bica"]);
  });
});
