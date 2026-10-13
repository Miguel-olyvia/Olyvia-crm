import { describe, expect, it } from "vitest";
import { AREA, CHAVE_PRINCIPAL, gruposArea, juntarDivisoes, reorganizarDivisoes } from "./campos";
import { efeitosDoLevantamento } from "./efeitosLevantamento";
import { acoes, protecoesSugeridas, seed, tot } from "./motor";

describe("área de intervenção com várias divisões", () => {
  it("uma divisão: o grupo de sempre; duas: a principal sem prefixo e a outra com div_{divisão}_", () => {
    expect(gruposArea(undefined, { diag_tipo_area: "Casa de banho" })).toEqual([AREA]);
    const gs = gruposArea(undefined, { diag_tipo_area: "Casa de banho, Cozinha" });
    expect(gs.map((g) => g.titulo)).toEqual(["Área de intervenção", "Área de intervenção · Cozinha"]);
    expect(gs[1].campos.map((c) => c.k)).toContain("div_coz_diag_gas");
    expect(gs[1].campos.some((c) => c.k.endsWith("diag_tipo_area"))).toBe(false);
    expect(gs[0].campos.find((c) => c.k === "diag_gas")!.bloco).toMatch(/^Casa de banho · /);
  });
  it("juntar: soma as contagens e fica com o pior caso nas escolhas; com uma divisão fica igual", () => {
    const f1 = { diag_tipo_area: "Casa de banho", diag_portas_proteger: "3" };
    expect(juntarDivisoes(f1)).toBe(f1);
    const f = {
      diag_tipo_area: "Casa de banho, Sala", diag_portas_proteger: "2", div_sala_diag_portas_proteger: "1",
      diag_distancia_entrada: "Curta (até 5 m)", div_sala_diag_distancia_entrada: "Longa (+15 m)",
      diag_janela: "Sim", div_sala_diag_janela: "Não", diag_gas: "Manter", div_sala_diag_gas: "Anular", diag_pontos_eletricos: "4", div_sala_diag_pontos_eletricos: "6",
    };
    const j = juntarDivisoes(f);
    expect(j).toMatchObject({ diag_portas_proteger: "3", diag_distancia_entrada: "Longa (+15 m)", diag_janela: "Não", diag_gas: "Anular", diag_pontos_eletricos: "10" });
    expect(Object.keys(j).some((k) => k.startsWith("div_"))).toBe(false);
    expect(juntarDivisoes(j)).toEqual(j); // juntar duas vezes dá o mesmo
    const e = efeitosDoLevantamento(f).map((x) => x.d);
    expect(e).toContain("Plástico de proteção em 3 portas");
    expect(e).toContain("Proteção do caminho: cartão canelado (20 m)");
    expect(protecoesSugeridas(f)).toContain("plástico nas 3 portas");
  });
  it("tirar a divisão principal: a nova principal passa para as chaves sem prefixo", () => {
    const f: Record<string, string> = { diag_tipo_area: "Casa de banho, Cozinha", [CHAVE_PRINCIPAL]: "Casa de banho", diag_gas: "Manter", div_coz_diag_gas: "Instalar" };
    f.diag_tipo_area = "Cozinha";
    reorganizarDivisoes(f);
    expect(f).toMatchObject({ [CHAVE_PRINCIPAL]: "Cozinha", diag_gas: "Instalar" });
    expect(f.div_coz_diag_gas).toBeUndefined();
  });
  it("o portão pede os campos da segunda divisão; os exemplos não mudam", () => {
    const S = seed();
    const antes = S.deals.filter((d) => d.orc).map((d) => tot(d, S).pf);
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1050)!;
    A.campo(d.id, "diag_tipo_area", "Casa de banho, Quarto");
    expect(d.f[CHAVE_PRINCIPAL]).toBe("Casa de banho");
    expect(S.deals.filter((x) => x.orc && x.id !== 1050).map((x) => tot(x, S).pf)).toEqual(antes.filter((_, i) => S.deals.filter((x) => x.orc)[i].id !== 1050));
  });
});
