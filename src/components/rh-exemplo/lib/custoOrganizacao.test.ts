import { describe, expect, it } from "vitest";
import { contaRepartida, contaUmaVez } from "./comoConta";
import type { AvulsoCusto } from "./custoMes";
import {
  composicaoDoCusto, custoDaPessoaNoMes, filtrarLinhas, montarLinhaCusto, ordenarLinhas, SEM_FILTRO, totaisDaOrganizacao,
  type ContextoCusto, type PessoaParaCusto,
} from "./custoOrganizacao";
import type { EquipamentoPessoa } from "./equipamentos";

const pessoa = (parcial: Partial<PessoaParaCusto> = {}): PessoaParaCusto => ({
  pessoaId: "p1", nome: "Inês Cardoso", cargo: "Gerente", centroId: "loc-porto", centro: "Loja Porto", filialId: "fil-porto", filial: "Porto",
  tipoContrato: "sem_termo", retribuicaoMes: 1200, horasSemanais: 40, ...parcial,
});

const km: AvulsoCusto = {
  id: "a1", pessoaId: "p1", tipo: "km", data: "2026-09-09", conta: contaUmaVez(), descricao: "Visita", quantidade: 120,
  valorUnitario: 0.4, valor: 48, autor: "RH", criadoEm: "2026-09-09T10:00:00Z", anulado: null,
};
const ajuda: AvulsoCusto = { ...km, id: "a2", tipo: "ajuda", quantidade: 2, valorUnitario: 25, valor: 50 };
const portatil: EquipamentoPessoa = {
  id: "e1", pessoaId: "p1", tipo: "portatil", descricao: "Portátil", valor: 900, entrega: "2026-01-15", conta: contaRepartida(), estado: "atribuido",
  devolucao: null, estadoDevolucao: null, autor: "RH",
};

const contexto = (parcial: Partial<ContextoCusto> = {}): ContextoCusto => ({
  mes: "2026-09", avulsos: [km, ajuda], equipamentos: [portatil], excecoes: {},
  definicoes: { taxaEmpresa: 23.75, seguro: 1.5, valorPorKm: 0.4, ajudaPorDia: 25 }, ...parcial,
});

describe("o custo de uma pessoa num mês", () => {
  it("separa encargos e seguro sem perder um cêntimo: taxa 285 + seguro 18 = 303", () => {
    const r = custoDaPessoaNoMes(pessoa(), contexto());
    expect(r.encargos).toBe(303);
    expect(r.seguro).toBe(18);
    expect(r.encargosTaxa).toBe(285);
    expect(r.encargosTaxa + r.seguro).toBe(r.encargos);
  });

  it("o total é retribuição + avulsos + encargos + seguro + equipamentos (1200 + 98 + 285 + 18 + 25 = 1626)", () => {
    const r = custoDaPessoaNoMes(pessoa(), contexto());
    expect(r.kmEAjudas).toBe(98);
    expect(r.outrosCustos).toBe(25);
    expect(r.nEquipamentos).toBe(1);
    expect(r.total).toBe(1626);
  });

  it("só conta o que é da pessoa: avulsos e equipamentos de outra pessoa ficam de fora", () => {
    const r = custoDaPessoaNoMes(pessoa(), contexto({ avulsos: [{ ...km, pessoaId: "p2" }], equipamentos: [{ ...portatil, pessoaId: "p2" }] }));
    expect(r).toMatchObject({ kmEAjudas: 0, outrosCustos: 0, nEquipamentos: 0, total: 1503 });
  });

  it("a exceção de taxa da pessoa muda os encargos", () => {
    const r = custoDaPessoaNoMes(pessoa(), contexto({ excecoes: { p1: 10 } }));
    expect(r.encargosTaxa).toBe(120);
  });

  it("sem retribuição o custo fica sem valor, mas o equipamento e os avulsos continuam a ser vistos", () => {
    const linha = montarLinhaCusto(pessoa({ retribuicaoMes: null }), contexto());
    expect(linha).toMatchObject({ retribuicao: null, total: null, porHora: null, avulsosMes: 98, equipamentosMes: 25, composicao: [] });
  });
});

describe("a linha e a composição", () => {
  it("o custo por hora é o total a dividir pelas horas previstas do mês", () => {
    const linha = montarLinhaCusto(pessoa(), contexto());
    // Setembro de 2026 tem 22 dias úteis: 22 x 40 / 5 = 176 h; 1626 / 176 = 9,24.
    expect(linha.porHora).toBe(9.24);
  });

  it("a composição tem uma percentagem por parte e fecha em 100 (com a tolerância de uma casa)", () => {
    const partes = montarLinhaCusto(pessoa(), contexto()).composicao;
    expect(partes.map((p) => p.chave)).toEqual(["retribuicao", "avulsos", "encargos", "seguro", "equipamentos"]);
    expect(partes[0]).toMatchObject({ valor: 1200, pct: 73.8 });
    expect(Math.abs(partes.reduce((s, p) => s + p.pct, 0) - 100)).toBeLessThan(0.5);
  });

  it("sem custo para repartir não há composição", () => {
    expect(composicaoDoCusto({ retribuicao: 0, avulsos: 0, encargos: 0, seguro: 0, equipamentos: 0 }, 0)).toEqual([]);
    expect(composicaoDoCusto({ retribuicao: 0, avulsos: 0, encargos: 0, seguro: 0, equipamentos: 0 }, null)).toEqual([]);
  });
});

describe("os totais da organização", () => {
  const linhas = () => [
    montarLinhaCusto(pessoa(), contexto()),
    montarLinhaCusto(pessoa({ pessoaId: "p2", nome: "Rui Amaral", retribuicaoMes: 2000, centroId: "loc-lisboa", filialId: "fil-lisboa", tipoContrato: "termo_certo" }), contexto()),
    montarLinhaCusto(pessoa({ pessoaId: "p3", nome: "Ana Sem Salário", retribuicaoMes: null }), contexto()),
  ];

  it("somam as colunas e batem: retribuição + encargos + seguro + avulsos + equipamentos = custo total", () => {
    const t = totaisDaOrganizacao(linhas());
    expect(t.pessoas).toBe(3);
    expect(t.retribuicao).toBe(3200);
    expect(t.semValor).toBe(1);
    // 1626 (Inês) + 2505 (Rui: 2000 + 505 de encargos); quem não tem retribuição não soma.
    expect(t.total).toBe(4131);
  });

  it("a soma das partes é o total (sem contar quem não tem retribuição)", () => {
    const t = totaisDaOrganizacao(linhas().slice(0, 2));
    expect(Math.round((t.retribuicao + t.encargos + t.seguro + t.avulsos + t.equipamentos) * 100)).toBe(Math.round(t.total * 100));
  });
});

describe("ordenar e filtrar", () => {
  const todas = () => [
    montarLinhaCusto(pessoa({ pessoaId: "p1", nome: "Inês Cardoso" }), contexto({ avulsos: [], equipamentos: [] })),
    montarLinhaCusto(pessoa({ pessoaId: "p2", nome: "Rui Amaral", retribuicaoMes: 2000, centroId: "loc-lisboa", centro: "Loja Lisboa", filialId: "fil-lisboa", tipoContrato: "termo_certo" }), contexto({ avulsos: [], equipamentos: [] })),
    montarLinhaCusto(pessoa({ pessoaId: "p3", nome: "André Silva", retribuicaoMes: null, centroId: null, centro: null }), contexto({ avulsos: [], equipamentos: [] })),
  ];

  it("ordena por custo total a descer com os vazios sempre no fim, e por nome com acentos", () => {
    expect(ordenarLinhas(todas(), "total", "desc").map((l) => l.nome)).toEqual(["Rui Amaral", "Inês Cardoso", "André Silva"]);
    expect(ordenarLinhas(todas(), "total", "asc").map((l) => l.nome)).toEqual(["Inês Cardoso", "Rui Amaral", "André Silva"]);
    expect(ordenarLinhas(todas(), "nome", "asc").map((l) => l.nome)).toEqual(["André Silva", "Inês Cardoso", "Rui Amaral"]);
  });

  it("não altera a lista de entrada", () => {
    const original = todas();
    const ids = original.map((l) => l.pessoaId);
    ordenarLinhas(original, "total", "desc");
    expect(original.map((l) => l.pessoaId)).toEqual(ids);
  });

  it("pesquisa por nome sem ligar a acentos nem maiúsculas", () => {
    const f = { texto: "ines", local: SEM_FILTRO, contrato: SEM_FILTRO };
    expect(filtrarLinhas(todas(), f).map((l) => l.nome)).toEqual(["Inês Cardoso"]);
    expect(filtrarLinhas(todas(), { ...f, texto: "  SILVA " }).map((l) => l.nome)).toEqual(["André Silva"]);
    expect(filtrarLinhas(todas(), { ...f, texto: "zzz" })).toEqual([]);
  });

  it("filtra por filial, por centro e por tipo de contrato, e combina os filtros", () => {
    const base = { texto: "", local: SEM_FILTRO, contrato: SEM_FILTRO };
    expect(filtrarLinhas(todas(), { ...base, local: "f:fil-lisboa" }).map((l) => l.nome)).toEqual(["Rui Amaral"]);
    expect(filtrarLinhas(todas(), { ...base, local: "l:loc-porto" }).map((l) => l.nome)).toEqual(["Inês Cardoso"]);
    expect(filtrarLinhas(todas(), { ...base, contrato: "termo_certo" }).map((l) => l.nome)).toEqual(["Rui Amaral"]);
    expect(filtrarLinhas(todas(), { ...base, local: "f:fil-porto", contrato: "termo_certo" })).toEqual([]);
  });
});
