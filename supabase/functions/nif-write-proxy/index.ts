import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { deriveKeyFromEnv } from "../_shared/nifCrypto.ts";
import { handleNifWriteProxyRequest } from "./handler.ts";

initSentry();

/**
 * nif-write-proxy — Deno.serve wiring.
 *
 * See handler.ts for the request-handling logic and full documentation.
 * This file only wires real dependencies into the testable handler:
 *  - a service-role client, used ONLY to resolve the caller's identity;
 *  - a per-request client scoped to the caller's own JWT (forwarded
 *    Authorization header), used for the actual RPC call, so every RPC's
 *    internal auth.uid()-based permission checks behave exactly as if the
 *    browser had called it directly;
 *  - the env-derived NIF encryption/HMAC keys.
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

    return await handleNifWriteProxyRequest(req, {
      supabaseAdmin,
      createUserClient: (authHeader: string) =>
        createClient(supabaseUrl, supabaseAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: authHeader } },
        }),
      getEncKey: () => deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"),
      getHmacKey: () => deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC"),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Error in nif-write-proxy:", message);
    await captureError(error, { function: "nif-write-proxy" });
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
