// 5/11: o que o Estúdio decidiu encontra o par no Catálogo verdadeiro e entra nas Necessidades do negócio.
import { describe, expect, it } from "vitest";
import { ligarAoCatalogo, produtoPara, servicoPara, type LinhaLevada } from "./ligarEstudio";

const SERVICOS = {
  demol: { n: "Demolição e entulho" }, canal: { n: "Canalização" }, revest: { n: "Revestimento de parede" }, pav: { n: "Pavimento cerâmico" },
  loucas: { n: "Montagem de louças" }, c7: { n: "Instalação de Base de Duche" }, teto: { n: "Teto falso em pladur" }, pint: { n: "Pintura de tetos e paredes" },
};
const PRODUTOS = [
  { id: "p1", n: "Sanita suspensa branca", servico: "loucas" }, { id: "p2", n: "Sanita compacta cinza" },
  { id: "p3", n: "Base de duche Ardósia preta", servico: "c7" }, { id: "p4", n: "Azulejo cinza 120x60" }, { id: "p5", n: "Móvel Axis Oak 80" },
];
const L = (id: string, tipo: LinhaLevada["tipo"], chave: string, q = 1, extra: Partial<LinhaLevada> = {}): LinhaLevada => ({ id, n: id, q, un: "un", tipo, chave, ...extra });

describe("ligar o Estúdio ao Catálogo", () => {
  it("o produto: pelo nome da categoria, e entre esses o da cor pedida", () => {
    expect(produtoPara("sanita", ["cinza"], PRODUTOS)?.id).toBe("p2");
    expect(produtoPara("sanita", ["branco"], PRODUTOS)?.id).toBe("p1");
    expect(produtoPara("sanita", [], PRODUTOS)?.id).toBe("p1");
    expect(produtoPara("toalheiro", [], PRODUTOS)).toBeNull();
  });

  it("17/11 (teste A-Z: os produtos escolhidos eram trocados ao fechar a visita): o produto escolhido no Estúdio entra tal e qual", () => {
    const UUID = "0b1c2d3e-0000-4000-8000-000000000001";
    const lista = [...PRODUTOS, { id: UUID, n: "SANITA FLY SUSPENSO BRANCO MATE", servico: "loucas" }];
    // pelo id, mesmo havendo outra sanita que «combina» melhor pela cor
    const [a] = ligarAoCatalogo([L("prod-s", "produto", "sanita", 1, { cores: ["cinza"], produtoId: UUID, n: "SANITA FLY SUSPENSO BRANCO MATE" })], SERVICOS, lista);
    expect(a.alvo).toMatchObject({ tipo: "produto", id: UUID });
    // um produto do Catálogo que o negócio não tem: fica sem par (à vista), em vez de entrar outro qualquer
    const [b] = ligarAoCatalogo([L("prod-x", "produto", "sanita", 1, { produtoId: "0b1c2d3e-0000-4000-8000-0000000000ff", n: "Outra sanita" })], SERVICOS, lista);
    expect(b.alvo).toBeNull();
    // um produto do catálogo de teste (sem par): procura o parecido, como antes
    const [c] = ligarAoCatalogo([L("prod-t", "produto", "sanita", 1, { cores: ["cinza"], produtoId: "san-nexo-c" })], SERVICOS, lista);
    expect(c.alvo?.id).toBe("p2");
  });

  it("17/11 (A-Z na Mudelar): o assentamento do revestimento e do pavimento vem com o produto que o traz (não conta duas vezes)", () => {
    const lista = [...PRODUTOS, { id: "rv", n: "Revestimento CERÂMICO ATREZO", servico: "c-inst-rev" }, { id: "pv", n: "Pavimento BRERA" }];
    const r = ligarAoCatalogo([
      L("rev", "produto", "revestimento", 22, { produtoId: "rv", n: "Revestimento CERÂMICO ATREZO" }), L("rev-inst", "servico", "revestimento", 20),
      L("pav", "produto", "pavimento", 4.36, { produtoId: "pv", n: "Pavimento BRERA" }), L("pav-inst", "servico", "pavimento", 3.96),
    ], SERVICOS, lista);
    expect(r.find((x) => x.linhas.some((l) => l.id === "rev-inst"))?.vemComProduto).toBe(true);
    // o pavimento sem serviço ligado fica com o assentamento da planta
    expect(r.find((x) => x.linhas.some((l) => l.id === "pav-inst"))?.vemComProduto).toBeUndefined();
  });

  it("o serviço: pelo nome, sem acentos", () => {
    expect(servicoPara("demolicao", SERVICOS)?.id).toBe("demol");
    expect(servicoPara("teto", SERVICOS)?.id).toBe("teto");
    expect(servicoPara("pintura", SERVICOS)?.id).toBe("pint");
    expect(servicoPara("nicho", SERVICOS)).toBeNull();
  });

  it("junta por alvo e soma as quantidades; a instalação que o produto real já traz fica marcada; sem par fica à parte", () => {
    const r = ligarAoCatalogo([
      L("prod-s", "produto", "sanita", 1, { par: "s", cores: ["branco"] }), L("inst-s", "servico", "instalar:sanita", 1, { par: "s" }),
      L("inst-b", "servico", "instalar:bide", 1, { par: "b" }),
      L("dem", "servico", "demolicao", 22.5), L("ret-ban", "servico", "retirar", 1),
      L("serv-nicho", "servico", "nicho", 1),
    ], SERVICOS, PRODUTOS);
    const sanita = r.find((x) => x.alvo?.id === "p1")!;
    expect(sanita.linhas.map((x) => x.id)).toEqual(["prod-s"]);
    const instSanita = r.find((x) => x.linhas.some((l) => l.id === "inst-s"))!;
    expect(instSanita).toMatchObject({ vemComProduto: true, alvo: { id: "loucas" } });
    const instBide = r.find((x) => x.linhas.some((l) => l.id === "inst-b"))!;
    expect(instBide.vemComProduto).toBeUndefined();
    const demol = r.find((x) => x.alvo?.id === "demol")!;
    expect(demol.linhas.map((x) => x.id)).toEqual(["dem", "ret-ban"]);
    expect(demol.q).toBe(23.5);
    expect(r.find((x) => x.linhas[0].id === "serv-nicho")?.alvo).toBeNull();
  });
});

describe("os casos do Catálogo real do testarh (5/11)", () => {
  const REAIS = [
    { id: "t1", n: "Toalheiro DE MOVEL MOSS 26cm" }, { id: "m1", n: "Móvel suspenso Rio 80 carvalho" },
    { id: "s1", n: "Sanita de Chão SMART TOILET WISH" }, { id: "v1", n: "Pavimento cerâmico cinza 60x60" },
  ];
  it("o móvel não é o toalheiro «de móvel»; o pavimento não é a sanita «de chão»", () => {
    expect(produtoPara("movel", ["madeira"], REAIS)?.id).toBe("m1");
    expect(produtoPara("pavimento", ["cinza"], REAIS)?.id).toBe("v1");
  });
  it("retirar uma banheira procura a remoção dela; sem ela, a demolição, sem somar un com m²", () => {
    const S = { demol: { n: "Demolição e entulho", un: "m²" }, rb: { n: "Remoção de banheira", un: "un" } };
    expect(servicoPara("retirar:banheira", S)?.id).toBe("rb");
    expect(servicoPara("retirar:bide", S)?.id).toBe("demol");
    const r = ligarAoCatalogo([L("ret-b", "servico", "retirar:bide", 1), L("dem", "servico", "demolicao", 24.66, { un: "m²" })], { demol: S.demol }, []);
    // 6/11: o mesmo serviço entra uma vez: a demolição em m², com o retirar do bidé incluído
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ q: 24.66, alvo: { id: "demol" } });
    expect(r[0].unDiferente).toBeUndefined();
    expect(r[0].incluidas?.map((l) => l.id)).toEqual(["ret-b"]);
  });
});

describe("a cozinha no Catálogo verdadeiro (6/11)", () => {
  const COZ = [
    { id: "lv", n: "Lava-Loiça Inox 1 Cuba" }, { id: "mq", n: "Máquina de Lavar Loiça Encastre" }, { id: "pl", n: "Placa Indução 4 zonas" },
    { id: "ex", n: "Exaustor de parede Inox" }, { id: "bc", n: "Bancada em Quartzo Branco" },
  ];
  it("o lava-loiça não é a máquina de lavar loiça; a placa, o exaustor e a bancada pelo nome", () => {
    expect(produtoPara("lava", ["cinza"], COZ)?.id).toBe("lv");
    expect(produtoPara("maquina", [], COZ)?.id).toBe("mq");
    expect(produtoPara("placa", [], COZ)?.id).toBe("pl");
    expect(produtoPara("exaustor", [], COZ)?.id).toBe("ex");
    expect(produtoPara("bancada", ["branco"], COZ)?.id).toBe("bc");
  });
});
