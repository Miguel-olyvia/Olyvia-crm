import { describe, expect, it, vi } from "vitest";
import { applyDataTableTokens, applyQuoteItemsToken, renderItemsTableModelHtml } from "../contractDocument";
import { buildItemsTableModel, type ItemsTableLine } from "@/utils/documentTemplate/buildItemsTableModel";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const ITENS = [
  { descricao: "Remodelação cozinha", qtd: 2, unidade: "vg", valor: 320, preco_unitario: 160, kind: "service" as const },
  { descricao: "Material", qtd: 1, unidade: "un", valor: 72.37, kind: "product" as const },
];
const DEFS = { show_quote_items: true };

function linha(d: string, qtd: number, preco: number): ItemsTableLine {
  return { description: d, quantity: qtd, unit: "un", unit_price: preco, line_total: qtd * preco };
}
const DOIS = [
  { quoteNumber: "Q-1", lines: [linha("a", 2, 50)], subtotal: 100 },
  { quoteNumber: "Q-2", lines: [linha("b", 1, 200)], subtotal: 200 },
];
const CORES = { headerBg: "#7C3AED", headerColor: "#ffffff", borderColor: "#d1d5db", zebra: false, zebraColor: "#f9fafb" };
const OPCOES = { title: "T", showQuantity: true, showUnit: true, showPrice: true, showTotal: true, primaryColor: "#7C3AED", colors: CORES };

describe("applyDataTableTokens com idioma", () => {
  it("tabela de artigos em inglês: título e cabeçalhos; valores com o formato de sempre", () => {
    const html = applyDataTableTokens("<p>{{orcamento_itens}}</p>", { orcamento_itens: ITENS }, DEFS, "#7C3AED", true, "en");
    expect(html).toContain(">Quote items</h3>");
    for (const h of ["Description", "Qty", "Unit", "Unit price", "Total"]) expect(html).toContain(`>${h}</th>`);
    expect(html).not.toContain("Descrição");
    expect(html).toContain("€160,00");
    expect(html).toContain("€320,00");
    expect(html).toContain("€72,37");
    expect(html).toContain("Remodelação cozinha");
  });

  it("o título escolhido no modelo manda, em qualquer idioma", () => {
    const html = applyDataTableTokens("{{orcamento_itens}}", { orcamento_itens: ITENS }, { ...DEFS, quote_items_title: "Items" }, "#7C3AED", true, "en");
    expect(html).toContain(">Items</h3>");
  });

  it("título a null (versão sem título) cai no dicionário", () => {
    const html = applyDataTableTokens("{{orcamento_itens}}", { orcamento_itens: ITENS }, { ...DEFS, quote_items_title: null }, "#7C3AED", true, "en");
    expect(html).toContain(">Quote items</h3>");
  });

  it("o título do chip manda sobre tudo", () => {
    const cfg = btoa(unescape(encodeURIComponent(JSON.stringify({ title: "Lines" }))));
    const html = applyDataTableTokens(`<span data-contract-table="quote_items" data-config="${cfg}">x</span>`, { orcamento_itens: ITENS }, {}, "#7C3AED", true, "en");
    expect(html).toContain(">Lines</h3>");
  });

  it("chip sem título: o do idioma", () => {
    const html = applyDataTableTokens(`<span data-contract-table="quote_items" data-config="">x</span>`, { orcamento_itens: ITENS }, {}, "#7C3AED", true, "en");
    expect(html).toContain(">Quote items</h3>");
  });

  it("tabela de signatários em inglês", () => {
    const sig = [{ nome: "Ana", email: "ana@x.pt", papel: "Segundo Contratante", ordem: 1 }];
    const cfg = btoa(unescape(encodeURIComponent(JSON.stringify({ showOrder: true }))));
    const html = applyDataTableTokens(`<span data-contract-table="signatories" data-config="${cfg}">x</span>`, { signatarios: sig }, {}, "#7C3AED", true, "en");
    expect(html).toContain(">Signatories</h3>");
    for (const h of ["#", "Name", "Role", "Email"]) expect(html).toContain(`>${h}</th>`);
    expect(html).toContain("Segundo Contratante");
  });

  it("applyQuoteItemsToken (alias antigo) passa o idioma", () => {
    const html = applyQuoteItemsToken("{{orcamento_itens}}", { orcamento_itens: ITENS }, DEFS, "#7C3AED", true, "en");
    expect(html).toContain(">Quote items</h3>");
  });

  it("português é a omissão", () => {
    const html = applyDataTableTokens("{{orcamento_itens}}", { orcamento_itens: ITENS }, DEFS, "#7C3AED");
    expect(html).toContain(">Artigos do Orçamento</h3>");
    expect(html).toContain(">Preço Unit.</th>");
  });
});

describe("renderItemsTableModelHtml com idioma", () => {
  it("vários orçamentos agrupados: «Quote Q-1», Subtotal e Total", () => {
    const html = renderItemsTableModelHtml(buildItemsTableModel({ quotes: DOIS }), OPCOES, "en");
    expect(html).toContain("Quote Q-1");
    expect(html).toContain("Quote Q-2");
    expect(html).toContain(">Subtotal</td>");
    expect(html).toContain("Total: €300,00");
    expect(html).not.toContain("Orçamento");
  });

  it("consolidado: coluna Ref. e Total, dinheiro igual", () => {
    const model = buildItemsTableModel({ quotes: DOIS, settings: { mode: "consolidated" } as never });
    const html = renderItemsTableModelHtml(model, OPCOES, "en");
    expect(html).toContain(">Ref.</th>");
    expect(html).toContain(">Total</td>");
    expect(html).toContain("€300,00");
  });
});
