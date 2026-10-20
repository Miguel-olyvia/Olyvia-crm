// As respostas às perguntas dos quatro tipos (escolha única, escolha múltipla, texto e número): como se guardam no formulário (um texto por
// pergunta), quando contam como respondidas, como se alternam e como a visibilidade condicional as trata. Só lógica pura.
import { describe, expect, it } from "vitest";
import type { BlocoDef, PerguntaDef } from "./perguntasTipos";
import {
  alternarResposta, chavesEscolhidas, contarRespostas, limparOcultas, mudarResposta, perguntaRespondida, perguntaVisivel, respostasEmTexto,
} from "./respostasVisita";

const lit = (id: string, tipo: PerguntaDef["tipo"], extra: Partial<PerguntaDef> = {}): PerguntaDef => ({
  id, rotulo: [`P ${id}`, `P ${id}`], tipo, literal: true,
  opcoes: tipo === "escolha_unica" || tipo === "escolha_multipla" ? [["a", "Alfa", "Alfa"], ["b", "Beta", "Beta"], ["c", "Gama", "Gama"]] : [], ...extra,
});
const unica = lit("u", "escolha_unica");
const multipla = lit("m", "escolha_multipla");
const texto = lit("t", "texto", { textoMax: 10 });
const numero = lit("n", "numero", { numero: { min: 0, max: 100, casas: 1, unidade: "m2" } });
const BLOCOS: readonly BlocoDef[] = [{ id: "b", perguntas: [unica, multipla, texto, numero] }];

describe("chavesEscolhidas", () => {
  it.each([
    [undefined, []], ["", []], ["a", ["a"]], ["a,b", ["a", "b"]], ["a,,b", ["a", "b"]],
  ])("%j -> %j", (valor, esperado) => expect(chavesEscolhidas(valor)).toEqual(esperado));
});

describe("perguntaRespondida", () => {
  it("escolha: só conta uma chave que é opção da pergunta", () => {
    expect(perguntaRespondida(unica, "a")).toBe(true);
    expect(perguntaRespondida(unica, "z")).toBe(false);
    expect(perguntaRespondida(unica, undefined)).toBe(false);
    expect(perguntaRespondida(multipla, "a,c")).toBe(true);
    expect(perguntaRespondida(multipla, "z")).toBe(false);
  });

  it("texto: conta com texto que não seja só espaços; número: conta se for um número", () => {
    expect(perguntaRespondida(texto, "olá")).toBe(true);
    expect(perguntaRespondida(texto, "   ")).toBe(false);
    expect(perguntaRespondida(numero, "12,5")).toBe(true);
    expect(perguntaRespondida(numero, "0")).toBe(true);
    expect(perguntaRespondida(numero, "abc")).toBe(false);
    expect(perguntaRespondida(numero, "")).toBe(false);
  });

  it("uma pergunta sem tipo é de escolha única (o catálogo do código)", () => {
    const antiga: PerguntaDef = { id: "x", rotulo: ["X", "X"], opcoes: [["a", "A", "A"], ["b", "B", "B"]] };
    expect(perguntaRespondida(antiga, "a")).toBe(true);
  });
});

describe("alternarResposta por tipo", () => {
  it("única: escolhe, troca e retira ao tocar de novo (como sempre)", () => {
    const um = alternarResposta(BLOCOS, {}, "u", "a");
    expect(um).toEqual({ u: "a" });
    expect(alternarResposta(BLOCOS, um, "u", "b")).toEqual({ u: "b" });
    expect(alternarResposta(BLOCOS, um, "u", "a")).toEqual({});
  });

  it("múltipla: acrescenta, guarda pela ordem das opções e retira só a tocada; a última retirada limpa a resposta", () => {
    let r = alternarResposta(BLOCOS, {}, "m", "c");
    r = alternarResposta(BLOCOS, r, "m", "a");
    expect(r).toEqual({ m: "a,c" });
    r = alternarResposta(BLOCOS, r, "m", "c");
    expect(r).toEqual({ m: "a" });
    expect(alternarResposta(BLOCOS, r, "m", "a")).toEqual({});
  });

  it("não muda o objeto recebido", () => {
    const antes = Object.freeze({ m: "a" });
    expect(alternarResposta(BLOCOS, antes, "m", "b")).toEqual({ m: "a,b" });
    expect(antes).toEqual({ m: "a" });
  });
});

describe("mudarResposta (texto e número)", () => {
  it("escreve, substitui e, com texto vazio ou só espaços, retira a resposta", () => {
    expect(mudarResposta(BLOCOS, {}, "t", "olá")).toEqual({ t: "olá" });
    expect(mudarResposta(BLOCOS, { t: "olá" }, "t", "adeus")).toEqual({ t: "adeus" });
    expect(mudarResposta(BLOCOS, { t: "olá" }, "t", "")).toEqual({});
    expect(mudarResposta(BLOCOS, { t: "olá" }, "t", "   ")).toEqual({});
  });

  it("mantém o que se escreve tal como está enquanto se escreve (espaços e vírgula não se mexem)", () => {
    expect(mudarResposta(BLOCOS, {}, "t", "olá ")).toEqual({ t: "olá " });
    expect(mudarResposta(BLOCOS, {}, "n", "12,")).toEqual({ n: "12," });
  });
});

describe("visibilidade condicional com perguntas de vários tipos", () => {
  const pai = lit("pai", "escolha_multipla");
  const filha = lit("filha", "texto", { se: { pergunta: "pai", valores: ["b"] } });
  const semResp = lit("semResp", "numero", { se: { pergunta: "pai", valores: ["b", ""] } });
  const blocos: readonly BlocoDef[] = [{ id: "x", perguntas: [pai, filha, semResp] }];

  it("com um pai de escolha múltipla, basta uma das opções escolhidas estar nas pedidas", () => {
    expect(perguntaVisivel(filha, { pai: "a,b" })).toBe(true);
    expect(perguntaVisivel(filha, { pai: "a,c" })).toBe(false);
    expect(perguntaVisivel(filha, {})).toBe(false);
  });

  it("a chave vazia nas pedidas faz a pergunta aparecer também sem resposta", () => {
    expect(perguntaVisivel(semResp, {})).toBe(true);
    expect(perguntaVisivel(semResp, { pai: "a" })).toBe(false);
  });

  it("tirar a opção que a condição pedia retira a resposta que já não se vê", () => {
    const antes = { pai: "b", filha: "texto" };
    expect(alternarResposta(blocos, antes, "pai", "b")).toEqual({});
    expect(limparOcultas(blocos, { pai: "a", filha: "x", semResp: "3" })).toEqual({ pai: "a" });
  });
});

describe("contarRespostas e respostasEmTexto com os quatro tipos", () => {
  it("conta as respondidas entre as visíveis", () => {
    expect(contarRespostas(BLOCOS, {})).toEqual({ respondidas: 0, total: 4 });
    expect(contarRespostas(BLOCOS, { u: "a", m: "a,b", t: "x", n: "2" })).toEqual({ respondidas: 4, total: 4 });
    expect(contarRespostas(BLOCOS, { u: "z", t: "  ", n: "abc" })).toEqual({ respondidas: 0, total: 4 });
  });

  it("em texto: o texto escrito e os textos das opções (não as chaves), com a unidade nos números", () => {
    const t = (c: string) => c;
    const saida = respostasEmTexto(BLOCOS, { u: "a", m: "c,a", t: " olá ", n: "12,5" }, t);
    expect(saida).toEqual([
      { pergunta: "P u", resposta: "Alfa" },
      { pergunta: "P m", resposta: "Alfa, Gama" },
      { pergunta: "P t", resposta: "olá" },
      { pergunta: "P n", resposta: "12,5 m2" },
    ]);
  });
});
