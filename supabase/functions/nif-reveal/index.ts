import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { deriveKeyFromEnv } from "../_shared/nifCrypto.ts";
import { handleNifRevealRequest } from "./handler.ts";

initSentry();

/**
 * nif-reveal — Deno.serve wiring.
 *
 * See handler.ts for the request-handling logic and full documentation.
 * This file only wires real dependencies into the testable handler: a
 * service-role client (used both to resolve the caller's identity and to
 * read the service-role-only fiscal_entities / anew_entity_fiscal_entities
 * tables and invoke filter_visible_entity_ids), plus the env-derived NIF
 * decryption key.
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

    return await handleNifRevealRequest(req, {
      supabaseAdmin,
      getDecKey: () => deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"),
    });
  } catch (error: unknown) {
    // handler.ts already catches and safely reports every expected failure
    // mode internally, so reaching this outer catch means something truly
    // unexpected happened (e.g. env/client setup) — never echo it raw, since
    // this handles decrypted NIF data.
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Error in nif-reveal:", message);
    await captureError(error, { function: "nif-reveal" });
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
