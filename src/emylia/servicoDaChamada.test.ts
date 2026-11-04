import { describe, expect, it } from "vitest";
import { acoes, seed } from "./motor";

// 4/11 (Rúben): na Qualificação, quem liga confirma ou troca o serviço que veio da lead
describe("o serviço confirmado na chamada", () => {
  it("confirmar fica no histórico e marca o serviço como confirmado, sem o mudar", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 1 && x.linha === "wc" && !x.linhaPorDefinir)!;
    const nome = d.servico;
    acoes(S, () => {}, (fn) => fn()).servicoDaChamada(d.id, "wc");
    expect(d.linha).toBe("wc");
    expect(d.servico).toBe(nome);
    expect(d.f.servico_validado).toBe("Sim");
    expect(d.hist[0].t).toBe("Serviço confirmado na chamada: Casa de banho");
  });

  it("trocar muda a linha e o nome que era o da linha; um nome escrito à mão fica", () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.fase === 1)!;
    Object.assign(d, { linha: "wc", servico: "Casa de banho" }); delete d.linhaPorDefinir;
    A.servicoDaChamada(d.id, "coz");
    expect(d).toMatchObject({ linha: "coz", servico: "Cozinha" });
    expect(d.hist[0].t).toBe("Serviço confirmado na chamada: Cozinha (era Casa de banho)");
    d.servico = "Cozinha do T3 da Rua A";
    A.servicoDaChamada(d.id, "wc");
    expect(d).toMatchObject({ linha: "wc", servico: "Cozinha do T3 da Rua A" });
  });

  it("uma lead sem serviço fica com o escolhido na chamada", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 1)!;
    Object.assign(d, { linhaPorDefinir: true, servico: "Por definir" });
    acoes(S, () => {}, (fn) => fn()).servicoDaChamada(d.id, "coz");
    expect(d.linhaPorDefinir).toBeUndefined();
    expect(d).toMatchObject({ linha: "coz", servico: "Cozinha" });
    expect(d.hist[0].t).toBe("Serviço confirmado na chamada: Cozinha");
  });
});
