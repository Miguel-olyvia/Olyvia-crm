/**
 * hr-anexo-rh -- o RH anexa, substitui e remove o cartao de cidadao, o
 * comprovativo de IBAN e a fotografia de uma pessoa. Tres accoes: `url`,
 * `confirmar` e `remover` (ver accoes.ts, que tem toda a logica e o ciclo de
 * vida do ficheiro).
 *
 * Autenticada pelo JWT do RH (verify_jwt por omissao, como hr-anexo-url). A
 * chave de servico so existe aqui dentro e nunca e devolvida: as RPCs
 * rpc_hr_anexo_rh_* sao so de service_role e recebem o auth uid de quem pediu,
 * leem a pessoa pela chave primaria e verificam a permissao de escrita do tipo
 * na ORGANIZACAO DA PESSOA. Nenhuma organizacao entra pelo pedido.
 *
 * Uma chamada com a chave de servico (ou do gatilho da base) e recusada: tem de
 * haver um humano, para a auditoria dizer quem alterou o ficheiro.
 *
 * Respostas de erro: `{error: codigo}`, nunca texto da base nem caminhos.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { erroSemDados } from "../_shared/erroSemDados.ts";
import { checkRateLimit, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import type { ClienteAnexos } from "../convite-admissao/accoesAnexos.ts";
import { eAccaoRh, recusarSeNaoForHumano, tratarAccaoRh } from "./accoes.ts";

initSentry();

const ORIGEM = "hr-anexo-rh";
/** Pedidos por utilizador e por accao na janela. */
const MAX_PEDIDOS_POR_HORA = 60;
const JANELA_MINUTOS = 60;

serve(async (req) => {
  const corsHeaders = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const responder = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const registarErro = (e: unknown) => {
    captureError(erroSemDados(ORIGEM, e));
  };

  try {
    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, getCorsHeaders(req));
    }

    const recusa = recusarSeNaoForHumano(caller);
    if (recusa) return responder(recusa.body, recusa.status);

    const body = await req.json().catch(() => null);
    const payload = body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
    const accao = payload?.accao;
    if (!eAccaoRh(accao)) return responder({ error: "accao_desconhecida" }, 400);

    const bucket = `hr-anexo-rh-${accao}`;
    const limite = await checkRateLimit(supabase, {
      bucket,
      identifier: caller.authUid,
      maxAttempts: MAX_PEDIDOS_POR_HORA,
      windowMinutes: JANELA_MINUTOS,
    });
    if (!limite.allowed) return responder({ error: "demasiadas_tentativas" }, 429);
    await recordRateLimitAttempt(supabase, bucket, caller.authUid);

    const resultado = await tratarAccaoRh({
      accao,
      svc: supabase as unknown as ClienteAnexos,
      authUid: caller.authUid,
      payload,
      registarErro,
    });
    return responder(resultado.body, resultado.status);
  } catch (e) {
    registarErro(e);
    return responder({ error: "erro_inesperado" }, 500);
  }
});
