import { describe, expect, it } from "vitest";
import {
  COMERCIAL_ATUAL, SEM_FILTROS, chipsDosFiltros, filtrarNegocios as filtrarCom, filtrosAtivos, filtrosNoPopover, servicosDe,
  type FiltrosQuadro,
} from "./logicaQuadro";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";

const { negocios } = DADOS_EXEMPLO;
const filtrarNegocios = (ns: typeof negocios, f: FiltrosQuadro) => filtrarCom(ns, f, HOJE_EXEMPLO);
const ids = (ls: readonly { id: string }[]) => ls.map((n) => n.id);

describe("Os meus | Todos", () => {
  it("Os meus mostra só os negócios do comercial atual", () => {
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, meus: true }))).toEqual(["n1", "n2", "n10"]);
    expect(negocios.filter((n) => n.comercial === COMERCIAL_ATUAL)).toHaveLength(3);
  });
  it("Todos (sem o filtro) mostra tudo", () => {
    expect(filtrarNegocios(negocios, SEM_FILTROS)).toHaveLength(10);
  });
});

describe("filtros avançados", () => {
  it("serviço", () => {
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, servico: "Cozinha" }))).toEqual(["n2", "n9"]);
  });
  it("número de orçamentos", () => {
    expect(filtrarNegocios(negocios, { ...SEM_FILTROS, orcamentos: "1" })).toHaveLength(4);
    expect(filtrarNegocios(negocios, { ...SEM_FILTROS, orcamentos: "2+" })).toHaveLength(6);
  });
  it("faixa de valor (os sem valor ficam de fora)", () => {
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, faixa: "ate10" }))).toEqual(["n1", "n3", "n6", "n7"]);
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, faixa: "10a20" }))).toEqual(["n2", "n4", "n5", "n9"]);
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, faixa: "20mais" }))).toEqual(["n10"]);
  });
  it("combinam com os restantes", () => {
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, meus: true, orcamentos: "2+" }))).toEqual(["n1", "n2", "n10"]);
  });
  it("a lista de serviços é única e ordenada", () => {
    const s = servicosDe(negocios);
    expect(new Set(s).size).toBe(s.length);
    expect(s).toEqual([...s].sort((a, b) => a.localeCompare(b, "pt")));
    expect(s).toContain("Cozinha");
  });
});

describe("filtros ativos", () => {
  it("o botão Filtros conta só os campos do painel", () => {
    expect(filtrosNoPopover(SEM_FILTROS)).toBe(0);
    expect(filtrosNoPopover({ ...SEM_FILTROS, q: "x", meus: true, paraTratar: true, fases: ["proposta"] })).toBe(0);
    expect(
      filtrosNoPopover({ ...SEM_FILTROS, servico: "Cozinha", faixa: "ate10", comercial: "Ana Ribeiro", orcamentos: "1" }),
    ).toBe(4);
  });
  it("cada filtro com chip removível sabe como se limpar", () => {
    const f = { ...SEM_FILTROS, q: " marta ", meus: true, servico: "Cozinha", faixa: "ate10" as const };
    const chips = chipsDosFiltros(f);
    expect(chips.map((c) => c.id)).toEqual(["q", "meus", "servico", "faixa"]);
    expect(chips[0].valor).toBe("marta");
    const sem = chips.reduce((acc, c) => ({ ...acc, ...c.limpar }), f);
    expect(filtrosAtivos(sem)).toBe(false);
  });
  it("fases e Para tratar contam como filtros ativos mesmo sem chip removível", () => {
    expect(filtrosAtivos({ ...SEM_FILTROS, fases: ["contrato"] })).toBe(true);
    expect(filtrosAtivos({ ...SEM_FILTROS, paraTratar: true })).toBe(true);
    expect(chipsDosFiltros({ ...SEM_FILTROS, fases: ["contrato"], paraTratar: true })).toEqual([]);
  });
  it("sem filtros não há chips", () => {
    expect(chipsDosFiltros(SEM_FILTROS)).toEqual([]);
  });
});
