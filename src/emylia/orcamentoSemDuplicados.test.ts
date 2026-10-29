// 29/10 (teste no browser): um serviço escolhido com a linha "geral" e depois incluído no pacote da linha (a divisão da visita passou a
// linha a WC) não fica duas vezes no orçamento.
import { describe, expect, it } from "vitest";
import { criarOrc, seed } from "./motor";

describe("criarOrc sem serviços repetidos", () => {
  it("o extra de um serviço que já está no pacote não entra; um extra fora do pacote entra", () => {
    const S = seed();
    const d = structuredClone(S.deals.find((x) => x.linha === "wc")!);
    d.visita.med = { pav: 4, par: 16, pts: 5, pcs: 3 };
    d.visita.off = [];
    d.visita.extra = { canal: 1, revest: 1 };
    const o = criarOrc(d, S);
    const canal = o.linhas.filter((l) => l.t === "svc" && l.sid === "canal");
    expect(canal).toHaveLength(1);
    expect(canal[0]).toMatchObject({ q: 5 });
    expect(o.linhas.filter((l) => l.t === "svc" && l.sid === "revest")).toHaveLength(1);
    const fora = Object.keys(S.svc).find((k) => !["demol", "canal", "revest", "pav", "loucas", "moveis", "teto", "pint", "eletr"].includes(k));
    if (fora) {
      d.visita.extra = { [fora]: 2 };
      expect(criarOrc(d, S).linhas.some((l) => l.t === "svc" && l.sid === fora)).toBe(true);
    }
  });
});
