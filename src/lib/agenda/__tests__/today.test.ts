import { describe, it, expect } from "vitest";
import { buildAlertRows, getAgendaItemAction, getFirstName, getGreetingKey } from "../today";
import type { AgendaItem } from "../types";
import { QUICK_GROUPS } from "@/components/home/QuickLinks";
import { todayTranslations } from "@/translations/today";
import appSource from "@/App.tsx?raw";

function item(partial: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: "i1",
    title: "Visita",
    status: "scheduled",
    start_datetime: "2026-10-04T09:00:00Z",
    end_datetime: "2026-10-04T10:00:00Z",
    itemType: null,
    entity: null,
    ...partial,
  };
}

const all = () => true;
const none = () => false;

describe("getGreetingKey", () => {
  it("dá bom dia, boa tarde e boa noite conforme a hora local", () => {
    expect(getGreetingKey(new Date(2026, 9, 4, 8))).toBe("today.greeting.morning");
    expect(getGreetingKey(new Date(2026, 9, 4, 14))).toBe("today.greeting.afternoon");
    expect(getGreetingKey(new Date(2026, 9, 4, 21))).toBe("today.greeting.evening");
    expect(getGreetingKey(new Date(2026, 9, 4, 2))).toBe("today.greeting.evening");
  });
});

describe("getFirstName", () => {
  it("fica só com o primeiro nome", () => {
    expect(getFirstName("  Ruben  Carvalho ")).toBe("Ruben");
    expect(getFirstName(null)).toBe("");
  });
});

describe("getAgendaItemAction", () => {
  it("leva à ficha da lead quando há lead e permissão", () => {
    const action = getAgendaItemAction(item({ entity: { kind: "lead", id: "L1", name: "Ana" } }), all);
    expect(action).toEqual({ href: "/leads?open=L1", labelKey: "today.action.openLead" });
  });

  it("leva ao negócio quando não há entidade", () => {
    const action = getAgendaItemAction(item({ deal_id: "D1" }), all);
    expect(action.href).toBe("/deals?open=D1");
  });

  it("sem permissão para a ficha, cai na agenda", () => {
    const action = getAgendaItemAction(
      item({ entity: { kind: "client", id: "C1", name: "X" }, deal_id: "D1" }),
      none
    );
    expect(action).toEqual({ href: "/scheduling", labelKey: "today.action.openAgenda" });
  });
});

describe("buildAlertRows", () => {
  it("junta leads e contactos, ignora zeros e respeita permissões", () => {
    const rows = buildAlertRows(
      { lead: 2, contact: 1, quote: 3, proposal: 0 },
      (permission) => permission !== "quotes.view"
    );
    expect(rows).toEqual([{ id: "leads", labelKey: "today.alerts.leads", count: 3, href: "/leads" }]);
  });
});

describe("atalhos do ecrã Hoje", () => {
  it("só apontam para rotas reais (sem redirecionamentos nem rotas inexistentes)", () => {
    for (const group of QUICK_GROUPS) {
      for (const link of group.items) {
        const route = new RegExp(`path="${link.to}" element=\\{(?!<Navigate)`);
        expect(appSource, `${link.to} não é uma rota real`).toMatch(route);
      }
    }
  });

  it("todas as chaves novas existem em PT e EN", () => {
    const en = Object.keys(todayTranslations.en).sort();
    const ptKeys = Object.keys(todayTranslations.pt).sort();
    expect(ptKeys).toEqual(en);
  });
});
