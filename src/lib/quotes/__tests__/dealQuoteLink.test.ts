import { describe, it, expect } from "vitest";
import { buildNewQuoteFromDealUrl, buildOpenQuoteUrl, readAutoImportParam } from "../dealQuoteLink";

describe("buildNewQuoteFromDealUrl", () => {
  it("abre um orçamento novo com o pedido e a importação automática", () => {
    const url = buildNewQuoteFromDealUrl("deal-1");
    const params = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/quotes?")).toBe(true);
    expect(params.get("new")).toBe("1");
    expect(params.get("deal_id")).toBe("deal-1");
    expect(params.get("autoImport")).toBe("1");
    expect(params.get("proposal_id")).toBeNull();
  });

  it("permite desligar a importação automática", () => {
    const params = new URLSearchParams(buildNewQuoteFromDealUrl("deal-1", { autoImport: false }).split("?")[1]);
    expect(params.get("autoImport")).toBeNull();
  });
});

describe("buildOpenQuoteUrl", () => {
  it("usa o deeplink ?open= da página de orçamentos", () => {
    expect(buildOpenQuoteUrl("q-1")).toBe("/quotes?open=q-1");
  });
});

describe("readAutoImportParam", () => {
  it("só aceita autoImport=1", () => {
    expect(readAutoImportParam(new URLSearchParams("autoImport=1"))).toBe(true);
    expect(readAutoImportParam(new URLSearchParams("autoImport=0"))).toBe(false);
    expect(readAutoImportParam(new URLSearchParams(""))).toBe(false);
  });
});
