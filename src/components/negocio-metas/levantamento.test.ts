import { describe, expect, it } from "vitest";
import {
  adaptarLinhasAoServico, lerMedida, levantamentoVazio, novaLinha, paraLevantamentoNegocio, temLevantamento, type LinhaForm,
} from "./levantamento";
import { DIVISOES, OUTRO, SERVICOS, UNIDADES, divisaoPorServico, ehServico, trabalhosPorServico } from "./levantamentoExemplo";
import { negocioMetasNovoTranslations } from "@/translations/negocioMetasNovo";

describe("listas fechadas", () => {
  it("os serviços são os seis pedidos, com Outro no fim, e as divisões e unidades também", () => {
    expect(SERVICOS).toEqual(["casaDeBanho", "cozinha", "janelas", "isolamento", "remodelacaoTotal", "outro"]);
    expect(DIVISOES).toEqual(["casaDeBanho", "cozinha", "sala", "quarto", "exterior", "outra"]);
    expect(UNIDADES).toEqual(["m2", "m", "un"]);
    expect(ehServico("cozinha")).toBe(true);
    expect(ehServico("Cozinha")).toBe(false);
  });

  it("os trabalhos sugeridos adaptam-se ao serviço; Outro e sem serviço não têm sugestões", () => {
    expect(trabalhosPorServico("casaDeBanho")).toEqual(["bancaPorDuche", "sanita", "azulejos", "canalizacao"]);
    expect(trabalhosPorServico("cozinha")).toEqual(["bancada", "eletrodomesticos", "azulejos", "pavimento"]);
    expect(trabalhosPorServico("janelas")).toEqual(["caixilharia", "estores"]);
    expect(trabalhosPorServico("isolamento")).toEqual(["paredes", "teto"]);
    expect(trabalhosPorServico(OUTRO)).toEqual([]);
    expect(trabalhosPorServico("")).toEqual([]);
  });

  it("a divisão por omissão só existe para casa de banho e cozinha", () => {
    expect(divisaoPorServico("cozinha")).toBe("cozinha");
    expect(divisaoPorServico("casaDeBanho")).toBe("casaDeBanho");
    expect(divisaoPorServico("janelas")).toBe("");
  });

  it("toda a chave das listas tem texto em pt e en", () => {
    const chaves = [
      ...SERVICOS.map((s) => `service.opt.${s}`), ...DIVISOES.map((d) => `room.${d}`), ...UNIDADES.map((u) => `unit.${u}`),
      ...SERVICOS.flatMap((s) => trabalhosPorServico(s).map((w) => `work.${w}`)), "work.outro",
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

  it("ao mudar o serviço limpa os trabalhos que já não servem, mas mantém Outro e os por escolher", () => {
    const l = (id: string, trabalho: string): LinhaForm => ({ ...novaLinha(id, "casaDeBanho"), trabalho });
    const antes = [l("a", "sanita"), l("b", "azulejos"), l("c", OUTRO), l("d", "")];
    const depois = adaptarLinhasAoServico(antes, "cozinha");
    expect(depois.map((x) => x.trabalho)).toEqual(["", "azulejos", OUTRO, ""]);
    expect(antes[0].trabalho).toBe("sanita");
  });

  it("converte para texto: rótulos, trabalho Outro escrito, medida em número e textos aparados", () => {
    const rotulo = (g: string, c: string) => `${g}:${c}`;
    const base = { ...novaLinha("l1", "cozinha"), trabalho: "bancada", medida: "2,5", observacoes: " x " };
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
