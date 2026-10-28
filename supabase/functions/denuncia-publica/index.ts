/**
 * O canal de denuncias publico: a ponte entre o browser (com ou sem sessao) e as RPCs
 * `rpc_denuncia_publica_*`. Toda a logica vive em `handler.ts` (sem Deno, testavel); este
 * ficheiro so liga o mundo real: cliente Supabase, ambiente, relogio e Sentry.
 *
 * SEGREDOS DE AMBIENTE (alem dos de sempre), ambos com 32 caracteres ou mais, gerados uma vez
 * com `openssl rand -base64 48` e nunca partilhados:
 *  - DENUNCIAS_PIN_PEPPER: pepper do HMAC do PIN. Sem ele, criar e entrar respondem 503.
 *  - DENUNCIAS_IP_PEPPER: pepper do HMAC do IP (so para limitar pedidos). Sem ele, os limites
 *    por IP respondem 503 (falha fechada).
 * Opcional: DENUNCIAS_XFF_SALTOS (por omissao 0): proxies conhecidos a direita da entrada de
 * x-forwarded-for que a plataforma acrescenta. Ver `ip.ts`.
 *
 * CORS: so as origens da aplicacao (`_shared/cors.ts`), nunca "*". NAO PUBLICAR antes de as
 * RPCs existirem na base (migration `rpc_denuncia_publica_*`), de os segredos estarem
 * definidos e de o `config.toml` ter `verify_jwt = false` para esta funcao.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { captureError, initSentry } from "../_shared/sentry.ts";
import { criarHandler, type ClienteDenuncia, type DepsDenuncia } from "./handler.ts";
import { ipDoPedido } from "./ip.ts";

initSentry();

const saltos = Number(Deno.env.get("DENUNCIAS_XFF_SALTOS") ?? "0");
const SALTOS_CONFIAVEIS = Number.isInteger(saltos) && saltos >= 0 && saltos <= 5 ? saltos : 0;

const deps: DepsDenuncia = {
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  pinPepper: Deno.env.get("DENUNCIAS_PIN_PEPPER") ?? null,
  ipPepper: Deno.env.get("DENUNCIAS_IP_PEPPER") ?? null,
  criarCliente: (url, chave) =>
    createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as ClienteDenuncia,
  registarErro: (erro) => {
    captureError(erro);
  },
  corsHeaders: (req) => getCorsHeaders(req),
  ipDoPedido: (req) => ipDoPedido(req, SALTOS_CONFIAVEIS),
  agora: () => Date.now(),
  hoje: () => new Date().toISOString().slice(0, 10),
  dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

Deno.serve(criarHandler(deps));
