// 5/11: o Estúdio abre a partir da Visita: a planta, as alturas e o estilo vêm do negócio.
import { describe, expect, it } from "vitest";
import { gravarPlanta, retangulo } from "@/emylia/planta";
import { coresDoTexto, estiloDasRespostas, projetoDaVisita } from "./daVisita";

describe("o Estúdio a partir da Visita", () => {
  it("as cores ditas num texto, pela ordem", () => {
    expect(coresDoTexto("Cinza 120 x 60 retificado")).toEqual(["cinza"]);
    expect(coresDoTexto("Axis Oak")).toEqual(["madeira"]);
    expect(coresDoTexto("Preto e cinza")).toEqual(["preto", "cinza"]);
    expect(coresDoTexto("")).toEqual([]);
  });

  it("o estilo: as cores das paredes, da base e das torneiras; o móvel à parte", () => {
    const e = estiloDasRespostas({ pc_rev_modelo: "Cinza 120 x 60", pc_base_cor: "Preto", pc_torn_cor: "Preto", pc_movel_frentes: "Axis Oak" });
    expect(e.cores).toEqual(["cinza", "preto"]);
    expect(e.porCategoria.movel).toEqual(["madeira"]);
  });

  it("o projeto: a planta da visita é o antes (e o depois começa igual), com o pé-direito e o teto falso", () => {
    const f = { planta: gravarPlanta({ o: { x: 0, y: 0 }, paredes: retangulo(234, 177), pecas: [] }), diag_pe_direito_m: "2,6 m", pc_teto: "Teto falso" };
    const p = projetoDaVisita("testeeeeeeee", f)!;
    expect(p.nome).toBe("testeeeeeeee");
    expect(p.antes.paredes).toEqual(retangulo(234, 177));
    expect(p.depois).toEqual(p.antes);
    expect(p.depois).not.toBe(p.antes);
    expect(p.alturas).toEqual({ peDireito: 260, tetoFalso: 240 });
  });

  it("sem planta desenhada não há projeto", () => {
    expect(projetoDaVisita("x", {})).toBeNull();
  });
});
