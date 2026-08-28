// accept-proposal — aceitacao de uma proposta a partir do link publico.
//
// Contraparte exacta de `reject-proposal`. Existe por uma razao concreta: o
// `acceptance_ip` so pode ser determinado no servidor. `PublicProposal.tsx`
// fazia o UPDATE directamente do browser e gravava `acceptance_ip: "client"`
// — uma constante inventada num campo que serve de prova. Ver
// _shared/clientIp.ts para o racional completo.
//
// PORQUE UMA FUNCAO NOVA E NAO REUTILIZAR UMA EXISTENTE
// ----------------------------------------------------
// Os outros dois caminhos de aceitacao nao servem este:
//   - `client-portal-action` exige um JWT de utilizador do portal e confirma a
//     posse via `client_portal_users`; o link publico nao tem utilizador.
//   - `send-verification-code/verify` exige um OTP verificado; o template sem
//     verificacao nao gera nenhum.
// O que E reutilizado — e a parte que divergia — e o MECANISMO de deteccao do
// IP, agora em `_shared/clientIp.ts` e partilhado pelos tres caminhos.
//
// Esta funcao nao consulta nenhuma tabela multi-tenant com o service role: toda
// a leitura e escrita acontece dentro de `accept_proposal_atomic`, que e
// SECURITY DEFINER e esta ancorada no `public_token` da propria proposta. Nao
// ha, por construcao, uma query por organizacao que se possa esquecer de
// filtrar (por isso tambem nao usa `_shared/orgScopedQuery.ts`).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { detectClientIp, detectUserAgent } from "../_shared/clientIp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposal_id, public_token } = await req.json();

    if (!proposal_id || !public_token) {
      return json({ error: "proposal_id and public_token are required" }, 400);
    }

    // Derivado dos cabecalhos do pedido, NUNCA do corpo. Qualquer `ip` que o
    // cliente enviasse seria prova escolhida pelo proprio, logo nao e prova.
    // `null` quando nao ha cabecalho — e o que fica na base, sem enchimento.
    const acceptanceIp = detectClientIp(req);
    const acceptanceUserAgent = detectUserAgent(req);

    if (acceptanceIp === null) {
      // Nao bloqueia a aceitacao — o cliente nao pode ser impedido de aceitar
      // por uma falha de infraestrutura nossa — mas fica registado que a prova
      // saiu incompleta.
      console.warn(
        `[accept-proposal] IP nao detectado para a proposta ${proposal_id}; acceptance_ip fica NULL`,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await supabase.rpc("accept_proposal_atomic", {
      p_proposal_id:           proposal_id,
      p_public_token:          public_token,
      p_acceptance_ip:         acceptanceIp,
      p_acceptance_user_agent: acceptanceUserAgent,
    });

    if (error) {
      console.error("[accept-proposal] RPC error:", error);
      return json({ error: error.message }, 400);
    }

    // Congela o snapshot decidido, tal como `client-portal-action` faz depois
    // de assinar. Fail-soft de proposito: a aceitacao ja esta gravada, e uma
    // falha aqui nunca a pode desfazer nem esconder do cliente.
    if (data?.changed === true) {
      const { error: decisionError } = await supabase.rpc("record_proposal_decision", {
        p_proposal_id: proposal_id,
      });
      if (decisionError) {
        console.error("[accept-proposal] record_proposal_decision error:", decisionError);
      }
    }

    return json({ success: true, result: data }, 200);
  } catch (err: any) {
    console.error("[accept-proposal] Unexpected error:", err);
    return json({ error: err.message }, 500);
  }
});
