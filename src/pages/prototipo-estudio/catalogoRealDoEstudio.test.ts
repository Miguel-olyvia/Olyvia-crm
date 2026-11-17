// 17/11 (Rúben: «ligar o catálogo de produtos à lista do Estúdio da visita»): os produtos verdadeiros no formato do Estúdio.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { comMaoDeObraDoServico, coresDoTexto, medidasDoTexto, produtoDaLinha } from "./catalogoRealDoEstudio";
import { melhorPara, produto, produtosDe, usarProdutosReais, type Estilo } from "./catalogoFake";
import type { LinhaPaginaProduto } from "@/emylia/real/produtosPaginados";

const linha = (nome: string, extra: Partial<LinhaPaginaProduto> = {}): LinhaPaginaProduto => ({
  id: "id-" + nome, nome, sku: null, sku_gerado: null, marca: "Sanindusa", categoria_id: null, categoria: null, subcategoria_id: null,
  subcategoria: null, modelo_id: null, modelo: "GLAMIC", modelo_numero: null, unidade: "un", custo: 100, pvp: 199.9, grossista: null,
  distribuidor: null, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null, ...extra,
});
afterEach(() => usarProdutosReais([]));

describe("a cor e as medidas pelo nome", () => {
  it("as cores", () => {
    expect(coresDoTexto("SANITA GLAMIC BTW CINZA MATE")).toEqual(["cinza"]);
    expect(coresDoTexto("BIDÉ FLY SUSPENSO CAPPUCINNO")).toEqual(["bege"]);
    expect(coresDoTexto("Coluna de Duche NILO ORO")).toEqual(["bege"]);
    expect(coresDoTexto("Resguardo Kenna Angular 95x75 Negro")).toEqual(["preto"]);
    expect(coresDoTexto("Móvel AXIS Carvalho Natural 100x81x45")).toEqual(["madeira"]);
    expect(coresDoTexto("Torneira de Lavatório CASSIO Cromo")).toEqual(["cinza"]);
    expect(coresDoTexto("SANITA ELEGANT BTW BRANCO MATE")).toEqual(["branco"]);
  });
  it("as medidas (cm; em mm quando passam de 4 m)", () => {
    expect(medidasDoTexto("Base de Duche CACH 70x120")).toEqual([70, 120]);
    expect(medidasDoTexto("Móvel AXIS 100X81X45 - 3 Gav")).toEqual([100, 81, 45]);
    expect(medidasDoTexto("Coverlam 1200x2600x5,6")).toEqual([120, 260, 1]);
    expect(medidasDoTexto("Sanita suspensa")).toBeNull();
  });
});

describe("a linha do servidor como produto do Estúdio", () => {
  it("base de duche: o lado maior é a largura; preço de venda; altura do 3D do molde", () => {
    const p = produtoDaLinha(linha("Base de Duche CACH 70x120 Branco"), "base")!;
    expect(p).toMatchObject({ cat: "base", preco: 199.9, cores: ["branco"], w: 120, h: 70, un: "un", colecao: "GLAMIC" });
  });
  it("sem preço de venda, inativo ou em rascunho não entra", () => {
    expect(produtoDaLinha(linha("X", { pvp: 0 }), "base")).toBeNull();
    expect(produtoDaLinha(linha("X", { ativo: false }), "base")).toBeNull();
    expect(produtoDaLinha({ ...linha("X"), estado: "draft" } as LinhaPaginaProduto, "base")).toBeNull();
  });
  it("revestimentos por m²", () => {
    expect(produtoDaLinha(linha("Revestimento PORCELÂNICO STATUÁRIO 60x120", { unidade: "m2" }), "pavimento")!.un).toBe("m²");
  });
});

describe("17/11 (Rúben: «a mão de obra a vir do serviço ligado»)", () => {
  it("o preço do serviço × o fator, com o nome do serviço; sem serviço (ou sem preço), fica como estava", () => {
    const a = produtoDaLinha(linha("Móvel AXIS 60x81x45 Branco"), "movel")!, b = produtoDaLinha(linha("Toalheiro SMOOTH 45cm"), "toalheiro")!;
    const r = comMaoDeObraDoServico([a, b], new Map([[a.id, { sid: "s1", fator: 2 }], [b.id, { sid: "s2", fator: 1 }]]),
      new Map([["s1", { n: "Instalação de Mobiliário WC", preco: 85.5 }]]));
    expect(r[0]).toMatchObject({ inst: 171, instServico: "Instalação de Mobiliário WC" });
    expect(r[1]).toEqual(b);
  });
});

describe("o Estúdio passa a escolher dos produtos verdadeiros", () => {
  const estilo: Estilo = { cores: ["preto"], porCategoria: {} };
  it("numa categoria com produtos verdadeiros, só esses; sem eles, o catálogo de teste; os ids antigos abrem", () => {
    const antes = melhorPara("sanita", estilo)!;
    expect(antes.id).toMatch(/^san-/);
    usarProdutosReais([produtoDaLinha(linha("SANITA GLAMIC SUSPENSO PRETO MATE"), "sanita")!, produtoDaLinha(linha("SANITA ELEGANT BTW BRANCO MATE"), "sanita")!]);
    expect(melhorPara("sanita", estilo)!.n).toBe("SANITA GLAMIC SUSPENSO PRETO MATE");
    expect(produtosDe("sanita", estilo, true)).toHaveLength(2);
    expect(melhorPara("bide", estilo)?.id ?? "").toMatch(/^bid-|^$/); // os bidés ainda vêm do teste
    expect(produto(antes.id)?.id).toBe(antes.id); // o projeto antigo continua a abrir
  });
});
