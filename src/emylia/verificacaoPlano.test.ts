// 23/10/2026: a verificação do plano antes de aprovar (verificacaoPlano.ts): técnicos noutra obra nos mesmos dias, tarefas sem técnico.
import { describe, expect, it } from "vitest";
import { seed, type Negocio, type Plano } from "./motor";
import { sobreposicoes, verificarPlano } from "./verificacaoPlano";

const plano = (inicio: string, tasks: { tec: string | null; dia: number; dur: number }[], estado: Plano["estado"] = "por aprovar"): Plano =>
  ({ estado, origem: "orcamento", inicio, dia: 0, tasks: tasks.map((t, i) => ({ nome: `T${i + 1}`, svcs: [], sk: "x", h: 4, ...t })) } as unknown as Plano);
const obra = (S: ReturnType<typeof seed>, id: number, nome: string, p: Plano): Negocio => {
  const d = { ...structuredClone(S.deals[0]), id, nome, perdido: false, anulado: undefined } as Negocio;
  d.obra = { ...d.obra, plano: p };
  return d;
};

describe("rever o plano", () => {
  it("o mesmo técnico noutra obra nos mesmos dias, e o dia útil para começar depois", () => {
    const S = seed();
    const tec = S.deals.flatMap((d) => d.obra.plano?.tasks ?? []).find((t) => t.tec)?.tec ?? "hugo";
    const a = obra(S, 9001, "Obra A", plano("2026-10-26", [{ tec, dia: 0, dur: 2 }]));
    const b = obra(S, 9002, "Obra B", plano("2026-10-27", [{ tec, dia: 0, dur: 3 }], "aprovado"));
    S.deals = [a, b];
    const sob = sobreposicoes(a, S);
    expect(sob).toHaveLength(1);
    expect(sob[0]).toMatchObject({ outra: "Obra B", dia: "2026-10-27", fimOutra: "2026-10-29" });
    const p = verificarPlano(a, S, []).find((x) => x.id === "outras")!;
    expect(p.ok).toBe(false);
    expect(p.depois).toBe("2026-10-30"); // sexta, o dia útil a seguir ao fim da obra B
  });
  it("obras concluídas ou noutros dias não contam", () => {
    const S = seed();
    const a = obra(S, 9001, "Obra A", plano("2026-10-26", [{ tec: "x1", dia: 0, dur: 1 }]));
    const b = obra(S, 9002, "Obra B", plano("2026-10-26", [{ tec: "x1", dia: 0, dur: 1 }], "concluída"));
    const c = obra(S, 9003, "Obra C", plano("2026-11-09", [{ tec: "x1", dia: 0, dur: 1 }]));
    S.deals = [a, b, c];
    expect(sobreposicoes(a, S)).toEqual([]);
    expect(verificarPlano(a, S, []).find((x) => x.id === "outras")!.ok).toBe(true);
  });
  it("tarefas sem técnico e materiais em falta ficam por rever", () => {
    const S = seed();
    const a = obra(S, 9001, "Obra A", plano("2026-10-26", [{ tec: null, dia: 0, dur: 1 }]));
    S.deals = [a];
    const L = verificarPlano(a, S, ["receber o pagamento", "PO-1 por aprovar"]);
    expect(L.find((x) => x.id === "tecnicos")!.ok).toBe(false);
    expect(L.find((x) => x.id === "materiais")!.t).toBe("Materiais: falta PO-1 por aprovar");
  });
});
