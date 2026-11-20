// Os textos das famílias gravadas na base (`catFamilias.*`): paridade en/pt, nenhum vazio, e juntos na tabela fundida (o que o useTranslation lê).
import { describe, expect, it } from "vitest";
import { catalogoFamiliasTranslations as T } from "./catalogoFamilias";
import { tabelaFundida } from "./tabelaFundida";

describe("catalogoFamilias", () => {
  it("en e pt têm exatamente as mesmas chaves, todas com o prefixo catFamilias.", () => {
    expect(Object.keys(T.en).sort()).toEqual(Object.keys(T.pt).sort());
    for (const k of Object.keys(T.pt)) expect(k.startsWith("catFamilias.")).toBe(true);
  });
  it("nenhum texto vazio e os mesmos marcadores {…} nas duas línguas", () => {
    for (const k of Object.keys(T.pt)) {
      expect(T.pt[k].trim()).not.toBe("");
      expect(T.en[k].trim()).not.toBe("");
      const marcas = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(marcas(T.en[k])).toEqual(marcas(T.pt[k]));
    }
  });
  it("estão juntos na tabela fundida", () => {
    expect(tabelaFundida.pt["catFamilias.guardar"]).toBe("Guardar");
    expect(tabelaFundida.en["catFamilias.guardar"]).toBe("Save");
    expect(tabelaFundida.pt["catFamilias.confirmar.texto"]).toMatch(/Os produtos não são apagados/);
  });
});
