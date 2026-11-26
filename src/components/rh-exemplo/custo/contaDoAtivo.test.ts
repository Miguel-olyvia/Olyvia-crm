// O que o ecrã mostra de «Como conta» numa linha que é um ativo: o rótulo vem do ativo («Comprado, 36 meses» / «Alugado, 450,00 € por mês»),
// a escolha de conta ignora conta_* e a lista do mês conta pelo ativo. A farda continua como hoje.
import { describe, expect, it } from "vitest";
import { contaRepartida, contaTodosMeses, contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import { itensDoMes } from "@/components/rh-exemplo/lib/custoItens";
import type { AtivoDoEquipamento, EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { escolhaDaLinha } from "./escolhaConta";
import { rotuloDoEquipamento, rotuloDaConta } from "./rotuloConta";

const HOJE = "2030-06-15";
const t = (chave: string, p?: Record<string, string | number>) => (p ? `${chave}${JSON.stringify(p)}` : chave);

const comprado: AtivoDoEquipamento = {
  forma: "comprado", codigo: "PC-0001", nome: "Portátil", tipo: "portatil", estado: "ativo", valorCompra: 1200, valorResidual: 0,
  dataCompra: "2027-01-05", vidaMeses: 36, vidaOrigem: "pagamento", desativadoEm: null,
};
const alugado: AtivoDoEquipamento = {
  forma: "alugado", codigo: "VIA-0001", nome: "Viatura", tipo: "viatura", estado: "ativo", rendaMensal: 450, inicioAluguer: "2026-01-01",
  fimAluguer: null, desativadoEm: null,
};
const linha = (p: Partial<EquipamentoPessoa> = {}): EquipamentoPessoa => ({
  id: "e1", pessoaId: "p1", tipo: "portatil", descricao: "Portátil", valor: 999, entrega: "2027-01-10", conta: contaUmaVez(), estado: "atribuido",
  devolucao: null, estadoDevolucao: null, autor: "", ...p,
});

describe("rotuloDoEquipamento", () => {
  it("comprado: «comprado, N meses» a partir do ativo, e não do «como conta» da linha", () => {
    expect(rotuloDoEquipamento(t, linha({ ativo: comprado, conta: contaTodosMeses("2027-01") }), "pt")).toBe('rhCustos.conta.ativoComprado{"n":36}');
  });

  it("alugado: «alugado, X por mês» a partir da renda do ativo", () => {
    const r = rotuloDoEquipamento(t, linha({ ativo: alugado }), "pt");
    expect(r).toMatch(/^rhCustos\.conta\.ativoAlugado\{"valor":".*450,00.*"\}$/);
  });

  it("sem ativo (a farda) continua a ser o «como conta» da linha", () => {
    const farda = linha({ tipo: "fardamento", conta: contaRepartida(12), ativo: null });
    expect(rotuloDoEquipamento(t, farda, "pt")).toBe(rotuloDaConta(t, farda.conta, "pt"));
    expect(rotuloDoEquipamento(t, linha({ conta: contaUmaVez() }), "pt")).toBe("rhCustos.conta.umaVez");
  });
});

describe("escolhaDaLinha: a escolha que o formulário «Alterar como conta» abre", () => {
  it("numa linha com ativo ignora conta_* (valor por omissão); sem ativo parte da conta da linha", () => {
    expect(escolhaDaLinha(linha({ ativo: comprado, conta: contaTodosMeses("2027-01", "2027-12") }))).toEqual({ modo: "repartido", meses: "36", inicio: "", fim: "" });
    expect(escolhaDaLinha(linha({ conta: contaRepartida(12) }))).toMatchObject({ modo: "repartido", meses: "12" });
    expect(escolhaDaLinha(linha({ conta: contaTodosMeses("2027-01", "2027-12") }))).toMatchObject({ modo: "todosMeses", inicio: "2027-01", fim: "2027-12" });
  });
});

describe("itensDoMes: o que conta no mês, item a item", () => {
  const ana = linha({ id: "ana", pessoaId: "p1", ativo: comprado, ativoId: "at-1", contaDesde: "2027-01-10", descricao: "Portátil de Ana" });
  const farda = linha({ id: "farda", pessoaId: "p1", tipo: "fardamento", descricao: "Colete", valor: 36, entrega: "2027-01-02", conta: contaUmaVez(), ativo: null });

  it("a linha com ativo conta a quota (33,33 €); a farda conta como hoje; leva o ativo para o rótulo", () => {
    const itens = itensDoMes("p1", [ana, farda], [], "2027-01", HOJE);
    expect(itens.map((i) => [i.id, i.valorMes])).toEqual([["ana", 33.33], ["farda", 36]]);
    expect(itens[0].ativo?.forma).toBe("comprado");
    expect(itens[1].ativo ?? null).toBeNull();
  });

  it("uma linha sem o mês dela (outra pessoa o tem no último dia) não aparece", () => {
    const devolvida = { ...ana, estado: "devolvido" as const, devolucao: "2027-03-10" };
    expect(itensDoMes("p1", [devolvida], [], "2027-03", HOJE)).toEqual([]);
    expect(itensDoMes("p1", [devolvida], [], "2027-02", HOJE)).toHaveLength(1);
  });
});
