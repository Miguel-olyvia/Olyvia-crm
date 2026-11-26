// A conta de cada mês de um ativo (comprado ou alugado) e de quem a paga, a mesma para o RH e para os Ativos (desenho v4, secção 2).
import { describe, expect, it } from "vitest";
import { valorNoMes, contaTodosMeses } from "@/components/rh-exemplo/lib/comoConta";
import { arredondar } from "@/components/rh-exemplo/lib/custo";
import {
  amortizadoAte,
  diaDeReferencia,
  donoDoMes,
  mesesDecorridos,
  quotaDoMes,
  rendaDoMes,
  ultimoDiaDoMes,
  valorDoAtivoNoMes,
  type AtivoAlugadoConta,
  type AtivoCompradoConta,
  type OcupacaoParaConta,
} from "./contaAtivo";

const HOJE = "2030-06-15";
const mesesEntre = (de: string, ate: string): string[] => {
  const lista: string[] = [];
  let [a, m] = de.split("-").map(Number);
  while (`${a}-${String(m).padStart(2, "0")}` <= ate) {
    lista.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return lista;
};

const portatil: AtivoCompradoConta = { forma: "comprado", valorCompra: 1200, valorResidual: 0, dataCompra: "2027-01-05", vidaMeses: 36, desativadoEm: null };
const viatura: AtivoAlugadoConta = { forma: "alugado", rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: "2029-12-31", desativadoEm: null };

describe("ultimoDiaDoMes", () => {
  it("dá o último dia, com bissexto", () => {
    expect(ultimoDiaDoMes("2027-02")).toBe("2027-02-28");
    expect(ultimoDiaDoMes("2028-02")).toBe("2028-02-29");
    expect(ultimoDiaDoMes("2027-12")).toBe("2027-12-31");
    expect(ultimoDiaDoMes("2027-04")).toBe("2027-04-30");
  });
});

describe("amortização do comprado", () => {
  it("1 200 € a 36 meses: quota de 33,33 € e o último mês leva o resto (33,45 €)", () => {
    expect(quotaDoMes(portatil, "2027-01")).toBe(33.33);
    expect(quotaDoMes(portatil, "2029-11")).toBe(33.33);
    expect(quotaDoMes(portatil, "2029-12")).toBe(33.45);
    expect(quotaDoMes(portatil, "2030-01")).toBe(0);
    expect(quotaDoMes(portatil, "2026-12")).toBe(0);
  });

  it("a soma das quotas é exatamente compra menos residual", () => {
    const soma = arredondar(mesesEntre("2026-01", "2032-12").reduce((s, m) => s + quotaDoMes(portatil, m), 0));
    expect(soma).toBe(1200);
    const comResidual: AtivoCompradoConta = { ...portatil, valorResidual: 200 };
    expect(arredondar(mesesEntre("2026-01", "2032-12").reduce((s, m) => s + quotaDoMes(comResidual, m), 0))).toBe(1000);
  });

  it("amortizado até um mês: 14 meses = 466,62 € e meses decorridos 14", () => {
    expect(amortizadoAte(portatil, "2028-02")).toBe(466.62);
    expect(mesesDecorridos(portatil, "2028-02")).toBe(14);
    expect(amortizadoAte(portatil, "2026-12")).toBe(0);
    expect(mesesDecorridos(portatil, "2026-12")).toBe(0);
    expect(amortizadoAte(portatil, "2040-01")).toBe(1200);
    expect(mesesDecorridos(portatil, "2040-01")).toBe(36);
  });

  it("desativado a meio: a quota pára no mês da desativação", () => {
    const parado: AtivoCompradoConta = { ...portatil, desativadoEm: "2027-06-20" };
    expect(quotaDoMes(parado, "2027-06")).toBe(33.33);
    expect(quotaDoMes(parado, "2027-07")).toBe(0);
    expect(mesesDecorridos(parado, "2030-01")).toBe(6);
    expect(amortizadoAte(parado, "2030-01")).toBe(199.98);
  });

  it("vida de 600 meses: a soma continua a chegar ao valor exato", () => {
    const longo: AtivoCompradoConta = { ...portatil, valorCompra: 1000, vidaMeses: 600 };
    expect(arredondar(mesesEntre("2027-01", "2077-12").reduce((s, m) => s + quotaDoMes(longo, m), 0))).toBe(1000);
  });

  it("sem vida em meses não amortiza", () => {
    expect(quotaDoMes({ ...portatil, vidaMeses: null }, "2027-03")).toBe(0);
    expect(amortizadoAte({ ...portatil, vidaMeses: null }, "2027-03")).toBe(0);
    expect(mesesDecorridos({ ...portatil, vidaMeses: null }, "2027-03")).toBe(0);
  });
});

describe("renda do alugado", () => {
  it("só nos meses que o contrato toca, inteira também no primeiro e no último", () => {
    const meio: AtivoAlugadoConta = { ...viatura, inicioAluguer: "2026-03-20", fimAluguer: "2026-05-10" };
    expect(rendaDoMes(meio, "2026-02")).toBe(0);
    expect(rendaDoMes(meio, "2026-03")).toBe(450);
    expect(rendaDoMes(meio, "2026-04")).toBe(450);
    expect(rendaDoMes(meio, "2026-05")).toBe(450);
    expect(rendaDoMes(meio, "2026-06")).toBe(0);
  });

  it("sem fim continua; desativado, pára no mês da desativação", () => {
    const semFim: AtivoAlugadoConta = { ...viatura, fimAluguer: null };
    expect(rendaDoMes(semFim, "2040-01")).toBe(450);
    const desativado: AtivoAlugadoConta = { ...semFim, desativadoEm: "2026-08-12" };
    expect(rendaDoMes(desativado, "2026-08")).toBe(450);
    expect(rendaDoMes(desativado, "2026-09")).toBe(0);
  });

  it("valorDoAtivoNoMes escolhe a conta pela forma", () => {
    expect(valorDoAtivoNoMes(portatil, "2027-01")).toBe(33.33);
    expect(valorDoAtivoNoMes(viatura, "2027-01")).toBe(450);
  });
});

describe("dia de referência e dono do mês", () => {
  it("é o último dia do mês, ou hoje no mês a decorrer", () => {
    expect(diaDeReferencia(portatil, "2028-02", HOJE)).toBe("2028-02-29");
    expect(diaDeReferencia(portatil, "2030-06", HOJE)).toBe("2030-06-15");
    expect(diaDeReferencia(portatil, "2030-07", HOJE)).toBe("2030-07-31");
  });

  it("o fim do aluguer e a desativação cortam o dia", () => {
    const acaba: AtivoAlugadoConta = { ...viatura, fimAluguer: "2029-12-15" };
    expect(diaDeReferencia(acaba, "2029-12", HOJE)).toBe("2029-12-15");
    expect(diaDeReferencia({ ...portatil, desativadoEm: "2027-06-20" }, "2027-06", HOJE)).toBe("2027-06-20");
  });

  it("o dia da devolução conta: agosto é de quem devolve a 31/08", () => {
    const joao: OcupacaoParaConta = { contaDesde: "2026-01-01", devolucao: "2027-08-31" };
    const ana: OcupacaoParaConta = { contaDesde: "2027-09-05", devolucao: "2029-12-31" };
    expect(donoDoMes(joao, viatura, "2027-08", HOJE)).toBe(true);
    expect(donoDoMes(ana, viatura, "2027-08", HOJE)).toBe(false);
    expect(donoDoMes(ana, viatura, "2027-09", HOJE)).toBe(true);
    expect(donoDoMes(joao, viatura, "2027-09", HOJE)).toBe(false);
  });

  it("uma pessoa que devolve a meio do mês perde esse mês se ninguém o tem a 31", () => {
    const ana: OcupacaoParaConta = { contaDesde: "2027-01-10", devolucao: "2028-01-10" };
    expect(donoDoMes(ana, portatil, "2027-12", HOJE)).toBe(true);
    expect(donoDoMes(ana, portatil, "2028-01", HOJE)).toBe(false);
  });

  it("troca no mesmo dia: quem devolve fica com o mês e a entrega seguinte começa no dia seguinte (conta_desde)", () => {
    // O João devolve a 31/08 e a Ana recebe no próprio dia 31/08: a base devolve conta_desde = 01/09 para a Ana.
    const joao: OcupacaoParaConta = { contaDesde: "2026-01-01", devolucao: "2027-08-31" };
    const ana: OcupacaoParaConta = { contaDesde: "2027-09-01", devolucao: null };
    expect(donoDoMes(joao, viatura, "2027-08", HOJE)).toBe(true);
    expect(donoDoMes(ana, viatura, "2027-08", HOJE)).toBe(false);
    expect(donoDoMes(ana, viatura, "2027-09", HOJE)).toBe(true);
  });
});

describe("os exemplos do desenho, mês a mês, pessoa a pessoa", () => {
  const dono = (ocupacoes: { nome: string; o: OcupacaoParaConta }[], a: AtivoCompradoConta | AtivoAlugadoConta, mes: string): string => {
    const quem = ocupacoes.filter((x) => donoDoMes(x.o, a, mes, HOJE));
    expect(quem.length).toBeLessThanOrEqual(1);
    return quem[0]?.nome ?? "estrutura";
  };

  it("portátil: Ana 399,96 (12 meses), estrutura 66,66 (2 meses), Bruno 733,38 (22 meses), total 1 200", () => {
    const ocupacoes = [
      { nome: "Ana", o: { contaDesde: "2027-01-10", devolucao: "2028-01-10" } },
      { nome: "Bruno", o: { contaDesde: "2028-03-15", devolucao: null } },
    ];
    const somas: Record<string, { valor: number; meses: number }> = {};
    for (const mes of mesesEntre("2027-01", "2029-12")) {
      const quem = dono(ocupacoes, portatil, mes);
      const atual = somas[quem] ?? { valor: 0, meses: 0 };
      somas[quem] = { valor: arredondar(atual.valor + valorDoAtivoNoMes(portatil, mes)), meses: atual.meses + 1 };
    }
    expect(somas).toEqual({ Ana: { valor: 399.96, meses: 12 }, estrutura: { valor: 66.66, meses: 2 }, Bruno: { valor: 733.38, meses: 22 } });
    expect(arredondar(somas.Ana.valor + somas.estrutura.valor + somas.Bruno.valor)).toBe(1200);
    // Quando o Bruno recebe (março de 2028): já amortizado 466,62 €, falta 733,38 € em 22 meses.
    expect(amortizadoAte(portatil, "2028-02")).toBe(466.62);
    expect(arredondar(1200 - amortizadoAte(portatil, "2028-02"))).toBe(733.38);
    expect(36 - mesesDecorridos(portatil, "2028-02")).toBe(22);
  });

  it("viatura em renting a 450 €/mês: João 9 000 € (20 meses) e Ana 12 600 € (28 meses), estrutura 0", () => {
    const ocupacoes = [
      { nome: "João", o: { contaDesde: "2026-01-01", devolucao: "2027-08-31" } },
      { nome: "Ana", o: { contaDesde: "2027-09-05", devolucao: "2029-12-31" } },
    ];
    const somas: Record<string, { valor: number; meses: number }> = {};
    for (const mes of mesesEntre("2026-01", "2029-12")) {
      const quem = dono(ocupacoes, viatura, mes);
      const atual = somas[quem] ?? { valor: 0, meses: 0 };
      somas[quem] = { valor: atual.valor + rendaDoMes(viatura, mes), meses: atual.meses + 1 };
    }
    expect(somas).toEqual({ João: { valor: 9000, meses: 20 }, Ana: { valor: 12600, meses: 28 } });
  });

  it("variante: se a Ana só a recebe a 01/10/2027, setembro vai para a estrutura", () => {
    const ocupacoes = [
      { nome: "João", o: { contaDesde: "2026-01-01", devolucao: "2027-08-31" } },
      { nome: "Ana", o: { contaDesde: "2027-10-01", devolucao: null } },
    ];
    expect(dono(ocupacoes, viatura, "2027-09")).toBe("estrutura");
    expect(dono(ocupacoes, viatura, "2027-10")).toBe("Ana");
  });

  it("contrato que acaba a 15/12: dezembro é de quem a tinha a 15/12", () => {
    const acaba: AtivoAlugadoConta = { ...viatura, fimAluguer: "2029-12-15" };
    const ana: OcupacaoParaConta = { contaDesde: "2027-09-05", devolucao: "2029-12-15" };
    expect(donoDoMes(ana, acaba, "2029-12", HOJE)).toBe(true);
    expect(rendaDoMes(acaba, "2029-12")).toBe(450);
    expect(rendaDoMes(acaba, "2030-01")).toBe(0);
  });
});

describe("a renda do «todos os meses» do RH duplicava numa troca no mesmo mês; a conta nova não", () => {
  it("comoConta.ts conta agosto no João e na Ana (900 €); pela regra do dono só a Ana tem agosto (450 €)", () => {
    // João devolve a 20/08/2027, Ana recebe a 25/08/2027. O «todos os meses» conta do mês da entrega até ao mês da devolução, inclusive.
    const joaoAntigo = valorNoMes({ valor: 450, data: "2026-01-01", conta: contaTodosMeses("2026-01"), devolucao: "2027-08-20" }, "2027-08");
    const anaAntigo = valorNoMes({ valor: 450, data: "2027-08-25", conta: contaTodosMeses("2027-08"), devolucao: null }, "2027-08");
    expect(joaoAntigo + anaAntigo).toBe(900);

    const joao: OcupacaoParaConta = { contaDesde: "2026-01-01", devolucao: "2027-08-20" };
    const ana: OcupacaoParaConta = { contaDesde: "2027-08-25", devolucao: null };
    const pagos = [joao, ana].filter((o) => donoDoMes(o, viatura, "2027-08", HOJE)).length;
    // Nenhuma das duas o tem a 31/08? A Ana tem-no (entrega 25/08, sem devolução): só ela paga agosto.
    expect(pagos).toBe(1);
    expect(donoDoMes(ana, viatura, "2027-08", HOJE)).toBe(true);
    expect(donoDoMes(joao, viatura, "2027-08", HOJE)).toBe(false);
  });
});
