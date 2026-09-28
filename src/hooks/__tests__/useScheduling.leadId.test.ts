/**
 * schedule_items.contact_id -> lead_id (rename): the dialogo de agendamento
 * so liga a leads (anew_leads), nunca a contactos legados; a RPC agora
 * recebe `p_lead_id`/`p_set_lead_id` em vez de `p_contact_id`/`p_set_contact_id`.
 *
 * These tests assert the exact RPC payload useScheduling sends, since that
 * payload is the contract with the Postgres side (rpc_create_schedule_item /
 * rpc_update_schedule_item) written in the companion migration.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const rpc = vi.fn();
const getUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getUser: (...args: unknown[]) => getUser(...args) },
  },
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: vi.fn().mockResolvedValue("business-user-1"),
}));

vi.mock("@/utils/auditContext", () => ({
  withAuditContext: async (_client: unknown, _actor: unknown, fn: () => unknown) => fn(),
}));

import { useScheduling } from "@/hooks/useScheduling";

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } } });
});

describe("useScheduling — lead_id (not contact_id) on schedule_items RPCs", () => {
  it("createItem sends p_lead_id, never p_contact_id", async () => {
    rpc.mockResolvedValue({ data: { id: "item-1" }, error: null });
    const { result } = renderHook(() => useScheduling("org-1"));

    await act(async () => {
      await result.current.createItem({
        board_id: "board-1",
        title: "Visita",
        start_datetime: "2026-01-01T09:00:00.000Z",
        end_datetime: "2026-01-01T10:00:00.000Z",
        lead_id: "lead-123",
      } as any);
    });

    expect(rpc).toHaveBeenCalledWith(
      "rpc_create_schedule_item",
      expect.objectContaining({ p_lead_id: "lead-123" })
    );
    const [, params] = rpc.mock.calls[0];
    expect(params).not.toHaveProperty("p_contact_id");
  });

  it("updateItem sends p_lead_id and p_set_lead_id=true, never p_contact_id/p_set_contact_id", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useScheduling("org-1"));

    await act(async () => {
      await result.current.updateItem("item-1", { lead_id: "lead-456" } as any);
    });

    expect(rpc).toHaveBeenCalledWith(
      "rpc_update_schedule_item",
      expect.objectContaining({
        p_id: "item-1",
        p_lead_id: "lead-456",
        p_set_lead_id: true,
      })
    );
    const [, params] = rpc.mock.calls[0];
    expect(params).not.toHaveProperty("p_contact_id");
    expect(params).not.toHaveProperty("p_set_contact_id");
  });

  it("updateItem omits lead_id (p_set_lead_id=false) when not supplied", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useScheduling("org-1"));

    await act(async () => {
      await result.current.updateItem("item-1", { title: "Novo título" } as any);
    });

    expect(rpc).toHaveBeenCalledWith(
      "rpc_update_schedule_item",
      expect.objectContaining({
        p_set_lead_id: false,
        p_lead_id: null,
      })
    );
  });
});
