import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, invokeMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  invokeMock: vi.fn(),
  fromMock: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock, functions: { invoke: invokeMock }, from: fromMock },
}));

import {
  bulkSetEntityOwner,
  describeSkipped,
  notifyOwnerChangeVisits,
  setEntityOwner,
} from "../entityOwnerSync";

function mockSettings(row: unknown) {
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  invokeMock.mockReset();
  fromMock.mockReset();
});

describe("setEntityOwner", () => {
  it("chama rpc_set_entity_owner e devolve as visitas afectadas", async () => {
    rpcMock.mockResolvedValueOnce({ data: { affected_visit_ids: ["v1", "v2"], owner_name: "Ana" }, error: null });
    const r = await setEntityOwner("lead", "lead-1", "user-2");
    expect(rpcMock).toHaveBeenCalledWith("rpc_set_entity_owner", { p_kind: "lead", p_id: "lead-1", p_assigned_to: "user-2" });
    expect(r).toEqual({ affectedVisitIds: ["v1", "v2"], ownerName: "Ana" });
  });

  it("em erro da base (dono sem recurso) lança, para o ecra bloquear", async () => {
    const dbError = { message: "owner_without_schedule_resource: Rui" };
    rpcMock.mockResolvedValueOnce({ data: null, error: dbError });
    await expect(setEntityOwner("client", "c1", "u9")).rejects.toBe(dbError);
  });
});

describe("bulkSetEntityOwner", () => {
  it("devolve actualizadas, saltadas com motivo e sem permissao", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        updated_ids: ["a"],
        skipped: [{ id: "b", name: "Bruno", reason: "no_resource" }, { id: "c", name: null, reason: "owner_required" }],
        not_permitted_ids: ["d"],
        affected_visit_ids: ["v9"],
      },
      error: null,
    });
    const r = await bulkSetEntityOwner("lead", ["a", "b", "c", "d"], "u1");
    expect(r.updatedIds).toEqual(["a"]);
    expect(r.skipped).toEqual([
      { id: "b", name: "Bruno", reason: "no_resource" },
      { id: "c", name: null, reason: "owner_required" },
    ]);
    expect(r.notPermittedIds).toEqual(["d"]);
    expect(describeSkipped(r.skipped, "sem nome")).toBe("Bruno, sem nome");
  });

  it("a atribuicao em massa NAO envia emails aos clientes (zero chamadas a edge function)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { updated_ids: ["a"], skipped: [], not_permitted_ids: [], affected_visit_ids: ["v1"] },
      error: null,
    });
    await bulkSetEntityOwner("client", ["a"], "u1");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("notifyOwnerChangeVisits", () => {
  it("interruptor ligado: avisa as visitas afectadas", async () => {
    mockSettings({ notify_client_on_reassign: true, notify_client_on_reschedule: false });
    invokeMock.mockResolvedValue({ data: { sent: { email: true, sms: false }, skipped: null }, error: null });
    const n = await notifyOwnerChangeVisits("org-1", ["v1"]);
    expect(invokeMock).toHaveBeenCalledWith("notify-schedule-change", {
      body: { schedule_item_id: "v1", changes: ["assignee"] },
    });
    expect(n).toBe(1);
  });

  it("interruptor desligado: nao avisa ninguem", async () => {
    mockSettings({ notify_client_on_reassign: false });
    const n = await notifyOwnerChangeVisits("org-1", ["v1"]);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it("sem visitas afectadas nem sequer le as definicoes", async () => {
    const n = await notifyOwnerChangeVisits("org-1", []);
    expect(fromMock).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });
});
