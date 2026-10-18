import { describe, expect, it } from "vitest";
import { RESULTADOS_CONTACTO } from "@/components/pessoas/opcoesPessoa";
import { negocioMetasTranslations } from "./negocioMetas";
import { negocioMetasRegistosTranslations } from "./negocioMetasRegistos";

const { en, pt } = negocioMetasRegistosTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções da aba «Registos» do novo negócio", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores, e nenhum texto está vazio", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) {
      expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
      expect(pt[chave].trim(), chave).not.toBe("");
      expect(en[chave].trim(), chave).not.toBe("");
    }
  });

  it("todas as chaves levam o prefixo do painel «Novo negócio»", () => {
    for (const chave of Object.keys(pt)) expect(chave).toMatch(/^businessGoals\.new\.(tab\.records|link\.)/);
  });

  it("há um texto para cada resultado de contacto e cada estado de visita", () => {
    for (const r of RESULTADOS_CONTACTO) expect(pt[`businessGoals.new.link.result.${r}`], r).toBeTruthy();
    for (const e of ["porFazer", "feita", "cancelada"]) expect(pt[`businessGoals.new.link.visitState.${e}`], e).toBeTruthy();
  });

  it("a página «Negócio e metas» junta-os nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(negocioMetasTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(negocioMetasTranslations.en[chave]).toBe(en[chave]);
  });

  it("não fala de pedidos", () => {
    for (const texto of [...Object.values(pt), ...Object.values(en)]) expect(texto).not.toMatch(/pedido|request/i);
  });
});
