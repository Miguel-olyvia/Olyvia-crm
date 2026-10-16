import { describe, expect, it } from "vitest";
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import { textoDoAviso } from "./anunciosProcesso";
import type { ItemProcesso } from "./tiposProcesso";

/** Uma tradução de mentira: a chave e os parâmetros, para ver qual texto e com quê. */
const t: Traduzir = (chave, params) => `${chave}${params ? JSON.stringify(params) : ""}`;

const item = (extra: Partial<ItemProcesso>): ItemProcesso => ({
  id: "pedido-a", pessoaId: "a", tipo: "pedido", fase: "contactado", trabalho: null, valor: null, prazo: null, atrasado: false,
  orcamentos: 0, orcamentoEscolhido: false, propostaRascunho: false, visitaFeita: false, levantamentoLinhas: 0, ...extra,
});

describe("textoDoAviso", () => {
  it("chamada que muda de fase: 'passa a <fase>'", () => {
    expect(textoDoAviso(t, "chamada", "Ana", "porContactar", item({ fase: "contactado" })))
      .toBe('pessoasPagina.done.call{"name":"Ana","phase":"pessoasPagina.board.col.contactado"}');
  });

  it("chamada que não muda de fase: 'continua em <fase>'", () => {
    expect(textoDoAviso(t, "chamada", "Ana", "contactado", item({ fase: "contactado" })))
      .toBe('pessoasPagina.done.callStays{"name":"Ana","phase":"pessoasPagina.board.col.contactado"}');
  });

  it("chamada que deixa a pessoa sem item (perdida): só diz que a chamada foi registada", () => {
    expect(textoDoAviso(t, "chamada", "Ana", "contactado", null)).toBe('pessoasPagina.done.callNoPhase{"name":"Ana"}');
  });

  it("visita marcada: 'passa a Visita'", () => {
    expect(textoDoAviso(t, "visita", "Ana", "contactado", item({ fase: "visita" })))
      .toBe('pessoasPagina.done.visitBooked{"name":"Ana","phase":"pessoasPagina.board.col.visita"}');
  });

  it("visita feita: a fase e o novo A fazer", () => {
    expect(textoDoAviso(t, "visitaFeita", "Ana", "visita", item({ fase: "visita", visitaFeita: true })))
      .toBe('pessoasPagina.done.visitDone{"name":"Ana","phase":"pessoasPagina.board.col.visita","step":"pessoasPagina.todo.step.fazerLevantamento"}');
  });

  it("levantamento guardado: o novo A fazer é criar o negócio", () => {
    expect(textoDoAviso(t, "levantamento", "Ana", "visita", item({ fase: "visita", visitaFeita: true, levantamentoLinhas: 2 })))
      .toBe('pessoasPagina.done.survey{"name":"Ana","step":"pessoasPagina.todo.step.criarNegocio"}');
  });

  it("negócio criado: 'passa a Orçamento'", () => {
    expect(textoDoAviso(t, "negocio", "Ana", "visita", item({ id: "n-novo-1", tipo: "negocio", fase: "orcamento" })))
      .toBe('pessoasPagina.done.deal{"name":"Ana","phase":"pessoasPagina.board.col.orcamento"}');
  });

  it("sem item depois, só a chamada tem aviso; os outros passos não dizem nada", () => {
    for (const tipo of ["visita", "visitaFeita", "levantamento", "negocio"] as const) expect(textoDoAviso(t, tipo, "Ana", "visita", null)).toBe("");
  });
});
