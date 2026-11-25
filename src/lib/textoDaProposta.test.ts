import { describe, expect, it } from "vitest";
import {
  VARIAVEIS_DA_PROPOSTA, condicoesDePagamentoTexto, pagamentoFixoEscritoAMao, substituirVariaveis, temVariaveisConhecidas, textosComVariaveis,
} from "./textoDaProposta";

const TERMOS = "Termos e condições\n1. Esta proposta é válida pelo período indicado.\n2. Os valores apresentados incluem IVA à taxa legal em vigor.\n3. Condições de Pagamento: {{condicoes_pagamento}}";

describe("condicoesDePagamentoTexto", () => {
  it("100% na adjudicação", () => {
    expect(condicoesDePagamentoTexto([{ l: "Na adjudicação", p: 1 }])).toBe("100% - Adjudicação");
  });
  it("50% + 50% no fim", () => {
    expect(condicoesDePagamentoTexto([{ l: "Na adjudicação", p: 0.5 }, { l: "No fim da obra", p: 0.5 }])).toBe("50% - Adjudicação / 50% - Fim da obra");
  });
  it("50% + 25% no arranque + 25% no fim", () => {
    expect(condicoesDePagamentoTexto([{ l: "Na adjudicação", p: 0.5 }, { l: "No arranque da obra", p: 0.25 }, { l: "No fim, antes da entrega", p: 0.25 }]))
      .toBe("50% - Adjudicação / 25% - Início da obra / 25% - Fim da obra");
  });
  it("30% + 40% + 30%", () => {
    expect(condicoesDePagamentoTexto([{ l: "Na adjudicação", p: 0.3 }, { l: "A meio da obra", p: 0.4 }, { l: "No fim da obra", p: 0.3 }]))
      .toBe("30% - Adjudicação / 40% - Meio da obra / 30% - Fim da obra");
  });
  it("Por fases e À medida: o momento como a Emylia o escreve; percentagens com uma casa", () => {
    expect(condicoesDePagamentoTexto([{ l: "Na adjudicação", p: 0.25 }, { l: "No fim da fase 2 · Canalização e eletricidade", p: 0.425 }, { l: "Na entrega das chaves", p: 0.325 }]))
      .toBe("25% - Adjudicação / 42,5% - No fim da fase 2 · Canalização e eletricidade / 32,5% - Na entrega das chaves");
  });
  it("sem prestações: vazio", () => {
    expect(condicoesDePagamentoTexto([])).toBe("");
  });
});

describe("substituirVariaveis", () => {
  const v = { condicoes_pagamento: "100% - Adjudicação", validade: "30/12/2026", prazo: "12 dias úteis", garantia: "2 anos", cliente_nome: "Ana & Rui <Lda>" };
  it("substitui as conhecidas, com ou sem espaços dentro das chavetas", () => {
    expect(substituirVariaveis(TERMOS, v)).toBe(TERMOS.replace("{{condicoes_pagamento}}", "100% - Adjudicação"));
    expect(substituirVariaveis("Prazo: {{ prazo }}; garantia {{garantia}}", v)).toBe("Prazo: 12 dias úteis; garantia 2 anos");
  });
  it("em HTML escapa o valor; em texto não", () => {
    expect(substituirVariaveis("<p>Para {{cliente_nome}}</p>", v, { html: true })).toBe("<p>Para Ana &amp; Rui &lt;Lda&gt;</p>");
    expect(substituirVariaveis("Para {{cliente_nome}}", v)).toBe("Para Ana & Rui <Lda>");
  });
  it("conhecida sem dados: fica vazia (o cliente nunca vê as chavetas)", () => {
    expect(substituirVariaveis("3. Condições de Pagamento: {{condicoes_pagamento}}", null)).toBe("3. Condições de Pagamento: ");
    expect(substituirVariaveis("Válida até {{validade}}.", { prazo: "3 dias" })).toBe("Válida até .");
  });
  it("desconhecida fica como está (pode ser de outro sistema)", () => {
    expect(substituirVariaveis("Olá {{nome_da_obra}}", v)).toBe("Olá {{nome_da_obra}}");
  });
  it("um texto sem variáveis sai byte a byte igual", () => {
    const fixo = "Termos e condições\r\n3. Condições de Pagamento: 50% - Adjudicação / 25% - Início da Obra / 25% - Fim da Obra";
    expect(substituirVariaveis(fixo, v)).toBe(fixo);
    expect(substituirVariaveis(fixo, null)).toBe(fixo);
  });
});

describe("textosComVariaveis", () => {
  it("troca nos cinco textos do template e devolve o MESMO objeto quando não há variáveis", () => {
    const tpl = { name: "x", header_text: "<p>Olá {{cliente_nome}}</p>", terms_conditions: TERMOS, footer_text: null, thank_you_message: "Obrigado", description: "{{prazo}}" };
    const r = textosComVariaveis(tpl, { cliente_nome: "Ana", condicoes_pagamento: "100% - Adjudicação", prazo: "5 dias úteis" });
    expect(r).not.toBe(tpl);
    expect(r.header_text).toBe("<p>Olá Ana</p>");
    expect(r.terms_conditions?.endsWith("3. Condições de Pagamento: 100% - Adjudicação")).toBe(true);
    expect(r.description).toBe("5 dias úteis");
    expect(r.footer_text).toBeNull();
    expect(tpl.header_text).toBe("<p>Olá {{cliente_nome}}</p>");
    const semNada = { name: "y", header_text: "<p>fixo</p>", terms_conditions: "1. a" };
    expect(textosComVariaveis(semNada, { prazo: "1" })).toBe(semNada);
    expect(textosComVariaveis(null, { prazo: "1" })).toBeNull();
  });
});

describe("ajudas do editor", () => {
  it("lista as variáveis disponíveis", () => {
    expect(VARIAVEIS_DA_PROPOSTA.map((x) => x.chave)).toEqual(["condicoes_pagamento", "validade", "prazo", "garantia", "cliente_nome"]);
  });
  it("deteta variáveis conhecidas", () => {
    expect(temVariaveisConhecidas("a {{ condicoes_pagamento }}")).toBe(true);
    expect(temVariaveisConhecidas("a {{outra}}")).toBe(false);
    expect(temVariaveisConhecidas(null)).toBe(false);
  });
  it("avisa quando o pagamento ficou escrito à mão", () => {
    expect(pagamentoFixoEscritoAMao("3. Condições de Pagamento: 50% - Adjudicação / 25% - Início da Obra / 25% - Fim da Obra")).toBe(true);
    expect(pagamentoFixoEscritoAMao("<p>Pagamento: 30% na adjudicação</p>")).toBe(true);
    expect(pagamentoFixoEscritoAMao("3. Condições de Pagamento: {{condicoes_pagamento}}")).toBe(false);
    expect(pagamentoFixoEscritoAMao("Os valores incluem IVA a 23%.")).toBe(false);
    expect(pagamentoFixoEscritoAMao(null)).toBe(false);
  });
});
