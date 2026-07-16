import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { deriveKeyFromEnv } from "../_shared/nifCrypto.ts";
import { handleFiscalEntityResolveRequest } from "./handler.ts";

initSentry();

/**
 * fiscal-entity-resolve — Deno.serve wiring.
 *
 * See handler.ts for the request-handling logic and full documentation.
 * This file only wires real dependencies into the testable handler: a single
 * service-role client (used both to resolve the caller's identity and to run
 * the resolve_fiscal_entity RPC), plus the env-derived NIF encryption/HMAC
 * keys.
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

    return await handleFiscalEntityResolveRequest(req, {
      supabaseAdmin,
      getEncKey: () => deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"),
      getHmacKey: () => deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC"),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Error in fiscal-entity-resolve:", message);
    await captureError(error, { function: "fiscal-entity-resolve" });
    return new Response(
      JSON.stringify({ success: false, error: message, code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
