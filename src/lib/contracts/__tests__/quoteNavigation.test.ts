import { describe, it, expect } from "vitest";
import { contractHasQuotes, contractQuotesRoute } from "../quoteNavigation";

const contrato = (over: Record<string, unknown> = {}) => ({
  quote_id: null,
  proposal_id: "prop-1",
  proposals: { quotes: [] },
  ...over,
});

describe("contractHasQuotes", () => {
  it("fica activo quando o contrato tem orcamento proprio", () => {
    expect(contractHasQuotes(contrato({ quote_id: "q-1", _contractQuoteAlive: true }))).toBe(true);
  });

  it("fica activo quando a proposta tem orcamentos", () => {
    expect(contractHasQuotes(contrato({ proposals: { quotes: [{ id: "q-1" }] } }))).toBe(true);
  });

  it("fica desactivado sem orcamento nenhum", () => {
    expect(contractHasQuotes(contrato())).toBe(false);
  });

  it("fica desactivado sem proposta nenhuma", () => {
    expect(contractHasQuotes(contrato({ proposal_id: null, proposals: null }))).toBe(false);
  });

  it("nao conta o orcamento proprio quando esta apagado", () => {
    expect(contractHasQuotes(contrato({ quote_id: "q-1", _contractQuoteAlive: false }))).toBe(false);
  });

  it("nao conta os orcamentos apagados da proposta", () => {
    expect(contractHasQuotes(contrato({
      proposals: { quotes: [{ id: "q-1", deleted_at: "2026-01-01T00:00:00Z" }] },
    }))).toBe(false);
  });
});

describe("contractQuotesRoute", () => {
  it("abre o orcamento do proprio contrato", () => {
    expect(contractQuotesRoute(contrato({ quote_id: "q-1", _contractQuoteAlive: true })))
      .toBe("/quotes?open=q-1");
  });

  it("abre o unico orcamento da proposta", () => {
    expect(contractQuotesRoute(contrato({ proposals: { quotes: [{ id: "q-9" }] } })))
      .toBe("/quotes?open=q-9");
  });

  it("leva a lista filtrada quando a proposta tem varios", () => {
    expect(contractQuotesRoute(contrato({ proposals: { quotes: [{ id: "q-1" }, { id: "q-2" }] } })))
      .toBe("/quotes?proposal=prop-1");
  });

  it("abre o unico vivo quando os restantes da proposta estao apagados", () => {
    expect(contractQuotesRoute(contrato({
      proposals: { quotes: [{ id: "q-1", deleted_at: "2026-01-01T00:00:00Z" }, { id: "q-2" }] },
    }))).toBe("/quotes?open=q-2");
  });

  it("ignora o orcamento proprio apagado e abre o vivo da proposta", () => {
    expect(contractQuotesRoute(contrato({
      quote_id: "q-morto",
      _contractQuoteAlive: false,
      proposals: { quotes: [{ id: "q-morto", deleted_at: "2026-01-01T00:00:00Z" }, { id: "q-vivo" }] },
    }))).toBe("/quotes?open=q-vivo");
  });

  it("mantem o comportamento anterior quando o estado do orcamento proprio nao foi resolvido", () => {
    expect(contractQuotesRoute(contrato({ quote_id: "q-1" }))).toBe("/quotes?open=q-1");
  });
});
