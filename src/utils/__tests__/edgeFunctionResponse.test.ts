import { describe, expect, it } from "vitest";
import { describeEdgeFunctionError, parseEdgeFunctionPayload } from "@/utils/edgeFunctionResponse";

describe("parseEdgeFunctionPayload", () => {
  // The regression this guards: client-portal-action returns JSON without a
  // Content-Type header, so functions.invoke hands back a string and reading
  // `.quotes` off it yields undefined — a good HTTP 200 looked like an empty
  // proposal and the portal's "Download PDF" button did nothing useful.
  it("parses a JSON string payload into an object", () => {
    const raw = JSON.stringify({ proposal: { id: "p1" }, quotes: [{ quote: { id: "q1" } }] });
    const parsed = parseEdgeFunctionPayload<{ quotes: unknown[] }>(raw);
    expect(parsed?.quotes).toHaveLength(1);
  });

  it("passes an already-parsed object straight through", () => {
    const payload = { quotes: [1, 2] };
    expect(parseEdgeFunctionPayload<typeof payload>(payload)).toBe(payload);
  });

  it("distinguishes an empty result from an undecodable one", () => {
    expect(parseEdgeFunctionPayload('{"quotes":[]}')).toEqual({ quotes: [] });
    expect(parseEdgeFunctionPayload("not json")).toBeNull();
    expect(parseEdgeFunctionPayload("")).toBeNull();
    expect(parseEdgeFunctionPayload("   ")).toBeNull();
    expect(parseEdgeFunctionPayload(null)).toBeNull();
    expect(parseEdgeFunctionPayload(undefined)).toBeNull();
  });

  it("rejects JSON scalars, which are never a valid payload here", () => {
    expect(parseEdgeFunctionPayload("42")).toBeNull();
    expect(parseEdgeFunctionPayload('"a string"')).toBeNull();
    expect(parseEdgeFunctionPayload("null")).toBeNull();
    expect(parseEdgeFunctionPayload(7)).toBeNull();
  });

  it("keeps arrays, which are valid JSON objects", () => {
    expect(parseEdgeFunctionPayload("[1,2]")).toEqual([1, 2]);
  });
});

describe("describeEdgeFunctionError", () => {
  it("surfaces the message from a FunctionsHttpError response body", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: new Response(JSON.stringify({ error: "forbidden", message: "Sem permissão" }), { status: 403 }),
    };
    await expect(describeEdgeFunctionError(error)).resolves.toBe("Sem permissão (HTTP 403)");
  });

  it("falls back to the error field when there is no message", async () => {
    const error = { context: new Response(JSON.stringify({ error: "proposal_id required" }), { status: 400 }) };
    await expect(describeEdgeFunctionError(error)).resolves.toBe("proposal_id required (HTTP 400)");
  });

  it("reports the status when the body is not JSON", async () => {
    const error = { context: new Response("", { status: 500 }) };
    await expect(describeEdgeFunctionError(error)).resolves.toBe("O servidor respondeu HTTP 500.");
  });

  it("uses a plain Error message when there is no response context", async () => {
    await expect(describeEdgeFunctionError(new Error("boom"))).resolves.toBe("boom");
  });

  it("returns a user-facing fallback for an unusable error", async () => {
    await expect(describeEdgeFunctionError(null)).resolves.toMatch(/Tenta novamente/);
    await expect(describeEdgeFunctionError({})).resolves.toMatch(/Tenta novamente/);
  });
});
