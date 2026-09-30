import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../sentry.ts", () => ({
  captureError: vi.fn(async () => {}),
}));

import {
  checkAndConsumeAiCredits,
  aiCreditsBlockedResponse,
  CREDITS_CHECK_UNAVAILABLE,
} from "../aiCredits.ts";
import { captureError } from "../sentry.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";

const clientWith = (rpc: () => Promise<unknown>) => ({ rpc: vi.fn(rpc) });

describe("checkAndConsumeAiCredits (fail closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("blocks with credits_check_unavailable when the RPC returns an error", async () => {
    const client = clientWith(async () => ({ data: null, error: { message: "boom" } }));
    const result = await checkAndConsumeAiCredits(client, ORG, 1);
    expect(result).toEqual({ blocked: true, reason: CREDITS_CHECK_UNAVAILABLE });
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("blocks when the RPC returns empty data", async () => {
    for (const data of [null, undefined, []]) {
      const client = clientWith(async () => ({ data, error: null }));
      const result = await checkAndConsumeAiCredits(client, ORG, 1);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("credits_check_unavailable");
    }
  });

  it("blocks when the RPC throws", async () => {
    const client = clientWith(async () => {
      throw new Error("network down");
    });
    const result = await checkAndConsumeAiCredits(client, ORG, 1);
    expect(result).toEqual({ blocked: true, reason: "credits_check_unavailable" });
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("passes through a normal allowed result", async () => {
    const client = clientWith(async () => ({ data: [{ blocked: false, balance_credits: 9 }], error: null }));
    const result = await checkAndConsumeAiCredits(client, ORG, 1);
    expect(result.blocked).toBe(false);
    expect(result.balance_credits).toBe(9);
    expect(client.rpc).toHaveBeenCalledWith("fn_check_and_consume_ai_credits", {
      _organization_id: ORG,
      _amount: 1,
    });
  });

  it("passes through a genuine block (out of credits) with its own reason", async () => {
    const client = clientWith(async () => ({
      data: { blocked: true, reason: "insufficient_credits", balance_credits: 0 },
      error: null,
    }));
    const result = await checkAndConsumeAiCredits(client, ORG, 3);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("insufficient_credits");
  });
});

describe("aiCreditsBlockedResponse", () => {
  it("maps credits_check_unavailable to 503 (no upsell)", async () => {
    const res = aiCreditsBlockedResponse({ blocked: true, reason: CREDITS_CHECK_UNAVAILABLE }, {});
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("credits_check_unavailable");
    expect(body.upsell).toBeUndefined();
  });

  it("keeps the 402 upsell for a real limit block", async () => {
    const res = aiCreditsBlockedResponse({ blocked: true, reason: "insufficient_credits" }, {});
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upsell.canBuyCredits).toBe(true);
  });
});
