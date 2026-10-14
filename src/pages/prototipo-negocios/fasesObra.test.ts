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
