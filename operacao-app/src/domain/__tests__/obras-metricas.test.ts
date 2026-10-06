import { describe, expect, it } from "vitest";
import {
  metricasPorModelo,
  metricasPorPessoa,
  type RegistoMetrica,
  type TarefaMetrica,
} from "../obras-metricas";

const tarefa = (p: Partial<TarefaMetrica>): TarefaMetrica => ({
  id: "t",
  modeloTarefaId: "m-demolir",
  nome: "Demolição",
  estado: "validada",
  minutosPrevistos: 300,
  ...p,
});

describe("métricas por tarefa-modelo — o default está errado?", () => {
  it("desvio consistente em 3 obras: default curto, sugere a mediana", () => {
    const tarefas = [
      tarefa({ id: "a" }),
      tarefa({ id: "b" }),
      tarefa({ id: "c", estado: "feita" }),
    ];
    const registos: RegistoMetrica[] = [
      { tarefaId: "a", utilizadorId: "u1", minutos: 400 },
      { tarefaId: "b", utilizadorId: "u2", minutos: 420 },
      { tarefaId: "c", utilizadorId: "u1", minutos: 200 },
      { tarefaId: "c", utilizadorId: "u3", minutos: 233 },
    ];
    const [m] = metricasPorModelo(tarefas, registos);
    expect(m.n).toBe(3);
    expect(m.mediaPrevistos).toBe(300);
    expect(m.mediaReais).toBe(418);
    expect(m.razao).toBe(1.39);
    expect(m.veredicto).toBe("default_curto");
    expect(m.sugestao).toBe(420);
  });

  it("com menos de 3 obras não tira conclusões", () => {
    const [m] = metricasPorModelo([tarefa({ id: "a" })], [{ tarefaId: "a", utilizadorId: "u", minutos: 900 }]);
    expect(m.veredicto).toBe("poucos_dados");
  });

  it("default longo e default certo", () => {
    const longo = metricasPorModelo(
      [1, 2, 3].map((i) => tarefa({ id: `l${i}`, modeloTarefaId: "m-l", minutosPrevistos: 100 })),
      [1, 2, 3].map((i) => ({ tarefaId: `l${i}`, utilizadorId: "u", minutos: 60 }))
    );
    expect(longo[0].veredicto).toBe("default_longo");
    const certo = metricasPorModelo(
      [1, 2, 3].map((i) => tarefa({ id: `c${i}`, modeloTarefaId: "m-c", minutosPrevistos: 100 })),
      [95, 110, 105].map((m, i) => ({ tarefaId: `c${i + 1}`, utilizadorId: "u", minutos: m }))
    );
    expect(certo[0].veredicto).toBe("certo");
  });

  it("ignora tarefas por terminar e sem tempo; agrupa as manuais pelo nome", () => {
    const r = metricasPorModelo(
      [
        tarefa({ id: "a", estado: "em_curso" }),
        tarefa({ id: "b" }),
        tarefa({ id: "m1", modeloTarefaId: null, nome: "Pintar muro" }),
        tarefa({ id: "m2", modeloTarefaId: null, nome: "pintar muro " }),
      ],
      [
        { tarefaId: "a", utilizadorId: "u", minutos: 999 },
        { tarefaId: "m1", utilizadorId: "u", minutos: 300 },
        { tarefaId: "m2", utilizadorId: "u", minutos: 330 },
      ]
    );
    expect(r).toHaveLength(1);
    expect(r[0].chave).toBe("nome:pintar muro");
    expect(r[0].n).toBe(2);
  });

  it("ordena pelo maior desvio primeiro", () => {
    const r = metricasPorModelo(
      [
        tarefa({ id: "a", modeloTarefaId: "x", nome: "X" }),
        tarefa({ id: "b", modeloTarefaId: "y", nome: "Y" }),
      ],
      [
        { tarefaId: "a", utilizadorId: "u", minutos: 310 },
        { tarefaId: "b", utilizadorId: "u", minutos: 600 },
      ]
    );
    expect(r.map((m) => m.nome)).toEqual(["Y", "X"]);
  });
});

describe("métricas por pessoa — formação ou boa prática?", () => {
  // Três tarefas de 100 min previstos.
  const tarefas = [1, 2, 3, 4].map((i) => tarefa({ id: `t${i}`, minutosPrevistos: 100 }));

  it("razão pesada pelo tempo de cada um nas tarefas em que esteve", () => {
    const registos: RegistoMetrica[] = [
      // t1: só o lento, 150 → razão 1,5
      { tarefaId: "t1", utilizadorId: "lento", minutos: 150 },
      // t2: os dois, 80 + 80 → razão 1,6
      { tarefaId: "t2", utilizadorId: "lento", minutos: 80 },
      { tarefaId: "t2", utilizadorId: "rapido", minutos: 80 },
      // t3: só o lento, 130 → 1,3
      { tarefaId: "t3", utilizadorId: "lento", minutos: 130 },
      // t4: só o rápido, 60 → 0,6
      { tarefaId: "t4", utilizadorId: "rapido", minutos: 60 },
    ];
    const r = metricasPorPessoa(tarefas, registos);
    const lento = r.find((p) => p.utilizadorId === "lento")!;
    const rapido = r.find((p) => p.utilizadorId === "rapido")!;
    // (150×1,5 + 80×1,6 + 130×1,3) / 360 = 1,45
    expect(lento.razao).toBe(1.45);
    expect(lento.nTarefas).toBe(3);
    expect(lento.veredicto).toBe("mais_lento");
    expect(rapido.nTarefas).toBe(2);
    expect(rapido.veredicto).toBe("poucos_dados");
    expect(r[0].utilizadorId).toBe("lento");
  });

  it("mais rápido com amostra suficiente", () => {
    const r = metricasPorPessoa(
      tarefas,
      ["t1", "t2", "t3"].map((t) => ({ tarefaId: t, utilizadorId: "boa", minutos: 70 }))
    );
    expect(r[0]).toMatchObject({ veredicto: "mais_rapido", razao: 0.7, minutos: 210 });
  });

  it("sem tarefas terminadas não há métricas", () => {
    expect(metricasPorPessoa([tarefa({ id: "x", estado: "em_curso" })], [
      { tarefaId: "x", utilizadorId: "u", minutos: 10 },
    ])).toEqual([]);
  });
});
