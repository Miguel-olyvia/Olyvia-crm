import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { deriveKeyFromEnv } from "../_shared/nifCrypto.ts";
import { handleProcurarDuplicadosProxyRequest } from "./handler.ts";

initSentry();

/**
 * neg-procurar-duplicados-proxy — ligação do Deno.serve. A lógica e a documentação estão em handler.ts.
 * Um cliente com a chave de serviço só para resolver quem pede; a chamada à função da base usa a sessão de quem pede.
 */
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    return await handleProcurarDuplicadosProxyRequest(req, {
      supabaseAdmin,
      createUserClient: (authHeader: string) =>
        createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: authHeader } } }),
      getHmacKey: () => deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC"),
    });
  } catch (error: unknown) {
    console.error("Erro em neg-procurar-duplicados-proxy:", error instanceof Error ? error.message : "Internal error");
    await captureError(error, { function: "neg-procurar-duplicados-proxy" });
    return new Response(JSON.stringify({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
