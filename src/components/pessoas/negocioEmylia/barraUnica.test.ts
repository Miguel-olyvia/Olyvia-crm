import { describe, expect, it } from "vitest";
import type { FaseDoNegocio } from "../fasesDoNegocio";
import { barraUnica } from "./barraUnica";

const f = (id: FaseDoNegocio["id"], estado: FaseDoNegocio["estado"]): FaseDoNegocio => ({ id, estado });
const texto = (r: ReturnType<typeof barraUnica>) => r.map((x) => `${x.id}:${x.estado}`);
const base = { faseDoItem: null, fasesDoNegocio: [] as FaseDoNegocio[], faseEmylia: null, perdido: false };

describe("barraUnica (uma só barra, como a de /negocios: seis fases)", () => {
  it("tem seis fases pela ordem do percurso; Orçamento, Proposta e Contrato NÃO são fases (são passos dentro de Negócio)", () => {
    expect(barraUnica(base).map((x) => x.id)).toEqual(["porContactar", "contactado", "visita", "negocio", "financeiro", "obra"]);
  });
  it("numa pessoa em Contactado, a anterior está feita e as seguintes por fazer", () => {
    expect(texto(barraUnica({ ...base, faseDoItem: "contactado" }))).toEqual([
      "porContactar:feita", "contactado:atual", "visita:porFazer", "negocio:porFazer", "financeiro:porFazer", "obra:porFazer",
    ]);
  });
  it("um negócio na coluna Levantamento do quadro (levantamento guardado) está na fase NEGÓCIO: a ficha e o quadro concordam", () => {
    expect(barraUnica({ ...base, faseDoItem: "levantamento" }).find((x) => x.estado === "atual")?.id).toBe("negocio");
  });
  it("a barra avança assim que uma fase se conclui (pelo que o negócio tem), sem esperar pelo quadro", () => {
    const tem = { chamadas: 0, visitas: 0, levantamento: false, orcamentos: 0, proposta: false, contrato: false };
    const atual = (sobre: Partial<typeof tem>, item: string | null = "porContactar") => barraUnica({ ...base, faseDoItem: item, tem: { ...tem, ...sobre } }).find((x) => x.estado === "atual")?.id;
    expect(atual({})).toBe("porContactar");
    expect(atual({ chamadas: 1 })).toBe("contactado");
    expect(atual({ chamadas: 1, visitas: 1 }, "contactado")).toBe("visita");
    expect(atual({ chamadas: 1, visitas: 1, levantamento: true }, "visita")).toBe("negocio");
  });
  it("a fase gravada em negocios.fase conta, e nunca atrasa o que o negócio já tem", () => {
    expect(barraUnica({ ...base, faseGravada: 2 }).find((x) => x.estado === "atual")?.id).toBe("visita");
    expect(barraUnica({ ...base, faseGravada: 1, tem: { chamadas: 0, visitas: 0, levantamento: true, orcamentos: 0, proposta: false, contrato: false } }).find((x) => x.estado === "atual")?.id).toBe("negocio");
  });
  it("Orçamento, Proposta e Contrato do CRM são todos a fase Negócio", () => {
    for (const fase of ["orcamento", "proposta", "contrato"]) {
      expect(barraUnica({ ...base, faseDoItem: fase }).find((x) => x.estado === "atual")?.id).toBe("negocio");
    }
  });
  it("com fase da Emylia, essa é a atual, e o que vem antes (abordagem incluída) está feito", () => {
    expect(texto(barraUnica({ ...base, faseDoItem: "orcamento", faseEmylia: "negocio" }))).toEqual([
      "porContactar:feita", "contactado:feita", "visita:feita", "negocio:atual", "financeiro:porFazer", "obra:porFazer",
    ]);
    expect(barraUnica({ ...base, faseEmylia: "obra" }).find((x) => x.estado === "atual")?.id).toBe("obra");
    expect(texto(barraUnica({ ...base, faseEmylia: "financeiro" })).slice(3)).toEqual(["negocio:feita", "financeiro:atual", "obra:porFazer"]);
  });
  it("sem item nem fase da Emylia, a atual vem das fases do negócio (Proposta é a fase Negócio)", () => {
    expect(barraUnica({ ...base, fasesDoNegocio: [f("orcamento", "feita"), f("proposta", "atual"), f("contrato", "porFazer")] }).find((x) => x.estado === "atual")?.id).toBe("negocio");
  });
  it("um negócio ganho sem fase da Emylia fica com o Negócio feito e nenhuma atual", () => {
    const r = barraUnica({ ...base, fasesDoNegocio: [f("orcamento", "feita"), f("proposta", "feita"), f("contrato", "feita"), f("ganho", "feita")] });
    expect(texto(r)).toEqual(["porContactar:feita", "contactado:feita", "visita:feita", "negocio:feita", "financeiro:porFazer", "obra:porFazer"]);
    expect(r.find((x) => x.estado === "atual")).toBeUndefined();
  });
  it("a perda fica na fase onde se perdeu (Negócio) e Financeiro e Obra não aparecem por fazer", () => {
    const r = barraUnica({ ...base, perdido: true, fasesDoNegocio: [f("orcamento", "feita"), f("proposta", "perdida"), f("contrato", "porFazer")] });
    expect(texto(r)).toEqual(["porContactar:feita", "contactado:feita", "visita:feita", "negocio:perdida"]);
  });
  it("os rótulos da abordagem são os de sempre; Negócio, Financeiro e Obra são os das fases", () => {
    const r = barraUnica(base);
    expect(r[0].rotuloChave).toBe("pessoasPagina.board.col.porContactar");
    expect(r[2].rotuloChave).toBe("pessoasPagina.board.col.visita");
    expect(r[3].rotuloChave).toBe("pessoasPagina.guia.fase.negocio");
    expect(r[4].rotuloChave).toBe("pessoasPagina.phases.financeiro");
    expect(r[5].rotuloChave).toBe("pessoasPagina.phases.obra");
  });
});
