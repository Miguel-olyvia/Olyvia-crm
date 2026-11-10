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

  it("ja nao ha conta «para comparar»: so o custo do mes", () => {
    expect(c).not.toHaveProperty("repartido");
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
    expect(normal(linha(c, "duodecimos")?.formula)).toBe("2 subsídios × 100 % ÷ 12 × 1 000,00 € = 166,67 €");
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

describe("contasDoMes: a formula dos duodecimos e a do processamento (2 subsidios x % ÷ 12 x retribuicao)", () => {
  /** O processamento: divisor = 168 ÷ (12 + 2 × pct/100); baseMes = retribuicao × 14 ÷ divisor. */
  const comDivisor = (retribuicao: number, divisor: number, opcoes?: Parameters<typeof contasDoMes>[1]) => {
    const baseMes = (retribuicao * 14) / divisor;
    const d = decomposicaoDoResultado({ baseMes, divisorDuodecimos: divisor, linhasAutomaticas: [], linhasRegra: [], descontoFaltas: 0, subsidioAlimentacao: 0 });
    return contasDoMes(entrada({ retribuicaoMes: Math.round(baseMes * 100) / 100, decomposicao: d, manuais: 0, equipamentos: 0 }), opcoes);
  };

  it("50 % de 1 500 €: a formula reproduz 125,00 € (e nao a do 14 ÷ 13, que dava 115,38 €)", () => {
    const c = comDivisor(1500, 168 / 13);
    expect(linha(c, "duodecimos")?.valor).toBe(125);
    expect(normal(linha(c, "duodecimos")?.formula)).toBe("2 subsídios × 50 % ÷ 12 × 1 500,00 € = 125,00 €");
    expect(somaDasParcelas(c)).toBe(cent(c.total ?? Number.NaN));
  });

  it("100 % de 1 500 €: 250,00 €", () => {
    const c = comDivisor(1500, 12);
    expect(linha(c, "duodecimos")?.valor).toBe(250);
    expect(normal(linha(c, "duodecimos")?.formula)).toBe("2 subsídios × 100 % ÷ 12 × 1 500,00 € = 250,00 €");
  });

  it("0 % (subsidios em dois meses, divisor 14): nao ha linha de duodecimos", () => {
    expect(linha(comDivisor(1500, 14), "duodecimos")).toBeUndefined();
  });

  it("divisor que nao corresponde a 0, 50 ou 100 %: so o valor, «calculado pelo processamento»", () => {
    const c = comDivisor(1500, 13);
    expect(linha(c, "duodecimos")?.valor).toBe(115.38);
    expect(normal(linha(c, "duodecimos")?.formula)).toBe("= 115,38 €, calculado pelo processamento");
  });

  it("em ingles usa a palavra dada para os subsidios", () => {
    const c = comDivisor(1500, 168 / 13, { lingua: "en", rotuloSubsidios: "allowances" });
    expect(normal(linha(c, "duodecimos")?.formula)).toBe("2 allowances × 50 % ÷ 12 × 1,500.00 € = 125.00 €");
  });
});

// ---- Subsidio de alimentacao (duas regras) e desconto de faltas, com os dias e as horas que os originaram ----
describe("contasDoMes: detalhe do subsidio de alimentacao e das faltas", () => {
  type Dias = { data: string | null; minutos: number }[];
  const detalheSubsidio = (diasPeloDia: Dias, diasPelaHora: Dias, totalPelaHora: number, valorHora = 0.76, valorDia = 6.15) => ({
    limiteMin: 300,
    valorDia,
    valorHora,
    diasPeloDia,
    diasPelaHora,
    totalPeloDia: Math.round(diasPeloDia.length * 615) / 100,
    totalPelaHora,
  });
  const DIAS_DIA: Dias = [{ data: "2026-10-01", minutos: 480 }, { data: "2026-10-02", minutos: 300 }, { data: "2026-10-05", minutos: 500 }];
  const DIAS_HORA: Dias = [{ data: "2026-10-06", minutos: 120 }, { data: "2026-10-07", minutos: 299 }];

  /** Uma pessoa de 1000 de base, sem duodecimos, com o subsidio e as faltas dados; a retribuicao e exactamente a soma das partes. */
  const contasCom = (resultado: Partial<ResultadoParaContas>, opcoes: Parameters<typeof contasDoMes>[1] = {}) => {
    const r: ResultadoParaContas = { baseMes: 1000, divisorDuodecimos: 14, linhasAutomaticas: [], linhasRegra: [], descontoFaltas: 0, subsidioAlimentacao: 0, ...resultado };
    const retribuicaoMes = Math.round((1000 + r.subsidioAlimentacao - r.descontoFaltas) * 100) / 100;
    return contasDoMes(entrada({ retribuicaoMes, decomposicao: decomposicaoDoResultado(r), manuais: 0, equipamentos: 0 }), opcoes);
  };
  const bate = (c: Contas) => {
    const ate = c.linhas.findIndex((l) => l.chave === "retribuicao");
    const parcelas = c.linhas.slice(0, ate).reduce((soma, l) => soma + cent(l.valor), 0);
    expect(parcelas).toBe(cent(c.bruto ?? 0));
    expect(cent(c.bruto ?? 0)).toBe(cent(c.linhas[ate].valor));
  };

  it("as DUAS regras viram duas linhas, cada uma com a sua conta e os seus dias", () => {
    const sub = detalheSubsidio(DIAS_DIA, DIAS_HORA, 5.31);
    const c = contasCom({ subsidioAlimentacao: 23.76, subsidioDetalhe: sub });
    expect(linha(c, "subsidioAlimentacao")).toBeUndefined();
    const dia = linha(c, "subsidioAlimentacaoDia");
    const hora = linha(c, "subsidioAlimentacaoHora");
    expect(dia).toMatchObject({ tipo: "parcela", valor: 18.45, rotuloParams: { limite: "5 h" }, dias: ["2026-10-01", "2026-10-02", "2026-10-05"] });
    expect(normal(dia?.formula)).toBe("3 dias × 6,15 € = 18,45 €");
    expect(hora).toMatchObject({ tipo: "parcela", valor: 5.31, rotuloParams: { limite: "5 h" }, dias: ["2026-10-06", "2026-10-07"] });
    // 120 + 299 = 419 min = 6 h 59 min
    expect(normal(hora?.formula)).toBe("6 h 59 min × 0,76 €/h = 5,31 €");
    bate(c);
  });

  it("o limite vem da regra e nao esta fixo a 5 h", () => {
    const sub = { ...detalheSubsidio(DIAS_DIA, DIAS_HORA, 5.31), limiteMin: 330 };
    const c = contasCom({ subsidioAlimentacao: 23.76, subsidioDetalhe: sub });
    expect(linha(c, "subsidioAlimentacaoDia")?.rotuloParams).toEqual({ limite: "5 h 30 min" });
  });

  it("so dias pelo valor do dia: so a primeira linha; um unico dia diz «1 dia»", () => {
    const c = contasCom({ subsidioAlimentacao: 6.15, subsidioDetalhe: detalheSubsidio([DIAS_DIA[0]], [], 0) });
    expect(linha(c, "subsidioAlimentacaoHora")).toBeUndefined();
    expect(normal(linha(c, "subsidioAlimentacaoDia")?.formula)).toBe("1 dia × 6,15 € = 6,15 €");
    bate(c);
  });

  it("so dias pelo valor da hora: so a segunda linha", () => {
    const c = contasCom({ subsidioAlimentacao: 5.31, subsidioDetalhe: detalheSubsidio([], DIAS_HORA, 5.31) });
    expect(linha(c, "subsidioAlimentacaoDia")).toBeUndefined();
    expect(linha(c, "subsidioAlimentacaoHora")?.valor).toBe(5.31);
    bate(c);
  });

  it("sem dias de nenhuma regra, nao ha linha de subsidio", () => {
    const c = contasCom({ subsidioAlimentacao: 0, subsidioDetalhe: detalheSubsidio([], [], 0) });
    expect(c.linhas.some((l) => l.chave.startsWith("subsidioAlimentacao"))).toBe(false);
  });

  it("arredondamento por dia: a conta total nao reproduz ao centimo e diz «calculado dia a dia»", () => {
    // 3 dias de 20 min a 0,76 EUR/h: cada um 0,2533 -> 0,25; soma 0,75; mas 60 min x 0,76 = 0,76
    const tres: Dias = [{ data: "2026-10-01", minutos: 20 }, { data: "2026-10-02", minutos: 20 }, { data: "2026-10-03", minutos: 20 }];
    const c = contasCom({ subsidioAlimentacao: 0.75, subsidioDetalhe: detalheSubsidio([], tres, 0.75) });
    const hora = linha(c, "subsidioAlimentacaoHora");
    expect(normal(hora?.formula)).toBe("= 0,75 €, calculado dia a dia");
    expect(hora?.dias).toHaveLength(3);
    bate(c);
  });

  it("valor do dia com 3 casas: se n x valor mostrado nao reproduz o total ao centimo, so «= total, calculado dia a dia»", () => {
    // 6,145 EUR: o processamento arredonda 614,5 a 615 cêntimos (3 dias = 18,45), mas o ecra mostra 6,14 (3 x 6,14 = 18,42)
    const tres: Dias = [{ data: "2026-10-01", minutos: 480 }, { data: "2026-10-02", minutos: 300 }, { data: "2026-10-05", minutos: 500 }];
    const c = contasCom({ subsidioAlimentacao: 18.45, subsidioDetalhe: detalheSubsidio(tres, [], 0, 0.76, 6.145) });
    const dia = linha(c, "subsidioAlimentacaoDia");
    expect(normal(dia?.formula)).toBe("= 18,45 €, calculado dia a dia");
    expect(dia?.dias).toHaveLength(3);
    bate(c);
  });

  it("valor do dia com 3 casas que reproduz (6,154 -> 6,15): mantem a formula n x valor", () => {
    const tres: Dias = [{ data: "2026-10-01", minutos: 480 }, { data: "2026-10-02", minutos: 300 }, { data: "2026-10-05", minutos: 500 }];
    const c = contasCom({ subsidioAlimentacao: 18.45, subsidioDetalhe: detalheSubsidio(tres, [], 0, 0.76, 6.154) });
    expect(normal(linha(c, "subsidioAlimentacaoDia")?.formula)).toBe("3 dias × 6,15 € = 18,45 €");
  });

  it("dias sem data: a formula diz o total de dias (a conta tem de bater) e a lista so traz as datas conhecidas", () => {
    const sem: Dias = [{ data: "2026-10-01", minutos: 480 }, { data: null, minutos: 300 }, { data: "2026-10-05", minutos: 500 }];
    const c = contasCom({ subsidioAlimentacao: 18.45, subsidioDetalhe: detalheSubsidio(sem, [], 0) });
    const dia = linha(c, "subsidioAlimentacaoDia");
    expect(normal(dia?.formula)).toBe("3 dias × 6,15 € = 18,45 €");
    expect(dia?.dias).toEqual(["2026-10-01", "2026-10-05"]);
  });

  it("em ingles", () => {
    const c = contasCom(
      { subsidioAlimentacao: 23.76, subsidioDetalhe: detalheSubsidio(DIAS_DIA, DIAS_HORA, 5.31) },
      { lingua: "en", rotuloDias: "days", rotuloDia: "day", rotuloDiaADia: "calculated day by day", rotuloDeFalta: "of absence" },
    );
    expect(normal(linha(c, "subsidioAlimentacaoDia")?.formula)).toBe("3 days × 6.15 € = 18.45 €");
  });

  it("sem detalhe (mes fechado): uma so linha, como antes, sem dias", () => {
    const c = contasCom({ subsidioAlimentacao: 23.76 });
    expect(linha(c, "subsidioAlimentacaoDia")).toBeUndefined();
    expect(linha(c, "subsidioAlimentacaoHora")).toBeUndefined();
    expect(linha(c, "subsidioAlimentacao")).toMatchObject({ valor: 23.76, formula: "" });
    expect(linha(c, "subsidioAlimentacao")?.dias).toBeUndefined();
    bate(c);
  });

  it("o detalhe que nao soma o subsidio devolvido nao e mostrado: cai na linha unica", () => {
    const c = contasCom({ subsidioAlimentacao: 30, subsidioDetalhe: detalheSubsidio(DIAS_DIA, DIAS_HORA, 5.31) });
    expect(linha(c, "subsidioAlimentacao")?.valor).toBe(30);
    expect(linha(c, "subsidioAlimentacaoDia")).toBeUndefined();
  });

  it("faltas: as horas e os dias, o valor da hora e o valor; a soma continua a bater", () => {
    // 600 min a 10 EUR/h = 100 EUR
    const c = contasCom({ descontoFaltas: 100, faltasDetalhe: { dias: ["2026-10-05", "2026-10-09"], minutosDescontados: 600, valorHoraReal: 10, valor: 100 } });
    const f = linha(c, "faltas");
    expect(f).toMatchObject({ valor: -100, dias: ["2026-10-05", "2026-10-09"] });
    expect(normal(f?.formula)).toBe("10 h de falta (2 dias) × 10,00 €/h = −100,00 €");
    bate(c);
  });

  it("faltas: se a conta nao reproduz ao centimo, mostra so o valor e os dias", () => {
    // 600 min a 11,6667 EUR/h daria 116,67, mas o processamento chegou a 116,66 (falta a falta)
    const c = contasCom({ descontoFaltas: 116.66, faltasDetalhe: { dias: ["2026-10-05"], minutosDescontados: 600, valorHoraReal: 11.666666666666668, valor: 116.66 } });
    const f = linha(c, "faltas");
    expect(normal(f?.formula)).toBe("= −116,66 €, calculado pelo processamento");
    expect(f).toMatchObject({ valor: -116.66, dias: ["2026-10-05"] });
    bate(c);
  });

  it("faltas sem detalhe (mes fechado): uma linha, sem dias", () => {
    const c = contasCom({ descontoFaltas: 100 });
    expect(linha(c, "faltas")).toMatchObject({ valor: -100, formula: "" });
    expect(linha(c, "faltas")?.dias).toBeUndefined();
    bate(c);
  });

  it("decomposicaoDoResultado leva o detalhe quando o resultado o traz, e nao o inventa quando nao traz", () => {
    const sub = detalheSubsidio(DIAS_DIA, [], 0);
    expect(decomposicaoDoResultado({ ...RESULTADO, subsidioDetalhe: sub })?.subsidioDetalhe).toEqual(sub);
    expect(decomposicaoDoResultado(RESULTADO)).not.toHaveProperty("subsidioDetalhe");
    expect(decomposicaoDoResultado(RESULTADO)).not.toHaveProperty("faltasDetalhe");
  });
});
