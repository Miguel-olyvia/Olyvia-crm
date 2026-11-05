/** Validacao das regras salariais no cliente: intervalos, faixas (meia-noite, sobreposicao, percentagem OU preco) e erros da base. */
import { describe, it, expect } from "vitest";
import {
  chaveDoErroDeRegrasSalariais,
  diferencasDaRegra,
  faixaVazia,
  formDeRegra,
  intervalosDaFaixa,
  minutosDaHora,
  numeroComDuasCasas,
  validarRegraSalarial,
  type FormRegraSalarial,
} from "@/lib/hr/regrasSalariais";
import type { RegraSalarial } from "@/types/hr";

const HOJE = "2027-01-10";

const regra: RegraSalarial = {
  id: "r1",
  valido_de: "2026-01-01",
  valido_ate: null,
  subsidio_limite_min: 300,
  subsidio_valor_hora: 0.76,
  subsidio_valor_dia: 6.15,
  he_pct_dia_util: 50,
  he_pct_feriado: 75,
  he_pct_descanso: 100,
  he_limite_anual_min: 6000,
  iht_pct: 25,
  km_valor: 0.4,
  ajudas_custo_dia: 65.89,
  criada_em: "2026-01-01T00:00:00Z",
  criada_por_nome: "Ana",
  substituida_em: null,
  noturnas: [{ hora_inicio: "21:00", hora_fim: "00:00", percentagem: 25, preco_hora: null }],
};

const formValido = (): FormRegraSalarial => formDeRegra(regra, HOJE);
const faixa = (inicio: string, fim: string, valor = "25", modo: "percentagem" | "preco" = "percentagem") => ({
  ...faixaVazia(),
  inicio,
  fim,
  valor,
  modo,
});

describe("formDeRegra", () => {
  it("5 h = 5 horas e 0 minutos, e os valores com virgula", () => {
    const f = formValido();
    expect(f.limiteHoras).toBe("5");
    expect(f.limiteMinutos).toBe("0");
    expect(f.valorHora).toBe("0,76");
    expect(f.heLimiteHoras).toBe("100");
    expect(f.heLimiteMinutos).toBe("0");
    expect(f.validoDe).toBe(HOJE);
  });
  it("sem regra nao inventa valores", () => {
    const f = formDeRegra(null, HOJE);
    expect(f.valorDia).toBe("");
    expect(f.faixas).toEqual([]);
  });
});

describe("validarRegraSalarial", () => {
  it("a regra de hoje volta ao mesmo payload (300 min, 6000 min, faixa a percentagem)", () => {
    const { erros, payload } = validarRegraSalarial(formValido());
    expect(erros).toEqual({});
    expect(payload).toMatchObject({
      subsidio_limite_min: 300,
      subsidio_valor_hora: 0.76,
      subsidio_valor_dia: 6.15,
      he_limite_anual_min: 6000,
      iht_pct: 25,
      km_valor: 0.4,
      ajudas_custo_dia: 65.89,
      noturnas: [{ hora_inicio: "21:00", hora_fim: "00:00", percentagem: 25 }],
    });
  });

  it("limite do subsidio em horas e minutos: 4 h 30 = 270; 0 h 0 min e 24 h 1 min sao recusados", () => {
    expect(validarRegraSalarial({ ...formValido(), limiteHoras: "4", limiteMinutos: "30" }).payload?.subsidio_limite_min).toBe(270);
    expect(validarRegraSalarial({ ...formValido(), limiteHoras: "0", limiteMinutos: "0" }).erros.limite).toBeDefined();
    expect(validarRegraSalarial({ ...formValido(), limiteHoras: "24", limiteMinutos: "1" }).erros.limite).toBeDefined();
    expect(validarRegraSalarial({ ...formValido(), limiteHoras: "5", limiteMinutos: "60" }).erros.limite).toBeDefined();
  });

  it("cada limite e o da base: o maximo passa e o maximo mais um centimo e recusado", () => {
    const casos: Array<[keyof FormRegraSalarial, string, string]> = [
      ["valorHora", "10", "10,01"],
      ["valorDia", "50", "50,01"],
      ["hePctDiaUtil", "300", "300,01"],
      ["hePctFeriado", "300", "300,01"],
      ["hePctDescanso", "300", "300,01"],
      ["ihtPct", "50", "50,01"],
      ["kmValor", "2", "2,01"],
      ["ajudasDia", "300", "300,01"],
    ];
    for (const [campo, passa, falha] of casos) {
      expect(validarRegraSalarial({ ...formValido(), [campo]: passa }).erros[campo]).toBeUndefined();
      expect(validarRegraSalarial({ ...formValido(), [campo]: falha }).erros[campo]).toBeDefined();
    }
    // Faixas: percentagem ate 300, preco ate 50, e nunca 0.
    const f = (modo: "percentagem" | "preco", valor: string) => ({ ...formValido(), faixas: [faixa("01:00", "02:00", valor, modo)] });
    expect(validarRegraSalarial(f("percentagem", "300")).erros["faixa.0.valor"]).toBeUndefined();
    expect(validarRegraSalarial(f("percentagem", "300,01")).erros["faixa.0.valor"]).toBeDefined();
    expect(validarRegraSalarial(f("preco", "50")).erros["faixa.0.valor"]).toBeUndefined();
    expect(validarRegraSalarial(f("preco", "50,01")).erros["faixa.0.valor"]).toBeDefined();
  });

  it("recusa mais de duas casas, texto e vazio", () => {
    expect(validarRegraSalarial({ ...formValido(), kmValor: "0,401" }).erros.kmValor).toBeDefined();
    expect(validarRegraSalarial({ ...formValido(), valorDia: "abc" }).erros.valorDia).toBeDefined();
    expect(validarRegraSalarial({ ...formValido(), hePctFeriado: "" }).erros.hePctFeriado).toBeDefined();
  });

  it("o limite anual e em horas e minutos inteiros, de 1 minuto a 400 horas (24000 min)", () => {
    expect(numeroComDuasCasas("0,40")).toBe(0.4);
    expect(numeroComDuasCasas("0.4")).toBe(0.4);
    const com = (h: string, m: string) => validarRegraSalarial({ ...formValido(), heLimiteHoras: h, heLimiteMinutos: m });
    expect(com("100", "30").payload?.he_limite_anual_min).toBe(6030);
    expect(com("1", "40").payload?.he_limite_anual_min).toBe(100); // sem dizimas: 100 min
    expect(com("400", "0").erros.heLimiteHoras).toBeUndefined();
    expect(com("400", "1").erros.heLimiteHoras).toBeDefined();
    expect(com("0", "0").erros.heLimiteHoras).toBeDefined();
    expect(com("1", "60").erros.heLimiteHoras).toBeDefined();
  });

  it("a regra de 100 minutos volta ao formulario sem dizimas e ao mesmo valor", () => {
    const f = formDeRegra({ ...regra, he_limite_anual_min: 100 }, HOJE);
    expect([f.heLimiteHoras, f.heLimiteMinutos]).toEqual(["1", "40"]);
    expect(validarRegraSalarial(f).payload?.he_limite_anual_min).toBe(100);
  });

  it("propoe a data mais tardia entre hoje e o inicio da versao mais recente", () => {
    expect(formDeRegra({ ...regra, valido_de: "2027-06-01" }, HOJE).validoDe).toBe("2027-06-01");
    expect(formDeRegra({ ...regra, valido_de: "2026-01-01" }, HOJE).validoDe).toBe(HOJE);
  });

  it("24:00 e o fim do dia: 00:00-24:00 e o dia inteiro, e 24:00 como inicio e recusado", () => {
    expect(minutosDaHora("24:00", true)).toBe(1440);
    expect(minutosDaHora("24:00")).toBeNull();
    const dia = validarRegraSalarial({ ...formValido(), faixas: [faixa("00:00", "24:00")] });
    expect(dia.erros).toEqual({});
    expect(dia.payload?.noturnas).toEqual([{ hora_inicio: "00:00", hora_fim: "24:00", percentagem: 25 }]);
    expect(validarRegraSalarial({ ...formValido(), faixas: [faixa("00:00", "00:00")] }).erros["faixa.0.horas"]).toBe(
      "hr.regrasSalariais.erro.faixaMesmaHora",
    );
    expect(validarRegraSalarial({ ...formValido(), faixas: [faixa("24:00", "06:00")] }).erros["faixa.0.horas"]).toBe(
      "hr.regrasSalariais.erro.faixaHoras",
    );
    // 21:00-24:00 e 00:00-06:00 nao se sobrepoem; o dia inteiro cruza-se com qualquer outra.
    expect(validarRegraSalarial({ ...formValido(), faixas: [faixa("21:00", "24:00"), faixa("00:00", "06:00", "30")] }).erros).toEqual({});
    expect(validarRegraSalarial({ ...formValido(), faixas: [faixa("00:00", "24:00"), faixa("03:00", "04:00")] }).erros["faixa.1.horas"]).toBeDefined();
  });

  it("exemplo 21:00-24:00 a 25 % e 00:00-06:00 a 30 % e valido (24:00 grava-se como 00:00)", () => {
    const f = { ...formValido(), faixas: [faixa("21:00", "00:00", "25"), faixa("00:00", "06:00", "30")] };
    const { erros, payload } = validarRegraSalarial(f);
    expect(erros).toEqual({});
    expect(payload?.noturnas).toEqual([
      { hora_inicio: "21:00", hora_fim: "00:00", percentagem: 25 },
      { hora_inicio: "00:00", hora_fim: "06:00", percentagem: 30 },
    ]);
  });

  it("faixa a preco por hora envia preco_hora e nunca percentagem", () => {
    const f = { ...formValido(), faixas: [faixa("22:00", "06:00", "3,5", "preco")] };
    expect(validarRegraSalarial(f).payload?.noturnas).toEqual([{ hora_inicio: "22:00", hora_fim: "06:00", preco_hora: 3.5 }]);
  });

  it("uma faixa que atravessa a meia-noite cobre os dois lados", () => {
    expect(intervalosDaFaixa(22 * 60, 6 * 60)).toEqual([
      [1320, 1440],
      [0, 360],
    ]);
  });

  it("recusa faixas sobrepostas, tambem atravessando a meia-noite, e diz em qual", () => {
    const f = { ...formValido(), faixas: [faixa("22:00", "06:00"), faixa("05:00", "07:00")] };
    const { erros, payload } = validarRegraSalarial(f);
    expect(payload).toBeNull();
    expect(erros["faixa.1.horas"]).toBe("hr.regrasSalariais.erro.faixasSobrepostas");
    expect(erros["faixa.0.horas"]).toBeUndefined();
  });

  it("faixas encostadas (06:00 fim, 06:00 inicio) nao se sobrepoem", () => {
    const f = { ...formValido(), faixas: [faixa("00:00", "06:00"), faixa("06:00", "07:00", "40")] };
    expect(validarRegraSalarial(f).erros).toEqual({});
  });

  it("recusa faixa com a mesma hora, hora invalida, valor a zero", () => {
    const { erros } = validarRegraSalarial({
      ...formValido(),
      faixas: [faixa("21:00", "21:00"), faixa("25:00", "06:00"), faixa("01:00", "02:00", "0")],
    });
    expect(erros["faixa.0.horas"]).toBe("hr.regrasSalariais.erro.faixaMesmaHora");
    expect(erros["faixa.1.horas"]).toBe("hr.regrasSalariais.erro.faixaHoras");
    expect(erros["faixa.2.valor"]).toBe("hr.regrasSalariais.erro.faixaPercentagem");
  });

  it("exige uma data valida de inicio", () => {
    expect(validarRegraSalarial({ ...formValido(), validoDe: "" }).erros.validoDe).toBeDefined();
  });
});

describe("diferencasDaRegra", () => {
  it("a mesma regra nao muda nada; mudar o km e uma faixa nova aparecem", () => {
    const igual = validarRegraSalarial(formValido()).payload!;
    const semFaixas = { ...igual, noturnas: [{ hora_inicio: "21:00", hora_fim: "00:00", percentagem: 25 }] };
    expect(diferencasDaRegra(regra, semFaixas)).toEqual({
      campos: [],
      faixas: { mudou: false, antes: semFaixas.noturnas, depois: semFaixas.noturnas },
    });
    const nova = { ...igual, km_valor: 0.45, noturnas: [] };
    const d = diferencasDaRegra(regra, nova);
    expect(d.campos).toEqual([{ campo: "km_valor", antes: 0.4, depois: 0.45 }]);
    expect(d.faixas.mudou).toBe(true);
  });
  it("sem regra anterior tudo e novo (antes null)", () => {
    const payload = validarRegraSalarial(formValido()).payload!;
    expect(diferencasDaRegra(null, payload).campos).toHaveLength(10);
    expect(diferencasDaRegra(null, payload).campos[0].antes).toBeNull();
  });
});

describe("chaveDoErroDeRegrasSalariais", () => {
  it("traduz os prefixos da migration", () => {
    expect(chaveDoErroDeRegrasSalariais({ message: "regras_salariais_periodo_fechado: ha uma folha fechada" })).toBe(
      "hr.regrasSalariais.erro.periodoFechado",
    );
    expect(chaveDoErroDeRegrasSalariais({ message: "regras_salariais_faixas_sobrepostas: a faixa" })).toBe(
      "hr.regrasSalariais.erro.faixasSobrepostas",
    );
    expect(chaveDoErroDeRegrasSalariais({ message: "regras_salariais_retroactiva: a regra so pode valer" })).toBe("hr.regrasSalariais.erro.retroactiva");
    expect(chaveDoErroDeRegrasSalariais({ message: "regras_salariais_historico_imutavel: x" })).toBe("hr.regrasSalariais.erro.historicoImutavel");
    expect(chaveDoErroDeRegrasSalariais({ message: "outra coisa" })).toBeNull();
  });
});
