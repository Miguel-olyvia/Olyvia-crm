import { describe, expect, it } from "vitest";
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import { textoDoAviso } from "./anunciosProcesso";
import type { ItemProcesso } from "./tiposProcesso";

/** Uma tradução de mentira: a chave e os parâmetros, para ver qual texto e com quê. */
const t: Traduzir = (chave, params) => `${chave}${params ? JSON.stringify(params) : ""}`;

const item = (extra: Partial<ItemProcesso>): ItemProcesso => ({
  id: "pessoa-a", pessoaId: "a", tipo: "pessoa", fase: "contactado", trabalho: null, valor: null, prazo: null, atrasado: false,
  orcamentos: 0, verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
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

  it("visita feita (e levantamento guardado): a fase e o novo A fazer, que é criar o negócio", () => {
    expect(textoDoAviso(t, "visitaFeita", "Ana", "visita", item({ fase: "visita", visitaFeita: true })))
      .toBe('pessoasPagina.done.visitDone{"name":"Ana","phase":"pessoasPagina.board.col.visita","step":"pessoasPagina.todo.step.criarNegocio"}');
  });

  it("visita guardada sem ficar feita: a fase e o A fazer, que continua a ser marcar a visita como feita", () => {
    expect(textoDoAviso(t, "visitaGuardada", "Ana", "visita", item({ fase: "visita" })))
      .toBe('pessoasPagina.done.visitSaved{"name":"Ana","phase":"pessoasPagina.board.col.visita","step":"pessoasPagina.todo.step.marcarVisitaFeita"}');
  });

  it("negócio criado: 'passa a Orçamento'", () => {
    expect(textoDoAviso(t, "negocio", "Ana", "visita", item({ id: "n-novo-1", tipo: "negocio", fase: "orcamento" })))
      .toBe('pessoasPagina.done.deal{"name":"Ana","phase":"pessoasPagina.board.col.orcamento"}');
  });

  describe("os passos do orçamento e da proposta (Fase 4)", () => {
    const negocio = (extra: Partial<ItemProcesso>) => item({ id: "n1", tipo: "negocio", fase: "orcamento", orcamentos: 1, ...extra });
    const passo = (chave: string) => `"step":"pessoasPagina.todo.step.${chave}"`;

    it("orçamento guardado: diz o que há a fazer a seguir (verificá-lo)", () => {
      expect(textoDoAviso(t, "orcamento", "Ana", "orcamento", negocio({ verificacao: "porVerificar" })))
        .toBe(`pessoasPagina.done.quote{"name":"Ana",${passo("verificarOrcamento")}}`);
    });

    it("orçamento verificado: o próximo passo é enviar a proposta", () => {
      expect(textoDoAviso(t, "verificado", "Ana", "orcamento", negocio({ verificacao: "verificado" })))
        .toBe(`pessoasPagina.done.verified{"name":"Ana",${passo("enviarProposta")}}`);
    });

    it("aprovação pedida à Direção: o próximo passo é aguardar a resposta", () => {
      expect(textoDoAviso(t, "direcaoPedida", "Ana", "orcamento", negocio({ verificacao: "aguardaDirecao" })))
        .toBe(`pessoasPagina.done.directionAsked{"name":"Ana",${passo("aguardarDirecao")}}`);
    });

    it("exceção aprovada: o próximo passo é enviar a proposta; recusada: volta a verificar", () => {
      expect(textoDoAviso(t, "direcaoAprovada", "Ana", "orcamento", negocio({ verificacao: "verificado" })))
        .toBe(`pessoasPagina.done.directionApproved{"name":"Ana",${passo("enviarProposta")}}`);
      expect(textoDoAviso(t, "direcaoRecusada", "Ana", "orcamento", negocio({ verificacao: "porVerificar" })))
        .toBe(`pessoasPagina.done.directionRefused{"name":"Ana",${passo("verificarOrcamento")}}`);
    });

    it("proposta enviada: 'passa a Proposta'", () => {
      expect(textoDoAviso(t, "proposta", "Ana", "orcamento", negocio({ fase: "proposta" })))
        .toBe('pessoasPagina.done.proposal{"name":"Ana","phase":"pessoasPagina.board.col.proposta"}');
    });
  });

  describe("a resposta do cliente, a assinatura e a recusa", () => {
    const negocio = (extra: Partial<ItemProcesso>) => item({ id: "n1", tipo: "negocio", orcamentos: 1, ...extra });

    it("proposta aceite com contrato: 'passa a Contrato' e o que há a fazer a seguir (registar a assinatura)", () => {
      expect(textoDoAviso(t, "resposta", "Ana", "proposta", negocio({ fase: "contrato" })))
        .toBe('pessoasPagina.done.reply{"name":"Ana","phase":"pessoasPagina.board.col.contrato","step":"pessoasPagina.todo.step.registarAssinatura"}');
    });

    it("proposta aceite sem contrato: o negócio ficou ganho e já não há item, mas o aviso diz-o", () => {
      expect(textoDoAviso(t, "resposta", "Ana", "proposta", null)).toBe('pessoasPagina.done.replyWon{"name":"Ana"}');
    });

    it("assinatura: o negócio está ganho, haja ou não outro item da pessoa", () => {
      expect(textoDoAviso(t, "assinatura", "Ana", "contrato", null)).toBe('pessoasPagina.done.signed{"name":"Ana"}');
      expect(textoDoAviso(t, "assinatura", "Ana", "contrato", negocio({ fase: "orcamento" }))).toBe('pessoasPagina.done.signed{"name":"Ana"}');
    });

    it("recusa: o texto vem escrito pelo passo (leva o motivo), por isso aqui não há nenhum", () => {
      expect(textoDoAviso(t, "recusa", "Ana", "proposta", null)).toBe("");
    });
  });

  it("sem item depois, só a chamada, a resposta aceite e a assinatura têm aviso; os outros passos não dizem nada", () => {
    const outros = [
      "visita", "visitaFeita", "visitaGuardada", "negocio", "orcamento", "verificado", "direcaoPedida", "direcaoAprovada", "direcaoRecusada", "proposta", "recusa",
    ] as const;
    for (const tipo of outros) expect(textoDoAviso(t, tipo, "Ana", "visita", null)).toBe("");
  });
});
