import { describe, it, expect } from "vitest";
import { classifyAgendaItems, isTerminalStatus } from "@/lib/agenda/classify";
import { getDayWindow } from "@/lib/agenda/dayWindow";
import { getItemType, getLeadId } from "@/lib/agenda/itemType";
import type { AgendaItemRow } from "@/lib/agenda/types";

const DIA = new Date(2026, 8, 1, 10, 0, 0);
const window = getDayWindow(DIA);

function at(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month, day, hour, minute, 0, 0).toISOString();
}

function item(overrides: Partial<AgendaItemRow> & { id: string }): AgendaItemRow {
  return {
    title: "Item",
    status: "scheduled",
    start_datetime: at(2026, 8, 1, 9),
    end_datetime: at(2026, 8, 1, 10),
    ...overrides,
  };
}

describe("classifyAgendaItems", () => {
  it("separa atrasado, agenda de hoje e sem hora", () => {
    const rows = [
      item({ id: "atrasado", start_datetime: at(2026, 7, 28, 15) }),
      item({ id: "hoje", start_datetime: at(2026, 8, 1, 14) }),
      item({ id: "semHora", start_datetime: at(2026, 8, 1, 0), all_day: true }),
    ];

    const { overdue, timed, allDay } = classifyAgendaItems(rows, window);
    expect(overdue.map((r) => r.id)).toEqual(["atrasado"]);
    expect(timed.map((r) => r.id)).toEqual(["hoje"]);
    expect(allDay.map((r) => r.id)).toEqual(["semHora"]);
  });

  it("não trata como atrasado o que já está concluído ou cancelado", () => {
    const rows = [
      item({ id: "feito", start_datetime: at(2026, 7, 28, 15), status: "completed" }),
      item({ id: "cancelado", start_datetime: at(2026, 7, 28, 16), status: "cancelled" }),
      item({ id: "porFazer", start_datetime: at(2026, 7, 28, 17), status: "in_progress" }),
      item({ id: "reagendado", start_datetime: at(2026, 7, 29, 9), status: "rescheduled" }),
    ];

    expect(classifyAgendaItems(rows, window).overdue.map((r) => r.id)).toEqual(["porFazer", "reagendado"]);
  });

  it("mantém no dia os itens concluídos do próprio dia", () => {
    const rows = [item({ id: "feitoHoje", start_datetime: at(2026, 8, 1, 8), status: "completed" })];
    expect(classifyAgendaItems(rows, window).timed.map((r) => r.id)).toEqual(["feitoHoje"]);
  });

  it("descarta o que é depois do dia visível", () => {
    const rows = [item({ id: "amanha", start_datetime: at(2026, 8, 2, 9) })];
    const sections = classifyAgendaItems(rows, window);
    expect([...sections.overdue, ...sections.timed, ...sections.allDay]).toEqual([]);
  });

  it("inclui as fronteiras exactas do dia local", () => {
    const rows = [
      item({ id: "primeiroMinuto", start_datetime: new Date(2026, 8, 1, 0, 0, 0, 0).toISOString() }),
      item({ id: "ultimoMinuto", start_datetime: new Date(2026, 8, 1, 23, 59, 59, 999).toISOString() }),
    ];
    expect(classifyAgendaItems(rows, window).timed.map((r) => r.id)).toEqual(["primeiroMinuto", "ultimoMinuto"]);
  });

  it("ordena por hora, do mais cedo para o mais tarde", () => {
    const rows = [
      item({ id: "tarde", start_datetime: at(2026, 8, 1, 17) }),
      item({ id: "manha", start_datetime: at(2026, 8, 1, 9) }),
      item({ id: "almoco", start_datetime: at(2026, 8, 1, 13) }),
    ];
    expect(classifyAgendaItems(rows, window).timed.map((r) => r.id)).toEqual(["manha", "almoco", "tarde"]);
  });

  it("desempata pelo título quando a hora é a mesma", () => {
    const rows = [
      item({ id: "b", title: "Zulu", start_datetime: at(2026, 8, 1, 11) }),
      item({ id: "a", title: "Alfa", start_datetime: at(2026, 8, 1, 11) }),
    ];
    expect(classifyAgendaItems(rows, window).timed.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("ordena os atrasados do mais antigo para o mais recente", () => {
    const rows = [
      item({ id: "ontem", start_datetime: at(2026, 7, 31, 9) }),
      item({ id: "semanaPassada", start_datetime: at(2026, 7, 25, 9) }),
    ];
    expect(classifyAgendaItems(rows, window).overdue.map((r) => r.id)).toEqual(["semanaPassada", "ontem"]);
  });

  it("ignora itens com data inválida em vez de rebentar", () => {
    const rows = [item({ id: "mau", start_datetime: "nao-e-uma-data" })];
    const sections = classifyAgendaItems(rows, window);
    expect([...sections.overdue, ...sections.timed, ...sections.allDay]).toEqual([]);
  });
});

describe("isTerminalStatus", () => {
  it("só completed e cancelled fecham o item", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("scheduled")).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
  });
});

describe("getItemType", () => {
  it("a ausência de tipo é o caso normal", () => {
    expect(getItemType({ metadata: null })).toBeNull();
    expect(getItemType({ metadata: {} })).toBeNull();
    expect(getItemType({ metadata: { visit_type: "  " } })).toBeNull();
  });

  it("lê as duas convenções, com item_type à frente", () => {
    expect(getItemType({ metadata: { visit_type: "site_visit" } })).toBe("site_visit");
    expect(getItemType({ metadata: { item_type: "call", visit_type: "meeting" } })).toBe("call");
  });
});

describe("getLeadId", () => {
  it("lê a lead de metadata, porque não existe coluna lead_id", () => {
    expect(getLeadId({ metadata: { lead_id: "lead-1" } })).toBe("lead-1");
    expect(getLeadId({ metadata: { lead_id: 42 } })).toBeNull();
    expect(getLeadId({ metadata: null })).toBeNull();
  });
});
