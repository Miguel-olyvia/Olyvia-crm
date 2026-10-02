import { describe, expect, it } from "vitest";
import { applyRescheduleToItem } from "../clientConfirmation";

const item = {
  id: "v1",
  title: "Visita",
  status: "confirmed",
  start_datetime: "2026-10-01T09:00:00.000Z",
  end_datetime: "2026-10-01T10:00:00.000Z",
  confirmed_at: "2026-09-30T12:00:00.000Z",
};

describe("applyRescheduleToItem (arrastar na Agenda)", () => {
  const newStart = new Date("2026-10-02T09:00:00.000Z");
  const newEnd = new Date("2026-10-02T10:00:00.000Z");

  it("actualiza as datas, passa a rescheduled e limpa o selo do cliente", () => {
    const out = applyRescheduleToItem(item, newStart, newEnd);
    expect(out.start_datetime).toBe(newStart.toISOString());
    expect(out.end_datetime).toBe(newEnd.toISOString());
    expect(out.status).toBe("rescheduled");
    expect(out.confirmed_at).toBeNull();
  });

  it("nao altera o item original nem os outros campos", () => {
    const out = applyRescheduleToItem(item, newStart, newEnd);
    expect(item.status).toBe("confirmed");
    expect(item.confirmed_at).toBe("2026-09-30T12:00:00.000Z");
    expect(out.id).toBe("v1");
    expect(out.title).toBe("Visita");
  });

  it("visita sem confirmacao tambem passa a rescheduled", () => {
    const out = applyRescheduleToItem({ ...item, status: "scheduled", confirmed_at: null }, newStart, newEnd);
    expect(out.status).toBe("rescheduled");
    expect(out.confirmed_at).toBeNull();
  });
});
