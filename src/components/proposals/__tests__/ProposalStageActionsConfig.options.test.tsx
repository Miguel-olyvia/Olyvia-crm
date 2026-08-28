import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";

/**
 * `send_notification` deixou de ser oferecido como acção nova nesta superfície:
 * a string não existe em lado nenhum de `supabase/`, logo nada a executa. O
 * teste lê as opções realmente renderizadas pelo Radix, não a constante.
 */

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const from = () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => Promise.resolve({ data: [], error: null });
    return chain;
  };
  return { supabase: { from } };
});

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { ProposalStageActionsConfig } from "../ProposalStageActionsConfig";

const STAGES = [
  {
    id: "stage-1",
    name: "enviada",
    label: "Enviada",
    color: "#3b82f6",
    stage_order: 1,
    is_final: false,
    is_won: false,
    is_lost: false,
    is_active: true,
  },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  toastMock.mockClear();
});

async function openActionTypeOptions(): Promise<string[]> {
  render(<ProposalStageActionsConfig stages={STAGES} companyId="org-1" />);

  await waitFor(() =>
    expect(
      screen.getByText("Nenhuma acção automática configurada")
    ).toBeInTheDocument()
  );

  fireEvent.click(screen.getAllByRole("button", { name: /Nova Acção/i })[0]);
  await screen.findByText("Tipo de Acção *");

  // 0 = Fase, 1 = Tipo de Acção
  fireEvent.keyDown(screen.getAllByRole("combobox")[1], { key: "Enter" });
  const listbox = await screen.findByRole("listbox");
  return within(listbox)
    .getAllByRole("option")
    .map((option) => option.textContent?.trim() ?? "");
}

describe("ProposalStageActionsConfig — opções oferecidas", () => {
  it("não oferece 'Enviar Notificação' como acção nova", async () => {
    expect(await openActionTypeOptions()).not.toContain("Enviar Notificação");
  });

  it("mantém as restantes acções oferecidas", async () => {
    const options = await openActionTypeOptions();

    expect(options).toContain("Criar Tarefa");
    expect(options).toContain("Enviar Email");
    expect(options).toContain("Criar Contrato");
  });
});
