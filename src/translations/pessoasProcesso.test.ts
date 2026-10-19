import { describe, expect, it } from "vitest";
import { PASSOS_PROCESSO } from "@/components/pessoas/processo/tiposProcesso";
import type { FaltaProcesso } from "@/components/pessoas/processo/portoesProcesso";
import { pessoasAcoesTranslations } from "./pessoasAcoes";
import { pessoasChamadaTranslations } from "./pessoasChamada";
import { pessoasFichaTranslations } from "./pessoasFicha";
import { pessoasFichaResumoTranslations } from "./pessoasFichaResumo";
import { pessoasListaTranslations } from "./pessoasLista";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasProcessoTranslations } from "./pessoasProcesso";
import { pessoasVisitaTranslations } from "./pessoasVisita";

const { en, pt } = pessoasProcessoTranslations;
/** Tudo o que um portão pode dizer que falta (ver `portoesProcesso.ts`); o `Record` obriga a não esquecer nenhum. */
const FALTAS = Object.keys({
  dataVisita: 0, visita: 0, linhaInvalida: 0, pessoa: 0,
  orcamentoLinhas: 0, orcamentoValor: 0, semOrcamento: 0, margem: 0, abaixoDoCusto: 0, semPedido: 0, porVerificar: 0, condicoes: 0,
  orcamentoNaoGuardado: 0, negocioDesapareceu: 0, descontoInvalido: 0, pessoaPerdida: 0, semLevantamento: 0,
} satisfies Record<FaltaProcesso, 0>);
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções do seletor de vista e do Quadro de Pessoas", () => {
  it("pt e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("todas as chaves são view.*, board.*, deals.*, todo.*, process.*, gate.*, done.*, quote.*, verify.*, direction.* ou proposal.*, com o prefixo da página", () => {
    for (const chave of Object.keys(pt)) {
      expect(chave).toMatch(/^pessoasPagina\.(view|board|deals|todo|process|gate|done|quote|verify|direction|proposal)\./);
    }
  });

  it("há um texto de passo (todo.step.<id>) para cada um dos passos do processo (agora 14), e nenhum a mais", () => {
    const ids = Object.keys(pt).filter((c) => c.startsWith("pessoasPagina.todo.step.")).map((c) => c.slice("pessoasPagina.todo.step.".length));
    expect(ids.sort()).toEqual([...PASSOS_PROCESSO].sort());
  });

  it("os textos dos negócios da lista têm os marcadores certos", () => {
    expect(marcas(pt["pessoasPagina.deals.show"])).toEqual(["{count}"]);
    expect(marcas(pt["pessoasPagina.deals.for"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.deals.list"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.deals.summary.one"])).toEqual(["{step}"]);
    expect(marcas(pt["pessoasPagina.deals.summary.many"])).toEqual(["{count}", "{step}"]);
    expect(marcas(pt["pessoasPagina.deals.stepLabel"])).toEqual(["{name}", "{step}", "{work}"]);
  });

  it("o botão do passo no Quadro diz o mesmo que o da Lista: '{passo}: {trabalho} de {nome}', e '(abre a ficha)' só onde ainda não executa", () => {
    for (const lingua of [pt, en]) {
      expect(marcas(lingua["pessoasPagina.board.step"])).toEqual(["{name}", "{step}", "{work}"]);
      expect(marcas(lingua["pessoasPagina.board.stepOpens"])).toEqual(["{name}", "{step}", "{work}"]);
    }
    expect(pt["pessoasPagina.board.step"]).toBe(pt["pessoasPagina.process.stepLabel"]);
    expect(pt["pessoasPagina.board.stepOpens"]).toBe(pt["pessoasPagina.deals.stepLabel"]);
    expect(en["pessoasPagina.board.step"]).toBe(en["pessoasPagina.process.stepLabel"]);
    expect(en["pessoasPagina.board.stepOpens"]).toBe(en["pessoasPagina.deals.stepLabel"]);
  });

  it("o painel aberto por um passo tem título e descrição próprios, com o nome da pessoa, nas duas línguas", () => {
    for (const chave of ["process.visitSurvey.title", "process.visitSurvey.description", "process.visitSurvey.save", "process.deal.title", "process.deal.description"]) {
      expect(pt[`pessoasPagina.${chave}`], chave).toBeTruthy();
      expect(en[`pessoasPagina.${chave}`], chave).toBeTruthy();
    }
    expect(marcas(pt["pessoasPagina.process.visitSurvey.title"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.process.deal.title"])).toEqual(["{name}"]);
    expect(pt["pessoasPagina.process.visitSurvey.title"]).toBe("Visita e levantamento de {name}");
  });

  it("os rótulos só para leitores de ecrã (fase, valor, prazo) existem nas duas línguas", () => {
    for (const chave of ["deals.sr.phase", "deals.sr.value", "deals.sr.deadline"]) {
      expect(pt[`pessoasPagina.${chave}`], chave).toMatch(/:$/);
      expect(en[`pessoasPagina.${chave}`], chave).toMatch(/:$/);
    }
  });

  it("nenhum texto está vazio e os marcadores {x} coincidem entre línguas", () => {
    for (const chave of Object.keys(pt)) {
      expect(pt[chave].trim(), chave).not.toBe("");
      expect(en[chave].trim(), chave).not.toBe("");
      expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
    }
  });

  it("estão registadas em pessoasPagina, nas duas línguas", () => {
    for (const lingua of ["en", "pt"] as const) {
      for (const [chave, texto] of Object.entries(pessoasProcessoTranslations[lingua])) {
        expect(pessoasPaginaTranslations[lingua][chave], chave).toBe(texto);
      }
    }
  });

  it("têm o anúncio de vista, o separador da contagem e a frase das perdidas", () => {
    for (const chave of [
      "view.announce.list", "view.announce.board", "board.count.sep", "board.lostHint",
    ]) {
      expect(pt[`pessoasPagina.${chave}`], chave).toBeTruthy();
      expect(en[`pessoasPagina.${chave}`], chave).toBeTruthy();
    }
    expect(pt["pessoasPagina.view.announce.board"]).toContain("{count}");
  });

  it("há um texto de portão (gate.<falta>) para cada coisa que pode faltar, nas duas línguas", () => {
    for (const falta of FALTAS) {
      expect(pt[`pessoasPagina.gate.${falta}`], falta).toBeTruthy();
      expect(en[`pessoasPagina.gate.${falta}`], falta).toBeTruthy();
    }
    const gates = Object.keys(pt).filter((c) => c.startsWith("pessoasPagina.gate.") && c !== "pessoasPagina.gate.blocked");
    expect(gates.map((c) => c.slice("pessoasPagina.gate.".length)).sort()).toEqual([...FALTAS].sort());
    expect(marcas(pt["pessoasPagina.gate.blocked"])).toEqual(["{reasons}", "{step}"]);
  });

  it("os avisos do que aconteceu (done.*) têm os marcadores certos", () => {
    expect(marcas(pt["pessoasPagina.done.call"])).toEqual(["{name}", "{phase}"]);
    expect(marcas(pt["pessoasPagina.done.callStays"])).toEqual(["{name}", "{phase}"]);
    expect(marcas(pt["pessoasPagina.done.callNoPhase"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.done.visitBooked"])).toEqual(["{name}", "{phase}"]);
    expect(marcas(pt["pessoasPagina.done.visitDone"])).toEqual(["{name}", "{phase}", "{step}"]);
    expect(marcas(pt["pessoasPagina.done.visitSaved"])).toEqual(["{name}", "{phase}", "{step}"]);
    expect(marcas(pt["pessoasPagina.done.deal"])).toEqual(["{name}", "{phase}"]);
    for (const chave of ["quote", "verified", "directionAsked", "directionApproved", "directionRefused"]) {
      expect(marcas(pt[`pessoasPagina.done.${chave}`]), chave).toEqual(["{name}", "{step}"]);
    }
    expect(marcas(pt["pessoasPagina.done.proposal"])).toEqual(["{name}", "{phase}"]);
  });

  it("o editor do orçamento: o nome do serviço entra nos nomes dos campos e dos botões, para serem únicos por linha", () => {
    for (const chave of ["quote.forWork", "quote.removeLabel", "quote.error.quantity", "quote.error.price"]) {
      expect(marcas(pt[`pessoasPagina.${chave}`]), chave).toEqual(["{work}"]);
    }
    expect(marcas(pt["pessoasPagina.quote.title"])).toEqual(["{work}"]);
    expect(marcas(pt["pessoasPagina.quote.titleVersion"])).toEqual(["{version}", "{work}"]);
    expect(marcas(pt["pessoasPagina.quote.description"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.quote.lineTotal"])).toEqual(["{value}"]);
  });

  it("a verificação diz a margem, o mínimo, o alvo e o preço sugerido, e o botão 'Usar' diz em que serviço", () => {
    expect(marcas(pt["pessoasPagina.verify.description"])).toEqual(["{min}", "{name}", "{target}"]);
    expect(marcas(pt["pessoasPagina.verify.block.belowCost"])).toEqual(["{cost}", "{price}", "{work}"]);
    expect(marcas(pt["pessoasPagina.verify.block.lowMargin"])).toEqual(["{margin}", "{min}"]);
    expect(marcas(pt["pessoasPagina.verify.block.discount"])).toEqual(["{margin}", "{min}"]);
    expect(marcas(pt["pessoasPagina.verify.warn.target"])).toEqual(["{margin}", "{target}"]);
    expect(marcas(pt["pessoasPagina.verify.usePrice"])).toEqual(["{price}"]);
    expect(marcas(pt["pessoasPagina.verify.usePriceLabel"])).toEqual(["{price}", "{work}"]);
    expect(marcas(pt["pessoasPagina.verify.summary.many"])).toEqual(["{count}", "{margin}"]);
    // O nome acessível do botão começa pelo texto visível (WCAG 2.5.3).
    expect(pt["pessoasPagina.verify.usePriceLabel"].startsWith("Usar {price}")).toBe(true);
    expect(pt["pessoasPagina.verify.usePrice"]).toBe("Usar {price}");
  });

  it("a proposta tem as quatro formas de pagamento, as três validades e as garantias, nas duas línguas", () => {
    for (const chave of ["adjudicacao", "metade", "tres", "fases"]) {
      expect(pt[`pessoasPagina.proposal.payment.${chave}`], chave).toBeTruthy();
      expect(en[`pessoasPagina.proposal.payment.${chave}`], chave).toBeTruthy();
    }
    expect(marcas(pt["pessoasPagina.proposal.validity.option"])).toEqual(["{days}"]);
    expect(marcas(pt["pessoasPagina.proposal.warranty.many"])).toEqual(["{years}"]);
    expect(marcas(pt["pessoasPagina.proposal.notes.count"])).toEqual(["{count}", "{max}"]);
    expect(marcas(pt["pessoasPagina.proposal.notes.error"])).toEqual(["{max}"]);
    expect(marcas(pt["pessoasPagina.proposal.description"])).toEqual(["{name}", "{total}"]);
  });

  it("já não há texto do diálogo 'A visita já foi feita?' nem do painel só do levantamento da visita (passaram a um só painel); o passo «Fazer o levantamento» é o de um negócio em Levantamento", () => {
    const orfas = Object.keys(pt).filter((c) => /process\.(visitDone|survey)\.|done\.survey$/.test(c));
    expect(orfas).toEqual([]);
    expect(marcas(pt["pessoasPagina.process.stepLabel"])).toEqual(["{name}", "{step}", "{work}"]);
  });

  it("«pedido» só quer dizer o pedido de aprovação à Direção: o pedido como entidade saiu e levou os seus textos", () => {
    expect(pt["pessoasPagina.done.directionAsked"]).toContain("Pedido de aprovação");
    expect(en["pessoasPagina.done.directionAsked"]).toContain("Approval request");
    const saiu = [
      [pt, /requestName|requestNew|board\.request|deals\.kind\.request|pedidoDesapareceu/],
      [en, /requestName|requestNew|board\.request|deals\.kind\.request|pedidoDesapareceu/],
      [pessoasChamadaTranslations.pt, /call\.(request|visitGoes)/], [pessoasChamadaTranslations.en, /call\.(request|visitGoes)/],
      [pessoasVisitaTranslations.pt, /nextVisit\.request/], [pessoasVisitaTranslations.en, /nextVisit\.request/],
      [pessoasFichaTranslations.pt, /bar\.dealWith(out)?Visit/], [pessoasFichaTranslations.en, /bar\.dealWith(out)?Visit/],
    ] as const;
    for (const [lingua, padrao] of saiu) expect(Object.keys(lingua).filter((c) => padrao.test(c))).toEqual([]);
  });

  it("os textos das visitas da pessoa existem nas duas línguas, com os mesmos marcadores", () => {
    const chaves = ["pessoasPagina.nextVisit.state.porFazer", "pessoasPagina.nextVisit.state.feita", "pessoasPagina.nextVisit.changeLabel"] as const;
    for (const chave of chaves) {
      expect(pessoasVisitaTranslations.pt[chave], chave).toBeTruthy();
      expect(pessoasVisitaTranslations.en[chave], chave).toBeTruthy();
      expect(marcas(pessoasVisitaTranslations.en[chave]), chave).toEqual(marcas(pessoasVisitaTranslations.pt[chave]));
    }
    for (const lingua of [pt, en]) {
      // O painel de visita e levantamento é da pessoa: a descrição já não fala de um pedido.
      expect(marcas(lingua["pessoasPagina.process.visitSurvey.description"])).toEqual([]);
    }
    expect(marcas(pessoasVisitaTranslations.pt["pessoasPagina.nextVisit.changeLabel"])).toEqual(["{when}", "{work}"]);
    expect(pessoasVisitaTranslations.pt["pessoasPagina.nextVisit.done"]).toBeUndefined();
    expect(pessoasVisitaTranslations.pt["pessoasPagina.activity.visitDone"]).toBeUndefined();
    expect(pessoasVisitaTranslations.en["pessoasPagina.activity.visitDone"]).toBeUndefined();
    expect(pessoasVisitaTranslations.pt["pessoasPagina.nextVisit.changeLabel"].startsWith("Alterar visita")).toBe(true);
  });

  it("as chaves novas (process, gate, done, quote, verify, direction, proposal) não colidem com as de outros módulos de Pessoas", () => {
    const modulos = [
      pessoasAcoesTranslations, pessoasChamadaTranslations, pessoasFichaTranslations, pessoasFichaResumoTranslations,
      pessoasListaTranslations, pessoasVisitaTranslations,
    ];
    for (const lingua of ["en", "pt"] as const) {
      for (const chave of Object.keys(pessoasProcessoTranslations[lingua])) {
        for (const modulo of modulos) expect(chave in modulo[lingua], chave).toBe(false);
      }
    }
  });

  it("há uma coluna traduzida para cada uma das 6 fases", () => {
    for (const fase of ["porContactar", "contactado", "visita", "orcamento", "proposta", "contrato"]) {
      expect(pt[`pessoasPagina.board.col.${fase}`]).toBeTruthy();
      expect(en[`pessoasPagina.board.col.${fase}`]).toBeTruthy();
    }
  });
});

describe("traduções dos achados da revisão da Fase 4", () => {
  it("os textos novos existem nas duas línguas, com os mesmos marcadores", () => {
    const chaves = [
      "gate.orcamentoNaoGuardado", "gate.negocioDesapareceu", "gate.descontoInvalido", "quote.removed.none", "quote.removed.one",
      "quote.removed.many", "quote.totals.announce", "verify.block.saleBelowCost", "verify.noQuote",
    ];
    for (const chave of chaves) {
      const c = `pessoasPagina.${chave}`;
      expect(pt[c], c).toBeTruthy();
      expect(en[c], c).toBeTruthy();
      expect(marcas(pt[c]), c).toEqual(marcas(en[c]));
    }
    expect(marcas(pt["pessoasPagina.quote.removed.many"])).toEqual(["{count}", "{work}"]);
    expect(marcas(pt["pessoasPagina.quote.removed.one"])).toEqual(["{work}"]);
    expect(marcas(pt["pessoasPagina.quote.totals.announce"])).toEqual(["{margin}", "{total}"]);
    expect(marcas(pt["pessoasPagina.verify.block.saleBelowCost"])).toEqual(["{cost}", "{net}"]);
  });
});
