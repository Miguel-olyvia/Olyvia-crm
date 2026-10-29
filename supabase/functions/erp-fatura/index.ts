// Edge Function erp-fatura (Deno), trazida do Olyvia 2.0 (26/10/2026) para o CRM (F3, 28/10): «esta fatura já foi paga no Eticadata?».
// A nuvem não chega ao SQL Server da rede da empresa; quem lá chega é a ponte (só leitura), exposta por um túnel de saída. Esta função é a
// única que fala com a ponte: o token da ponte fica nos segredos do Supabase e nunca vai ao browser.
// Ordem: CORS -> sessão (JWT) -> corpo { organizacao_id, numero } -> a permissão (negocios.registar_fatura ou negocios.validar_pagamento
// nessa organização, has_anew_permission_in_org; ou system admin) -> GET <ERP_PONTE_URL>/fatura?numero=… -> a resposta da ponte tal como
// vem ({ encontrada, … } ou { erro }).
// Segredos: ERP_PONTE_URL, ERP_PONTE_TOKEN; e, se o túnel estiver atrás do Cloudflare Access, ERP_PONTE_CF_ID e ERP_PONTE_CF_SECRET.
// Sem a ponte configurada responde 503 «O ERP não está configurado»: o ecrã regista a fatura na mesma e o pagamento valida-se à mão.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERO_RE = /^[\w .\-/]{3,50}$/;
const PERMISSOES = ["negocios.registar_fatura", "negocios.validar_pagamento"];
const ESPERA_MS = 25_000;

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  const resp = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return resp(405, { erro: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    console.error("erp-fatura: configuracao do ambiente incompleta");
    return resp(500, { erro: "Serviço indisponível. Tente mais tarde." });
  }

  const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("Authorization") ?? "")?.[1];
  if (!token) return resp(401, { erro: "Sessão em falta. Inicie sessão novamente." });
  const cliente = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error: eSessao } = await cliente.auth.getUser(token);
  if (eSessao || !sessao?.user) return resp(401, { erro: "Sessão inválida ou expirada." });

  let corpo: Record<string, unknown> | null = null;
  try { corpo = await req.json(); } catch { corpo = null; }
  const org = corpo?.organizacao_id, numero = typeof corpo?.numero === "string" ? corpo.numero.trim() : "";
  if (typeof org !== "string" || !UUID_RE.test(org) || !NUMERO_RE.test(numero)) return resp(400, { erro: "Pedido inválido." });

  // as permissões contam pela identidade de quem pede (has_anew_permission_in_org, como fn_cat_exigir nas RPCs do negócio)
  const uid = sessao.user.id;
  const pedidos = await Promise.all([
    ...PERMISSOES.map((p) => cliente.rpc("has_anew_permission_in_org", { _auth_uid: uid, _permission_code: p, _organization_id: org })),
    cliente.rpc("is_system_admin_user", { _user_id: uid }),
  ]);
  const falhou = pedidos.slice(0, PERMISSOES.length).find((r) => r.error);
  if (falhou) {
    console.error("erp-fatura: a verificacao da permissao falhou", falhou.error?.code);
    return resp(500, { erro: "Não foi possível verificar a permissão." });
  }
  const pode = pedidos.some((r) => r.data === true && !r.error);
  if (!pode) return resp(403, { erro: "Sem permissão para ler as faturas do ERP." });

  const ponte = (Deno.env.get("ERP_PONTE_URL") ?? "").replace(/\/+$/, "");
  const tokenPonte = Deno.env.get("ERP_PONTE_TOKEN") ?? "";
  if (!ponte.startsWith("https://") || tokenPonte.length < 32) return resp(503, { erro: "O ERP não está configurado: valide o pagamento à mão." });
  const cabecalhos: Record<string, string> = { Authorization: `Bearer ${tokenPonte}`, Accept: "application/json" };
  const cfId = Deno.env.get("ERP_PONTE_CF_ID"), cfSegredo = Deno.env.get("ERP_PONTE_CF_SECRET");
  if (cfId && cfSegredo) { cabecalhos["CF-Access-Client-Id"] = cfId; cabecalhos["CF-Access-Client-Secret"] = cfSegredo; }

  try {
    const r = await fetch(`${ponte}/fatura?numero=${encodeURIComponent(numero)}`, { headers: cabecalhos, signal: AbortSignal.timeout(ESPERA_MS) });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (!j || (typeof j.encontrada !== "boolean" && typeof j.erro !== "string")) {
      console.error("erp-fatura: resposta inesperada da ponte", r.status);
      return resp(502, { erro: "Resposta inválida da ponte do Eticadata." });
    }
    if (typeof j.erro === "string") return resp(502, { erro: j.erro });
    return resp(200, j);
  } catch (e) {
    console.error("erp-fatura: a ponte nao respondeu", e instanceof Error ? e.name : "erro");
    return resp(502, { erro: "A ponte do Eticadata não respondeu." });
  }
});
