/**
 * hr-justificacao-anexo -- anexos das justificacoes (do dia e papel de uma
 * falta) com quarentena. Corpo JSON `{accao, ...}`; ver accoes.ts.
 *
 *   url | confirmar | remover | abrir   utilizador humano (JWT), 60/h por
 *                                       utilizador e accao
 *   limpar                              pg_cron, com o segredo partilhado do cron
 *
 * AUTENTICACAO. `verify_jwt = false` em supabase/config.toml: o segredo do cron
 * nao e um JWT e o gateway rejeitava-o. Por isso as accoes humanas validam o
 * JWT aqui (resolveCallerIdentity -> auth.getUser) e recusam qualquer chamada
 * com a chave de servico ou o segredo do cron (so um utilizador real tem
 * auth.uid() a quem atribuir o anexo e o registo de acesso). `limpar` exige o
 * segredo do cron ou a chave de servico (requireServiceRoleOrCronSecret).
 *
 * Quem pode o que decide-o a base (rpc_hr_justificacao_anexo_*), com a
 * organizacao da propria linha; aqui nao se le nenhuma tabela com a chave de
 * servico, excepto rate_limit_attempts (sem organizacao; regista a tentativa antes de contar e,
 * nas accoes url/abrir/remover, recusa com erro_inesperado se o contador falhar). Respostas de erro:
 * `{error: codigo}`, nunca texto da base nem caminhos.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AuthError, authErrorResponse, requireServiceRoleOrCronSecret, resolveCallerIdentity } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { erroSemDados } from "../_shared/erroSemDados.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import type { ClienteJustificacao } from "./accoes.ts";
import { consumirLimiteRegistandoPrimeiro, tratarPedidoHttp, tratarPedidoHumano } from "./handler.ts";
import { limparAnexosJustificacoes, mensagemDeAlarme, respostaDaVolta, type ClienteLimpeza } from "./limpeza.ts";

initSentry();

const ORIGEM = "hr-justificacao-anexo";

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const responder = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: cors });
  if (req.method !== "POST") return responder({ error: "method_not_allowed" }, 405);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const registarErro = (e: unknown) => {
    captureError(erroSemDados(ORIGEM, e));
  };

  try {
    const resposta = await tratarPedidoHttp(req, {
      eCron: requireServiceRoleOrCronSecret,
      resolverChamador: (r) => resolveCallerIdentity(r, svc),
      limpar: async () => {
        const resultado = await limparAnexosJustificacoes(svc as unknown as ClienteLimpeza, registarErro);
        if (resultado.alarmes.length > 0) captureError(new Error(mensagemDeAlarme(resultado)));
        return respostaDaVolta(resultado);
      },
      humano: (accao, authUid, payload) =>
        tratarPedidoHumano({
          accao,
          authUid,
          payload,
          svc: svc as unknown as ClienteJustificacao,
          // regista ANTES de contar: uma rajada paralela nao passa toda
          consumirLimite: (bucket, identificador) => consumirLimiteRegistandoPrimeiro(svc, bucket, identificador),
          registarErro,
        }),
    });
    return responder(resposta.body, resposta.status);
  } catch (e) {
    if (e instanceof AuthError) return authErrorResponse(e, getCorsHeaders(req));
    registarErro(e);
    return responder({ error: "erro_inesperado" }, 500);
  }
});
