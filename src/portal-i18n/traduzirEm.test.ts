// traduzirEm(idioma): o t() e o tn() com o idioma dado de fora, sem armazém nem React. É o que permite a um
// componente partilhado com o CRM (ex.: ProposalPortalDocument) falar o idioma que o chamador escolheu.
import { describe, expect, it } from "vitest";
import { traduzirEm } from "./traduzirEm";
import { traduzir, traduzirN } from "./traduzir";

describe("traduzirEm", () => {
  it("traz o idioma e devolve o mesmo que traduzir() para esse idioma", () => {
    const pt = traduzirEm("pt");
    const en = traduzirEm("en");
    expect(pt.idioma).toBe("pt");
    expect(en.idioma).toBe("en");
    expect(pt.t("pc.layout.menu.propostas")).toBe(traduzir("pt", "pc.layout.menu.propostas"));
    expect(en.t("pc.layout.menu.propostas")).toBe(traduzir("en", "pc.layout.menu.propostas"));
    expect(pt.t("pc.layout.menu.propostas")).not.toBe(en.t("pc.layout.menu.propostas"));
  });

  it("aplica os parâmetros", () => {
    expect(traduzirEm("en").t("pc.inicio.saudacao", { nome: "Ana" })).toBe(traduzir("en", "pc.inicio.saudacao", { nome: "Ana" }));
    expect(traduzirEm("pt").t("pc.inicio.saudacao", { nome: "Ana" })).toBe("Olá, Ana!");
  });

  it("tn escolhe singular ou plural como traduzirN", () => {
    const en = traduzirEm("en");
    const chaves = ["pc.propostas.pendentes.um", "pc.propostas.pendentes.varios"] as const;
    expect(en.tn(chaves[0], chaves[1], 1)).toBe(traduzirN("en", chaves[0], chaves[1], 1));
    expect(en.tn(chaves[0], chaves[1], 3)).toBe(traduzirN("en", chaves[0], chaves[1], 3));
    expect(en.tn(chaves[0], chaves[1], 1)).not.toBe(en.tn(chaves[0], chaves[1], 3));
  });

  it("um idioma que não é pt nem en (valor vindo de fora) cai em pt em vez de rebentar", () => {
    const estranho = traduzirEm("fr" as never);
    expect(estranho.idioma).toBe("pt");
    expect(estranho.t("pc.layout.menu.propostas")).toBe(traduzir("pt", "pc.layout.menu.propostas"));
    expect(traduzirEm(undefined as never).idioma).toBe("pt");
    expect(traduzirEm(null as never).idioma).toBe("pt");
  });

  it("uma chave que não existe volta como veio", () => {
    expect(traduzirEm("en").t("pc.nao.existe")).toBe("pc.nao.existe");
  });
});
