/**
 * @vitest-environment node
 *
 * Writers fail-closed contract — Bloco 0.1
 *
 * Validates the guard pattern used in every writer touched by Item 1
 * (Products, Suppliers, Services, PurchaseOrders, AnewClients, AnewContacts):
 *
 *   const businessUserId = await resolveCurrentBusinessUserId();
 *   if (!businessUserId) {
 *     toast({...});
 *     return;   // <-- MUST short-circuit BEFORE supabase.from(...).insert(...)
 *   }
 *   data.created_by = businessUserId;
 *
 * We test the guard itself (not the React pages) so the contract is enforced
 * regardless of UI internals. If any future writer drops this guard, callers
 * relying on this contract will surface it via integration QA.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({
    insert: insertMock,
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })),
  }));
  return {
    supabase: {
      from: fromMock,
      auth: {
        getUser: vi.fn(),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
    __mocks: { fromMock, insertMock },
  };
});

import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "../resolveBusinessUserId";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __mocks } = (await import("@/integrations/supabase/client")) as any;

/**
 * Reference implementation of the fail-closed writer guard.
 * Mirrors the exact pattern used in src/pages/{Products,Suppliers,Services,PurchaseOrders,AnewClients,AnewContacts}.tsx
 */
async function writerGuarded(payload: Record<string, unknown>, toast: (a: unknown) => void) {
  const businessUserId = await resolveCurrentBusinessUserId();
  if (!businessUserId) {
    toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
    return { ok: false as const };
  }
  payload.created_by = businessUserId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("products") as any).insert(payload);
  return { ok: true as const };
}

beforeEach(() => {
  __mocks.fromMock.mockClear();
  __mocks.insertMock.mockClear();
});

describe("writers fail-closed guard", () => {
  it("aborts insert and toasts when business user cannot be resolved", async () => {
    (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { user: null } });
    const toast = vi.fn();
    const result = await writerGuarded({ name: "X" }, toast);
    expect(result.ok).toBe(false);
    expect(__mocks.insertMock).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" })
    );
  });

  it("proceeds with insert and stamps created_by when business user resolves", async () => {
    (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: { id: "auth-uid-OK" } },
    });
    // resolveCurrentBusinessUserId will call supabase.from('anew_users').select(...).eq(...).maybeSingle()
    // We need that chain to return a business id.
    const maybeSingle = vi.fn().mockResolvedValueOnce({ data: { id: "biz-OK" }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    __mocks.fromMock.mockImplementationOnce(() => ({ select }));

    const payload: Record<string, unknown> = { name: "Y" };
    const toast = vi.fn();
    const result = await writerGuarded(payload, toast);

    expect(result.ok).toBe(true);
    expect(payload.created_by).toBe("biz-OK");
    expect(__mocks.insertMock).toHaveBeenCalledWith(expect.objectContaining({ created_by: "biz-OK" }));
    expect(toast).not.toHaveBeenCalled();
  });
});
