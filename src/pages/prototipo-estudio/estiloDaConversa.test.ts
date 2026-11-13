import { describe, expect, it } from "vitest";
import type { Fala } from "@/emylia/chamadaMotor";
import { combinacoesPara, ditosDaConversa, estiloDosDitos, juntarEstilo, amostras } from "./estiloDaConversa";
import { melhorPara } from "./catalogoFake";

let t = 0;
const cl = (texto: string): Fala => ({ inicio: (t += 5), fim: t + 4, texto, falante: "cliente", confianca_falante: 1 });
const co = (texto: string): Fala => ({ inicio: (t += 5), fim: t + 4, texto, falante: "comercial", confianca_falante: 1 });
const ouvir = (falas: Fala[]) => estiloDosDitos(ditosDaConversa(falas, "visita"));

describe("o estilo dito na conversa", () => {
  it("«quero tudo preto» dá o preto como cor principal", () => {
    const o = ouvir([co("E de cores, já pensou?"), cl("Olhe, eu quero tudo preto.")])!;
    expect(o.estilo.cores).toEqual(["preto"]);
    expect(o.ditos[0].tudo).toBe(true);
    expect(o.ditos[0].frase).toBe("Olhe, eu quero tudo preto.");
  });

  it("a peça dita perto da cor fica como exceção", () => {
    const o = ouvir([cl("Quero tudo preto, menos o móvel, que gostava em madeira.")])!;
    expect(o.estilo.cores).toEqual(["preto"]);
    expect(o.estilo.porCategoria.movel).toEqual(["madeira"]);
  });

  it("«não quero nada branco» evita o branco", () => {
    const o = ouvir([cl("Gostava de cinzento nas paredes."), cl("Branco não, não quero nada branco.")])!;
    expect(o.evitar).toEqual(["branco"]);
    expect(o.ditos.filter((d) => d.cor === "branco").every((d) => d.evitar)).toBe(true);
    expect(o.estilo.porCategoria.revestimento).toEqual(["cinza"]);
    expect(o.estilo.cores).toEqual([]);
  });

  it("não confunde palavras parecidas nem descrições do que há hoje", () => {
    expect(ouvir([cl("Pretendo fazer a obra em março."), cl("A banheira está branca e velha.")])).toBeNull();
  });

  it("a pergunta do comercial só conta com o sim do cliente", () => {
    expect(ouvir([co("Quer tudo em preto?"), cl("Hum, deixe-me pensar.")])).toBeNull();
    const o = ouvir([co("Então quer tudo em preto?"), cl("Sim, exatamente.")])!;
    expect(o.estilo.cores).toEqual(["preto"]);
  });

  it("13/11: apanha as escolhas ditas sem «quero» (afinal, fico com, opto, vou de)", () => {
    expect(ouvir([cl("Afinal cinza.")])!.estilo.cores).toEqual(["cinza"]);
    expect(ouvir([cl("Fico com o branco.")])!.estilo.cores).toEqual(["branco"]);
    expect(ouvir([cl("Opto pelo preto.")])!.estilo.cores).toEqual(["preto"]);
    expect(ouvir([cl("Vou de madeira no móvel.")])!.estilo.porCategoria.movel).toEqual(["madeira"]);
  });

  it("13/11: a cor no fim de uma lista de peças aplica-se a todas (sem apanhar o que vem antes do verbo)", () => {
    const o = ouvir([cl("Olhe, eu quero tirar o bidé e quero a minha sanita e banheira branca.")])!;
    expect(o.estilo.porCategoria.sanita).toEqual(["branco"]);
    expect(o.estilo.porCategoria.banheira).toEqual(["branco"]);
    // «tirar o bidé» está antes do segundo «quero»: o bidé não fica branco (é uma remoção, tratada à parte)
    expect(o.estilo.porCategoria.bide ?? []).toEqual([]);
    // uma peça só continua a ligar-se à sua cor
    expect(ouvir([cl("Quero o móvel em madeira.")])!.estilo.porCategoria.movel).toEqual(["madeira"]);
  });

  it("na visita conta também o comercial (é quem segura o telemóvel) e a escolha ditada sem verbo", () => {
    const o = ouvir([co("Quero uma sanita preta."), co("Torneiras pretas e o móvel em madeira.")])!;
    expect(o.estilo.porCategoria.sanita).toEqual(["preto"]);
    expect(o.estilo.porCategoria.torneira).toEqual(["preto"]);
    expect(o.estilo.porCategoria.movel).toEqual(["madeira"]);
    expect(ouvir([co("Temos sanitas pretas e brancas."), co("O móvel é branco.")])).toBeNull();
    expect(ouvir([co("Põe a base de duche preta.")])!.estilo.porCategoria.base).toEqual(["preto"]);
  });

  it("o cliente muda de ideias: ganha o que disse por último", () => {
    const o = ouvir([cl("Quero tudo branco."), cl("Afinal prefiro tudo preto.")])!;
    expect(o.estilo.cores).toEqual(["preto", "branco"]);
    const o2 = ouvir([cl("Quero as torneiras pretas."), cl("Afinal prefiro as torneiras cromadas.")])!;
    expect(o2.estilo.porCategoria.torneira).toEqual(["cinza", "preto"]);
  });

  it("«não sei» não é negação", () => {
    const o = ouvir([cl("Não sei, talvez gostava de preto.")])!;
    expect(o.evitar).toEqual([]);
    expect(o.estilo.cores).toEqual(["preto"]);
  });

  it("juntar ao estilo que havia: o dito passa à frente e o evitado sai", () => {
    const o = ouvir([cl("Quero tudo preto."), cl("Não quero nada bege.")])!;
    const e = juntarEstilo({ cores: ["bege", "cinza"], porCategoria: { movel: ["bege"], sanita: ["branco"] } }, o);
    expect(e.cores).toEqual(["preto", "cinza"]);
    expect(e.porCategoria).toEqual({ sanita: ["branco"] });
  });
});

describe("as combinações para a cor principal", () => {
  it("para o preto: total, madeira, branco e pedra, todas com produtos no catálogo", () => {
    const cs = combinacoesPara("preto");
    expect(cs.map((c) => c.n)).toEqual(["Preto total", "Preto e madeira", "Preto e branco", "Preto e pedra"]);
    for (const c of cs) expect(amostras(c.estilo, ["base", "torneira", "movel", "sanita", "revestimento", "pavimento"]).length).toBe(6);
    const madeira = cs[1].estilo;
    expect(melhorPara("movel", madeira)?.cores).toContain("madeira");
    expect(melhorPara("torneira", madeira)?.cores).toContain("preto");
    expect(melhorPara("base", cs[0].estilo)?.cores).toContain("preto");
  });

  it("tira as que usam uma cor a evitar", () => {
    expect(combinacoesPara("preto", ["branco"]).map((c) => c.n)).toEqual(["Preto total", "Preto e madeira", "Preto e pedra"]);
    expect(combinacoesPara(undefined)).toEqual([]);
  });
});
