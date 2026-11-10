// As contas do mes passo a passo: cada linha com rotulo (chave), formula em texto e valor; a soma das linhas bate sempre com o total.
import { describe, expect, it } from "vitest";
import { contasDoMes, decomposicaoDoResultado, TSU_EMPREGADOR_PCT, type DecomposicaoRetribuicao, type EntradaContas, type ResultadoParaContas } from "./contasDoMes";

const cent = (v: number) => Math.round(v * 100);
/** Os espacos duros do formato pt-PT passam a espacos normais, para ler os textos. */
const normal = (s: string | undefined) => (s ?? "").replace(/[\u00a0\u202f]/g, " ");

/** O processamento de uma pessoa com tudo: 1000 de base com duodecimos a 12, extras, noturnas, faltas, IHT, km e ajudas. */
const RESULTADO: ResultadoParaContas = {
  baseMes: (1000 * 14) / 12,
  divisorDuodecimos: 12,
  linhasAutomaticas: [{ origem: "horas_extra", valor: 50 }],
  linhasRegra: [
    { tipo: "noturnas", faixa: 0, quantidade: 4, valor: 20 },
    { tipo: "iht", faixa: null, quantidade: null, valor: 250 },
    { tipo: "km", faixa: null, quantidade: 100, valor: 40 },
    { tipo: "ajudas", faixa: null, quantidade: 2, valor: 50 },
  ],
  descontoFaltas: 30,
  subsidioAlimentacao: 100,
};

const completa = (): DecomposicaoRetribuicao => {
  const d = decomposicaoDoResultado(RESULTADO);
  if (!d) throw new Error("decomposicao em falta");
  return d;
};

const entrada = (parcial: Partial<EntradaContas> = {}): EntradaContas => ({
  retribuicaoMes: 1646.67,
  decomposicao: completa(),
  estimado: false,
  manuais: 120,
  equipamentos: 25,
  taxaPct: TSU_EMPREGADOR_PCT,
  taxaDaPessoa: false,
  seguroPct: 5,
  ...parcial,
});

type Contas = ReturnType<typeof contasDoMes>;
const somaDasParcelas = (c: Contas) => c.linhas.filter((l) => l.tipo === "parcela").reduce((s, l) => s + cent(l.valor), 0);
const linha = (c: Contas, chave: string) => c.linhas.find((l) => l.chave === chave);

describe("TSU_EMPREGADOR_PCT", () => {
  it("e a taxa da entidade empregadora em Portugal: 23,75 %", () => {
    expect(TSU_EMPREGADOR_PCT).toBe(23.75);
  });
});

describe("decomposicaoDoResultado", () => {
  it("separa salario base, duodecimos, alimentacao, extras e noturnas, faltas, IHT, km e ajudas", () => {
    expect(completa()).toMatchObject({
      salarioBase: 1000,
      divisor: 12,
      duodecimos: 166.67,
      subsidioAlimentacao: 100,
      horasExtra: 70,
      descontoFaltas: 30,
      iht: 250,
      km: { quantidade: 100, valor: 40 },
      ajudas: { quantidade: 2, valor: 50 },
    });
  });

  it("sem direito a IHT, km e ajudas essas linhas ficam a null (o processamento nao as devolveu)", () => {
    const d = decomposicaoDoResultado({ ...RESULTADO, linhasRegra: [] });
    expect(d).toMatchObject({ iht: null, km: null, ajudas: null, horasExtra: 50 });
  });

  it("sem base do mes (sem retribuicao) nao ha decomposicao", () => {
    expect(decomposicaoDoResultado({ ...RESULTADO, baseMes: null })).toBeNull();
    expect(decomposicaoDoResultado({ ...RESULTADO, divisorDuodecimos: null })).toBeNull();
  });
});

describe("contasDoMes: o caso completo", () => {
  const c = contasDoMes(entrada());

  it("a retribuicao e as linhas que a compoem, cada uma com a sua formula", () => {
    expect(linha(c, "salarioBase")?.valor).toBe(1000);
    expect(linha(c, "duodecimos")?.valor).toBe(166.67);
    expect(linha(c, "subsidioAlimentacao")?.valor).toBe(100);
    expect(linha(c, "horasExtra")?.valor).toBe(70);
    expect(linha(c, "faltas")?.valor).toBe(-30);
    expect(linha(c, "iht")?.valor).toBe(250);
    expect(normal(linha(c, "iht")?.formula)).toBe("25 % × 1 000,00 € = 250,00 €");
    expect(linha(c, "km")?.valor).toBe(40);
    expect(normal(linha(c, "km")?.formula)).toBe("100 km × 0,40 € = 40,00 €");
    expect(normal(linha(c, "ajudas")?.formula)).toBe("2 dias × 25,00 € = 50,00 €");
    expect(linha(c, "manuais")?.valor).toBe(120);
    expect(linha(c, "retribuicao")).toMatchObject({ tipo: "subtotal", valor: 1766.67 });
  });

  it("a TSU incide sobre a retribuicao SEM km nem ajudas (os manuais entram): 23,75 % x 1 676,67 = 398,21", () => {
    expect(c.baseTsu).toBe(1676.67);
    expect(linha(c, "tsu")?.valor).toBe(398.21);
    expect(normal(linha(c, "tsu")?.formula)).toBe("23,75 % × 1 676,67 € = 398,21 €");
  });

  it("o seguro incide so sobre o salario base: 5 % x 1 000,00 = 50,00", () => {
    expect(linha(c, "seguro")?.valor).toBe(50);
    expect(normal(linha(c, "seguro")?.formula)).toBe("5 % × 1 000,00 € = 50,00 €");
  });

  it("a soma das linhas bate com o total (retribuicao + TSU + seguro + equipamentos = 2 239,88)", () => {
    expect(c.total).toBe(2239.88);
    expect(linha(c, "total")).toMatchObject({ tipo: "total", valor: 2239.88 });
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("a comparacao: salario base x 14 / 12 + TSU + seguro", () => {
    // 1000 x 14 / 12 = 1166,67; TSU 23,75 % = 277,08; seguro 50.
    expect(c.repartido?.valor).toBe(1493.75);
    expect(c.repartido?.formula).toContain("14 ÷ 12");
  });
});

describe("contasDoMes: casos", () => {
  it("cargo sem seguro: seguro 0 e a linha di-lo", () => {
    const c = contasDoMes(entrada({ seguroPct: null }));
    expect(linha(c, "seguro")).toMatchObject({ valor: 0, nota: "semSeguro" });
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("seguro de 0 % tambem e sem seguro", () => {
    expect(linha(contasDoMes(entrada({ seguroPct: 0 })), "seguro")?.nota).toBe("semSeguro");
  });

  it("pessoa sem direitos: IHT, km e ajudas nao aparecem, e a TSU incide sobre toda a retribuicao", () => {
    const d = decomposicaoDoResultado({ ...RESULTADO, linhasRegra: [] });
    const c = contasDoMes(entrada({ decomposicao: d, retribuicaoMes: 1286.67, manuais: 0, equipamentos: 0 }));
    for (const chave of ["iht", "km", "ajudas", "manuais", "equipamentos"]) expect(linha(c, chave)).toBeUndefined();
    expect(c.baseTsu).toBe(1286.67);
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("a taxa desta pessoa (excecao) manda na TSU e a linha di-lo", () => {
    const c = contasDoMes(entrada({ taxaPct: 10, taxaDaPessoa: true }));
    expect(linha(c, "tsu")?.valor).toBe(167.67);
    expect(linha(c, "tsu")?.nota).toBe("taxaDaPessoa");
  });

  it("estimativa pelo cargo: so salario base, TSU e seguro sobre a estimativa, tudo marcado estimado", () => {
    const c = contasDoMes(entrada({ retribuicaoMes: 1200, decomposicao: null, estimado: true, manuais: 0, equipamentos: 0 }));
    expect(c.linhas.map((l) => l.chave)).toEqual(["salarioBase", "retribuicao", "tsu", "seguro", "total"]);
    expect(linha(c, "tsu")?.valor).toBe(285);
    expect(linha(c, "seguro")?.valor).toBe(60);
    expect(c.total).toBe(1545);
    expect(c.linhas.every((l) => l.estimado === true)).toBe(true);
    expect(somaDasParcelas(c)).toBe(cent(1545));
  });

  it("sem retribuicao: sem linhas e sem total (nunca um 0 inventado)", () => {
    const c = contasDoMes(entrada({ retribuicaoMes: null, decomposicao: null }));
    expect(c.linhas).toEqual([]);
    expect(c.total).toBeNull();
    expect(c.repartido).toBeNull();
  });

  it("o que o processamento tem e as linhas nao explicam fica em «Outras componentes» (nada inventado)", () => {
    // 100 a mais na retribuicao: por exemplo um codigo de valor fixo mensal.
    const c = contasDoMes(entrada({ retribuicaoMes: 1746.67 }));
    expect(linha(c, "outras")?.valor).toBe(100);
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("uma diferenca de arredondamento de um centimo nao cria «Outras componentes»: vai para a linha «Arredondamento» e a soma bate", () => {
    const c = contasDoMes(entrada({ retribuicaoMes: 1646.68 }));
    expect(linha(c, "outras")).toBeUndefined();
    expect(linha(c, "arredondamento")?.valor).toBe(0.01);
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("o arredondamento nao mexe no salario base (base do seguro e do IHT) nem nos duodecimos: a formula continua a reproduzir o valor", () => {
    const c = contasDoMes(entrada({ retribuicaoMes: 1646.68 }));
    expect(linha(c, "salarioBase")?.valor).toBe(1000);
    expect(linha(c, "duodecimos")?.valor).toBe(166.67);
    expect(normal(linha(c, "duodecimos")?.formula)).toBe("1 000,00 € × 14 ÷ 12 − 1 000,00 € = 166,67 €");
    expect(linha(c, "seguro")?.valor).toBe(50);
    expect(normal(linha(c, "iht")?.formula)).toBe("25 % × 1 000,00 € = 250,00 €");
    expect(c.salarioBase).toBe(1000);
  });

  it("sem diferenca de arredondamento nao ha linha «Arredondamento»", () => {
    expect(linha(contasDoMes(entrada()), "arredondamento")).toBeUndefined();
  });

  it("o arredondamento negativo tambem aparece (e a soma bate), sem salario base com centimos a mais", () => {
    const c = contasDoMes(entrada({ retribuicaoMes: 1646.66 }));
    expect(linha(c, "arredondamento")?.valor).toBe(-0.01);
    expect(linha(c, "salarioBase")?.valor).toBe(1000);
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });
});

describe("contasDoMes: formulas que so se mostram quando reproduzem o valor ao centimo", () => {
  it("IHT cuja percentagem x base nao reproduz o valor: sem formula inexacta, «calculado pelo processamento»", () => {
    const d = { ...completa(), iht: 250.01 };
    const c = contasDoMes(entrada({ decomposicao: d, retribuicaoMes: 1646.68 }));
    expect(normal(linha(c, "iht")?.formula)).toBe("= 250,01 €, calculado pelo processamento");
  });

  it("varias linhas de km com precos diferentes: sem preco unico inventado", () => {
    const d = decomposicaoDoResultado({
      ...RESULTADO,
      linhasRegra: [
        { tipo: "km", faixa: null, quantidade: 50, valor: 20 },
        { tipo: "km", faixa: null, quantidade: 50, valor: 25 },
      ],
    });
    if (!d) throw new Error("decomposicao em falta");
    const c = contasDoMes(entrada({ decomposicao: d, retribuicaoMes: 1286.67 + 45, manuais: 0, equipamentos: 0 }));
    expect(linha(c, "km")?.valor).toBe(45);
    expect(normal(linha(c, "km")?.formula)).toBe("= 45,00 €, calculado pelo processamento");
  });

  it("ajudas cujo preco x quantidade nao reproduz o valor: sem formula inexacta", () => {
    const d = decomposicaoDoResultado({ ...RESULTADO, linhasRegra: [{ tipo: "ajudas", faixa: null, quantidade: 1000, valor: 0.01 }] });
    if (!d) throw new Error("decomposicao em falta");
    const c = contasDoMes(entrada({ decomposicao: d, retribuicaoMes: 1286.67 + 0.01, manuais: 0, equipamentos: 0 }));
    expect(normal(linha(c, "ajudas")?.formula)).toBe("= 0,01 €, calculado pelo processamento");
  });

  it("uma so linha de km com preco exacto mantem a formula", () => {
    expect(normal(linha(contasDoMes(entrada()), "km")?.formula)).toBe("100 km × 0,40 € = 40,00 €");
  });

  it("o texto «calculado pelo processamento» vem da opcao (traducao)", () => {
    const d = { ...completa(), iht: 250.01 };
    const c = contasDoMes(entrada({ decomposicao: d, retribuicaoMes: 1646.68 }), { rotuloCalculado: "calculated by payroll" });
    expect(normal(linha(c, "iht")?.formula)).toBe("= 250,01 €, calculated by payroll");
  });
});

describe("contasDoMes: faltas acima da retribuicao (o processamento corta o bruto a 0)", () => {
  /** 100 de base, sem divisor de duodecimos (14), 300 de faltas: as partes dao -200 e o processamento devolve 0. */
  const faltasAltas = (): DecomposicaoRetribuicao => {
    const d = decomposicaoDoResultado({ baseMes: 100, divisorDuodecimos: 14, linhasAutomaticas: [], linhasRegra: [], descontoFaltas: 300, subsidioAlimentacao: 0 });
    if (!d) throw new Error("decomposicao em falta");
    return d;
  };

  it("di-lo numa linha com nota, nunca «Outras componentes», e o bruto fica a 0", () => {
    const c = contasDoMes(entrada({ decomposicao: faltasAltas(), retribuicaoMes: 0, manuais: 0, equipamentos: 0 }));
    expect(linha(c, "outras")).toBeUndefined();
    expect(linha(c, "limiteFaltas")).toMatchObject({ valor: 200, nota: "faltasExcedem" });
    expect(c.bruto).toBe(0);
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("com lancamentos pontuais (retribuicao sem pontuais negativa) o bruto e o total nunca ficam negativos", () => {
    // total bruto do processamento 0 com pontuais de 50: a retribuicao sem pontuais e -50; os manuais devolvem 50.
    const c = contasDoMes(entrada({ decomposicao: faltasAltas(), retribuicaoMes: -50, manuais: 50, equipamentos: 0 }));
    expect(c.bruto).toBe(0);
    expect(c.total ?? -1).toBeGreaterThanOrEqual(0);
    expect(linha(c, "limiteFaltas")?.nota).toBe("faltasExcedem");
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("se as partes ainda deixam o bruto negativo, a linha do limite repoe-no a 0", () => {
    const c = contasDoMes(entrada({ decomposicao: faltasAltas(), retribuicaoMes: -80, manuais: 50, equipamentos: 0 }));
    expect(c.bruto).toBe(0);
    expect(c.total ?? -1).toBeGreaterThanOrEqual(0);
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("sem faltas a mais nao ha linha de limite", () => {
    expect(linha(contasDoMes(entrada()), "limiteFaltas")).toBeUndefined();
  });
});

describe("contasDoMes: manuais e seguro desconhecido", () => {
  it("os lancamentos manuais sao reais: nao levam «estimado» numa pessoa estimada", () => {
    const c = contasDoMes(entrada({ retribuicaoMes: 1200, decomposicao: null, estimado: true, manuais: 30, equipamentos: 0 }));
    expect(linha(c, "manuais")?.estimado).toBeUndefined();
    expect(linha(c, "salarioBase")?.estimado).toBe(true);
    expect(linha(c, "tsu")?.estimado).toBe(true);
  });

  it("pessoa so no gravado (cargo desconhecido): seguro 0 com nota propria, nao «sem seguro», e fora do total", () => {
    const c = contasDoMes(entrada({ seguroPct: null, seguroDesconhecido: true }));
    expect(linha(c, "seguro")).toMatchObject({ valor: 0, nota: "cargoDesconhecido" });
    expect(c.seguro).toBe(0);
    expect(c.total).toBe(2189.88);
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("cargo desconhecido ganha ao pct (nao se aplica um seguro que nao se sabe)", () => {
    expect(linha(contasDoMes(entrada({ seguroPct: 5, seguroDesconhecido: true })), "seguro")).toMatchObject({ valor: 0, nota: "cargoDesconhecido" });
  });
});
