// O valor atual de um ativo, calculado no ecrã (depreciação linear por tempo), com os mesmos arredondamentos do RH (`comoConta.ts`).
import { describe, expect, it } from "vitest";
import { contaRepartida, situacaoDoItem, quotaMensal } from "@/components/rh-exemplo/lib/comoConta";
import type { Ativo, CatEquipamentoLigado } from "./tipos";
import { depreciacaoMensal, valorAtual, vidaEfetivaMeses } from "./valorAtivo";

const BASE: Ativo = {
  id: "a1", grupo: "estrutura", tipo: "mobiliario", nome: "Mesa", codigo: null, numSerie: null, catEquipamentoId: null,
  dataCompra: "2026-01-15", valorCompra: 1200, valorResidual: 0, vidaMeses: 12, manutencaoAno: 0, centroCustoId: null,
  localizacao: null, notas: null, estado: "ativo", desativadoEm: null, desativadoMotivo: null, desativadoNota: null,
  catEquipamento: null, atribuicao: null, ligado: false, forma: "comprado", rendaMensal: null, inicioAluguer: null, fimAluguer: null, vidaOrigem: null, armazem: null, armazemLigado: false, ocupacoes: [],
};
const com = (p: Partial<Ativo>): Ativo => ({ ...BASE, ...p });
const CAT = (p: Partial<CatEquipamentoLigado> = {}): CatEquipamentoLigado => ({ id: "c1", nome: "Berbequim", vidaAnos: 5, vidaHoras: null, usoAnoHoras: null, ...p });

describe("valorAtivo: depreciação linear", () => {
  it("a quota mensal é (compra - residual) / vida", () => {
    expect(depreciacaoMensal(com({}))).toBe(100);
    expect(depreciacaoMensal(com({ valorResidual: 200 }))).toBe(83.33);
  });

  it("o mês da compra já conta uma quota (como o RH)", () => {
    expect(valorAtual(com({}), "2026-01")).toBe(1100);
    expect(valorAtual(com({}), "2026-06")).toBe(600);
  });

  it("antes da data de compra o valor atual é a compra", () => {
    expect(valorAtual(com({}), "2025-12")).toBe(1200);
  });

  it("o residual é respeitado: depois da vida o valor atual é o residual", () => {
    const a = com({ valorResidual: 200, vidaMeses: 10 });
    expect(valorAtual(a, "2026-10")).toBe(200);
    expect(valorAtual(a, "2030-01")).toBe(200);
  });

  it("a desativação corta: depois dela o valor deixa de descer", () => {
    const a = com({ estado: "desativado", desativadoEm: "2026-04-10", desativadoMotivo: "vendido" });
    expect(valorAtual(a, "2026-04")).toBe(800);
    expect(valorAtual(a, "2027-01")).toBe(800);
  });

  it("vida de 600 meses (acima dos 120 do RH): linear, sem cortar a vida", () => {
    const a = com({ vidaMeses: 600, valorCompra: 60000 });
    expect(depreciacaoMensal(a)).toBe(100);
    expect(valorAtual(a, "2026-01")).toBe(59900);
    expect(valorAtual(a, "2036-01")).toBe(60000 - 100 * 121);
    expect(valorAtual(a, "2076-01")).toBe(0);
    expect(valorAtual(a, "2090-01")).toBe(0);
  });

  it("nunca desce abaixo do residual nem passa da compra, em nenhuma vida nem mês (1000 € a 600 meses dava -0,33 €)", () => {
    for (const [compra, residual, vida] of [[1000, 0, 600], [100, 0, 240], [1000, 150, 600], [999.99, 0, 599], [0.1, 0, 300], [5000, 5000, 600]] as const) {
      const a = com({ valorCompra: compra, valorResidual: residual, vidaMeses: vida });
      let anterior = compra;
      for (let n = -2; n <= vida + 3; n += 1) {
        const mes = `${2026 + Math.floor((n + 0) / 12)}-${String(((n % 12) + 12) % 12 + 1).padStart(2, "0")}`;
        const v = valorAtual(a, mes)!;
        expect(v, `${compra} € a ${vida} meses, mês ${n}: ${v}`).toBeGreaterThanOrEqual(residual);
        expect(v).toBeLessThanOrEqual(compra);
        expect(v, "só desce").toBeLessThanOrEqual(anterior);
        anterior = v;
      }
      expect(valorAtual(a, "2099-12")).toBe(residual);
    }
  });

  it("bate com o RH (comoConta) em todas as vidas até 120 meses, mês a mês", () => {
    for (const vida of [1, 7, 12, 36, 120]) {
      for (const compra of [1200, 999.99, 0.1]) {
        const a = com({ vidaMeses: vida, valorCompra: compra, valorResidual: 0 });
        for (const mes of ["2025-12", "2026-01", "2026-02", "2026-08", "2028-03", "2036-02", "2040-01"]) {
          const rh = situacaoDoItem({ valor: compra, data: a.dataCompra, conta: contaRepartida(vida), devolucao: null }, mes);
          expect(valorAtual(a, mes), `${vida} meses, ${compra} €, ${mes}`).toBe(Math.round((compra - rh.contado) * 100) / 100);
        }
        expect(depreciacaoMensal(a)).toBe(quotaMensal(compra, vida));
      }
    }
  });
});

describe("valorAtivo: a vida de um ativo de serviço", () => {
  it("sem vida_meses usa a vida do modelo do catálogo (anos x 12)", () => {
    const a = com({ grupo: "servico", tipo: null, vidaMeses: null, catEquipamentoId: "c1", catEquipamento: CAT() });
    expect(vidaEfetivaMeses(a)).toBe(60);
    expect(valorAtual(a, "2026-01")).toBe(1180);
  });

  it("com vida_meses própria, essa é que vale", () => {
    const a = com({ grupo: "servico", tipo: null, vidaMeses: 24, catEquipamento: CAT() });
    expect(vidaEfetivaMeses(a)).toBe(24);
  });

  it("modelo só com vida em horas: sem depreciação no tempo (null)", () => {
    const a = com({ grupo: "servico", tipo: null, vidaMeses: null, catEquipamento: CAT({ vidaAnos: null, vidaHoras: 2000 }) });
    expect(vidaEfetivaMeses(a)).toBeNull();
    expect(depreciacaoMensal(a)).toBeNull();
    expect(valorAtual(a, "2026-06")).toBeNull();
  });

  it("serviço sem modelo lido e sem vida: null", () => {
    expect(valorAtual(com({ grupo: "servico", vidaMeses: null }), "2026-06")).toBeNull();
  });
});
