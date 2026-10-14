import { describe, expect, it } from "vitest";
import {
  adaptarLinhaADivisao, lerMedida, levantamentoVazio, novaLinha, paraLevantamentoNegocio, temLevantamento, type LinhaForm,
} from "./levantamento";
import { DIVISOES, OUTRO, UNIDADES, trabalhosPorDivisao } from "./levantamentoExemplo";
import { negocioMetasNovoTranslations } from "@/translations/negocioMetasNovo";

describe("listas fechadas", () => {
  it("as divisões e as unidades são as pedidas, com Outra no fim das divisões", () => {
    expect(DIVISOES).toEqual(["casaDeBanho", "cozinha", "sala", "quarto", "exterior", "outra"]);
    expect(UNIDADES).toEqual(["m2", "m", "un"]);
  });

  it("os trabalhos sugeridos dependem só da divisão; Outra e sem divisão não têm sugestões", () => {
    expect(trabalhosPorDivisao("casaDeBanho")).toEqual(["bancaPorDuche", "sanita", "azulejos", "canalizacao"]);
    expect(trabalhosPorDivisao("cozinha")).toEqual(["bancada", "eletrodomesticos", "azulejos", "pavimento"]);
    expect(trabalhosPorDivisao("sala")).toEqual(["pavimento", "pintura", "eletricidade"]);
    expect(trabalhosPorDivisao("quarto")).toEqual(["pavimento", "pintura", "eletricidade"]);
    expect(trabalhosPorDivisao("exterior")).toEqual(["caixilharia", "estores", "paredes", "teto"]);
    expect(trabalhosPorDivisao("outra")).toEqual([]);
    expect(trabalhosPorDivisao("")).toEqual([]);
  });

  it("uma linha nova começa sem divisão nem trabalho", () => {
    expect(novaLinha("l1")).toMatchObject({ id: "l1", divisao: "", trabalho: "", unidade: "m2" });
  });

  it("toda a chave das listas tem texto em pt e en", () => {
    const chaves = [
      ...DIVISOES.map((d) => `room.${d}`), ...UNIDADES.map((u) => `unit.${u}`),
      ...DIVISOES.flatMap((d) => trabalhosPorDivisao(d).map((w) => `work.${w}`)), "work.outro",
    ];
    for (const lingua of ["pt", "en"] as const) {
      for (const c of chaves) expect(negocioMetasNovoTranslations[lingua][`businessGoals.new.${c}`], `${lingua} ${c}`).toBeTruthy();
    }
  });
});

describe("levantamento", () => {
  it("começa por fazer, na data dada, sem linhas", () => {
    expect(levantamentoVazio("2026-10-13", "Ana Ribeiro")).toEqual({
      data: "2026-10-13", feitoPor: "Ana Ribeiro", estado: "porFazer", linhas: [], observacoes: "",
    });
  });

  it("lerMedida aceita vírgula e dá NaN ao que não é número", () => {
    expect(lerMedida("2,5")).toBe(2.5);
    expect(lerMedida(" 3 ")).toBe(3);
    expect(lerMedida("")).toBeNaN();
    expect(lerMedida("abc")).toBeNaN();
  });

  it("ao mudar a divisão limpa o trabalho que já não serve, mas mantém Outro e o por escolher", () => {
    const l = (id: string, trabalho: string): LinhaForm => ({ ...novaLinha(id), divisao: "casaDeBanho", trabalho });
    const antes = [l("a", "sanita"), l("b", "azulejos"), l("c", OUTRO), l("d", "")];
    const depois = antes.map((x) => adaptarLinhaADivisao(x, "cozinha"));
    expect(depois.map((x) => x.trabalho)).toEqual(["", "azulejos", OUTRO, ""]);
    expect(antes[0].trabalho).toBe("sanita");
  });

  it("converte para texto: rótulos, trabalho Outro escrito, medida em número e textos aparados", () => {
    const rotulo = (g: string, c: string) => `${g}:${c}`;
    const base = { ...novaLinha("l1"), divisao: "cozinha", trabalho: "bancada", medida: "2,5", observacoes: " x " };
    const feito = paraLevantamentoNegocio({
      ...levantamentoVazio("2026-10-13", "Ana Ribeiro"), estado: "feito", observacoes: " geral ",
      linhas: [base, { ...base, id: "l2", trabalho: OUTRO, trabalhoOutro: " Rufar ", unidade: "un" }],
    }, rotulo);
    expect(feito.linhas).toEqual([
      { divisao: "room:cozinha", trabalho: "work:bancada", medida: 2.5, unidade: "unit:m2", observacoes: "x" },
      { divisao: "room:cozinha", trabalho: "Rufar", medida: 2.5, unidade: "unit:un", observacoes: "x" },
    ]);
    expect(feito.observacoes).toBe("geral");
  });

  it("temLevantamento: só com linhas, observações ou estado Feito", () => {
    const vazio = { data: "d", feitoPor: "x", estado: "porFazer" as const, linhas: [], observacoes: "" };
    expect(temLevantamento(undefined)).toBe(false);
    expect(temLevantamento(vazio)).toBe(false);
    expect(temLevantamento({ ...vazio, estado: "feito" })).toBe(true);
    expect(temLevantamento({ ...vazio, observacoes: "a" })).toBe(true);
  });
});
