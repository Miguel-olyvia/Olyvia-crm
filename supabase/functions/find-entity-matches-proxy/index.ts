import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { deriveKeyFromEnv } from "../_shared/nifCrypto.ts";
import { handleFindEntityMatchesProxyRequest } from "./handler.ts";

initSentry();

/**
 * find-entity-matches-proxy — Deno.serve wiring.
 *
 * See handler.ts for the request-handling logic and full documentation.
 * This file only wires real dependencies into the testable handler:
 *  - a service-role client, used ONLY to resolve the caller's identity;
 *  - a per-request client scoped to the caller's own JWT (forwarded
 *    Authorization header), used for the actual find_entity_matches RPC, so
 *    its internal auth.uid()-based visibility checks behave exactly as if
 *    the browser had called it directly;
 *  - the env-derived NIF HMAC key.
 */
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    return await handleFindEntityMatchesProxyRequest(req, {
      supabaseAdmin,
      createUserClient: (authHeader: string) =>
        createClient(supabaseUrl, supabaseAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: authHeader } },
        }),
      getHmacKey: () => deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC"),
    });
  } catch (error: unknown) {
    // handler.ts already catches and safely reports every expected failure
    // mode internally, so reaching this outer catch means something truly
    // unexpected happened (e.g. env/client setup) — never echo it raw, since
    // this handles NIF-based entity matching.
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Error in find-entity-matches-proxy:", message);
    await captureError(error, { function: "find-entity-matches-proxy" });
    return new Response(
      JSON.stringify({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
