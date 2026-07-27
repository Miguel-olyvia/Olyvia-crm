/**
 * _shared/cors.ts — CORS origin-resolution regression tests.
 *
 * BACKGROUND: `getCorsHeaders`/`getCorsHeadersExtended` are used by ~46 Edge
 * Functions (search-entities among them) to compute
 * `Access-Control-Allow-Origin` for both the OPTIONS preflight and the real
 * response. Before this fix, a request whose Origin header was a local dev
 * origin (e.g. http://localhost:5173 — the Vite dev server calling the real,
 * hosted Supabase project, not a local Supabase stack) fell through to
 * `PRODUCTION_ORIGIN`, because `isLocalDev()` only checks whether
 * SUPABASE_URL itself contains "localhost"/"127.0.0.1" (true only when
 * Supabase itself is run locally). The browser then rejects the response
 * because `Access-Control-Allow-Origin` doesn't match the request's actual
 * Origin, breaking every preflighted call (including search-entities) from
 * local dev/E2E — the same bug class fixed in portal-login/index.ts's
 * `buildCorsHeaders()`.
 *
 * These tests import `_shared/cors.ts` directly (unlike portal-login's
 * index.test.ts, which had to replicate its CORS logic because
 * portal-login/index.ts calls `serve(...)` at module load). `_shared/cors.ts`
 * has no top-level side effects, so it's safe to import as-is.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getCorsHeaders,
  getCorsHeadersExtended,
  PRODUCTION_ORIGIN,
} from "./cors.ts";

function makeRequest(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://example.com/some-function", {
    method: "OPTIONS",
    headers,
  });
}

Deno.test("CORS: a local dev origin (http://localhost:5173) is reflected back, not forced to PRODUCTION_ORIGIN", () => {
  const headers = getCorsHeaders(makeRequest("http://localhost:5173"));
  assertEquals(headers["Access-Control-Allow-Origin"], "http://localhost:5173");
});

Deno.test("CORS: a local dev origin on a different port (http://localhost:8080) is also reflected back", () => {
  const headers = getCorsHeaders(makeRequest("http://localhost:8080"));
  assertEquals(headers["Access-Control-Allow-Origin"], "http://localhost:8080");
});

Deno.test("CORS: a 127.0.0.1 origin with a port is reflected back", () => {
  const headers = getCorsHeaders(makeRequest("http://127.0.0.1:4173"));
  assertEquals(headers["Access-Control-Allow-Origin"], "http://127.0.0.1:4173");
});

Deno.test("CORS: a bare localhost origin with no port is reflected back", () => {
  const headers = getCorsHeaders(makeRequest("http://localhost"));
  assertEquals(headers["Access-Control-Allow-Origin"], "http://localhost");
});

Deno.test("CORS: getCorsHeadersExtended also reflects a local dev origin (used by send-email, trigger-email-template, send-schedule-invite)", () => {
  const headers = getCorsHeadersExtended(makeRequest("http://localhost:5173"));
  assertEquals(headers["Access-Control-Allow-Origin"], "http://localhost:5173");
});

Deno.test("CORS: an arbitrary non-local, non-production origin still falls back to PRODUCTION_ORIGIN (policy stays closed)", () => {
  const headers = getCorsHeaders(makeRequest("https://evil.example.com"));
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN);
});

Deno.test("CORS: a lookalike host that merely contains 'localhost' as a suffix/subdomain is rejected (anchored pattern holds)", () => {
  const headers = getCorsHeaders(makeRequest("https://localhost.evil.com"));
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN);
});

Deno.test("CORS: a lookalike host with 'localhost' as a prefix is rejected (anchored pattern holds)", () => {
  const headers = getCorsHeaders(makeRequest("https://evil-localhost.com"));
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN);
});

Deno.test("CORS: the exact production origin is still reflected back (existing behavior preserved)", () => {
  const headers = getCorsHeaders(makeRequest(PRODUCTION_ORIGIN));
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN);
});

Deno.test("CORS: a Vercel preview origin matching the anchored pattern is still reflected back (existing behavior preserved)", () => {
  const previewOrigin = "https://olyvia-crm-git-development-bmgest.vercel.app";
  const headers = getCorsHeaders(makeRequest(previewOrigin));
  assertEquals(headers["Access-Control-Allow-Origin"], previewOrigin);
});

Deno.test("CORS: a null/missing Origin header falls back to PRODUCTION_ORIGIN", () => {
  const headers = getCorsHeaders(makeRequest(null));
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN);
});

Deno.test("CORS: Vary: Origin is present whenever the origin is dynamically resolved", () => {
  const headers = getCorsHeaders(makeRequest("http://localhost:5173"));
  assertEquals(headers["Vary"], "Origin");
});
