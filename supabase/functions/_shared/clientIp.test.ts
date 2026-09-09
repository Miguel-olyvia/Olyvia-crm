import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectClientIp, detectUserAgent } from "./clientIp.ts";

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://example.test/accept-proposal", {
    method: "POST",
    headers,
  });
}

// ── The core contract: no invented values ───────────────────────────────────
// These are the regressions this helper exists to prevent. `acceptance_ip` /
// `signature_ip` are evidence columns; a placeholder there is a lie shaped like
// proof, so "no header" must produce null and nothing else.

Deno.test("no IP headers at all -> null, never a placeholder", () => {
  assertEquals(detectClientIp(reqWith({})), null);
});

Deno.test("literal placeholders in the header are rejected, not stored", () => {
  // The old code did `req.headers.get("x-forwarded-for") || "unknown"`, so a
  // proxy sending a non-address string would have persisted it verbatim.
  for (const junk of ["unknown", "client", "-", "localhost", "not-an-ip"]) {
    assertEquals(detectClientIp(reqWith({ "x-forwarded-for": junk })), null, junk);
  }
});

Deno.test("an out-of-range IPv4 is not an IP", () => {
  assertEquals(detectClientIp(reqWith({ "x-forwarded-for": "999.1.1.1" })), null);
  assertEquals(detectClientIp(reqWith({ "x-forwarded-for": "203.0.113.256" })), null);
});

// ── XFF is a chain, not an address ──────────────────────────────────────────

Deno.test("takes the first hop of x-forwarded-for, not the whole chain", () => {
  // The old code stored "203.0.113.7, 10.0.0.1, 172.16.0.5" as the IP.
  assertEquals(
    detectClientIp(reqWith({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 172.16.0.5" })),
    "203.0.113.7",
  );
});

Deno.test("skips a junk first hop and uses the next usable one", () => {
  assertEquals(
    detectClientIp(reqWith({ "x-forwarded-for": "unknown, 203.0.113.7" })),
    "203.0.113.7",
  );
});

Deno.test("single-value x-forwarded-for still works", () => {
  assertEquals(detectClientIp(reqWith({ "x-forwarded-for": "198.51.100.4" })), "198.51.100.4");
});

// ── Fallback order ──────────────────────────────────────────────────────────

Deno.test("falls back to x-real-ip when x-forwarded-for is absent", () => {
  assertEquals(detectClientIp(reqWith({ "x-real-ip": "198.51.100.9" })), "198.51.100.9");
});

Deno.test("falls back to cf-connecting-ip last", () => {
  assertEquals(detectClientIp(reqWith({ "cf-connecting-ip": "198.51.100.11" })), "198.51.100.11");
});

Deno.test("x-forwarded-for wins over x-real-ip", () => {
  assertEquals(
    detectClientIp(reqWith({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "10.0.0.1" })),
    "203.0.113.7",
  );
});

Deno.test("an unusable x-forwarded-for does not shadow a usable x-real-ip", () => {
  assertEquals(
    detectClientIp(reqWith({ "x-forwarded-for": "unknown", "x-real-ip": "198.51.100.9" })),
    "198.51.100.9",
  );
});

// ── Normalisation ───────────────────────────────────────────────────────────

Deno.test("strips a port from IPv4", () => {
  assertEquals(detectClientIp(reqWith({ "x-forwarded-for": "203.0.113.7:52344" })), "203.0.113.7");
});

Deno.test("keeps a bare IPv6 address intact", () => {
  assertEquals(
    detectClientIp(reqWith({ "x-forwarded-for": "2001:db8::1" })),
    "2001:db8::1",
  );
});

Deno.test("unwraps the bracketed IPv6-with-port form", () => {
  assertEquals(detectClientIp(reqWith({ "x-forwarded-for": "[2001:db8::1]:443" })), "2001:db8::1");
});

Deno.test("trims surrounding whitespace in a chain", () => {
  assertEquals(
    detectClientIp(reqWith({ "x-forwarded-for": "  203.0.113.7  ,  10.0.0.1" })),
    "203.0.113.7",
  );
});

// ── User agent ──────────────────────────────────────────────────────────────

Deno.test("absent user-agent -> null, never 'unknown'", () => {
  assertEquals(detectUserAgent(reqWith({})), null);
});

Deno.test("blank user-agent -> null", () => {
  assertEquals(detectUserAgent(reqWith({ "user-agent": "   " })), null);
});

Deno.test("user-agent is capped so an oversized header cannot bloat the column", () => {
  const ua = detectUserAgent(reqWith({ "user-agent": "M".repeat(5000) }));
  assertEquals(ua?.length, 500);
});
