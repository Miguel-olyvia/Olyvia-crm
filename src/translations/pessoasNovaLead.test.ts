import { describe, expect, it } from "vitest";
import { pessoasNovaLeadTranslations } from "./pessoasNovaLead";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasNovaLeadTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções da «Nova lead» de Pessoas", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo da página e nenhum texto vazio", () => {
    expect(Object.keys(pt).length).toBeGreaterThan(100);
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.real\.newLead\./);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });

  it("o diálogo de duplicados só tem «Abrir existente», «Atualizar dados» e «Cancelar»: não há «criar mesmo assim» nem «partilhar»", () => {
    const textos = [...Object.values(pt), ...Object.values(en)].join(" ").toLowerCase();
    for (const proibido of ["criar mesmo assim", "create anyway", "partilhar", "share with"]) expect(textos).not.toContain(proibido);
    expect(pt["pessoasPagina.real.newLead.dup.openOne"]).toBe("Abrir existente");
    expect(pt["pessoasPagina.real.newLead.dup.update"]).toBe("Atualizar dados");
    expect(pt["pessoasPagina.real.newLead.dup.cancel"]).toBe("Cancelar");
  });
});
