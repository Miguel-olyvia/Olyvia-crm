import { describe, expect, it } from "vitest";
import type { Negocio } from "./motor";
import { dataDaVaga, proximidade, sugerirQuemVai } from "./sugestaoVisita";

const HOJE = new Date(2026, 10, 2);
const OPCOES = ["Ana (comercial)", "Bruno (comercial)", "Carla (técnico)"];

/** Um negócio com uma visita marcada (ou nenhuma). */
function neg(id: number, cp: string, localidade: string, visita?: { quem: string; data: string; hora: string; duracao?: string }): Negocio {
  const f: Record<string, string> = { cp, localidade };
  if (visita) Object.assign(f, { v1_quem: visita.quem, v1_data: visita.data, v1_hora: visita.hora, v1_estado: "Marcada", v1_duracao: visita.duracao ?? "1 h 30" });
  return { id, nome: "C" + id, tel: "", servico: "Remodelação", local: `Rua X, ${localidade}`, f, vis: visita ? [1] : [], hist: [], obra: {} } as unknown as Negocio;
}

describe("dataDaVaga", () => {
  it("lê a vaga no ano mais perto de hoje", () => {
    expect(dataDaVaga("ter 03/11 · 10:00", HOJE)).toEqual({ data: "2026-11-03", hora: "10:00" });
    expect(dataDaVaga("seg 04/01 · 9:30", HOJE)).toEqual({ data: "2027-01-04", hora: "09:30" });
    expect(dataDaVaga("sem data", HOJE)).toBeNull();
  });
});

describe("proximidade", () => {
  it("mesmo código postal, mesma localidade, mesma zona", () => {
    expect(proximidade({ cp: "2780-123" }, { cp: "2780-555" }).n).toBe(3);
    expect(proximidade({ cp: "2790-000", localidade: "Oeiras" }, { cp: "2700-000", localidade: "oeiras" }).n).toBe(2);
    expect(proximidade({ cp: "2790-000" }, { cp: "2700-000" }).n).toBe(2);
    expect(proximidade({ cp: "1000-000" }, { cp: "4000-000" }).n).toBe(0);
  });
});

describe("sugerirQuemVai", () => {
  const novo = neg(1, "2780-100", "Oeiras");

  it("sugere quem tem uma visita perto nesse dia e está livre à hora", () => {
    const deals = [novo, neg(2, "2780-200", "Oeiras", { quem: "Bruno (comercial)", data: "2026-11-03", hora: "09:00", duracao: "1 h" }),
      neg(3, "4000-100", "Porto", { quem: "Ana (comercial)", data: "2026-11-03", hora: "15:00" })];
    const s = sugerirQuemVai(deals, novo, "ter 03/11 · 10:00", OPCOES, HOJE)!;
    expect(s.quem).toBe("Bruno (comercial)");
    expect(s.motivo).toBe("livre às 10:00 · tem uma visita às 09:00 perto (2780)");
  });

  it("quem está ocupado a essa hora não é sugerido", () => {
    const deals = [novo, neg(2, "2780-200", "Oeiras", { quem: "Bruno (comercial)", data: "2026-11-03", hora: "09:30" })];
    const s = sugerirQuemVai(deals, novo, "ter 03/11 · 10:00", OPCOES, HOJE)!;
    expect(s.quem).toBe("Ana (comercial)");
    expect(s.ocupados).toEqual(["Bruno"]);
    expect(s.motivo).toBe("livre às 10:00 · sem visitas nesse dia");
  });

  it("só comerciais quando os há; ninguém livre, nenhuma sugestão", () => {
    const deals = [novo, neg(2, "1", "A", { quem: "Ana (comercial)", data: "2026-11-03", hora: "10:00" }), neg(3, "1", "A", { quem: "Bruno (comercial)", data: "2026-11-03", hora: "10:30" })];
    expect(sugerirQuemVai(deals, novo, "ter 03/11 · 10:00", OPCOES, HOJE)).toBeNull();
  });

  it("em empate, quem tem menos visitas nesse dia", () => {
    const deals = [novo, neg(2, "9000-000", "Funchal", { quem: "Ana (comercial)", data: "2026-11-03", hora: "16:00" })];
    expect(sugerirQuemVai(deals, novo, "ter 03/11 · 10:00", OPCOES, HOJE)!.quem).toBe("Bruno (comercial)");
  });
});
