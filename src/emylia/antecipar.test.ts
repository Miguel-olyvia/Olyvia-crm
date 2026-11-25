// 25/11 (Rúben: «permitir antecipar»): o gestor pode pôr uma tarefa antes do fim da fase anterior (na 1048, a cozinha não espera pelos
// revestimentos da casa de banho). Fica antecipada e as fases deixam de a empurrar.
import { describe, expect, it } from "vitest";
import { anteciparInicio, encadearFases, inicioMinimo, mudarInicio } from "./ajustesPlano";
import type { Plano, Tarefa } from "./motor";

const T = (nome: string, fase: number, dia: number, dur: number): Tarefa => ({ nome, svcs: [], dia, dur, sk: "x", h: dur * 8, tec: null, fase });
const plano = (): Plano => ({ estado: "aprovado", dia: 0, tasks: [T("Demolição", 1, 0, 3), T("Canalização", 2, 2, 2), T("Revestimento", 3, 3, 4), T("Móveis da cozinha", 4, 6, 2)] });

describe("antecipar uma tarefa", () => {
  it("sem antecipar, a tarefa não começa antes do último dia da fase anterior", () => {
    const p = plano();
    mudarInicio(p, 3, 1);
    expect(p.tasks[3].dia).toBe(inicioMinimo(p, 3));
    expect(p.tasks[3].antecipada).toBeUndefined();
  });

  it("antecipar põe-na no dia escolhido, marcada; as fases não a empurram de volta", () => {
    const p = plano();
    anteciparInicio(p, 3, 1);
    expect(p.tasks[3].dia).toBe(1);
    expect(p.tasks[3].antecipada).toBe(true);
    encadearFases(p);
    mudarInicio(p, 3, 1);
    expect(p.tasks[3].dia).toBe(1);
  });

  it("posta outra vez depois da fase anterior, perde a marca", () => {
    const p = plano();
    anteciparInicio(p, 3, 1);
    anteciparInicio(p, 3, 9);
    expect(p.tasks[3].dia).toBe(9);
    expect(p.tasks[3].antecipada).toBeUndefined();
  });
});
