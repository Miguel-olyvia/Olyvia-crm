// 19/11 (testarh congelado depois do lote 2): uma data de início inválida no plano fazia o cálculo do fim da fase de uma parcela «a meio da
// obra» entrar num ciclo sem fim (os feriados de uma data NaN também são NaN, por isso nunca se encontrava um dia útil).
import { describe, expect, it } from "vitest";
import { diasDaObra, proximoUtil, deIso } from "./planoObra";
import { faseAcabou, fimDaFase } from "./parcelas";
import type { Negocio } from "./motor";

describe("datas inválidas não congelam", () => {
  it("proximoUtil e diasDaObra com uma data inválida acabam logo", () => {
    expect(Number.isNaN(proximoUtil(new Date(NaN)).getTime())).toBe(true);
    expect(diasDaObra(new Date(NaN), 10)).toEqual([]);
    expect(diasDaObra(deIso("2026-11-23"), Number.NaN)).toEqual([]);
    expect(diasDaObra(deIso("2026-11-23"), 3)).toHaveLength(3);
  });
  it("o fim da fase com o início do plano num formato que não é ISO: null, sem ciclo", () => {
    const d = { f: {}, obra: { estado: "em curso", plano: { origem: "orcamento", inicio: "seg, 23 nov", tasks: [{ fase: 2, dia: 0, dur: 3 }] } } } as unknown as Negocio;
    expect(fimDaFase(d, 2)).toBeNull();
    expect(faseAcabou(d, 2, "2026-12-01")).toBe(false);
    const d2 = { f: { inicio: "23/11/2026" }, obra: { estado: "em curso", plano: { origem: "orcamento", tasks: [{ fase: 2, dia: 0, dur: 3 }] } } } as unknown as Negocio;
    expect(fimDaFase(d2, 2)).toBeNull();
  });
});
