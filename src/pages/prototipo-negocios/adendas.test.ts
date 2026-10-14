import { describe, expect, it } from "vitest";
import { acoes, seed } from "./motor";
import { diasAdenda, totalAdenda, totalComIva } from "./adendas";

// 1027 Tiago Almeida: contrato assinado, plano do orçamento por aprovar
const preparar = () => { const S = seed(); return { S, A: acoes(S, () => {}, (fn) => fn()), d: S.deals.find((x) => x.id === 1027)! }; };

describe("trabalhos a mais (adenda)", () => {
  it("a adenda vai ao cliente com o preço e os dias; assinada, as tarefas entram no plano na fase do serviço", () => {
    const { A, d } = preparar();
    const n0 = d.obra.plano!.tasks.length;
    A.aprovarPlano(d.id);
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    const a = d.adendas![0];
    expect(a).toMatchObject({ n: "AD 2026/1027-1", estado: "enviada", motivo: "O cliente pediu" });
    expect(totalAdenda(a.linhas)).toBeGreaterThan(0);
    expect(totalComIva(a.linhas)).toBeCloseTo(totalAdenda(a.linhas) * 1.06, 2);
    expect(diasAdenda(a.linhas)).toBeGreaterThanOrEqual(1);
    expect(d.obra.plano!.tasks).toHaveLength(n0); // só entra quando o cliente assina
    A.assinarAdenda(d.id, a.n);
    const p = d.obra.plano!;
    expect(a.estado).toBe("assinada");
    expect(p.tasks).toHaveLength(n0 + 1);
    const t = p.tasks.find((x) => /adenda AD 2026\/1027-1/.test(x.nome))!;
    expect(t.svcs).toEqual(["pint"]);
    expect(p.estado).toBe("por aprovar"); // o plano estava aprovado: volta às Operações
    // as tarefas das fases seguintes andam para a frente; as anteriores ficam
    expect(p.tasks.filter((x) => (x.fase ?? 4) > t.fase!).every((x) => x.dia >= t.dia + t.dur)).toBe(true);
  });
  it("antes do contrato não há adenda (muda-se a proposta)", () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1031)!;
    A.criarAdenda(d.id, [{ sid: "pint", q: 5 }], "O cliente pediu");
    expect(d.adendas).toBeUndefined();
  });
});
