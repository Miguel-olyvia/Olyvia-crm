/**
 * convite-admissao-limpeza -- apaga do Storage os ficheiros dos convites de
 * admissao que ja nao servem (convites expirados ou revogados ha mais de 7
 * dias, uploads abandonados, copias da quarentena que ficaram para tras).
 * Chamada por pg_cron, uma vez por dia.
 *
 * AUTENTICACAO
 * ------------
 * `requireServiceRoleOrCronSecret`: o cron envia o segredo partilhado, que nao
 * e um JWT (por isso `verify_jwt = false` em supabase/config.toml). Sem ele, 401.
 *
 * ALARME
 * ------
 * No fim de cada volta a funcao le hr_convite_anexos_limpeza_estado(). Se uma
 * remocao falhou, se ha linhas apagadas ha mais de 2 dias por remover ou
 * promocoes pendentes, envia um alerta para o Sentry (so codigos e contagens) e
 * responde 500: um 200 com `falhados > 0` ninguem o ve.
 * (Nao cobre o caso de a funcao nem chegar a correr, por exemplo segredo do cron
 * errado: isso e lido do lado da base, em job_agendado e net._http_response.)
 *
 * O QUE NAO FAZ
 * -------------
 * Nao decide o que apagar (isso e da funcao SQL hr_convite_anexos_limpar, que
 * usa o MESMO criterio de 7 dias da limpeza dos rascunhos) e nunca faz DELETE
 * em storage.objects: so a API do Storage apaga ficheiros. A logica esta em
 * limpeza.ts. Nunca devolve nem regista tokens, caminhos ou nomes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrCronSecret } from "../_shared/auth.ts";
import { erroSemDados } from "../_shared/erroSemDados.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { limparAnexosExpirados, mensagemDeAlarme, respostaDaVolta, type ClienteLimpeza } from "./limpeza.ts";

initSentry();

const ORIGEM = "convite-admissao-limpeza";
const CABECALHOS = { "Content-Type": "application/json" };

function responder(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CABECALHOS });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return responder({ error: "method_not_allowed" }, 405);
  if (!requireServiceRoleOrCronSecret(req)) return responder({ error: "unauthorized" }, 401);

  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const resultado = await limparAnexosExpirados(svc as unknown as ClienteLimpeza, (e) => {
      captureError(erroSemDados(ORIGEM, e));
    });
    if (resultado.alarmes.length > 0) captureError(new Error(mensagemDeAlarme(resultado)));
    const { status, body } = respostaDaVolta(resultado);
    return responder(body, status);
  } catch (e) {
    captureError(erroSemDados(ORIGEM, e));
    return responder({ error: "erro_inesperado" }, 500);
  }
});
