import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { deriveKeyFromEnv } from "../_shared/nifCrypto.ts";
import { handleSearchEntitiesRequest } from "./handler.ts";

initSentry();

/**
 * search-entities — Deno.serve wiring.
 *
 * See handler.ts for the request-handling logic and full documentation.
 * This file only wires real dependencies into the testable handler: a
 * single service-role client (used both to resolve the caller's identity and
 * to run every query — the token table and the visibility-CTE tables all
 * require service_role), plus the env-derived NIF encryption/HMAC keys.
 */
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    return await handleSearchEntitiesRequest(req, {
      supabaseAdmin,
      getEncKey: () => deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"),
      getHmacKey: () => deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC"),
    });
  } catch (error: unknown) {
    // handler.ts already catches and safely reports every expected failure
    // mode internally, so reaching this outer catch means something truly
    // unexpected happened (e.g. env/client setup) — never echo it raw.
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Error in search-entities:", message);
    await captureError(error, { function: "search-entities" });
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
