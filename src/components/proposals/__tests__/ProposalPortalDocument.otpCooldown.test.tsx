import { fireEvent, render, screen } from "@testing-library/react";
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

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("ProposalPortalDocument - pausa só no Reenviar código", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });

  it("no passo inicial, Enviar código SMS e Aceitar e Assinar não levam contagem nem aviso", () => {
    renderDoc({ otpStep: "idle", otpCooldown: 0 });
    expect(button("Enviar código SMS").disabled).toBe(false);
    expect(button("Aceitar e Assinar").disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("mesmo com a contagem activa, o passo inicial continua sem segundos nem bloqueio", () => {
    renderDoc({ otpStep: "idle", otpCooldown: 45 });
    expect(button("Enviar código SMS").disabled).toBe(false);
    expect(button("Aceitar e Assinar").disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("Enviar e Aceitar e Assinar só ficam desactivados enquanto o envio está em curso", () => {
    renderDoc({ otpStep: "idle", otpCooldown: 0, actionLoading: true });
    expect(button("Enviar código SMS").disabled).toBe(true);
    expect(button("Aceitar e Assinar").disabled).toBe(true);
  });

  it("no passo do código, Reenviar fica desactivado com os segundos e o aviso aparece junto a ele", () => {
    renderDoc({ otpStep: "input", otpCooldown: 45, otpCode: "", maskedPhone: "9*****123" });
    expect(button("Reenviar código (45s)").disabled).toBe(true);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("no passo do código, o campo recebe o foco e Verificar e o campo nunca ficam bloqueados", () => {
    renderDoc({ otpStep: "input", otpCooldown: 30, otpCode: "123456", maskedPhone: "9*****123" });
    const field = screen.getByRole("textbox") as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(field.disabled).toBe(false);
    expect(button("Verificar").disabled).toBe(false);
  });

  it("com a contagem a 0, Reenviar volta a ficar activo e sem aviso", () => {
    renderDoc({ otpStep: "input", otpCooldown: 0, otpCode: "", maskedPhone: "9*****123" });
    expect(button("Reenviar código").disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("o Reenviar chama onResendOtp (e não onSendOtp) quando existe", () => {
    const onSendOtp = vi.fn();
    const onResendOtp = vi.fn();
    renderDoc({ otpStep: "input", otpCooldown: 0, otpCode: "", maskedPhone: "9*****123", onSendOtp, onResendOtp });
    fireEvent.click(button("Reenviar código"));
    expect(onResendOtp).toHaveBeenCalledTimes(1);
    expect(onSendOtp).not.toHaveBeenCalled();
  });

  it("o Enviar e o Aceitar e Assinar chamam onSendOtp", () => {
    const onSendOtp = vi.fn();
    const onResendOtp = vi.fn();
    renderDoc({ otpStep: "idle", otpCooldown: 0, onSendOtp, onResendOtp });
    fireEvent.click(button("Enviar código SMS"));
    fireEvent.click(button("Aceitar e Assinar"));
    expect(onSendOtp).toHaveBeenCalledTimes(2);
    expect(onResendOtp).not.toHaveBeenCalled();
  });
});
