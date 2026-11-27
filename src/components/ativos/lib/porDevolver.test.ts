// A resposta de `rpc_ativos_por_devolver`: o jsonb é lido com tolerância (nada rebenta com uma chave a faltar) e, sem detalhe,
// fica uma estrutura segura só com contagens (pessoas vazio, nunca nomes nem itens).
import { describe, expect, it } from "vitest";
import { chaveDiasRestantes, ordenarPorSaida, porDevolverDaResposta, resumoDaFaixa } from "./porDevolver";

const PESSOA = {
  pessoa_id: "p1", nome: "Ana Silva", saida_prevista: "2026-12-09", origem: "fim_contrato", dias_restantes: 12, vinculo_id: "v1",
  chefia_pessoa_id: "c1", n_itens: 2,
  itens: [
    { origem: "ativo", item_id: "i1", ref_id: "a1", codigo: "NIKE-IT-LAP-26-0001", nome: "Portátil", desde: "2026-06-01" },
    { origem: "frota", item_id: "i2", ref_id: "v9", codigo: "EP-11-EP", nome: "Renault Clio", desde: "2026-07-01" },
  ],
};

describe("porDevolverDaResposta", () => {
  it("lê o detalhe completo (pessoas, datas, itens da base e da frota)", () => {
    const r = porDevolverDaResposta({ hoje: "2026-11-27", dias: 90, detalhe: true, total_pessoas: 1, total_itens: 2, pessoas: [PESSOA] });
    expect(r).toMatchObject({ hoje: "2026-11-27", dias: 90, detalhe: true, totalPessoas: 1, totalItens: 2 });
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0]).toMatchObject({ pessoaId: "p1", nome: "Ana Silva", saidaPrevista: "2026-12-09", origem: "fim_contrato", diasRestantes: 12, nItens: 2 });
    expect(r.pessoas[0].itens.map((i) => [i.origem, i.codigo, i.nome])).toEqual([
      ["ativo", "NIKE-IT-LAP-26-0001", "Portátil"],
      ["frota", "EP-11-EP", "Renault Clio"],
    ]);
  });

  it("sem detalhe (só contagens) devolve as contagens e nenhuma pessoa", () => {
    const r = porDevolverDaResposta({ hoje: "2026-11-27", dias: 30, detalhe: false, total_pessoas: 3, total_itens: 5, pessoas: [] });
    expect(r.detalhe).toBe(false);
    expect(r.totalPessoas).toBe(3);
    expect(r.totalItens).toBe(5);
    expect(r.pessoas).toEqual([]);
  });

  it("sem detalhe ignora pessoas mesmo que venham (nunca mostra nomes sem a base os dar)", () => {
    const r = porDevolverDaResposta({ detalhe: false, total_pessoas: 1, total_itens: 2, pessoas: [PESSOA] });
    expect(r.pessoas).toEqual([]);
  });

  it("o nome pode vir vazio (sem hr.pessoas.view) e fica null", () => {
    const r = porDevolverDaResposta({ detalhe: true, total_pessoas: 1, total_itens: 1, pessoas: [{ ...PESSOA, nome: null }] });
    expect(r.pessoas[0].nome).toBeNull();
  });

  it("uma resposta vazia, nula ou estranha dá zeros (nunca rebenta)", () => {
    for (const x of [null, undefined, "x", 7, [], {}]) {
      const r = porDevolverDaResposta(x);
      expect(r).toMatchObject({ detalhe: false, totalPessoas: 0, totalItens: 0, pessoas: [] });
    }
  });

  it("descarta pessoas sem identificador e itens sem identificador; uma origem desconhecida passa a «ativo»", () => {
    const r = porDevolverDaResposta({
      detalhe: true, total_pessoas: 2, total_itens: 1,
      pessoas: [{ nome: "Sem id" }, { ...PESSOA, origem: "estranha", itens: [{ item_id: "i1", codigo: "X", origem: "outra" }, { codigo: "sem id" }] }],
    });
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0].origem).toBe("fim_contrato");
    expect(r.pessoas[0].itens.map((i) => [i.itemId, i.origem])).toEqual([["i1", "ativo"]]);
  });

  it("os números que chegam como texto (numeric do Postgres) são lidos", () => {
    const r = porDevolverDaResposta({ detalhe: false, total_pessoas: "2", total_itens: "4", pessoas: [] });
    expect(r.totalPessoas).toBe(2);
    expect(r.totalItens).toBe(4);
  });
});

describe("chaveDiasRestantes", () => {
  it("já saiu, sai hoje, sai amanhã, sai daqui a N dias", () => {
    expect(chaveDiasRestantes(-3)).toBe("ativos.saidas.jaSaiu");
    expect(chaveDiasRestantes(0)).toBe("ativos.saidas.hoje");
    expect(chaveDiasRestantes(1)).toBe("ativos.saidas.amanha");
    expect(chaveDiasRestantes(12)).toBe("ativos.saidas.diasRestantes");
    expect(chaveDiasRestantes(null)).toBe("ativos.saidas.semData");
  });
});

describe("resumoDaFaixa", () => {
  it("escolhe o texto pelo plural de pessoas e de itens; sem ninguém não há faixa", () => {
    expect(resumoDaFaixa({ totalPessoas: 0, totalItens: 0 })).toBeNull();
    expect(resumoDaFaixa({ totalPessoas: 1, totalItens: 1 })).toBe("ativos.faixa.pessoa.item");
    expect(resumoDaFaixa({ totalPessoas: 1, totalItens: 3 })).toBe("ativos.faixa.pessoa.itens");
    expect(resumoDaFaixa({ totalPessoas: 2, totalItens: 1 })).toBe("ativos.faixa.pessoas.item");
    expect(resumoDaFaixa({ totalPessoas: 3, totalItens: 5 })).toBe("ativos.faixa.pessoas.itens");
  });
});

describe("ordenarPorSaida", () => {
  it("a saída mais próxima primeiro («já saiu» no topo), as sem data no fim, sem mexer na lista original", () => {
    const base = { nome: null, saidaPrevista: null, origem: "fim_contrato" as const, vinculoId: null, nItens: 0, itens: [] };
    const lista = [
      { ...base, pessoaId: "a", diasRestantes: 12 },
      { ...base, pessoaId: "b", diasRestantes: null },
      { ...base, pessoaId: "c", diasRestantes: -3 },
      { ...base, pessoaId: "d", diasRestantes: 0 },
    ];
    expect(ordenarPorSaida(lista).map((p) => p.pessoaId)).toEqual(["c", "d", "a", "b"]);
    expect(lista.map((p) => p.pessoaId)).toEqual(["a", "b", "c", "d"]);
  });
});
