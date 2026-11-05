import { describe, expect, it } from "vitest";
import { dimensoesDoNome, extrairDimensoes, modeloDoProduto, produtosParaEspaco, tipoEspacoDeDivisao, tipoMockupDe, type NoCat, type ProdutoCat } from "./catalogo3d";
import { lerCatalogo } from "../v2/catalogoStore";

const arvore: NoCat[] = [
  { id: "c", n: "Canalização", pai: null }, { id: "c1", n: "Louças e torneiras", pai: "c" },
  { id: "k", n: "Carpintaria", pai: null }, { id: "k1", n: "Mobiliário", pai: "k" }, { id: "k2", n: "Resguardos", pai: "k" },
];
const p = (id: string, n: string, no: string | null, sub?: string): ProdutoCat => ({ id, n, no, sub });

describe("dimensões no nome", () => {
  it("lê «80×120» e «60x45x80 cm»", () => {
    expect(dimensoesDoNome("Base de duche 80×120")).toEqual([80, 120]);
    expect(dimensoesDoNome("Móvel 60x45x80 cm")).toEqual([60, 45, 80]);
  });
  it("lê milímetros e vírgulas", () => {
    expect(dimensoesDoNome("Base 1200x800 mm")).toEqual([120, 80]);
    expect(dimensoesDoNome("Banheira 170,5 x 70")).toEqual([170.5, 70]);
  });
  it("não confunde números soltos nem medidas absurdas", () => {
    expect(dimensoesDoNome("Sanita suspensa Roca 2020")).toBeNull();
    expect(dimensoesDoNome("Kit 1x2")).toBeNull();
  });
  it("base de duche e banheira: o maior é a largura", () => {
    expect(extrairDimensoes("Base de duche 80×120", "base_duche")).toMatchObject({ larguraCm: 120, profundidadeCm: 80, deNome: true });
    expect(extrairDimensoes("Banheira 70x170", "banheira")).toMatchObject({ larguraCm: 170, profundidadeCm: 70 });
  });
  it("móvel: largura × profundidade × altura; roupeiro com dois números: largura × altura", () => {
    expect(extrairDimensoes("Móvel 60x45x80", "movel")).toEqual({ larguraCm: 60, profundidadeCm: 45, alturaCm: 80, deNome: true });
    expect(extrairDimensoes("Roupeiro 180x240", "roupeiro")).toMatchObject({ larguraCm: 180, profundidadeCm: 60, alturaCm: 240 });
  });
  it("sem dimensões no nome usa a tabela do tipo", () => {
    expect(extrairDimensoes("Sanita suspensa", "sanita")).toEqual({ larguraCm: 36, profundidadeCm: 55, alturaCm: 40, deNome: false });
  });
});

describe("tipo de mockup", () => {
  it("pelo sub-ofício, pelo nome e pelo ramo", () => {
    expect(tipoMockupDe(p("1", "Modelo X", "c1", "Sanitas"), arvore)).toBe("sanita");
    expect(tipoMockupDe(p("2", "Base de duche 80×120", "c1"), arvore)).toBe("base_duche");
    expect(tipoMockupDe(p("3", "Modelo Y", "k1", "Armários Inferiores"), arvore)).toBe("movel");
    expect(tipoMockupDe(p("4", "Outra coisa", null), arvore)).toBe("caixa");
  });
  it("resguardos, torneiras e kits sanitários não são sanitas nem bases", () => {
    expect(tipoMockupDe(p("5", "Resguardo de duche", "k2", "Resguardos de Duche"), arvore)).toBe("caixa");
    expect(tipoMockupDe(p("6", "Kit para Sanitários", "c1", "Kit´s para Sanitários"), arvore)).toBe("caixa");
  });
});

describe("mockup 3D do produto", () => {
  it("leva a dimensão real em metros e a cor do tipo, e o GLB opcional", () => {
    const m = modeloDoProduto(p("7", "Base de duche 80×120", "c1", "Bases Duche"), arvore, { "7": "/modelos/base.glb" });
    expect(m.mockup3d).toMatchObject({ tipo: "base_duche", largura: 1.2, profundidade: 0.8, url: "/modelos/base.glb" });
    expect(modeloDoProduto(p("8", "Base 70×70", "c1", "Bases Duche"), arvore).mockup3d.url).toBeUndefined();
  });
});

describe("produtos para um espaço", () => {
  const lista = [p("a", "Sanita", "c1", "Sanitas"), p("b", "Base de duche 80×120", "c1", "Bases Duche"), p("c", "Roupeiro 200x60x240", "k1", "Roupeiros"), p("d", "Placa de indução", "k1", "Placas")];
  it("casa de banho: sanitários, não roupeiros nem placas", () => {
    expect(produtosParaEspaco(lista, arvore, "casa_banho").map((x) => x.produtoId)).toEqual(["b", "a"]);
  });
  it("cozinha leva eletrodomésticos; quarto leva roupeiros", () => {
    expect(produtosParaEspaco(lista, arvore, "cozinha").map((x) => x.produtoId)).toEqual(["d"]);
    expect(produtosParaEspaco(lista, arvore, "quarto").map((x) => x.produtoId)).toEqual(["c"]);
  });
  it("o mapa é configurável e dá para filtrar por ofício", () => {
    expect(produtosParaEspaco(lista, arvore, "sala", { mapa: { casa_banho: [], cozinha: [], quarto: [], outro: [], sala: ["sanita"] } }).map((x) => x.produtoId)).toEqual(["a"]);
    expect(produtosParaEspaco(lista, arvore, "outro", { oficios: ["Carpintaria"] }).map((x) => x.produtoId)).toEqual(["c", "d"]);
  });
  it("o tipo de espaço vem do nome da divisão", () => {
    expect(tipoEspacoDeDivisao("Casa de banho")).toBe("casa_banho");
    expect(tipoEspacoDeDivisao("Cozinha")).toBe("cozinha");
    expect(tipoEspacoDeDivisao("Quarto principal")).toBe("quarto");
    expect(tipoEspacoDeDivisao("Hall")).toBe("outro");
  });
});

describe("o catálogo real do protótipo", () => {
  it("dá produtos reais com dimensões para uma casa de banho", () => {
    const K = lerCatalogo();
    const r = produtosParaEspaco(K.produtos, K.arvore, "casa_banho");
    expect(K.produtos.length).toBeGreaterThan(0);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.dimensoes.larguraCm >= 5 && m.mockup3d.altura > 0)).toBe(true);
  });
});
