import { describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { ehGanho } from "./negociosApp";
import { ETAPAS_FUNIL, numeros, rotuloOrigem } from "./numerosV1Docs";

describe("Números do V1", () => {
  it("o funil desce (ou fica) etapa a etapa e acaba nos ganhos", () => {
    const S = seed(), N = numeros(S);
    expect(N.funil.map((e) => e.nome)).toEqual([...ETAPAS_FUNIL]);
    expect(N.funil[0].n).toBe(S.deals.length);
    for (let i = 1; i < N.funil.length; i++) expect(N.funil[i].n).toBeLessThanOrEqual(N.funil[i - 1].n);
    expect(N.funil[N.funil.length - 1].n).toBe(S.deals.filter(ehGanho).length);
    expect(N.funil[0].parte).toBe(1);
  });

  it("sem perdidos diz zero; ao perder uma lead com motivo, o motivo conta", () => {
    const S = seed();
    expect(numeros(S).nPerdidos).toBe(0);
    const A = acoes(S, vi.fn(), (fn) => fn());
    const d = S.deals.find((x) => x.nome === "Rita Sousa")!;
    d.motivoPerda = "Preço"; A.perderSim(d.id);
    const N = numeros(S);
    expect(N.nPerdidos).toBe(1);
    expect(N.perdas).toEqual([{ nome: "Preço", n: 1 }]);
    // o perdido continua no funil, nas etapas a que chegou
    expect(N.funil[0].n).toBe(S.deals.length);
  });

  it("as origens somam todos os negócios e dizem-se com maiúscula", () => {
    const S = seed(), N = numeros(S);
    expect(N.origens.reduce((a, o) => a + o.n, 0)).toBe(S.deals.length);
    expect(rotuloOrigem("site")).toBe("Site");
    expect(rotuloOrigem("à mão")).toBe("Registada à mão");
    expect(rotuloOrigem("")).toBe("Sem origem");
  });

  it("a conversão e a margem existem com dados e a margem está entre 0 e 1", () => {
    const N = numeros(seed());
    expect(N.conversao).not.toBeNull();
    expect(N.margem).not.toBeNull();
    expect(N.margem!).toBeGreaterThan(0);
    expect(N.margem!).toBeLessThan(1);
  });
});
