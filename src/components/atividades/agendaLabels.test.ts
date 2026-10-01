import { describe, expect, it } from "vitest";
import { getStatusClass, getStatusLabel } from "./agendaLabels";

describe("agendaLabels: estado Confirmado", () => {
  it("tem rotulo proprio (nao devolve a chave nem o valor em bruto)", () => {
    const t = (key: string) => (key === "activities.itemStatus.confirmed" ? "Confirmado" : key);
    expect(getStatusLabel(t, "confirmed")).toBe("Confirmado");
  });

  it("tem cor propria, diferente de scheduled", () => {
    expect(getStatusClass("confirmed")).toContain("text-success");
    expect(getStatusClass("confirmed")).not.toBe(getStatusClass("scheduled"));
  });
});
