import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}` : key,
  }),
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a), info: vi.fn() },
}));

const { fetchMock, resendMock } = vi.hoisted(() => ({ fetchMock: vi.fn(), resendMock: vi.fn() }));
vi.mock("@/lib/scheduling/visitConfirmation", async (orig) => {
  const real = await orig<typeof import("@/lib/scheduling/visitConfirmation")>();
  return { ...real, fetchVisitConfirmationStatus: fetchMock, requestVisitConfirmationResend: resendMock };
});

import { VisitConfirmationStatus } from "../VisitConfirmationStatus";

function status(over: Record<string, unknown>) {
  return new Map([["i1", { mode: "agenda_confirm", email: null, sms: null, ...over }]]);
}

beforeEach(() => {
  fetchMock.mockReset();
  resendMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("VisitConfirmationStatus", () => {
  it("visita no modo de hoje: nao mostra nada", async () => {
    fetchMock.mockResolvedValue(new Map([["i1", { mode: "booking", email: null, sms: null }]]));
    const { container } = render(<VisitConfirmationStatus itemId="i1" savedStatus="scheduled" pendingStatus="scheduled" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("por confirmar: diz que o cliente ainda nao recebeu nada", async () => {
    fetchMock.mockResolvedValue(status({}));
    render(<VisitConfirmationStatus itemId="i1" savedStatus="scheduled" pendingStatus="scheduled" />);
    expect(await screen.findByText("visitConfirmation.awaiting")).toBeInTheDocument();
  });

  it("ao escolher confirmada (por gravar): avisa que o cliente vai receber", async () => {
    fetchMock.mockResolvedValue(status({}));
    render(<VisitConfirmationStatus itemId="i1" savedStatus="scheduled" pendingStatus="confirmed" />);
    expect(await screen.findByText("visitConfirmation.willSendOnSave")).toBeInTheDocument();
  });

  it("mostra o estado de cada canal, com o motivo da falha", async () => {
    fetchMock.mockResolvedValue(status({
      email: { status: "sent", sent_at: new Date(2026, 10, 23, 10, 32).toISOString() },
      sms: { status: "failed", error_message: "numero invalido" },
    }));
    render(<VisitConfirmationStatus itemId="i1" savedStatus="confirmed" pendingStatus="confirmed" />);
    expect(await screen.findByText("visitConfirmation.state.sent|time=10:32")).toBeInTheDocument();
    expect(screen.getByText("visitConfirmation.state.failed|error=numero invalido")).toBeInTheDocument();
  });

  it("sem email nem telefone: pede para avisar por telefone", async () => {
    fetchMock.mockResolvedValue(status({
      email: { status: "skipped", skip_reason: "no_email" },
      sms: { status: "skipped", skip_reason: "no_phone" },
    }));
    render(<VisitConfirmationStatus itemId="i1" savedStatus="confirmed" pendingStatus="confirmed" />);
    expect(await screen.findByText("visitConfirmation.noContactHint")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "visitConfirmation.resend" })).not.toBeInTheDocument();
  });

  it("Reenviar pede so os canais com contacto e volta a ler o estado", async () => {
    fetchMock.mockResolvedValue(status({
      email: { status: "sent", sent_at: new Date().toISOString() },
      sms: { status: "skipped", skip_reason: "no_phone" },
    }));
    resendMock.mockResolvedValue({ ok: true, queued: 1 });
    render(<VisitConfirmationStatus itemId="i1" savedStatus="confirmed" pendingStatus="confirmed" />);
    fireEvent.click(await screen.findByRole("button", { name: "visitConfirmation.resend" }));
    await waitFor(() => expect(resendMock).toHaveBeenCalledWith("i1", ["email"]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(toastSuccess).toHaveBeenCalledWith("visitConfirmation.resendOk");
  });

  it("reenvio recusado mostra o motivo", async () => {
    fetchMock.mockResolvedValue(status({ email: { status: "failed", error_message: "x" } }));
    resendMock.mockResolvedValue({ ok: false, error: "Limite de reenvios atingido" });
    render(<VisitConfirmationStatus itemId="i1" savedStatus="confirmed" pendingStatus="confirmed" />);
    fireEvent.click(await screen.findByRole("button", { name: "visitConfirmation.resend" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("visitConfirmation.resendError|error=Limite de reenvios atingido"));
  });

  it("quem so pode ver recebe o destinatario nulo: o estado mostra-se igual e o ecra nunca o exibe", async () => {
    fetchMock.mockResolvedValue(status({
      email: { status: "sent", sent_at: new Date(2026, 10, 23, 10, 32).toISOString(), recipient: null },
      sms: { status: "sent", sent_at: new Date(2026, 10, 23, 10, 33).toISOString(), recipient: null },
    }));
    const { container } = render(<VisitConfirmationStatus itemId="i1" savedStatus="confirmed" pendingStatus="confirmed" />);
    expect(await screen.findByText("visitConfirmation.state.sent|time=10:32")).toBeInTheDocument();
    expect(screen.getByText("visitConfirmation.state.sent|time=10:33")).toBeInTheDocument();
    expect(container.textContent).not.toContain("null");
  });

  it("visita confirmada mas nao gravada como confirmada: sem botao de reenviar", async () => {
    fetchMock.mockResolvedValue(status({}));
    render(<VisitConfirmationStatus itemId="i1" savedStatus="scheduled" pendingStatus="confirmed" />);
    await screen.findByText("visitConfirmation.willSendOnSave");
    expect(screen.queryByRole("button", { name: "visitConfirmation.resend" })).not.toBeInTheDocument();
  });
});
