// Os dados que a ficha real dá aos ecrãs do negócio (o contexto `DadosNegocio`): as perdas, os detalhes dos documentos, os documentos por
// ligar, as leads abertas e as permissões, tudo lido do que `neg_ficha_pessoa` devolve. Nada rebenta com um valor que a ficha não conhece.
import { describe, expect, it } from "vitest";
import { adaptarDadosNegocio, faseDaPerdaDaBase } from "./adaptarDadosNegocio";
import { contactoDb, fichaDb, negocioDb, seccaoDb } from "./fichaFabrica";
import type { FichaDb } from "./fichaTipos";

const dados = (ficha: FichaDb = fichaDb(), momento: "manual" | "proposta_aceite" | "contrato_assinado" | null = "manual") => adaptarDadosNegocio(ficha, momento);

describe("faseDaPerdaDaBase: a fase da base na linguagem do ecrã", () => {
  it.each([
    ["levantamento", "levantamento"], ["orcamento", "orcamento"], ["proposta", "proposta"], ["contrato", "contrato"],
    // As fases da abordagem não têm texto próprio no ecrã: contam como a mais antiga que ele conhece.
    ["lead", "levantamento"], ["contacto", "levantamento"], ["visita", "levantamento"],
  ])("%s dá %s", (base, esperado) => {
    expect(faseDaPerdaDaBase(base)).toBe(esperado);
  });

  it("uma fase em falta ou desconhecida nunca rebenta: conta como orçamento", () => {
    expect(faseDaPerdaDaBase(null)).toBe("orcamento");
    expect(faseDaPerdaDaBase("ganho")).toBe("orcamento");
    expect(faseDaPerdaDaBase("xpto")).toBe("orcamento");
  });
});

describe("adaptarDadosNegocio: permissões e regra de ganho", () => {
  it("lê editar e criar da ficha e a regra da organização", () => {
    const d = dados(fichaDb({ permissoes: { editar: false, criar: true } }), "contrato_assinado");
    expect(d).toMatchObject({ podeEditar: false, podeCriar: true, momentoGanho: "contrato_assinado" });
  });

  it("sem regra de ganho fica null", () => {
    expect(dados(fichaDb(), null).momentoGanho).toBeNull();
  });
});

describe("adaptarDadosNegocio: os registos", () => {
  it("são os mesmos que a ficha adaptada dá, com o negócio a que cada um está ligado", () => {
    const d = dados(fichaDb({ contactos: seccaoDb([contactoDb({ id: "c1", negocio_id: "n1" }), contactoDb({ id: "c2" })]) }));
    expect(d.registos.contactos.map((c) => [c.id, c.negocioId])).toEqual([["c1", "n1"], ["c2", null]]);
  });
});

describe("adaptarDadosNegocio: as perdas", () => {
  const perdido = negocioDb({ id: "n9", estado: "perdido", fase_perda: "proposta", motivo_perda: "Preço", perdido_em: "2026-09-30T23:30:00Z" });

  it("só os negócios perdidos têm perda, com o motivo, a fase e o dia e o mês de Lisboa", () => {
    const d = dados(fichaDb({ negocios: { total: 2, itens: [perdido, negocioDb({ id: "n1" })] } }));
    expect(Object.keys(d.alteracoes.perdidos)).toEqual(["n9"]);
    expect(d.alteracoes.perdidos.n9).toEqual({ motivo: "Preço", mes: "2026-10", data: "2026-10-01", fase: "proposta" });
  });

  it("sem perdido_em usa a data de criação; sem motivo, texto vazio; as alterações do exemplo ficam vazias", () => {
    const d = dados(fichaDb({ negocios: { total: 1, itens: [negocioDb({ id: "n9", estado: "perdido", fase_perda: null, motivo_perda: null, perdido_em: null, criado_em: "2026-05-02T09:00:00Z" })] } }));
    expect(d.alteracoes.perdidos.n9).toEqual({ motivo: "", mes: "2026-05", data: "2026-05-02", fase: "orcamento" });
    expect(d.alteracoes).toMatchObject({ editados: {}, detalhes: {}, sequencia: 0 });
  });

  it("sem negócios (ou a secção em falta) não há perdas", () => {
    expect(dados(fichaDb({ negocios: null })).alteracoes.perdidos).toEqual({});
  });
});

describe("adaptarDadosNegocio: os detalhes dos documentos", () => {
  const ficha = fichaDb({
    negocios: {
      total: 1, itens: [negocioDb({
        id: "n1",
        orcamentos: [
          { id: "o1", numero: "O-1", estado: "rascunho", total: 100, criado_em: "2026-10-01T09:00:00Z" },
          { id: "o2", numero: "O-2", estado: "aceite", total: 200, criado_em: "2026-10-02T09:00:00Z" },
          { id: "o3", numero: "O-3", estado: "rejeitado", total: 300, criado_em: "2026-10-03T09:00:00Z" },
          { id: "o4", numero: "O-4", estado: "enviado", total: 400, criado_em: "2026-10-04T09:00:00Z" },
          { id: "o5", numero: "O-5", estado: "qualquer", total: 500, criado_em: null },
        ],
        propostas: [
          { id: "p-velha", numero: "P-1", titulo: null, status: "rejected", valor: 1, valid_until: null, terms: null, enviada_em: null, aceite_em: null, criado_em: "2026-10-01T09:00:00Z" },
          { id: "p-nova", numero: "P-2", titulo: null, status: "sent", valor: 2, valid_until: "2026-11-30", terms: null, enviada_em: "2026-10-05T09:00:00Z", aceite_em: null, criado_em: "2026-10-05T08:00:00Z" },
        ],
        contratos: [
          { id: "k-velho", numero: "C-1", status: "cancelled", valor: 1, assinado_em: null, criado_em: "2026-10-01T09:00:00Z", tem_base: true },
          { id: "k-novo", numero: "C-2", status: "signed", valor: 2, assinado_em: "2026-10-09T09:00:00Z", criado_em: "2026-10-08T09:00:00Z", tem_base: true },
        ],
      })],
    },
  });

  it("um negócio sem documentos, ou que não existe, não tem detalhe", () => {
    expect(dados().detalhe("n1")).toBeNull();
    expect(dados(ficha).detalhe("outro")).toBeNull();
  });

  it("os orçamentos: a data e o estado de cada um (um estado desconhecido conta como enviado)", () => {
    const orcamentos = dados(ficha).detalhe("n1")?.orcamentos ?? {};
    expect(orcamentos.o1).toEqual({ data: "2026-10-01", estado: "rascunho" });
    expect(orcamentos.o2.estado).toBe("aceite");
    expect(orcamentos.o3.estado).toBe("recusado");
    expect(orcamentos.o4.estado).toBe("enviado");
    expect(orcamentos.o5).toEqual({ data: "", estado: "enviado" });
  });

  it("a proposta que conta é a mais recente: quando foi enviada, até quando vale e os orçamentos do negócio", () => {
    expect(dados(ficha).detalhe("n1")?.proposta).toEqual({ enviadaEm: "2026-10-05", validaAte: "2026-11-30", orcamentoIds: ["o1", "o2", "o3", "o4", "o5"] });
  });

  it("o contrato que conta é o mais recente que não está cancelado: quando foi criado e quando foi assinado", () => {
    expect(dados(ficha).detalhe("n1")?.contrato).toEqual({ criadoEm: "2026-10-08", assinadoEm: "2026-10-09" });
  });

  it("uma proposta em rascunho não tem data de envio; um contrato por assinar não tem data de assinatura", () => {
    const f = fichaDb({
      negocios: { total: 1, itens: [negocioDb({
        id: "n2",
        propostas: [{ id: "p", numero: null, titulo: null, status: "draft", valor: 1, valid_until: null, terms: null, enviada_em: null, aceite_em: null, criado_em: "2026-10-05T08:00:00Z" }],
        contratos: [{ id: "k", numero: null, status: "draft", valor: 1, assinado_em: null, criado_em: "2026-10-08T09:00:00Z", tem_base: true }],
      })] },
    });
    const d = dados(f).detalhe("n2");
    expect(d?.proposta).toEqual({ orcamentoIds: [] });
    expect(d?.contrato).toEqual({ criadoEm: "2026-10-08" });
  });
});

describe("adaptarDadosNegocio: os documentos por ligar", () => {
  const comDocs = (docs: unknown) => fichaDb({ documentos_por_ligar: docs as FichaDb["documentos_por_ligar"] });

  it("junta orçamentos, propostas e contratos da pessoa; só um contrato com base se pode ligar", () => {
    const d = dados(comDocs({
      orcamentos: [{ id: "o1", numero: "O-1" }],
      propostas: [{ id: "p1", numero: "P-3" }],
      contratos: [{ id: "k1", numero: "C-9", tem_base: true }, { id: "k2", numero: "C-10", tem_base: false }, { id: "k3", numero: "C-11" }],
    }));
    expect(d.documentosPorLigar).toEqual([
      { tipo: "orcamento", id: "o1", numero: "O-1", temBase: true },
      { tipo: "proposta", id: "p1", numero: "P-3", temBase: true },
      { tipo: "contrato", id: "k1", numero: "C-9", temBase: true },
      { tipo: "contrato", id: "k2", numero: "C-10", temBase: false },
      // Sem a confirmação da base, um contrato não se oferece para ligar.
      { tipo: "contrato", id: "k3", numero: "C-11", temBase: false },
    ]);
  });

  it("sem número usa o início do id; entradas sem id ou que não são objetos são ignoradas", () => {
    const d = dados(comDocs({ orcamentos: [{ id: "abcdef12-3456" }, { numero: "sem id" }, null, 7], propostas: [], contratos: [] }));
    expect(d.documentosPorLigar).toEqual([{ tipo: "orcamento", id: "abcdef12-3456", numero: "abcdef12", temBase: true }]);
  });

  it("sem a secção, ou com uma forma inesperada, a lista é vazia", () => {
    expect(dados(comDocs(null)).documentosPorLigar).toEqual([]);
    expect(dados(comDocs({ orcamentos: "x", propostas: undefined })).documentosPorLigar).toEqual([]);
  });
});

describe("adaptarDadosNegocio: as leads abertas", () => {
  it("cada uma com o dia de criação e se a abordagem está encerrada (closure_result preenchido)", () => {
    const d = dados(fichaDb({
      leads_abertas: [
        { id: "l1", status: "new", created_at: "2026-09-01T10:00:00Z", closure_result: null },
        { id: "l2", status: "new", created_at: "2026-10-01T10:00:00Z", closure_result: "semInteresse" },
        { id: "l3", status: "new", created_at: null, closure_result: "" },
      ],
    }));
    expect(d.leadsAbertas).toEqual([
      { id: "l1", criadaEm: "2026-09-01", encerrada: false },
      { id: "l2", criadaEm: "2026-10-01", encerrada: true },
      { id: "l3", criadaEm: "", encerrada: false },
    ]);
  });

  it("sem leads abertas a lista é vazia", () => {
    expect(dados().leadsAbertas).toEqual([]);
  });
});

describe("adaptarDadosNegocio: estabilidade", () => {
  it("não muda a ficha de entrada", () => {
    const ficha = fichaDb({ negocios: { total: 1, itens: [negocioDb({ estado: "perdido", fase_perda: "contrato", motivo_perda: "x" })] } });
    const antes = JSON.stringify(ficha);
    dados(ficha);
    expect(JSON.stringify(ficha)).toBe(antes);
  });
});

describe("adaptarDadosNegocio: a proposta do detalhe é a viva, como em todo o lado", () => {
  const prop = (id: string, status: string, criado: string, validade: string | null, enviada: string | null) => ({
    id, numero: id, titulo: null, status, valor: 1, valid_until: validade, terms: null, enviada_em: enviada, aceite_em: null, criado_em: criado,
  });

  it("uma rejeitada mais recente não dá as datas de envio e de validade: valem as da proposta viva", () => {
    const ficha = fichaDb({
      negocios: { total: 1, itens: [negocioDb({ id: "n1", propostas: [
        prop("viva", "sent", "2026-10-01T09:00:00Z", "2026-11-30", "2026-10-02T09:00:00Z"),
        prop("morta", "rejected", "2026-10-09T09:00:00Z", "2026-12-31", "2026-10-10T09:00:00Z"),
      ] })] },
    });
    expect(dados(ficha).detalhe("n1")?.proposta).toMatchObject({ enviadaEm: "2026-10-02", validaAte: "2026-11-30" });
  });
});
