/**
 * @vitest-environment node
 *
 * Identity boundary tests — Bloco 0.1
 *
 * Validates that resolveBusinessUserId:
 *  1. Resolves correctly when anew_users row exists for an auth uid.
 *  2. Returns null (fail-closed) when no mapping exists.
 *  3. Returns null when supabase returns an error.
 *  4. Caches results per auth uid (no duplicate queries).
 *  5. Cache is cleared on SIGNED_OUT / USER_UPDATED auth events.
 *  6. Cache is NOT cleared on TOKEN_REFRESHED — a token refresh keeps the same
 *     auth_user_id, so the business mapping is still valid. Clearing on every
 *     refresh would cause a round-trip on every browser tab refocus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn((_table: string) => ({ select: selectMock }));
  const ref: { cb: ((event: string) => void) | null } = { cb: null };
  return { maybeSingleMock, eqMock, selectMock, fromMock, ref };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => h.fromMock(table),
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        h.ref.cb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getUser: vi.fn(),
    },
  },
}));

const { maybeSingleMock, eqMock, selectMock, fromMock, ref: capturedRef } = h;

// Import AFTER mock so the module-load auth listener is captured.
import {
  resolveBusinessUserId,
  __clearResolveBusinessUserIdCache,
} from "../resolveBusinessUserId";

beforeEach(() => {
  __clearResolveBusinessUserIdCache();
  maybeSingleMock.mockReset();
  eqMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
});

describe("resolveBusinessUserId", () => {
  it("returns the business id when the mapping exists", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: "biz-uuid-1" }, error: null });
    const result = await resolveBusinessUserId("auth-uid-1");
    expect(result).toBe("biz-uuid-1");
    expect(fromMock).toHaveBeenCalledWith("anew_users");
  });

  it("returns null (fail-closed) when no mapping exists", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await resolveBusinessUserId("auth-uid-orphan");
    expect(result).toBeNull();
  });

  it("returns null when supabase returns an error (fail-closed)", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const result = await resolveBusinessUserId("auth-uid-err");
    expect(result).toBeNull();
  });

  it("returns null for null/undefined auth uid without querying", async () => {
    expect(await resolveBusinessUserId(null)).toBeNull();
    expect(await resolveBusinessUserId(undefined)).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("caches results per auth uid (no duplicate queries)", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: "biz-cached" }, error: null });
    await resolveBusinessUserId("auth-uid-cache");
    await resolveBusinessUserId("auth-uid-cache");
    await resolveBusinessUserId("auth-uid-cache");
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
  });

  it("caches null results too (negative caching, still fail-closed)", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await resolveBusinessUserId("auth-uid-orphan")).toBeNull();
    expect(await resolveBusinessUserId("auth-uid-orphan")).toBeNull();
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
  });

  describe("cache invalidation on auth events", () => {
    it("clears cache on SIGNED_OUT", async () => {
      maybeSingleMock
        .mockResolvedValueOnce({ data: { id: "biz-A" }, error: null })
        .mockResolvedValueOnce({ data: { id: "biz-B" }, error: null });
      expect(await resolveBusinessUserId("uid-x")).toBe("biz-A");
      capturedRef.cb?.("SIGNED_OUT");
      expect(await resolveBusinessUserId("uid-x")).toBe("biz-B");
      expect(maybeSingleMock).toHaveBeenCalledTimes(2);
    });

    it("clears cache on USER_UPDATED", async () => {
      maybeSingleMock
        .mockResolvedValueOnce({ data: { id: "biz-A" }, error: null })
        .mockResolvedValueOnce({ data: { id: "biz-B" }, error: null });
      expect(await resolveBusinessUserId("uid-y")).toBe("biz-A");
      capturedRef.cb?.("USER_UPDATED");
      expect(await resolveBusinessUserId("uid-y")).toBe("biz-B");
      expect(maybeSingleMock).toHaveBeenCalledTimes(2);
    });

    it("does NOT clear cache on TOKEN_REFRESHED", async () => {
      // Token refresh keeps the same auth_user_id; mapping is still valid.
      // Clearing here would force a round-trip on every browser tab refocus.
      maybeSingleMock.mockResolvedValueOnce({ data: { id: "biz-A" }, error: null });
      expect(await resolveBusinessUserId("uid-z")).toBe("biz-A");
      capturedRef.cb?.("TOKEN_REFRESHED");
      expect(await resolveBusinessUserId("uid-z")).toBe("biz-A");
      expect(maybeSingleMock).toHaveBeenCalledTimes(1);
    });

    it("does NOT clear cache on unrelated events (e.g. INITIAL_SESSION)", async () => {
      maybeSingleMock.mockResolvedValueOnce({ data: { id: "biz-A" }, error: null });
      expect(await resolveBusinessUserId("uid-w")).toBe("biz-A");
      capturedRef.cb?.("INITIAL_SESSION");
      expect(await resolveBusinessUserId("uid-w")).toBe("biz-A");
      expect(maybeSingleMock).toHaveBeenCalledTimes(1);
    });
  });
});
