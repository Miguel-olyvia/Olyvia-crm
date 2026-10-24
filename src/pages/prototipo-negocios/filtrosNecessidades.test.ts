import { describe, expect, it } from "vitest";
import { NOMES_FASES, faseDoNome, filtrarPorFase, filtroAtivo, nomeDaFase, textoResultados } from "./filtrosNecessidades";
import type { FaseObra } from "./fasesObra";

describe("os filtros das Necessidades", () => {
  it("as fases pelo nome, ida e volta", () => {
    expect(NOMES_FASES).toEqual(["Preparação e demolições", "Infraestruturas", "Revestimentos", "Montagem final"]);
    for (const n of NOMES_FASES) expect(nomeDaFase(faseDoNome(n))).toBe(n);
    expect(faseDoNome(null)).toBeNull();
    expect(faseDoNome("Pintura")).toBeNull();
    expect(nomeDaFase(null)).toBeNull();
  });

  it("filtra pela fase; um item de várias fases aparece em cada uma", () => {
    const itens: { n: string; f: FaseObra[] }[] = [{ n: "demolição", f: [1] }, { n: "roço", f: [2, 3] }, { n: "louças", f: [4] }];
    const de = (x: (typeof itens)[number]) => x.f;
    expect(filtrarPorFase(itens, null, de)).toHaveLength(3);
    expect(filtrarPorFase(itens, 2, de).map((x) => x.n)).toEqual(["roço"]);
    expect(filtrarPorFase(itens, 3, de).map((x) => x.n)).toEqual(["roço"]);
    expect(filtrarPorFase(itens, 1, de).map((x) => x.n)).toEqual(["demolição"]);
  });

  it("sabe quando há filtro ligado (espaços na pesquisa não contam)", () => {
    expect(filtroAtivo({ q: "", fase: null, tipo: null })).toBe(false);
    expect(filtroAtivo({ q: "   ", fase: null, tipo: null })).toBe(false);
    expect(filtroAtivo({ q: "gás", fase: null, tipo: null })).toBe(true);
    expect(filtroAtivo({ q: "", fase: 3, tipo: null })).toBe(true);
    expect(filtroAtivo({ q: "", fase: null, tipo: "Canalização" })).toBe(true);
  });

  it("conta os resultados em palavras", () => {
    expect(textoResultados(0, "serviço", "serviços", "Nenhum serviço")).toBe("Nenhum serviço");
    expect(textoResultados(1, "serviço", "serviços", "Nenhum serviço")).toBe("1 serviço");
    expect(textoResultados(12, "produto", "produtos", "Nenhum produto")).toBe("12 produtos");
  });
});
