import { describe, expect, it } from "vitest";
import { RESULTADOS_VISITA } from "@/components/negocio-metas/registosTipos";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasRegistosTranslations } from "./pessoasRegistos";

const { en, pt } = pessoasRegistosTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções dos registos da pessoa", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas as chaves levam o prefixo da página e nenhum texto está vazio", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.(bar|board|deals|survey|visitResult|reg)\./);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("há um texto para cada resultado de visita, nas duas línguas", () => {
    for (const r of RESULTADOS_VISITA) {
      expect(pt[`pessoasPagina.visitResult.result.${r}`], r).toBeTruthy();
      expect(en[`pessoasPagina.visitResult.result.${r}`], r).toBeTruthy();
    }
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });

  it("os textos que falam de pedidos não existem aqui: o pedido já não é uma entidade", () => {
    for (const texto of [...Object.values(pt), ...Object.values(en)]) expect(texto).not.toMatch(/pedido|request/i);
  });
});
