// Edge Function erp-verificar-pagamentos (Deno), 12/11/2026: a verificação automática no Eticadata, sem ninguém com a página aberta.
// Quem a chama é o pg_cron, de 10 em 10 minutos (fn_erp_verificar_agendado, migration 20270115400000), com o token do Vault
// 'erp_verificar_segredo'. Não há sessão: confere-se o token na base (fn_erp_verificar_segredo_confere) e trabalha-se com o service_role.
// Ordem: só POST -> token -> a ponte configurada (ERP_PONTE_URL, ERP_PONTE_TOKEN, e ERP_PONTE_CF_ID/SECRET se houver Cloudflare Access)
// -> as faturas por pagar (neg_erp_por_verificar; ERP_PONTE_ORGS limita às organizações da base que a ponte lê) -> cada uma na ponte ->
// neg_erp_registar_leitura (paga no ERP: valida o pagamento com o recibo do ERP, como o «Verificar no ERP» do browser).
// Responde com o resumo da volta: as contas e os números das faturas validadas (sem nomes de clientes nem NIF).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { configPonte, lerNaPonte, orgsDaPonte, verificarPagamentos, type Pendente, type Registo } from "../_shared/erpVerificar.ts";

const LIMITE = 60;

Deno.serve(async (req: Request): Promise<Response> => {
  const resp = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return resp(405, { erro: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chave) {
    console.error("erp-verificar-pagamentos: configuracao do ambiente incompleta");
    return resp(500, { erro: "Serviço indisponível." });
  }
  const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("Authorization") ?? "")?.[1] ?? "";
  if (token.length < 32) return resp(401, { erro: "Sem autorização." });

  const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: certo, error: eToken } = await sb.rpc("fn_erp_verificar_segredo_confere", { p_token: token });
  if (eToken) {
    console.error("erp-verificar-pagamentos: a verificacao do token falhou", eToken.code);
    return resp(500, { erro: "Não foi possível verificar o pedido." });
  }
  if (certo !== true) return resp(401, { erro: "Sem autorização." });

  const ponte = configPonte((k) => Deno.env.get(k));
  if (!ponte) return resp(503, { erro: "A ponte do Eticadata não está configurada (ERP_PONTE_URL, ERP_PONTE_TOKEN)." });

  const { data: lista, error: eLista } = await sb.rpc("neg_erp_por_verificar", { p_orgs: orgsDaPonte(Deno.env.get("ERP_PONTE_ORGS")), p_limite: LIMITE });
  if (eLista) {
    console.error("erp-verificar-pagamentos: a lista das faturas falhou", eLista.code);
    return resp(500, { erro: "Não foi possível ler as faturas por pagar." });
  }

  const resumo = await verificarPagamentos({
    pendentes: (lista ?? []) as Pendente[],
    ler: (numero) => lerNaPonte(ponte, numero),
    registar: async (faturaId, leitura) => {
      const { data, error } = await sb.rpc("neg_erp_registar_leitura", { p_fatura: faturaId, p_erp: leitura });
      if (error) {
        console.error("erp-verificar-pagamentos: registar a leitura falhou", error.code);
        return { acao: "erro" };
      }
      return (data ?? {}) as Registo;
    },
  });
  const { pagas, ...contas } = resumo;
  console.log("erp-verificar-pagamentos", JSON.stringify({ ...contas, pagas: pagas.length }));
  return resp(200, resumo);
});
