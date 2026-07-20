import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { deriveKeyFromEnv } from "../_shared/nifCrypto.ts";
import { handleNifBackfillRequest } from "./handler.ts";

initSentry();

/**
 * NIF Backfill — Deno.serve wiring.
 *
 * See handler.ts for the request-handling logic and full documentation.
 * This file only wires real dependencies (Supabase service-role client,
 * env-derived crypto keys) into the testable handler.
 */
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    return await handleNifBackfillRequest(req, {
      supabase,
      getEncKey: () => deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"),
      getHmacKey: () => deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC"),
    });
  } catch (error: unknown) {
    // handler.ts already catches and safely reports every expected failure
    // mode internally, so reaching this outer catch means something truly
    // unexpected happened (e.g. env/client setup) — never echo it raw, since
    // this handles NIF encryption/backfill.
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Error in nif-backfill:", message);
    await captureError(error, { function: "nif-backfill" });
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
