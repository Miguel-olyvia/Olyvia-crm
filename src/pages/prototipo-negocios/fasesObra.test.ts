import { describe, expect, it } from "vitest";
import { faseDoProduto, fasesDoServico, fasesPadrao } from "./fasesObra";
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
