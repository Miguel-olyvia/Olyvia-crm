// O custo lido dos stores de exemplo: o módulo «Custos», as abas Custo das fichas e o «Cálculo do mês» de Setembro têm de
// bater, ao cêntimo. A data é fixa (14/10/2026) para os dados de exemplo serem os mesmos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repor, lerEstado } from "@/components/rh-exemplo/dados/loja";
import { atribuirEquipamento, definirMesCusto, devolverEquipamento, lerCusto, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { calcularMes, fichasDoCalculo } from "@/components/rh-exemplo/fluxosC/salarioEntrada";
import { totaisDaOrganizacao } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { situacaoDoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";
import { custoLidoDaPessoa, linhasDaOrganizacao } from "./custoLido";

const MES = "2026-09";
const cent = (v: number | null): number => Math.round((v ?? 0) * 100);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
  reporCusto();
});

afterEach(() => vi.useRealTimers());

describe("o custo bate com o «Cálculo do mês» de Setembro", () => {
  it("a retribuição de cada pessoa é o total bruto do cálculo, e entram as mesmas pessoas", () => {
    const estado = lerEstado();
    const calculo = calcularMes(fichasDoCalculo(estado.fichas, estado.ordem, 2026, 9), lerFluxosC(), 2026, 9);
    const linhas = linhasDaOrganizacao(MES);
    expect(linhas.map((l) => l.pessoaId)).toEqual(calculo.map((c) => c.pessoaId));
    expect(linhas.length).toBeGreaterThanOrEqual(11);
    for (const c of calculo) {
      expect(linhas.find((l) => l.pessoaId === c.pessoaId)?.retribuicao).toBe(c.resultado.totalBruto);
    }
    expect(cent(totaisDaOrganizacao(linhas).retribuicao)).toBe(cent(calculo.reduce((s, c) => s + (c.resultado.totalBruto ?? 0), 0)));
  });

  it("o custo total do módulo é a soma das abas Custo das fichas, pessoa a pessoa e no total", () => {
    const linhas = linhasDaOrganizacao(MES);
    for (const l of linhas) {
      const ficha = custoLidoDaPessoa(l.pessoaId, MES);
      expect(ficha?.atual.total).toBe(l.total);
      expect(ficha?.retribuicaoMes).toBe(l.retribuicao);
      expect(ficha?.atual.outrosCustos).toBe(l.equipamentosMes);
      expect(ficha?.atual.kmEAjudas).toBe(l.avulsosMes);
    }
    const somaDasFichas = linhas.reduce((s, l) => s + cent(custoLidoDaPessoa(l.pessoaId, MES)?.atual.total ?? null), 0);
    expect(cent(totaisDaOrganizacao(linhas).total)).toBe(somaDasFichas);
  });

  it("os totais fecham: retribuição + encargos + seguro + avulsos + equipamentos = custo total", () => {
    const t = totaisDaOrganizacao(linhasDaOrganizacao(MES));
    expect(t.semValor).toBe(0);
    expect(cent(t.retribuicao) + cent(t.encargos) + cent(t.seguro) + cent(t.avulsos) + cent(t.equipamentos)).toBe(cent(t.total));
    expect(t.avulsos).toBeGreaterThan(0);
    expect(t.equipamentos).toBeGreaterThan(0);
  });
});

describe("os dados de exemplo do custo", () => {
  const todos = () => lerCusto().equipamentos;

  it("quase todas as pessoas têm equipamentos, e há viatura, ferramentas, fardamento, um totalmente amortizado e um devolvido", () => {
    expect(new Set(todos().map((e) => e.pessoaId)).size).toBeGreaterThanOrEqual(11);
    for (const tipo of ["telemovel", "portatil", "viatura", "fardamento", "ferramentas"]) {
      expect(todos().some((e) => e.tipo === tipo)).toBe(true);
    }
    expect(todos().some((e) => situacaoDoEquipamento(e, MES).totalmenteAmortizado)).toBe(true);
    expect(todos().some((e) => e.estado === "devolvido" && e.devolucao !== null)).toBe(true);
    expect(todos().find((e) => e.tipo === "viatura")?.pessoaId).toBe("p-hugo");
  });

  it("ninguém recebe um equipamento antes de ser admitido", () => {
    const fichas = lerEstado().fichas;
    for (const e of todos()) expect(e.entrega >= (fichas[e.pessoaId].pessoa.data_admissao ?? "")).toBe(true);
  });

  it("há valores avulsos (km e ajudas de custo) em Setembro", () => {
    const set = lerCusto().avulsos.filter((a) => a.mesContagem === MES);
    expect(set.some((a) => a.tipo === "km")).toBe(true);
    expect(set.some((a) => a.tipo === "ajuda")).toBe(true);
  });
});

describe("atribuir e devolver equipamento mexem no custo da pessoa e no módulo", () => {
  const novo = { pessoaId: "p-tiago", tipo: "portatil" as const, descricao: "Portátil de teste", valor: 1800, entrega: "2026-09-01", autor: "Sofia" };

  it("atribuir um equipamento de 1800 acrescenta 50 (1800 / 36) ao custo do mês, na ficha e no módulo", () => {
    const antes = custoLidoDaPessoa("p-tiago", MES);
    const totalAntes = totaisDaOrganizacao(linhasDaOrganizacao(MES));
    expect(atribuirEquipamento(novo).erro).toBeNull();
    const depois = custoLidoDaPessoa("p-tiago", MES);
    expect(depois?.equipamentos).toHaveLength((antes?.equipamentos.length ?? 0) + 1);
    expect(cent(depois?.atual.outrosCustos ?? null) - cent(antes?.atual.outrosCustos ?? null)).toBe(5000);
    expect(cent(depois?.atual.total ?? null) - cent(antes?.atual.total ?? null)).toBe(5000);
    const totalDepois = totaisDaOrganizacao(linhasDaOrganizacao(MES));
    expect(cent(totalDepois.equipamentos) - cent(totalAntes.equipamentos)).toBe(5000);
    expect(cent(totalDepois.total) - cent(totalAntes.total)).toBe(5000);
    expect(totalDepois.nEquipamentos).toBe(totalAntes.nEquipamentos + 1);
  });

  it("recusa sem pessoa, sem descrição, com valor 0 e sem data, e não guarda nada", () => {
    const antes = todosOsEquipamentos();
    expect(atribuirEquipamento({ ...novo, pessoaId: "" }).erro).toBe("semPessoa");
    expect(atribuirEquipamento({ ...novo, descricao: " " }).erro).toBe("semDescricao");
    expect(atribuirEquipamento({ ...novo, valor: 0 }).erro).toBe("valorZero");
    expect(atribuirEquipamento({ ...novo, entrega: "" }).erro).toBe("semData");
    expect(todosOsEquipamentos()).toBe(antes);
  });

  it("devolver pára a amortização depois do mês da devolução e fica registado com data e estado", () => {
    const { id } = atribuirEquipamento({ ...novo, entrega: "2026-08-01" });
    expect(devolverEquipamento(id ?? "", "2026-09-10", "").erro).toBe("semEstado");
    expect(devolverEquipamento(id ?? "", "2026-07-01", "bom").erro).toBe("antesDaEntrega");
    expect(devolverEquipamento(id ?? "", "2026-09-10", "desgaste").erro).toBeNull();
    expect(lerCusto().equipamentos.find((e) => e.id === id)).toMatchObject({ estado: "devolvido", devolucao: "2026-09-10", estadoDevolucao: "desgaste" });
    const set = custoLidoDaPessoa("p-tiago", "2026-09");
    const out = custoLidoDaPessoa("p-tiago", "2026-10");
    expect(cent(set?.atual.outrosCustos ?? null) - cent(out?.atual.outrosCustos ?? null)).toBe(5000);
    expect(devolverEquipamento(id ?? "", "2026-09-11", "bom").erro).not.toBeNull();
  });

  it("o mês mostrado só aceita «AAAA-MM» válido", () => {
    definirMesCusto("2026-11");
    expect(lerCusto().mes).toBe("2026-11");
    definirMesCusto("2026-13");
    definirMesCusto("");
    definirMesCusto("novembro");
    expect(lerCusto().mes).toBe("2026-11");
    reporCusto();
    expect(lerCusto().mes).toBe("2026-09");
  });
});

function todosOsEquipamentos() {
  return lerCusto().equipamentos;
}
