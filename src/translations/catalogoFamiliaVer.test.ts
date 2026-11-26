// Os textos da vista da família (`catFamiliaVer.*`): paridade en/pt, nenhum vazio, os mesmos marcadores, e juntos na tabela fundida (o que o useTranslation lê).
import { describe, expect, it } from "vitest";
import { catalogoFamiliaVerTranslations as T } from "./catalogoFamiliaVer";
import { tabelaFundida } from "./tabelaFundida";

describe("catalogoFamiliaVer", () => {
  it("en e pt têm exatamente as mesmas chaves, todas com o prefixo catFamiliaVer.", () => {
    expect(Object.keys(T.en).sort()).toEqual(Object.keys(T.pt).sort());
    for (const k of Object.keys(T.pt)) expect(k.startsWith("catFamiliaVer.")).toBe(true);
  });
  it("nenhum texto vazio e os mesmos marcadores {…} nas duas línguas", () => {
    for (const k of Object.keys(T.pt)) {
      expect(T.pt[k]!.trim()).not.toBe("");
      expect(T.en[k]!.trim()).not.toBe("");
      const marcas = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(marcas(T.en[k]!)).toEqual(marcas(T.pt[k]!));
    }
  });
  it("estão juntos na tabela fundida, sem tirar os textos de catFamilias.*", () => {
    expect(tabelaFundida.pt["catFamiliaVer.cartao.abrir"]).toBe("Abrir produto");
    expect(tabelaFundida.en["catFamiliaVer.cartao.abrir"]).toBe("Open product");
    expect(tabelaFundida.pt["catFamilias.guardar"]).toBe("Guardar");
  });
});
