import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { base, openAndPick, renderTab } from "./emailsTabTestUtils";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

const trigger = () => screen.getByRole("combobox", { name: "Quando enviar a confirmação ao cliente" });

describe("FormEmailsTab: quando sai a confirmação ao cliente", () => {
  it("sem valor gravado mostra o comportamento de hoje (ao marcar)", () => {
    renderTab(base);
    expect(trigger()).toHaveTextContent("Logo que o cliente marca a visita");
  });

  it("com agenda_confirm mostra «Quando a visita é confirmada na Agenda» e a explicação", () => {
    renderTab({ ...base, confirmation_send_on: "agenda_confirm" });
    expect(trigger()).toHaveTextContent("Quando a visita é confirmada na Agenda");
    expect(screen.getByText(/só saem quando alguém da empresa marca a visita como confirmada/)).toBeInTheDocument();
  });

  it("escolher a opção nova grava confirmation_send_on = agenda_confirm", async () => {
    const { onChange } = renderTab(base);
    await openAndPick(trigger(), "Quando a visita é confirmada na Agenda");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ confirmation_send_on: "agenda_confirm" }));
  });
});
