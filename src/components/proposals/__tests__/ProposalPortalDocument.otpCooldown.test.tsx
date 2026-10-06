import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ProposalPortalDocument } from "../ProposalPortalDocument";

const baseProps = {
  proposal: { id: "p1", title: "Proposta", proposal_number: "P-1", created_at: "2026-01-01T10:00:00Z", status: "sent" },
  template: null,
  quotes: [{ id: "q1", quote_number: "Q-1", estado: "enviado" }],
  quoteLines: { q1: [{ id: "l1", section_name: "Itens", description: "Item", quantity: 1, total_sem_iva: 100, iva_percent: 23 }] },
  commercial: null,
  company: null,
  mode: "portal" as const,
  canActOnProposal: true,
  onSendOtp: () => {},
};

const NOTICE = "Aguarde 1 minuto antes de pedir um novo código.";

function renderDoc(props: Record<string, unknown>) {
  return render(<ProposalPortalDocument {...baseProps} {...props} />);
}

describe("ProposalPortalDocument - pausa entre envios de SMS", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });

  it("sem contagem, Enviar código SMS e Aceitar e Assinar estão activos", () => {
    renderDoc({ otpStep: "idle", otpCooldown: 0 });
    expect((screen.getByRole("button", { name: "Enviar código SMS" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Aceitar e Assinar" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("durante a contagem, os dois botões ficam desactivados com os segundos", () => {
    renderDoc({ otpStep: "idle", otpCooldown: 45 });
    expect((screen.getByRole("button", { name: "Enviar código SMS (45s)" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Aceitar e Assinar (45s)" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("no passo do código, o campo do código recebe o foco", () => {
    renderDoc({ otpStep: "input", otpCooldown: 30, otpCode: "", maskedPhone: "9*****123" });
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("no passo do código, Reenviar fica desactivado mas Verificar e o campo do código continuam livres", () => {
    renderDoc({ otpStep: "input", otpCooldown: 30, otpCode: "123456", maskedPhone: "9*****123" });
    expect((screen.getByRole("button", { name: "Reenviar código (30s)" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Verificar" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(false);
  });
});
