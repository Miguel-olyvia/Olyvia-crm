import { describe, expect, it } from "vitest";
import { RESULTADOS_VISITA } from "@/components/negocio-metas/registosTipos";
import { negocioMetasTranslations } from "./negocioMetas";
import { negocioMetasPercursoTranslations } from "./negocioMetasPercurso";

const { en, pt } = negocioMetasPercursoTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções do percurso do negócio", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores, e nenhum texto está vazio", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) {
      expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
      expect(pt[chave].trim(), chave).not.toBe("");
      expect(en[chave].trim(), chave).not.toBe("");
    }
  });

  it("todas as chaves levam o prefixo businessGoals.journey.", () => {
    for (const chave of Object.keys(pt)) expect(chave).toMatch(/^businessGoals\.journey\./);
  });

  it("há um texto para cada tipo de acontecimento e para cada resultado de visita", () => {
    for (const tipo of ["contacto", "visita", "levantamento", "orcamento", "proposta", "contrato", "perda"]) expect(pt[`businessGoals.journey.type.${tipo}`], tipo).toBeTruthy();
    for (const r of RESULTADOS_VISITA) expect(pt[`businessGoals.journey.visitResult.${r}`], r).toBeTruthy();
  });

  it("a página «Negócio e metas» junta-os nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(negocioMetasTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(negocioMetasTranslations.en[chave]).toBe(en[chave]);
  });

  it("não fala de pedidos nem de «Avançar para venda»", () => {
    for (const texto of [...Object.values(pt), ...Object.values(en)]) expect(texto).not.toMatch(/pedido|request|avançar para venda/i);
  });
});
