/**
 * O convite de admissao: a ponte entre o browser (com ou sem sessao) e as RPCs
 * `rpc_hr_convite_admissao_*`. Toda a logica vive em `handler.ts` (sem Deno,
 * testavel); este ficheiro so liga o mundo real: clientes Supabase, ambiente,
 * rate limit e Sentry.
 *
 * ACCOES, TRES NIVEIS DE CONFIANCA
 * --------------------------------
 *  - "criar": RH autenticado com `hr.pessoas.convite.enviar`. Valida o JWT, DERIVA
 *    dele o `p_actor`, confirma que a pessoa e da organizacao activa e que o RH tem
 *    a permissao nela, e chama `rpc_hr_convite_admissao_criar` com a chave de
 *    servico (a RPC e service_role: o token e o hash nascem aqui e nunca saem;
 *    um RH nao pode escolher o proprio token). A RPC volta a validar tudo por dentro.
 *  - "cancelar" e "prolongar": RH autenticado, sem segredos. As RPCs correm com o
 *    JWT REENCAMINHADO (cliente com o Authorization do pedido).
 *  - "estado", "rascunho", "submeter" e anexos: SEM sessao, so com o token, com
 *    service_role atras de rate limit por IP e por token_hash.
 *  - V3a, portal por OTP e sessao (token do link + sessao; `accoesPortal.ts`): "otp_pedir"
 *    (gera o codigo, grava so o HMAC e envia-o por correio directo ao e-mail FIXADO no
 *    convite), "otp_verificar" (abre a sessao: o segredo vai ao browser no corpo, a base so
 *    ve o hash), "sair", "ler" (monta o formulario) e "sensiveis" (NISS e IBAN para o Vault).
 *    A sessao volta no cabecalho `x-portal-sessao` e NUNCA no URL.
 *  - "reenviar" (RH, `reenviar.ts`): valida o JWT, deriva o actor dele e reenvia o MESMO link;
 *    o token nunca sai da Edge.
 *
 * SEGREDOS DE AMBIENTE (alem dos de sempre): PORTAL_OTP_PEPPER (obrigatorio para o OTP;
 * 32 caracteres ou mais; gera-se uma vez, com `openssl rand -base64 48`, e nao se partilha).
 * O SMTP e o da organizacao do processo (organization_smtp_settings), sem segredo novo.
 *
 * NUNCA se devolve nem regista `error.details` ou o texto de um erro do Postgres
 * (a mensagem de um CHECK violado traz a linha inteira).
 *
 * A CONTA BANCARIA (submeter)
 * ---------------------------
 * `iban`, `conta_titular` e `conta_banco` sao chaves do contrato como as outras;
 * o BIC viaja como `conta_swift`. O token E a autorizacao para escrever o IBAN,
 * tal como ja era para o NISS. No RASCUNHO, porem, niss, iban e conta_numero
 * nao se guardam (CHECK da V2): `rascunho.ts` retira-os.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { captureError, initSentry } from "../_shared/sentry.ts";
import { resolveOrganizationSmtp, sendEmailViaSMTP } from "../_shared/smtp.ts";
import { criarEnviadorCorreio } from "./correio.ts";
import { criarHandler, type ClienteConvite, type DepsConvite } from "./handler.ts";
import { comCabecalhoSessao } from "./sessao.ts";

initSentry();

const comoCliente = (c: unknown) => c as ClienteConvite;

// Cliente de servico para resolver o SMTP da organizacao do processo (so leitura de
// organization_smtp_settings, filtrada por organization_id dentro de resolveOrganizationSmtp).
const clienteSmtp = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const deps: DepsConvite = {
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  appBaseUrl: Deno.env.get("APP_BASE_URL"),
  allowedOrigin: Deno.env.get("ALLOWED_ORIGIN"),
  // Pepper do HMAC do OTP. Nao tem valor por omissao: sem ele (ou com menos de 32
  // caracteres) otp_pedir e otp_verificar falham FECHADOS (503 otp_indisponivel).
  otpPepper: Deno.env.get("PORTAL_OTP_PEPPER") ?? null,
  // SMTP da organizacao do processo, envio directo: NUNCA pela send-email (email_logs).
  enviarCorreio: criarEnviadorCorreio({
    resolverSmtp: (organizationId) => resolveOrganizationSmtp(clienteSmtp, organizationId),
    enviarSmtp: (smtp, mensagem) => sendEmailViaSMTP(smtp, mensagem),
  }),
  criarCliente: (url, key, opcoes) =>
    comoCliente(
      createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        // O JWT do RH reencaminhado (as RPCs correm com auth.uid() dele) e/ou cabecalhos
        // por pedido (x-portal-sessao na accao estado, lido pela RPC em request.headers).
        ...(opcoes?.authorization || opcoes?.headers
          ? {
            global: {
              headers: {
                ...(opcoes.headers ?? {}),
                ...(opcoes.authorization ? { Authorization: opcoes.authorization } : {}),
              },
            },
          }
          : {}),
      }),
    ),
  // O comportamento por omissao de _shared/rateLimit.ts nao muda (codigo partilhado).
  verificarLimite: (svc, opcoes) => checkRateLimit(svc, opcoes),
  registarTentativa: (svc, bucket, identifier) => recordRateLimitAttempt(svc, bucket, identifier),
  registarErro: (erro) => {
    captureError(erro);
  },
  // O CORS partilhado nao conhece x-portal-sessao: sem ele o browser recusa o preflight.
  corsHeaders: (req) => comCabecalhoSessao({ ...getCorsHeaders(req), "Access-Control-Allow-Origin": "*" }),
};

Deno.serve(criarHandler(deps));
