import { describe, expect, it } from "vitest";
import { REGRAS_PAGAMENTO_OMISSAO, type HoraExtra } from "./horasExtraRegras";
import {
  arredondarCentimo,
  baseDoMes,
  calcularSalario,
  converterParaMensal,
  diasUteisDoMes,
  subsidioNatalEmPagamento,
  valorDaHora,
  type EntradaSalario,
} from "./salarioRegras";
import { fecharMes, reabrirMes } from "./salarioFecho";

const he = (p: Partial<HoraExtra>): HoraExtra => ({
  id: "h", pessoaId: "p", data: "2026-11-06", minutos: 120, nocturnoMin: 0, origem: "diaria",
  motivoOrigem: "", estado: "confirmada", acimaDoLimite: false, motivoDecisao: null, decididoPor: null, ...p,
});

const entrada = (p: Partial<EntradaSalario> = {}): EntradaSalario => ({
  mes: 11,
  retribuicao: { valor: 1200, periodicidade: "mensal", duodecimosPct: 50, subsidioAlimentacaoDia: 6 },
  diasUteisMes: 21,
  horasPlaneadasMes: 168,
  minutosEmFalta: 0,
  diasElegiveisSubsidio: 21,
  horasExtra: [he({})],
  regrasHE: REGRAS_PAGAMENTO_OMISSAO,
  subsidioFerias: 0,
  pontuais: [{ id: "a", pessoaId: "p", mes: "2026-11", descricao: "prémio de objectivos", valor: 30 }],
  ...p,
});

describe("arredondamento", () => {
  it("meio cêntimo para cima, também nos negativos", () => {
    expect(arredondarCentimo(8.928571)).toBe(8.93);
    expect(arredondarCentimo(20.625)).toBe(20.63);
    expect(arredondarCentimo(1.005)).toBe(1.01);
    expect(arredondarCentimo(-1.005)).toBe(-1.01);
    expect(arredondarCentimo(0)).toBe(0);
  });
});

describe("conversão por periodicidade", () => {
  const base = { diasUteisMes: 21, horasPlaneadasMes: 168 };
  it("mensal, anual, semanal, diária e à hora", () => {
    expect(converterParaMensal({ ...base, valor: 1200, periodicidade: "mensal" })).toBe(1200);
    expect(converterParaMensal({ ...base, valor: 14000, periodicidade: "anual" })).toBeCloseTo(1166.6667, 3);
    expect(converterParaMensal({ ...base, valor: 300, periodicidade: "semanal" })).toBe(1300);
    expect(converterParaMensal({ ...base, valor: 50, periodicidade: "diaria" })).toBe(1050);
    expect(converterParaMensal({ ...base, valor: 7, periodicidade: "hora" })).toBe(1176);
  });
});

describe("duodécimos, valor da hora e Natal", () => {
  it("base a 0 %, 50 % e 100 % (exemplos da Joana e da Eva)", () => {
    expect(baseDoMes(1200, 0)).toBe(1200);
    expect(baseDoMes(1200, 50)).toBe(1300);
    expect(arredondarCentimo(baseDoMes(1000, 100))).toBe(1166.67);
    expect(baseDoMes(1000, null)).toBe(1000);
  });
  it("valor da hora não se arredonda; sem horas não existe", () => {
    expect(valorDaHora(1200, 168)).toBeCloseTo(7.142857, 6);
    expect(valorDaHora(1200, 0)).toBeNull();
  });
  it("Natal só em Dezembro: tudo a 0 %, metade a 50 %, nada a 100 %", () => {
    expect(subsidioNatalEmPagamento(1000, 0, 12)).toBe(1000);
    expect(subsidioNatalEmPagamento(1000, 50, 12)).toBe(500);
    expect(subsidioNatalEmPagamento(1000, 100, 12)).toBe(0);
    expect(subsidioNatalEmPagamento(1000, 0, 11)).toBe(0);
  });
  it("dias úteis de Novembro de 2026 = 21", () => {
    expect(diasUteisDoMes(2026, 11)).toBe(21);
    expect(diasUteisDoMes(2027, 2)).toBe(20);
  });
});

describe("cálculo completo", () => {
  it("Joana: 1.300 + 19,64 + 126 + 30 = 1.475,64", () => {
    const r = calcularSalario(entrada());
    expect(r.totalBruto).toBe(1475.64);
    expect(r.linhas.filter((l) => l.chave.startsWith("he_")).map((l) => l.valor)).toEqual([8.93, 10.71]);
    expect(r.avisos).toEqual([]);
  });
  it("Duarte: desconto de 2 h = 14,29 e total 1.301,21", () => {
    const r = calcularSalario(entrada({
      retribuicao: { valor: 1200, periodicidade: "mensal", duodecimosPct: 0, subsidioAlimentacaoDia: 5.5 },
      minutosEmFalta: 120, horasExtra: [], pontuais: [], diasElegiveisSubsidio: 21,
    }));
    expect(r.linhas.find((l) => l.chave === "desconto")?.valor).toBe(-14.29);
    expect(r.totalBruto).toBe(1301.21);
  });
  it("Eva: base 1.166,67 + subsídio 20 × 6 = 1.286,67", () => {
    const r = calcularSalario(entrada({
      retribuicao: { valor: 1000, periodicidade: "mensal", duodecimosPct: 100, subsidioAlimentacaoDia: 6 },
      diasElegiveisSubsidio: 20, horasExtra: [], pontuais: [],
    }));
    expect(r.totalBruto).toBe(1286.67);
  });
  it("só as horas extra confirmadas entram", () => {
    const r = calcularSalario(entrada({ horasExtra: [he({ estado: "pendente" }), he({ id: "x", estado: "rejeitada" })], pontuais: [] }));
    expect(r.linhas.some((l) => l.chave.startsWith("he_"))).toBe(false);
  });
  it("Dezembro acrescenta o subsídio de Natal e o de férias em pagamento", () => {
    const r = calcularSalario(entrada({ mes: 12, horasExtra: [], pontuais: [], subsidioFerias: 100, retribuicao: { valor: 1000, periodicidade: "mensal", duodecimosPct: 50, subsidioAlimentacaoDia: null } }));
    expect(r.linhas.find((l) => l.chave === "subsidio_natal")?.valor).toBe(500);
    expect(r.linhas.find((l) => l.chave === "subsidio_ferias")?.valor).toBe(100);
    expect(r.avisos).toContain("sem_subsidio_pessoa");
  });
  it("sem retribuição fica sem valor, com aviso", () => {
    const r = calcularSalario(entrada({ retribuicao: null }));
    expect(r.totalBruto).toBeNull();
    expect(r.avisos).toEqual(["sem_retribuicao"]);
  });
  it("sem horas planeadas não há desconto nem horas extra, com aviso", () => {
    const r = calcularSalario(entrada({ horasPlaneadasMes: 0, minutosEmFalta: 60 }));
    expect(r.valorHora).toBeNull();
    expect(r.avisos).toContain("sem_horas_planeadas");
    expect(r.linhas.some((l) => l.chave === "desconto")).toBe(false);
  });
  it("duodécimos por decidir contam como 0 % com aviso, e o total nunca fica abaixo de zero", () => {
    const r = calcularSalario(entrada({ retribuicao: { valor: 100, periodicidade: "mensal", duodecimosPct: null, subsidioAlimentacaoDia: null }, horasExtra: [], pontuais: [{ id: "n", pessoaId: "p", mes: "2026-11", descricao: "d", valor: -500 }] }));
    expect(r.avisos).toContain("duodecimos_por_decidir");
    expect(r.totalBruto).toBe(0);
  });
  it("o total é a soma das linhas já arredondadas", () => {
    const r = calcularSalario(entrada());
    expect(r.totalBruto).toBe(Math.round(r.linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100);
  });
});

describe("fechar e reabrir o mês", () => {
  it("o fecho guarda cópia: alterar o original não muda o recibo", () => {
    const resultado = calcularSalario(entrada());
    const fecho = fecharMes("2026-11", "Sofia", "2026-12-01T10:00:00Z", [{ pessoaId: "p", pessoaNome: "Joana", entrada: entrada(), resultado }]);
    const antes = fecho.recibos.p.resultado.totalBruto;
    resultado.totalBruto = 1;
    resultado.linhas[0].valor = 9999;
    expect(fecho.recibos.p.resultado.totalBruto).toBe(antes);
    expect(fecho.totalBruto).toBe(1475.64);
  });
  it("o recibo é imutável", () => {
    const fecho = fecharMes("2026-11", "Sofia", "t", [{ pessoaId: "p", pessoaNome: "J", entrada: entrada(), resultado: calcularSalario(entrada()) }]);
    expect(Object.isFrozen(fecho)).toBe(true);
    expect(Object.isFrozen(fecho.recibos.p.resultado.linhas[0])).toBe(true);
    expect(() => { (fecho.recibos.p.resultado as { totalBruto: number | null }).totalBruto = 0; }).toThrow();
  });
  it("reabrir exige autorização e motivo, e regista quem e porquê", () => {
    const fecho = fecharMes("2026-11", "Sofia", "t", []);
    expect(reabrirMes(fecho, "Sofia", "t2", "erro no prémio", false)).toEqual({ ok: false, erro: "sem_autorizacao" });
    expect(reabrirMes(fecho, "Sofia", "t2", " a ", true)).toEqual({ ok: false, erro: "motivo_obrigatorio" });
    const r = reabrirMes(fecho, "Sofia", "t2", " erro no prémio ", true);
    expect(r).toEqual({ ok: true, registo: { mes: "2026-11", reabertoPor: "Sofia", reabertoEm: "t2", motivo: "erro no prémio" } });
  });
});
