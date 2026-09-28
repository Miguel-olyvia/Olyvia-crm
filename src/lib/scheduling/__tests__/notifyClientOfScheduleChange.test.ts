import { describe, it, expect, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { detectScheduleChanges, notifyClientOfScheduleChange } from "../notifyClientOfScheduleChange";

describe("detectScheduleChanges", () => {
  it("a mesma data em formato ISO diferente nao conta como mudanca", () => {
    const prev = {
      start_datetime: "2026-10-05T10:00:00Z",
      end_datetime: "2026-10-05T11:00:00Z",
    };
    const next = {
      start_datetime: "2026-10-05T10:00:00+00:00",
      end_datetime: "2026-10-05T11:00:00+00:00",
    };
    expect(detectScheduleChanges(prev, next, null)).toEqual([]);
  });

  it("so o end muda: datetime", () => {
    const prev = { start_datetime: "2026-10-05T10:00:00Z", end_datetime: "2026-10-05T11:00:00Z" };
    const next = { start_datetime: "2026-10-05T10:00:00Z", end_datetime: "2026-10-05T12:00:00Z" };
    expect(detectScheduleChanges(prev, next, null)).toEqual(["datetime"]);
  });

  it("os mesmos assignees por outra ordem nao contam", () => {
    const prev = {
      start_datetime: "2026-10-05T10:00:00Z",
      end_datetime: "2026-10-05T11:00:00Z",
      assignees: [{ resource_id: "a" }, { resource_id: "b" }],
    };
    expect(detectScheduleChanges(prev, {}, ["b", "a"])).toEqual([]);
  });

  it("troca de assignee da assignee", () => {
    const prev = {
      start_datetime: "2026-10-05T10:00:00Z",
      end_datetime: "2026-10-05T11:00:00Z",
      assignees: [{ resource_id: "a" }],
    };
    expect(detectScheduleChanges(prev, {}, ["b"])).toEqual(["assignee"]);
  });

  it("as duas mudancas dao ['datetime','assignee']", () => {
    const prev = {
      start_datetime: "2026-10-05T10:00:00Z",
      end_datetime: "2026-10-05T11:00:00Z",
      assignees: [{ resource_id: "a" }],
    };
    const next = { start_datetime: "2026-10-05T14:00:00Z" };
    expect(detectScheduleChanges(prev, next, ["b"])).toEqual(["datetime", "assignee"]);
  });

  it("prev null devolve []", () => {
    expect(detectScheduleChanges(null, { start_datetime: "2026-10-05T10:00:00Z" }, ["a"])).toEqual([]);
  });
});

describe("notifyClientOfScheduleChange", () => {
  it("nao chama nada com changes vazio", async () => {
    invokeMock.mockClear();
    const result = await notifyClientOfScheduleChange("item-1", []);
    expect(result).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("devolve null sem lancar excepcao quando invoke devolve error", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    const result = await notifyClientOfScheduleChange("item-1", ["datetime"]);
    expect(result).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("notify-schedule-change", {
      body: { schedule_item_id: "item-1", changes: ["datetime"] },
    });
  });
});
