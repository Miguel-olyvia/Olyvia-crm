// As contas do mes com os subsidios de ferias e de Natal: parcelas antes dos manuais, dentro da soma explicada e da base da TSU.
import { describe, expect, it } from "vitest";
import { contasDoMes, decomposicaoDoResultado, TSU_EMPREGADOR_PCT, type EntradaContas, type ResultadoParaContas } from "./contasDoMes";

const cent = (v: number) => Math.round(v * 100);
const normal = (s: string | undefined) => (s ?? "").replace(/[\u00a0\u202f]/g, " ");

/** 1500 de base com 50 % em duodecimos: duodecimos 125, subsidio de ferias 750 (pago neste mes). */
const DIVISOR_50 = 168 / 13;
const resultado = (extra: Partial<ResultadoParaContas> = {}): ResultadoParaContas => ({
  baseMes: (1500 * 14) / DIVISOR_50,
  divisorDuodecimos: DIVISOR_50,
  linhasAutomaticas: [],
  linhasRegra: [{ tipo: "km", faixa: null, quantidade: 100, valor: 40 }],
  descontoFaltas: 0,
  subsidioAlimentacao: 0,
  subsidioFerias: 750,
  subsidioNatal: 0,
  subsidiosDetalhe: { r: 1500, duodecimosPct: 50, proporcao: 1, ferias: 750, natal: 0 },
  ...extra,
});

const entradaDe = (r: ResultadoParaContas, extra: Partial<EntradaContas> = {}): EntradaContas => {
  const d = decomposicaoDoResultado(r);
  const km = r.linhasRegra.reduce((s, l) => s + l.valor, 0);
  const retribuicaoMes = 1500 + 125 + (r.subsidioFerias ?? 0) + (r.subsidioNatal ?? 0) + km;
  return { retribuicaoMes, decomposicao: d, estimado: false, manuais: 0, equipamentos: 0, taxaPct: TSU_EMPREGADOR_PCT, taxaDaPessoa: false, seguroPct: null, ...extra };
};

type Contas = ReturnType<typeof contasDoMes>;
const somaDasParcelas = (c: Contas) => c.linhas.filter((l) => l.tipo === "parcela").reduce((s, l) => s + cent(l.valor), 0);
const linha = (c: Contas, chave: string) => c.linhas.find((l) => l.chave === chave);

describe("decomposicaoDoResultado com subsidios", () => {
  it("leva os dois valores e o detalhe", () => {
    expect(decomposicaoDoResultado(resultado({ subsidioNatal: 100 }))).toMatchObject({ subsidioFerias: 750, subsidioNatal: 100, subsidiosDetalhe: { r: 1500 } });
  });

  it("sem os campos (gravado antigo) ficam a 0", () => {
    const d = decomposicaoDoResultado(resultado({ subsidioFerias: undefined, subsidioNatal: undefined, subsidiosDetalhe: undefined }));
    expect(d?.subsidioFerias).toBe(0);
    expect(d?.subsidioNatal).toBe(0);
    expect(d?.subsidiosDetalhe).toBeUndefined();
  });
});

describe("contasDoMes com o subsidio de ferias", () => {
  it("a linha com a formula da parte que nao vai em duodecimos", () => {
    const c = contasDoMes(entradaDe(resultado()));
    const l = linha(c, "subsidioFerias");
    expect(l?.tipo).toBe("parcela");
    expect(l?.valor).toBe(750);
    expect(normal(l?.formula)).toBe("1 500,00 € × 50 % (a parte que não vai em duodécimos) × 12/12 = 750,00 €");
  });

  it("a soma das parcelas bate com o total e nada vai para «Outras componentes»", () => {
    const e = entradaDe(resultado());
    const c = contasDoMes(e);
    expect(linha(c, "outras")).toBeUndefined();
    expect(linha(c, "arredondamento")).toBeUndefined();
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? 0));
    expect(c.bruto).toBeCloseTo(e.retribuicaoMes ?? 0, 6);
  });

  it("entra na base da TSU (sem km e ajudas)", () => {
    const c = contasDoMes(entradaDe(resultado()));
    expect(c.baseTsu).toBeCloseTo(1500 + 125 + 750, 6);
    expect(c.tsu).toBeCloseTo(((1500 + 125 + 750) * TSU_EMPREGADOR_PCT) / 100, 2);
  });

  it("fica antes dos manuais", () => {
    const c = contasDoMes(entradaDe(resultado(), { manuais: 50, retribuicaoMes: 1500 + 125 + 750 + 40 + 50 }));
    const chaves = c.linhas.map((l) => l.chave);
    expect(chaves.indexOf("subsidioFerias")).toBeGreaterThan(chaves.indexOf("km"));
    expect(chaves.indexOf("subsidioFerias")).toBeLessThan(chaves.indexOf("manuais"));
  });

  it("com proporcao por dias: «× 184/365» (so quando reproduz ao centimo)", () => {
    const r = resultado({ subsidioFerias: 378.08, subsidiosDetalhe: { r: 1500, duodecimosPct: 50, proporcao: 184 / 365, diasNoAno: 184, diasDoAno: 365, ferias: 378.08, natal: 0 } });
    const l = linha(contasDoMes(entradaDe(r)), "subsidioFerias");
    expect(normal(l?.formula)).toBe("1 500,00 € × 50 % (a parte que não vai em duodécimos) × 184/365 = 378,08 €");
  });

  it("se a conta nao reproduz o valor ao centimo, so o valor (sem formula inexacta)", () => {
    const r = resultado({ subsidiosDetalhe: { r: 1500, duodecimosPct: 50, proporcao: 1, ferias: 750.5, natal: 0 }, subsidioFerias: 750.5 });
    const c = contasDoMes(entradaDe(r, { retribuicaoMes: 1500 + 125 + 750.5 + 40 }));
    expect(linha(c, "subsidioFerias")?.formula).toBe("");
    expect(linha(c, "subsidioFerias")?.valor).toBe(750.5);
  });

  it("mes fechado (sem detalhe): so o valor gravado, e a soma continua a bater", () => {
    const r = resultado({ subsidiosDetalhe: undefined });
    const e = entradaDe(r);
    const c = contasDoMes(e);
    expect(linha(c, "subsidioFerias")).toMatchObject({ valor: 750, formula: "" });
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? 0));
  });

  it("com os dois subsidios, duas linhas", () => {
    const r = resultado({ subsidioNatal: 750, subsidiosDetalhe: { r: 1500, duodecimosPct: 50, proporcao: 1, ferias: 750, natal: 750 } });
    const c = contasDoMes(entradaDe(r));
    expect(linha(c, "subsidioFerias")?.valor).toBe(750);
    expect(linha(c, "subsidioNatal")?.valor).toBe(750);
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? 0));
  });

  it("em ingles, a formula usa o separador ingles e o rotulo recebido", () => {
    const l = linha(contasDoMes(entradaDe(resultado()), { lingua: "en", rotuloParteSemDuodecimos: "the part not paid in twelfths" }), "subsidioFerias");
    expect(l?.formula.replace(/\u00a0/g, " ")).toBe("1,500.00 € × 50 % (the part not paid in twelfths) × 12/12 = 750.00 €");
  });

  it("sem subsidios as contas sao as de sempre (nenhuma linha nova)", () => {
    const c = contasDoMes(entradaDe(resultado({ subsidioFerias: 0, subsidioNatal: 0, subsidiosDetalhe: undefined }), { retribuicaoMes: 1500 + 125 + 40 }));
    expect(linha(c, "subsidioFerias")).toBeUndefined();
    expect(linha(c, "subsidioNatal")).toBeUndefined();
  });
});
