// Edge Function agentes-obra (Deno), 25/11/2026: os agentes da Olyvia a vigiar as obras com a Olyvia fechada (plano «Obra Viva», etapa 3b).
// Quem a chama é o pg_cron, de 15 em 15 minutos (fn_agentes_agendado, migration 20270127000000), com o token do Vault 'agentes_segredo'.
// Ordem: só POST → o token (fn_agentes_segredo_confere, com o service_role) → entra com a conta robô «Olyvia (agentes)» (AGENTES_EMAIL e
// AGENTES_PALAVRA_PASSE, segredos da função que o Rúben põe à mão) → para cada organização de AGENTES_ORGS, a mesma volta dos agentes da
// página dos Negócios (motor.bundle.js: correrAgentesServidor) → grava só as obras que mudaram, com as permissões da conta robô.
// Responde com o resumo da volta (contas por organização, sem nomes de clientes).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
// o motor da app, empacotado com `npm run build:agentes-obra` (não vai para o git: gera-se antes de publicar)
import { correrAgentesServidor, definirClienteServidor } from "./motor.bundle.js";

// o motor guarda umas preferências no browser; aqui não há browser
const g = globalThis as unknown as { localStorage?: unknown; window?: unknown };
if (!g.localStorage) {
  const m = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return resp(405, { erro: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL"), servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  const email = Deno.env.get("AGENTES_EMAIL"), palavra = Deno.env.get("AGENTES_PALAVRA_PASSE");
  const orgs = (Deno.env.get("AGENTES_ORGS") ?? "").split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!url || !servico || !anon) { console.error("agentes-obra: configuracao do ambiente incompleta"); return resp(500, { erro: "Serviço indisponível." }); }

  // o token do pg_cron confere-se na base: nunca sai do Vault
  const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("Authorization") ?? "")?.[1] ?? "";
  if (token.length < 32) return resp(401, { erro: "Sem autorização." });
  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: certo, error: eToken } = await admin.rpc("fn_agentes_segredo_confere", { p_token: token });
  if (eToken) { console.error("agentes-obra: a verificacao do token falhou", eToken.code); return resp(500, { erro: "Não foi possível verificar o pedido." }); }
  if (certo !== true) return resp(401, { erro: "Sem autorização." });

  if (!email || !palavra) return resp(503, { erro: "A conta dos agentes não está configurada (AGENTES_EMAIL, AGENTES_PALAVRA_PASSE)." });
  if (!orgs.length) return resp(503, { erro: "Falta a organização dos agentes (AGENTES_ORGS)." });

  // a conta robô: as mesmas funções da base, com as permissões dela (o papel das Operações)
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: eEntrar } = await sb.auth.signInWithPassword({ email, password: palavra });
  if (eEntrar) { console.error("agentes-obra: a conta dos agentes nao entrou", eEntrar.status); return resp(503, { erro: "A conta dos agentes não conseguiu entrar." }); }
  definirClienteServidor(sb);

  const resumo = [];
  for (const org of orgs) {
    try { resumo.push(await correrAgentesServidor(sb, org)); }
    catch (e) { console.error("agentes-obra: a volta falhou", org, (e as Error).message); resumo.push({ org, erros: [(e as Error).message] }); }
  }
  await sb.auth.signOut().catch(() => undefined);
  return resp(200, { volta: new Date().toISOString(), resumo });
});
