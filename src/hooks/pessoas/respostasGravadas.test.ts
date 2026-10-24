// Ler as respostas que a ficha devolve (fn_neg_ficha_seccao: respostas dos levantamentos; neg_ficha_pessoa: pessoa.qualificacao_respostas) com o
// snapshot do que a pessoa viu e respondeu. Tolerante: o que não se reconhece fica de fora, nunca rebenta a ficha.
import { describe, expect, it } from "vitest";
import { lerRespostasGravadas } from "./respostasGravadas";

const COMPLETA = {
  seccao: "exterior", pergunta: "acesso", resposta: "facil", tipo: "escolha_unica", pergunta_texto: "Acesso", seccao_titulo: "Exterior", bloco: "Acesso e estacionamento",
  ordem: 1000, escolhas: ["facil"], escolhas_texto: ["Fácil"], valor_texto: null, valor_numero: null,
};

describe("lerRespostasGravadas", () => {
  it("passa o snapshot a camelCase", () => {
    expect(lerRespostasGravadas([COMPLETA])).toEqual([{
      seccao: "exterior", pergunta: "acesso", resposta: "facil", tipo: "escolha_unica", perguntaTexto: "Acesso", seccaoTitulo: "Exterior",
      bloco: "Acesso e estacionamento", ordem: 1000, escolhas: ["facil"], escolhasTexto: ["Fácil"], valorTexto: null, valorNumero: null,
    }]);
  });

  it("a resposta antiga (só seccao, pergunta e resposta) lê-se sem snapshot: tipo nulo", () => {
    const [r] = lerRespostasGravadas([{ seccao: "exterior", pergunta: "acesso", resposta: "facil" }]);
    expect(r).toMatchObject({ pergunta: "acesso", resposta: "facil", tipo: null, perguntaTexto: null, escolhas: null, escolhasTexto: null, valorTexto: null, valorNumero: null, ordem: null });
  });

  it("lê texto e número, e a escolha múltipla sem `resposta`", () => {
    const [t, n, m] = lerRespostasGravadas([
      { ...COMPLETA, pergunta: "t", tipo: "texto", resposta: null, escolhas: null, escolhas_texto: null, valor_texto: "olá" },
      { ...COMPLETA, pergunta: "n", tipo: "numero", resposta: null, escolhas: null, escolhas_texto: null, valor_numero: 12.5 },
      { ...COMPLETA, pergunta: "m", tipo: "escolha_multipla", resposta: null, escolhas: ["a", "b"], escolhas_texto: ["A", "B"] },
    ]);
    expect(t).toMatchObject({ tipo: "texto", valorTexto: "olá", resposta: null });
    expect(n).toMatchObject({ tipo: "numero", valorNumero: 12.5 });
    expect(m).toMatchObject({ tipo: "escolha_multipla", escolhas: ["a", "b"], escolhasTexto: ["A", "B"], resposta: null });
  });

  it("um número que a base mandou como texto (numeric) também se lê", () => {
    const [n] = lerRespostasGravadas([{ ...COMPLETA, tipo: "numero", valor_numero: "12.500", escolhas: null, escolhas_texto: null }]);
    expect(n.valorNumero).toBe(12.5);
  });

  it.each([null, undefined, "x", 3, {}, [null], ["x"], [{}], [{ pergunta: "a" }], [{ seccao: "s", pergunta: 3, resposta: "x" }]])(
    "%j não dá respostas (e não rebenta)", (cru) => {
      expect(lerRespostasGravadas(cru)).toEqual([]);
    },
  );

  it("um tipo que não se conhece conta como sem snapshot; escolhas com tamanhos diferentes não se aceitam (ficam sem textos)", () => {
    const [a, b] = lerRespostasGravadas([
      { ...COMPLETA, tipo: "inventado" },
      { ...COMPLETA, escolhas: ["a", "b"], escolhas_texto: ["A"] },
    ]);
    expect(a.tipo).toBeNull();
    expect(b.escolhasTexto).toBeNull();
  });

  it("filtra as que não têm pergunta e secção em texto, e deixa as outras", () => {
    expect(lerRespostasGravadas([COMPLETA, { seccao: "x" }, COMPLETA]).map((r) => r.pergunta)).toEqual(["acesso", "acesso"]);
  });
});
