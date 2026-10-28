import { describe, expect, it } from "vitest";
import {
  FASES_PIPELINE, faseDaColunaDoQuadro, fasePipeline, fasePipelineDaGravada, fasePipelineDerivada, numeroDaFase, type TemDoNegocio,
} from "./faseDoPipeline";

const nada: TemDoNegocio = { chamadas: 0, visitas: 0, levantamento: false, orcamentos: 0, proposta: false, contrato: false };

describe("faseDoPipeline (UMA só função, partilhada pelo quadro e pela ficha)", () => {
  it("as seis fases de /negocios pela ordem, e negocios.fase 0 a 5 corresponde-lhes", () => {
    expect(FASES_PIPELINE).toEqual(["porContactar", "contactado", "visita", "negocio", "financeiro", "obra"]);
    FASES_PIPELINE.forEach((f, i) => { expect(numeroDaFase(f)).toBe(i); expect(fasePipelineDaGravada(i)).toBe(f); });
  });

  it("uma fase gravada fora de 0 a 5, nula ou desconhecida não conta", () => {
    for (const v of [null, undefined, -1, 6, 2.5, Number.NaN]) expect(fasePipelineDaGravada(v)).toBeNull();
  });

  describe("derivada do que o negócio tem (enquanto negocios.fase for nula): a MESMA ordem que a base usa para a coluna do quadro", () => {
    // neg_resumo_quadro: contrato > proposta > orçamento > levantamento (só com levantamento guardado) > visita > chamada > por contactar
    const casos: [string, Partial<TemDoNegocio>, string][] = [
      ["nada: Por contactar", {}, "porContactar"],
      ["uma chamada: Contactado", { chamadas: 1 }, "contactado"],
      ["uma visita marcada: Visita (mesmo com chamadas)", { chamadas: 3, visitas: 1 }, "visita"],
      ["levantamento guardado: Negócio (coluna Levantamento)", { levantamento: true }, "negocio"],
      ["orçamento: Negócio", { orcamentos: 1 }, "negocio"],
      ["proposta: Negócio", { proposta: true }, "negocio"],
      ["contrato: Negócio", { contrato: true }, "negocio"],
      ["levantamento por guardar fica na Visita (não passa a Negócio)", { visitas: 1, chamadas: 2 }, "visita"],
    ];
    it.each(casos)("%s", (_nome, tem, esperado) => {
      expect(fasePipelineDerivada({ ...nada, ...tem })).toBe(esperado);
    });
  });

  it("a fase gravada vale quando existe; sem ela, a derivada; e a derivada nunca recua uma gravada mais avançada, nem a gravada atrasada esconde o que já há", () => {
    expect(fasePipeline({ faseGravada: 4, tem: nada })).toBe("financeiro");
    expect(fasePipeline({ faseGravada: null, tem: { ...nada, chamadas: 1 } })).toBe("contactado");
    // o CRM tem um levantamento guardado e a base ainda diz «Contacto»: vale a mais avançada (o que o negócio já tem)
    expect(fasePipeline({ faseGravada: 1, tem: { ...nada, levantamento: true } })).toBe("negocio");
    expect(fasePipeline({ faseGravada: 5, tem: { ...nada, chamadas: 1 } })).toBe("obra");
  });

  it("as colunas do quadro (grupo Negócio incluído) correspondem às fases", () => {
    expect(faseDaColunaDoQuadro("porContactar")).toBe("porContactar");
    expect(faseDaColunaDoQuadro("contactado")).toBe("contactado");
    expect(faseDaColunaDoQuadro("visita")).toBe("visita");
    for (const c of ["levantamento", "orcamento", "proposta", "contrato"] as const) expect(faseDaColunaDoQuadro(c)).toBe("negocio");
  });
});
