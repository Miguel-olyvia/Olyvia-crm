import { describe, expect, it } from "vitest";
import { SERVICOS_MODELO, faseDoMaterial, faseDoMaterialNaObra, faseDoProduto, fasesDoServico, fasesPadrao, oficioDoServico, servicosDaObra, type ServicoNaObra } from "./fasesObra";
import { seed } from "./motor";
import { CATALOGO_TODO } from "./catalogo";

describe("fases da obra", () => {
  it("as regras por omissão", () => {
    expect(fasesPadrao("Demolição de azulejo")).toEqual([1]);
    expect(fasesPadrao("Deslocação de ponto de água")).toEqual([2]);
    expect(fasesPadrao("Construção de Murete em Alvenaria até 80cm")).toEqual([2, 3]);
    expect(fasesPadrao("Assentamento de pavimento cerâmico")).toEqual([3]);
    expect(fasesPadrao("Pintura de paredes")).toEqual([3, 4]);
    expect(fasesPadrao("Montagem de louças sanitárias")).toEqual([4]);
    expect(fasesPadrao("Limpeza final da obra")).toEqual([4]);
  });
  it("os casos do catálogo real que as regras gerais trocavam", () => {
    // "levantamento de parede" é erguer, não remover; "Levantamento de sanitários" continua a ser remoção
    expect(fasesPadrao("Mão de Obra Levantamento de parede em Alvenaria m2")).toEqual([2, 3]);
    expect(fasesPadrao("Levantamento de Sanitários e Mobiliário")).toEqual([1]);
    // os roços são das infraestruturas
    expect(fasesPadrao("Mão de Obra Abertura de Roço s/ Acabamento ml")).toEqual([2]);
    expect(fasesPadrao("Mão de Obra Abertura e Fecho de Roço c/ Acabamento ml")).toEqual([2, 3]);
    // "carpintaria" contém "pintar": pelo ofício, a peça de carpintaria é montagem final
    expect(fasesPadrao("RIPADOS MELAMINA 2400X700", "Carpintaria")).toEqual([4]);
    expect(fasesPadrao("Mão de Obra - Pintura de Parede m2", "Pintura")).toEqual([3, 4]);
    expect(fasesPadrao("Mão de Obra de Reboco de Parede sem Pintura m2")).toEqual([3]);
    // mexer num ponto é infraestrutura, mesmo com "eletrodomésticos" no nome
    expect(fasesPadrao("Mão de Obra Deslocação de Ponto de Luz para Eletrodomésticos")).toEqual([2]);
    expect(fasesPadrao("Instalação de Pedra Natural para Paredes m2")).toEqual([3]);
    expect(fasesPadrao("Instalação de Lã de Rocha m2")).toEqual([2, 3]);
    // os modelos de obra atravessam a obra
    expect(fasesPadrao("MO Modelo 2 - Casa de Banho: Remoção de Banheira ou Poliban + Elevação da Torneira + Revestimento até 120cm")).toEqual([1, 2, 3, 4]);
    expect(fasesPadrao("MO Modelo Simples de Mudança de Mobiliário - Cozinha")).toEqual([1, 4]);
    expect(fasesPadrao("Projeto 3D - 3 Imagens")).toEqual([1]);
    expect(fasesPadrao("Deslocação Fora do Raio de 30 km (valor p/km)")).toEqual([1]);
  });
  it("a ficha ganha às regras; ordenadas e sem repetidos", () => {
    expect(fasesDoServico({ fasesServico: { x: [4, 2, 2] } }, "x", "Demolição")).toEqual([2, 4]);
    expect(fasesDoServico({}, "x", "Demolição")).toEqual([1]);
  });
  it("o produto fica na fase do serviço que o instala; sem serviço, pelo tipo", () => {
    expect(faseDoProduto(null, { servico: "s", img: "sanita" }, { nome: "Instalação de sanita" })).toBe(4);
    expect(faseDoProduto(null, { img: "pavimento" })).toBe(3);
    expect(faseDoProduto(null, { img: "eletrico" })).toBe(2);
  });
  it("todos os serviços do catálogo real têm pelo menos uma fase, e todas as fases têm serviços", () => {
    const porFase = new Map<number, number>();
    for (const c of CATALOGO_TODO) for (const f of fasesDoServico(null, c.id, c.n, c.cat)) porFase.set(f, (porFase.get(f) ?? 0) + 1);
    expect([...porFase.keys()].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("a fase de um material na obra (02/11: a regra única da Encomenda de Cliente e da obra)", () => {
  const K = { fasesServico: { pint: [3, 4] as (1 | 2 | 3 | 4)[] } };
  const loucas: ServicoNaObra = { sid: "loucas", nome: "Montagem de louças sanitárias", oficio: "Canalizador", cons: [{ n: "Silicone sanitário" }] };
  const revest: ServicoNaObra = { sid: "revest", nome: "Revestimento de parede", oficio: "Ladrilhador", cons: [{ id: "p-cola", n: "Cimento-cola C2" }, { n: "Silicone sanitário" }] };
  const pint: ServicoNaObra = { sid: "pint", nome: "Pintura de paredes", oficio: "Pintor", cons: [{ n: "Fita de pintor" }] };
  it("a) instalado por um serviço da obra: a última fase desse serviço", () => {
    const r = faseDoMaterialNaObra(K, { n: "Sanita suspensa", servico: "loucas" }, [revest, loucas]);
    expect(r).toMatchObject({ fase: 4, por: "instala" });
    expect(r.servicos.map((s) => s.sid)).toEqual(["loucas"]);
    // um serviço em várias fases (pintura: 3 e 4) → a última
    expect(faseDoMaterialNaObra(K, { n: "Tinta especial", servico: "pint" }, [pint]).fase).toBe(4);
  });
  it("a) o serviço que o instala não está na obra: passa às regras seguintes", () => {
    // não está na obra nem em receitas: pelo nome ("cerâmico" → 3), e não pela última fase das louças
    expect(faseDoMaterialNaObra(K, { n: "Cerâmico 30×60", servico: "loucas" }, [pint])).toMatchObject({ fase: 3, por: "nome", servicos: [] });
  });
  it("b) consumível da receita: a primeira fase do serviço que o gasta; com vários, a menor", () => {
    // pelo id (o nome pode ser outro) e pelo nome sem acentos
    expect(faseDoMaterialNaObra(K, { id: "p-cola", n: "Cola cimentícia (saco)" }, [revest, loucas])).toMatchObject({ fase: 3, por: "receita" });
    expect(faseDoMaterialNaObra(K, { n: "fita de PINTOR" }, [pint]).fase).toBe(3);
    // o silicone vai nas louças (4) e no revestimento (3): fica na 3 e justifica-se pelos dois
    const r = faseDoMaterialNaObra(K, { n: "Silicone sanitário" }, [loucas, revest]);
    expect(r).toMatchObject({ fase: 3, por: "receita" });
    expect(r.servicos.map((s) => s.sid)).toEqual(["revest", "loucas"]); // o que decide primeiro
  });
  it("b) a primeira fase de um serviço com várias (a ficha ganha às regras)", () => {
    const parede: ServicoNaObra = { sid: "x", nome: "Levantamento de parede em alvenaria", cons: [{ n: "Tijolo 11" }] };
    expect(fasesDoServico(null, "x", parede.nome)).toEqual([2, 3]);
    expect(faseDoMaterialNaObra(null, { n: "Tijolo 11" }, [parede]).fase).toBe(2);
    expect(faseDoMaterialNaObra({ fasesServico: { x: [4, 3] } }, { n: "Tijolo 11" }, [parede]).fase).toBe(3);
  });
  it("c) sem serviço nem receita: pelo nome, como nas obras de antes", () => {
    for (const n of ["Saco de entulho", "Tubo multicamada 16", "Cimento-cola · saco 25 kg", "Pavimento cerâmico 60×60", "Espelho 80"]) {
      expect(faseDoMaterialNaObra(K, { n }, [loucas, revest, pint])).toEqual({ fase: faseDoMaterial(n), por: "nome", servicos: [] });
    }
    expect(faseDoMaterialNaObra(K, { n: "Silicone sanitário" }, [])).toMatchObject({ fase: 4, por: "nome" });
  });
  it("o ofício dos serviços do modelo é o do motor (o plano chama fasesDoServico com ele)", () => {
    const svc = seed().svc;
    for (const [k, m] of Object.entries(SERVICOS_MODELO)) expect([k, m.n, m.oficio]).toEqual([k, svc[k]?.n, svc[k]?.perfil]);
    expect(oficioDoServico("canal", "Canalização")).toBe("Canalizador");
    expect(oficioDoServico("c12", "Carpintaria")).toBe("Carpintaria");
    expect(oficioDoServico(null, null)).toBe("");
  });
  it("os serviços de uma obra: os do orçamento e os do plano, sem repetidos", () => {
    expect(servicosDaObra({
      orc: { linhas: [{ t: "svc", sid: "revest", q: 4 }, { t: "mat" }, { t: "svc", sid: "pint", q: 0 }] },
      obra: { plano: { tasks: [{ svcs: ["revest", "loucas"] }, { svcs: [] }] } },
    })).toEqual(["revest", "loucas"]);
    expect(servicosDaObra({ orc: null, obra: {} })).toEqual([]);
  });
});

describe("faseDoMaterial — saco", () => {
  it("o saco do entulho é preparação; o cimento-cola em saco é revestimento", () => {
    expect(faseDoMaterial("Sacos de entulho")).toBe(1);
    expect(faseDoMaterial("Big bag 1 m³")).toBe(1);
    expect(faseDoMaterial("Cimento-cola · saco 25 kg")).toBe(3);
  });
});
