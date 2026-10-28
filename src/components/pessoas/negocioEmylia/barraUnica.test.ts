import { describe, expect, it } from "vitest";
import type { FaseDoNegocio } from "../fasesDoNegocio";
import { barraUnica } from "./barraUnica";

const f = (id: FaseDoNegocio["id"], estado: FaseDoNegocio["estado"]): FaseDoNegocio => ({ id, estado });
const texto = (r: ReturnType<typeof barraUnica>) => r.map((x) => `${x.id}:${x.estado}`);
const base = { faseDoItem: null, fasesDoNegocio: [] as FaseDoNegocio[], faseEmylia: null, perdido: false };

describe("barraUnica (uma só barra: Por contactar à Obra)", () => {
  it("tem sempre as mesmas oito fases, pela ordem do percurso", () => {
    expect(barraUnica(base).map((x) => x.id)).toEqual(["porContactar", "contactado", "visita", "orcamento", "proposta", "contrato", "financeiro", "obra"]);
  });
  it("numa pessoa em Contactado, a anterior está feita e as seguintes por fazer", () => {
    expect(texto(barraUnica({ ...base, faseDoItem: "contactado" }))).toEqual([
      "porContactar:feita", "contactado:atual", "visita:porFazer", "orcamento:porFazer", "proposta:porFazer", "contrato:porFazer", "financeiro:porFazer", "obra:porFazer",
    ]);
  });
  it("o Levantamento é o fim da fase Visita: a barra marca Visita como atual", () => {
    expect(barraUnica({ ...base, faseDoItem: "levantamento" }).find((x) => x.estado === "atual")?.id).toBe("visita");
  });
  it("com fase da Emylia, essa é a atual, e o que vem antes (abordagem incluída) está feito", () => {
    expect(texto(barraUnica({ ...base, faseDoItem: "orcamento", faseEmylia: "proposta" }))).toEqual([
      "porContactar:feita", "contactado:feita", "visita:feita", "orcamento:feita", "proposta:atual", "contrato:porFazer", "financeiro:porFazer", "obra:porFazer",
    ]);
    expect(barraUnica({ ...base, faseEmylia: "obra" }).find((x) => x.estado === "atual")?.id).toBe("obra");
  });
  it("sem item nem fase da Emylia, a atual vem das fases do negócio (Orçamento, Proposta, Contrato)", () => {
    expect(barraUnica({ ...base, fasesDoNegocio: [f("orcamento", "feita"), f("proposta", "atual"), f("contrato", "porFazer")] }).find((x) => x.estado === "atual")?.id).toBe("proposta");
  });
  it("um negócio ganho sem fase da Emylia fica com o Contrato feito e nenhuma atual", () => {
    const r = barraUnica({ ...base, fasesDoNegocio: [f("orcamento", "feita"), f("proposta", "feita"), f("contrato", "feita"), f("ganho", "feita")] });
    expect(texto(r).slice(3)).toEqual(["orcamento:feita", "proposta:feita", "contrato:feita", "financeiro:porFazer", "obra:porFazer"]);
  });
  it("a perda fica na fase onde se perdeu e Financeiro e Obra não aparecem por fazer", () => {
    const r = barraUnica({ ...base, perdido: true, fasesDoNegocio: [f("orcamento", "feita"), f("proposta", "perdida"), f("contrato", "porFazer")] });
    expect(texto(r)).toEqual(["porContactar:feita", "contactado:feita", "visita:feita", "orcamento:feita", "proposta:perdida", "contrato:porFazer"]);
  });
  it("as fases da abordagem usam os mesmos rótulos de sempre; as do negócio, os das fases", () => {
    const r = barraUnica(base);
    expect(r[0].rotuloChave).toBe("pessoasPagina.board.col.porContactar");
    expect(r[2].rotuloChave).toBe("pessoasPagina.board.col.visita");
    expect(r[3].rotuloChave).toBe("pessoasPagina.phases.orcamento");
    expect(r[7].rotuloChave).toBe("pessoasPagina.phases.obra");
  });
});
