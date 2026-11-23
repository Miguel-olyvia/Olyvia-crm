import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock, rpcMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), rpcMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock }, rpc: rpcMock },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import {
  becameConfirmed,
  channelView,
  fetchVisitConfirmationStatus,
  requestVisitConfirmationResend,
  triggerVisitConfirmation,
  triggerConfirmationsForItems,
} from "../visitConfirmation";

beforeEach(() => {
  invokeMock.mockReset();
  rpcMock.mockReset();
});

describe("becameConfirmed", () => {
  it("so a passagem a confirmada conta", () => {
    expect(becameConfirmed("scheduled", "confirmed")).toBe(true);
    expect(becameConfirmed(undefined, "confirmed")).toBe(true);
    expect(becameConfirmed("confirmed", "confirmed")).toBe(false);
    expect(becameConfirmed("scheduled", "completed")).toBe(false);
    expect(becameConfirmed("scheduled", undefined)).toBe(false);
  });
});

describe("channelView", () => {
  it("sem linha: por enviar", () => {
    expect(channelView(null)).toEqual({ state: "not_sent" });
  });
  it("enviada leva a hora", () => {
    expect(channelView({ status: "sent", sent_at: "2026-11-23T10:32:00Z" })).toEqual({ state: "sent", at: "2026-11-23T10:32:00Z" });
  });
  it("pendente ou a enviar: em curso", () => {
    expect(channelView({ status: "pending" }).state).toBe("sending");
    expect(channelView({ status: "sending" }).state).toBe("sending");
  });
  it("falhada leva o motivo", () => {
    expect(channelView({ status: "failed", error_message: "numero invalido" })).toEqual({ state: "failed", error: "numero invalido" });
  });
  it("sem contacto e canal desligado distinguem-se do resto", () => {
    expect(channelView({ status: "skipped", skip_reason: "no_email" }).state).toBe("no_contact");
    expect(channelView({ status: "skipped", skip_reason: "no_phone" }).state).toBe("no_contact");
    expect(channelView({ status: "skipped", skip_reason: "email_disabled" }).state).toBe("disabled");
    expect(channelView({ status: "skipped", skip_reason: "not_confirmed" })).toEqual({ state: "skipped", reason: "not_confirmed" });
  });
});

describe("fetchVisitConfirmationStatus", () => {
  it("agrupa por visita, com o modo e a ultima linha de cada canal", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { schedule_item_id: "a", confirmation_send_on: "agenda_confirm", channel: "email", status: "sent", sent_at: "t1" },
        { schedule_item_id: "a", confirmation_send_on: "agenda_confirm", channel: "sms", status: "failed", error_message: "x" },
        { schedule_item_id: "b", confirmation_send_on: null, channel: null, status: null },
      ],
      error: null,
    });
    const out = await fetchVisitConfirmationStatus(["a", "b"]);
    expect(rpcMock).toHaveBeenCalledWith("rpc_visit_confirmation_status", { p_item_ids: ["a", "b"] });
    expect(out.get("a")?.mode).toBe("agenda_confirm");
    expect(out.get("a")?.email?.status).toBe("sent");
    expect(out.get("a")?.sms?.status).toBe("failed");
    expect(out.get("b")).toEqual({ mode: "booking", email: null, sms: null });
  });
  it("erro (migration por aplicar) devolve vazio, sem lancar", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    expect((await fetchVisitConfirmationStatus(["a"])).size).toBe(0);
  });
  it("lista vazia nao chama a base", async () => {
    expect((await fetchVisitConfirmationStatus([])).size).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("triggerVisitConfirmation", () => {
  it("chama a funcao com a visita e devolve o resumo", async () => {
    invokeMock.mockResolvedValue({ data: { sent: 2 }, error: null });
    expect(await triggerVisitConfirmation("a")).toEqual({ sent: 2 });
    expect(invokeMock).toHaveBeenCalledWith("send-visit-confirmation", { body: { schedule_item_id: "a" } });
  });
  it("erro nao lanca: devolve null", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("403") });
    expect(await triggerVisitConfirmation("a")).toBeNull();
  });
});

describe("triggerConfirmationsForItems", () => {
  it("so chama a funcao para as visitas em modo agenda_confirm", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { schedule_item_id: "a", confirmation_send_on: "agenda_confirm", channel: null },
        { schedule_item_id: "b", confirmation_send_on: null, channel: null },
      ],
      error: null,
    });
    invokeMock.mockResolvedValue({ data: { sent: 1 }, error: null });
    expect(await triggerConfirmationsForItems(["a", "b"])).toBe(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("send-visit-confirmation", { body: { schedule_item_id: "a" } });
  });
  it("organizacao no modo de hoje: nenhuma chamada a funcao", async () => {
    rpcMock.mockResolvedValue({ data: [{ schedule_item_id: "b", confirmation_send_on: "booking", channel: null }], error: null });
    expect(await triggerConfirmationsForItems(["b"])).toBe(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("requestVisitConfirmationResend", () => {
  it("pede o reenvio na base e depois processa logo", async () => {
    rpcMock.mockResolvedValue({ data: 2, error: null });
    invokeMock.mockResolvedValue({ data: { sent: 2 }, error: null });
    const res = await requestVisitConfirmationResend("a", ["email", "sms"]);
    expect(res).toEqual({ ok: true, queued: 2 });
    expect(rpcMock).toHaveBeenCalledWith("rpc_request_visit_confirmation_resend", { p_item_id: "a", p_channels: ["email", "sms"] });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
  it("recusa da base (limite) devolve a mensagem", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Limite de reenvios atingido ou envio ja em curso" } });
    const res = await requestVisitConfirmationResend("a", ["sms"]);
    expect(res).toEqual({ ok: false, error: "Limite de reenvios atingido ou envio ja em curso" });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
