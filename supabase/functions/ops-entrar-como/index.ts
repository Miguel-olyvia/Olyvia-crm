/**
 * Operações — "Entrar como": o admin de Operações abre a app como outra pessoa
 * da equipa, para testar o que ela vê e consegue fazer.
 *
 * Ficheiro ÚNICO, sem imports de ../_shared, para se poder publicar também
 * pelo editor do painel do Supabase (Edge Functions → Deploy a new function).
 *
 * Fluxo:
 *   1. a app (com a sessão do admin) chama esta função com { org_id, alvo_id };
 *   2. as regras são TODAS verificadas na base, com a identidade do admin:
 *      `ops_entrar_como_verificar` (db/entrar-como.sql) — admin de Operações
 *      nesta organização, pessoa com perfil ativo abaixo de admin, não admin de
 *      sistema, e sem nenhum acesso que o admin não tenha;
 *   3. só então, com a chave de serviço, gera-se um link mágico para a pessoa
 *      (nenhum email é enviado) e devolve-se o `token_hash`; a app troca-o por
 *      uma sessão com `verifyOtp`, guardada só na chave de sessão da app de
 *      Operações (não mexe na sessão do CRM aberta no mesmo browser);
 *   4. fica registado em `ops_entrar_como_log`. Sem registo, não se entra.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

// O mesmo critério de _shared/cors.ts: só a origem da app e as pré-visualizações.
const ORIGENS = ["https://www.olyvia-ai.com", "https://olyvia-ai.com", "https://app.olyvia.pt"];
const PREVIEW = /^https:\/\/olyvia[a-z0-9-]*-bmgest\.vercel\.app$/;
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  const permitida = ORIGENS.includes(o) || PREVIEW.test(o) || LOCAL.test(o) ? o : ORIGENS[0];
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": permitida,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

// Ver _shared/auth.ts: a SUPABASE_SERVICE_ROLE_KEY injetada deixou de valer neste
// projeto; a DB_SERVICE_ROLE_KEY é a que funciona.
const chaveServico = () => Deno.env.get("DB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const responder = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method !== "POST") return responder(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return responder(401, { error: "Sessão em falta." });

  let org_id = "";
  let alvo_id = "";
  try {
    const b = await req.json();
    org_id = String(b?.org_id ?? "");
    alvo_id = String(b?.alvo_id ?? "");
  } catch {
    return responder(400, { error: "Pedido inválido." });
  }
  if (!UUID.test(org_id) || !UUID.test(alvo_id)) return responder(400, { error: "Pedido inválido." });

  const url = Deno.env.get("SUPABASE_URL")!;

  try {
    // 1. As regras, com a sessão de quem pede (auth.uid() = o admin).
    const comoQuemPede = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: verif, error: verifErr } = await comoQuemPede.rpc("ops_entrar_como_verificar", {
      p_org: org_id,
      p_alvo: alvo_id,
    });
    if (verifErr || !verif?.ok) {
      return responder(403, { error: verifErr?.message ?? "Sem permissão." });
    }

    // 2. A sessão da pessoa: link mágico gerado pelo servidor (não envia email).
    const servico = createClient(url, chaveServico(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: link, error: linkErr } = await servico.auth.admin.generateLink({
      type: "magiclink",
      email: verif.email as string,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      console.error("[ops-entrar-como] generateLink falhou:", linkErr);
      throw new Error("Não foi possível abrir a sessão dessa pessoa.");
    }
    if (link.user?.id && link.user.id !== verif.auth_user_id) {
      throw new Error("A conta de acesso dessa pessoa não bate certo. Nada foi aberto.");
    }

    // 3. O registo. Sem registo, não se entra.
    const { data: log, error: logErr } = await servico
      .from("ops_entrar_como_log")
      .insert({
        organization_id: org_id,
        admin_id: verif.admin_id,
        alvo_id: verif.alvo_id,
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      })
      .select("id")
      .single();
    if (logErr || !log) {
      console.error("[ops-entrar-como] registo falhou:", logErr);
      throw new Error("Não foi possível registar a entrada. Nada foi aberto.");
    }

    return responder(200, {
      token_hash: tokenHash,
      log_id: log.id,
      nome: verif.nome,
      funcao: verif.funcao,
      email: verif.email,
    });
  } catch (err: unknown) {
    console.error("[ops-entrar-como] erro:", err);
    return responder(500, { error: err instanceof Error ? err.message : "Erro interno." });
  }
});
