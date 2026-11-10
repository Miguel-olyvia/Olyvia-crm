// O motor paga o subsidio de ferias e o de Natal quando a entrada o pede (`subsidiosExtra`); sem ele nada muda.
import { describe, expect, it } from "vitest";
import { calcularProcessamentoPessoa, type EntradaProcessamentoPessoa } from "@/lib/hr/processamentoTotais";

function entrada(duodecimosPct: 0 | 50 | 100 | null, extra: Partial<EntradaProcessamentoPessoa> = {}): EntradaProcessamentoPessoa {
  return {
    totais: {
      planeadoMinutos: 9600, realizadoMinutos: 9600, minutosExtraNormal: 0, minutosFeriadoTrabalhado: 0, minutosDescansoTrabalhado: 0,
      horasExtraNoturnasMinutos: 0, minutosAusenciaRemunerada: 0, diasFeriadoTrabalhados: 0, diasDescansoTrabalhado: 0, faltas: [],
    },
    minutosPorDia: [],
    minutosNoturnosPorFaixa: [],
    regra: null,
    direitoIht: false,
    retribuicao: { valorBase: 1500, periodicidade: "mensal", duodecimosPct },
    codigos: [],
    lancamentos: [],
    ...extra,
  };
}

const FERIAS = { ferias: true, natal: false, proporcao: 1 };

describe("sem subsidiosExtra nada muda", () => {
  it("os dois subsidios ficam a 0 e o total e o de sempre", () => {
    const r = calcularProcessamentoPessoa(entrada(0));
    expect(r.subsidioFerias).toBe(0);
    expect(r.subsidioNatal).toBe(0);
    expect(r.totalBrutoEstimado).toBeCloseTo(1500, 6);
    expect(r.subsidiosDetalhe).toBeUndefined();
    expect(r.avisosSubsidios ?? []).toEqual([]);
  });

  it("ferias:false e natal:false tambem nao pagam nem avisam", () => {
    const r = calcularProcessamentoPessoa(entrada(0, { subsidiosExtra: { ferias: false, natal: false, proporcao: 1 } }));
    expect(r.subsidioFerias).toBe(0);
    expect(r.avisosSubsidios ?? []).toEqual([]);
  });
});

describe("duodecimos: a parte que NAO vai em duodecimos", () => {
  it("0 %: o subsidio inteiro, somado ao total", () => {
    const sem = calcularProcessamentoPessoa(entrada(0));
    const r = calcularProcessamentoPessoa(entrada(0, { subsidiosExtra: FERIAS }));
    expect(r.subsidioFerias).toBe(1500);
    expect(r.subsidioNatal).toBe(0);
    expect(r.totalBrutoEstimado).toBeCloseTo((sem.totalBrutoEstimado ?? 0) + 1500, 6);
  });

  it("50 %: metade", () => {
    const sem = calcularProcessamentoPessoa(entrada(50));
    const r = calcularProcessamentoPessoa(entrada(50, { subsidiosExtra: FERIAS }));
    expect(r.subsidioFerias).toBe(750);
    expect(r.totalBrutoEstimado).toBeCloseTo((sem.totalBrutoEstimado ?? 0) + 750, 6);
  });

  it("100 %: nada (ja vai todo nos duodecimos), e nao ha aviso", () => {
    const sem = calcularProcessamentoPessoa(entrada(100));
    const r = calcularProcessamentoPessoa(entrada(100, { subsidiosExtra: FERIAS }));
    expect(r.subsidioFerias).toBe(0);
    expect(r.totalBrutoEstimado).toBeCloseTo(sem.totalBrutoEstimado ?? 0, 6);
    expect(r.avisosSubsidios ?? []).toEqual([]);
  });

  it("duodecimos por definir (null): nao paga e avisa", () => {
    const r = calcularProcessamentoPessoa(entrada(null, { subsidiosExtra: FERIAS }));
    expect(r.subsidioFerias).toBe(0);
    expect(r.avisosSubsidios).toEqual(["subsidio_sem_duodecimos"]);
    expect(r.avisos).toContain("duodecimos_por_decidir");
  });

  it("ferias e Natal juntos pagam os dois, cada um com o seu valor", () => {
    const r = calcularProcessamentoPessoa(entrada(50, { subsidiosExtra: { ferias: true, natal: true, proporcao: 1 } }));
    expect(r.subsidioFerias).toBe(750);
    expect(r.subsidioNatal).toBe(750);
  });

  it("so o de Natal", () => {
    const r = calcularProcessamentoPessoa(entrada(0, { subsidiosExtra: { ferias: false, natal: true, proporcao: 1 } }));
    expect(r.subsidioFerias).toBe(0);
    expect(r.subsidioNatal).toBe(1500);
  });
});

describe("proporcao, sem vinculo e cessacao", () => {
  it("proporcao 184/365 arredondada ao centimo no valor final", () => {
    const r = calcularProcessamentoPessoa(entrada(0, { subsidiosExtra: { ferias: true, natal: false, proporcao: 184 / 365 } }));
    expect(r.subsidioFerias).toBe(756.16); // 1500 * 184 / 365 = 756,1643
  });

  it("proporcao com 50 %: 1500 x 50 % x 184/365", () => {
    const r = calcularProcessamentoPessoa(entrada(50, { subsidiosExtra: { ferias: true, natal: false, proporcao: 184 / 365 } }));
    expect(r.subsidioFerias).toBe(378.08);
  });

  it("sem vinculo: nao paga e avisa", () => {
    const r = calcularProcessamentoPessoa(entrada(0, { subsidiosExtra: { ferias: true, natal: false, proporcao: null, semVinculo: true } }));
    expect(r.subsidioFerias).toBe(0);
    expect(r.avisosSubsidios).toEqual(["subsidio_sem_vinculo"]);
  });

  it("cessacao: nao paga e avisa", () => {
    const r = calcularProcessamentoPessoa(entrada(0, { subsidiosExtra: { ferias: false, natal: true, proporcao: null, cessacao: true } }));
    expect(r.subsidioNatal).toBe(0);
    expect(r.avisosSubsidios).toEqual(["subsidio_cessacao_por_tratar"]);
  });

  it("contratos com intervalo no ano: nao paga e avisa", () => {
    const r = calcularProcessamentoPessoa(entrada(0, { subsidiosExtra: { ferias: true, natal: false, proporcao: null, comIntervalo: true } }));
    expect(r.subsidioFerias).toBe(0);
    expect(r.avisosSubsidios).toEqual(["subsidio_contratos_com_intervalo"]);
  });

  it("os avisos nao se repetem quando ferias e Natal falham pela mesma razao", () => {
    const r = calcularProcessamentoPessoa(entrada(null, { subsidiosExtra: { ferias: true, natal: true, proporcao: 1 } }));
    expect(r.avisosSubsidios).toEqual(["subsidio_sem_duodecimos"]);
  });

  it("sem retribuicao: nao ha R e nao se paga (o aviso de sem retribuicao ja la esta)", () => {
    const r = calcularProcessamentoPessoa(entrada(0, { retribuicao: null, subsidiosExtra: FERIAS }));
    expect(r.subsidioFerias).toBe(0);
    expect(r.avisos).toContain("sem_retribuicao");
    expect(r.totalBrutoEstimado).toBeNull();
  });
});

describe("detalhe das contas", () => {
  it("devolve R, os duodecimos, a proporcao e os dois valores quando algum subsidio se paga", () => {
    const r = calcularProcessamentoPessoa(entrada(50, { subsidiosExtra: { ferias: true, natal: false, proporcao: 1 } }));
    expect(r.subsidiosDetalhe).toEqual({ r: 1500, duodecimosPct: 50, proporcao: 1, ferias: 750, natal: 0 });
  });

  it("o subsidio entra no total junto com os outros componentes (lancamento manual)", () => {
    const r = calcularProcessamentoPessoa(entrada(0, {
      subsidiosExtra: FERIAS,
      lancamentos: [{ id: "l", periodo_id: "p", pessoa_id: "x", organization_id: "o", descricao: "", valor: 100, tipo: "manual", quantidade: null, codigo_processamento_id: null, anulado_em: null, anulado_por: null, anulado_motivo: null, created_at: "", created_by: null, updated_at: "", updated_by: null }],
    }));
    expect(r.totalBrutoEstimado).toBeCloseTo(1500 + 1500 + 100, 6);
  });
});
