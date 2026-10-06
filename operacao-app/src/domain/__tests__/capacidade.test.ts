import { describe, expect, it } from "vitest";
import {
  apertos,
  avaliarCelula,
  composicao,
  fraseAperto,
  horas,
  percentagem,
  type Capacidade,
  type CelulaCapacidade,
} from "../capacidade";

const cel = (p: Partial<CelulaCapacidade>): CelulaCapacidade => ({
  w: 0,
  oferta: 0,
  procura: 0,
  certa: 0,
  atrasado: 0,
  faltam: 0,
  ...p,
});

describe("avaliarCelula", () => {
  it("folga até 85 %, apertado até 100 %, falta acima", () => {
    expect(avaliarCelula(cel({ oferta: 2400, procura: 2000 }), 5, "tudo").nivel).toBe("folga");
    expect(avaliarCelula(cel({ oferta: 2400, procura: 2200 }), 5, "tudo").nivel).toBe("apertado");
    expect(avaliarCelula(cel({ oferta: 2400, procura: 2400 }), 5, "tudo").nivel).toBe("apertado");
    const a = avaliarCelula(cel({ oferta: 2400, procura: 5000 }), 5, "tudo");
    expect(a.nivel).toBe("falta");
    // 2600 min a mais numa semana de 5 dias × 480 → 2 pessoas.
    expect(a.faltam).toBe(2);
  });

  it("sem ninguém com a especialidade mas com trabalho", () => {
    const a = avaliarCelula(cel({ oferta: 0, procura: 600 }), 5, "tudo");
    expect(a.nivel).toBe("sem_gente");
    expect(a.faltam).toBe(1);
    expect(a.ocupacao).toBeNull();
  });

  it("vazio quando não há trabalho nem equipa", () => {
    expect(avaliarCelula(cel({}), 5, "tudo").nivel).toBe("vazio");
  });

  it("no modo 'só o certo' ignora o comercial ponderado", () => {
    const c = cel({ oferta: 2400, procura: 4000, certa: 1000 });
    expect(avaliarCelula(c, 5, "tudo").nivel).toBe("falta");
    expect(avaliarCelula(c, 5, "certo").nivel).toBe("folga");
  });

  it("migalhas de arredondamento não dão 'falta 1'", () => {
    expect(avaliarCelula(cel({ oferta: 2400, procura: 2400.3 }), 5, "tudo").nivel).toBe("apertado");
  });
});

const cap: Capacidade = {
  inicio: "2026-11-02",
  hoje: "2026-11-04",
  semanas: [
    { w: 0, inicio: "2026-11-02", dias: 3 },
    { w: 1, inicio: "2026-11-09", dias: 5 },
  ],
  especialidades: [
    {
      id: "can",
      nome: "Canalização",
      pessoas: 1,
      celulas: [cel({ w: 0, oferta: 1440, procura: 500 }), cel({ w: 1, oferta: 2400, procura: 7300, certa: 2000 })],
    },
    {
      id: "pin",
      nome: "Pintura",
      pessoas: 0,
      celulas: [cel({ w: 0, procura: 300, certa: 300 }), cel({ w: 1 })],
    },
  ],
  fontes: [
    { tipo: "obra", id: "o1", codigo: "OB-1", titulo: "Obra", prob: 1, minutos: 3300, celulas: [
      { s: "can", w: 1, m: 3000 }, { s: "pin", w: 0, m: 300 }] },
    { tipo: "proposta", id: "q1", codigo: "Q-1", titulo: "Proposta", prob: 0.5, minutos: 4300, celulas: [
      { s: "can", w: 1, m: 4300 }] },
  ],
  resumo: { obras: 1, contratos: 0, aceites: 0, propostas: 1, propostas_total: 1, erros: 0, pessoas_sem_especialidade: 0 },
};

describe("apertos e frases", () => {
  it("lista o pior primeiro e escreve a frase", () => {
    const l = apertos(cap, "tudo");
    expect(l.map((a) => [a.especialidade, a.semana.w])).toEqual([
      ["Canalização", 1],
      ["Pintura", 0],
    ]);
    expect(fraseAperto(l[0])).toBe("Faltam ~3 pessoas de Canalização na semana de 09/11");
    expect(fraseAperto(l[1])).toBe("Ninguém com Pintura e há 5 h de trabalho na semana de 02/11");
  });

  it("só com o certo, a Canalização chega", () => {
    expect(apertos(cap, "certo").map((a) => a.especialidade)).toEqual(["Pintura"]);
  });
});

describe("composicao", () => {
  it("diz de onde vem a procura de uma célula, maior primeiro", () => {
    expect(composicao(cap, "can", 1, "tudo").map((p) => [p.fonte.id, p.minutos])).toEqual([
      ["q1", 4300],
      ["o1", 3000],
    ]);
    expect(composicao(cap, "can", 1, "certo").map((p) => p.fonte.id)).toEqual(["o1"]);
  });
});

describe("formatos", () => {
  it("horas e percentagem", () => {
    expect(horas(90)).toBe("1,5 h");
    expect(horas(720)).toBe("12 h");
    expect(percentagem(1.234)).toBe("123 %");
    expect(percentagem(null)).toBe("—");
  });
});
