// Edge Function nif-faturacao (Deno), 3/11/2026 (Rúben: «no passo Dados de faturação deve ir buscar o NIF e o nome do cliente»).
// O NIF da pessoa está cifrado em anew_entities.nif_encrypted (AES-256-GCM, NIF_ENC_KEY, só nas Edge Functions: nif-write-proxy) e nunca
// vai inteiro ao browser. Esta função é a única exceção: devolve o nome e o NIF da pessoa de UM negócio, para preencher os dados de
// faturação, a quem fatura ou valida pagamentos nessa organização.
// Ordem: CORS -> sessão (JWT) -> corpo { organizacao_id, negocio_id } -> a permissão (negocios.registar_fatura ou
// negocios.validar_pagamento nessa organização, has_anew_permission_in_org; ou system admin), como a erp-fatura -> o negócio dessa
// organização -> a pessoa dele -> o NIF decifrado. Cada leitura fica no log da função (quem, que negócio, se havia NIF), nunca o NIF.
// Não precisa de migration: a chave NIF_ENC_KEY já existe na base RH (a do nif-write-proxy).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getServiceRoleKey } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { decryptNif, deriveKeyFromEnv } from "../_shared/nifCrypto.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERMISSOES = ["negocios.registar_fatura", "negocios.validar_pagamento"];

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  const resp = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return resp(405, { erro: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    console.error("nif-faturacao: configuracao do ambiente incompleta");
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
  const org = corpo?.organizacao_id, negocio = corpo?.negocio_id;
  if (typeof org !== "string" || !UUID_RE.test(org) || typeof negocio !== "string" || !UUID_RE.test(negocio)) return resp(400, { erro: "Pedido inválido." });

  // a permissão pela identidade de quem pede (como a erp-fatura)
  const uid = sessao.user.id;
  const pedidos = await Promise.all([
    ...PERMISSOES.map((p) => cliente.rpc("has_anew_permission_in_org", { _auth_uid: uid, _permission_code: p, _organization_id: org })),
    cliente.rpc("is_system_admin_user", { _user_id: uid }),
  ]);
  const falhou = pedidos.slice(0, PERMISSOES.length).find((r) => r.error);
  if (falhou) {
    console.error("nif-faturacao: a verificacao da permissao falhou", falhou.error?.code);
    return resp(500, { erro: "Não foi possível verificar a permissão." });
  }
  if (!pedidos.some((r) => r.data === true && !r.error)) return resp(403, { erro: "Sem permissão para ler os dados de faturação." });

  // daqui para a frente com a service role: o negócio tem de ser desta organização, e a pessoa é a dele
  const admin = createClient(url, getServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: neg, error: eNeg } = await admin.from("negocios").select("entity_id").eq("id", negocio).eq("organization_id", org).maybeSingle();
  if (eNeg) {
    console.error("nif-faturacao: leitura do negocio falhou", eNeg.code);
    return resp(500, { erro: "Não foi possível ler o negócio." });
  }
  if (!neg) return resp(404, { erro: "Negócio não encontrado." });
  const { data: pessoa, error: ePessoa } = await admin.from("anew_entities").select("display_name, nif_encrypted")
    .eq("id", (neg as { entity_id: string }).entity_id).is("deleted_at", null).maybeSingle();
  if (ePessoa) {
    console.error("nif-faturacao: leitura da pessoa falhou", ePessoa.code);
    return resp(500, { erro: "Não foi possível ler a ficha do cliente." });
  }
  if (!pessoa) return resp(404, { erro: "A ficha do cliente não existe." });

  const p = pessoa as { display_name: string | null; nif_encrypted: string | null };
  let nif: string | null = null;
  if (p.nif_encrypted) {
    try {
      nif = await decryptNif(p.nif_encrypted, deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"));
    } catch (e) {
      console.error("nif-faturacao: nao deu para decifrar o NIF", e instanceof Error ? e.name : "erro");
      return resp(500, { erro: "Não foi possível ler o NIF da ficha." });
    }
  }
  // o registo de quem leu (sem o NIF)
  console.log(JSON.stringify({ evento: "nif_faturacao_lido", auth_uid: uid, organizacao_id: org, negocio_id: negocio, tem_nif: nif !== null }));
  return resp(200, { nome: p.display_name?.trim() || null, nif });
});
