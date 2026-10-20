import { z } from "npm:zod";
import { authErrorResponse, resolveCallerIdentity } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { captureError } from "../_shared/sentry.ts";
import { hashNif, normalizeNif } from "../_shared/nifCrypto.ts";

/**
 * neg-procurar-duplicados-proxy: o caminho da «Nova lead» de Pessoas quando a lead traz um NIF.
 *
 * A chave que calcula o `nif_hash` nunca chega ao browser, por isso o NIF não pode ir à função da base em claro nem em hash feito
 * no cliente. Esta função calcula o hash no servidor (o mesmo `hashNif` de find-entity-matches-proxy e nif-write-proxy) e chama
 * `neg_procurar_duplicados` com a sessão de QUEM PEDE (o JWT reencaminhado), de modo que as guardas da função (pessoas.view,
 * leads.create, configuração, limite de pedidos NG020) correm exatamente como se o browser a chamasse. Sem NIF a UI chama a RPC
 * diretamente e esta função não é precisa. É uma função NOVA: não altera find-entity-matches-proxy nem find_entity_matches.
 *
 * POST { orgId, email?, phone?, nif?, countryCode? } -> { success: true, data: <linhas da função, em snake_case> }
 * Recusa da função -> HTTP 200 { success: false, code, error } com o código (NG008, NG009, NG020 ou 42501); avaria -> 500. Nunca o NIF nem a chave.
 *
 * SEGURANÇA: nenhum log, mensagem de erro ou resposta pode conter o NIF em claro, o hash ou a chave.
 */
type NifKey = Uint8Array | CryptoKey;

export interface ProcurarDuplicadosProxyDeps {
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;
  // deno-lint-ignore no-explicit-any
  createUserClient: (authHeader: string) => any;
  getHmacKey: () => NifKey;
}

const requestSchema = z.object({
  orgId: z.string().trim().uuid(),
  email: z.string().trim().min(1).nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  nif: z.string().trim().min(1).nullable().optional(),
  countryCode: z.string().trim().min(1).optional(),
});

// Os códigos da função da base que a UI traduz. Respondem com HTTP 200 e `success: false`: o `functions.invoke` do browser deita fora o
// corpo de uma resposta 4xx e a UI deixava de saber que foi o limite de pedidos (NG020) e não uma avaria.
const CODIGOS_DE_NEGOCIO = new Set(["NG008", "NG009", "NG020", "42501"]);

function json(req: Request, corpo: unknown, estado: number): Response {
  return new Response(JSON.stringify(corpo), { status: estado, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
}
function falha(req: Request, estado: number, code: string, error: string): Response {
  return json(req, { success: false, code, error }, estado);
}

export async function handleProcurarDuplicadosProxyRequest(req: Request, deps: ProcurarDuplicadosProxyDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    await resolveCallerIdentity(req, deps.supabaseAdmin);
  } catch (e) {
    return authErrorResponse(e, getCorsHeaders(req));
  }

  const bruto = await req.json().catch(() => null);
  if (bruto === null) return falha(req, 400, "INVALID_INPUT", "Invalid JSON body");
  const lido = requestSchema.safeParse(bruto);
  if (!lido.success) return falha(req, 400, "INVALID_INPUT", lido.error.issues[0]?.message ?? "Invalid request");

  const { orgId, email, phone, nif } = lido.data;
  const pais = (lido.data.countryCode ?? "PT").toUpperCase();

  let nifHash: string | null = null;
  const nifTexto = nif != null ? nif.trim() : "";
  if (nifTexto !== "" && normalizeNif(nifTexto) !== "") {
    try {
      nifHash = await hashNif(nifTexto, deps.getHmacKey());
    } catch (e: unknown) {
      console.error("neg-procurar-duplicados-proxy: falhou o hash do NIF:", e instanceof Error ? e.message : "erro desconhecido");
      await captureError(e, { function: "neg-procurar-duplicados-proxy", stage: "hash-nif" });
      return falha(req, 500, "INTERNAL_ERROR", "Internal error");
    }
  }

  // Com a sessão de quem pede: as guardas e o limite de pedidos da função correm por esse utilizador. Sem repetição automática: a função
  // regista cada procura, e repetir uma que falhou por rede contava duas vezes.
  const cliente = deps.createUserClient(req.headers.get("Authorization") ?? "");
  const { data, error } = await cliente.rpc("neg_procurar_duplicados", {
    p_organization_id: orgId,
    p_email: email ?? null,
    p_telefone: phone ?? null,
    p_nif_hash: nifHash,
    p_pais: pais,
  });

  if (error) {
    const codigo = typeof error.code === "string" ? error.code : "";
    if (CODIGOS_DE_NEGOCIO.has(codigo)) return falha(req, 200, codigo, "Request refused");
    console.error("neg-procurar-duplicados-proxy: a RPC falhou:", error.message);
    await captureError(error, { function: "neg-procurar-duplicados-proxy", stage: "rpc" });
    return falha(req, 500, "INTERNAL_ERROR", "Internal error");
  }
  return json(req, { success: true, data: Array.isArray(data) ? data : [] }, 200);
}
