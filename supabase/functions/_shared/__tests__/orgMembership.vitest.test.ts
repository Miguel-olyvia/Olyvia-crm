import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireActiveMembership } from "../orgMembership.ts";

const USER = "u-1";
const ORG = "b6ffce4f-f630-4933-833a-008649757a33";

function clientReturning(result: unknown) {
  const calls: Array<[string, unknown]> = [];
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      calls.push([col, val]);
      return chain;
    },
    limit: async () => result,
  };
  return { client: { from: vi.fn(() => chain) }, calls };
}

describe("requireActiveMembership", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("is true with an active membership, filtered by user, exact org and status", async () => {
    const { client, calls } = clientReturning({ data: [{ id: "m1" }], error: null });
    expect(await requireActiveMembership(client, USER, ORG)).toBe(true);
    expect(client.from).toHaveBeenCalledWith("anew_memberships");
    expect(calls).toEqual([
      ["user_id", USER],
      ["organization_id", ORG],
      ["status", "active"],
    ]);
  });

  it("is false when there is no membership row (e.g. org only visible via hierarchy)", async () => {
    const { client } = clientReturning({ data: [], error: null });
    expect(await requireActiveMembership(client, USER, ORG)).toBe(false);
  });

  it("fails closed on a query error or exception", async () => {
    expect(await requireActiveMembership(clientReturning({ data: null, error: { message: "x" } }).client, USER, ORG)).toBe(false);
    const throwing = { from: () => { throw new Error("down"); } };
    expect(await requireActiveMembership(throwing, USER, ORG)).toBe(false);
  });

  it("is false without user or organization and never queries", async () => {
    const { client } = clientReturning({ data: [{ id: "m1" }], error: null });
    expect(await requireActiveMembership(client, "", ORG)).toBe(false);
    expect(await requireActiveMembership(client, USER, null)).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });
});
