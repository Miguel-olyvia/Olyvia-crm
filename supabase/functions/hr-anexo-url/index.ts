/**
 * hr-anexo-url -- emite o URL assinado de CURTA duracao que e a UNICA forma de
 * abrir um anexo da admissao (cartao de cidadao, comprovativo de IBAN,
 * fotografia) depois de a pessoa submeter o convite.
 *
 * Segue o molde de hr-documento-ficheiro-url (le o registo por CHAVE PRIMARIA
 * e deriva a organizacao da propria linha; nunca confia numa organizacao vinda
 * do cliente: o body e so `{anexoId}`), com a regra de autorizacao por tipo em
 * `regras.ts`:
 *
 *   fotografia         hr.pessoas.view  ou a propria pessoa            (sem auditoria, 300 s)
 *   cartao_cidadao     hr.pessoas.identificacao.reveal ou a propria     (auditado, 60 s)
 *   comprovativo_iban  hr.pessoas.bancarios.edit ou a propria           (auditado, 60 s)
 *
 * A AUDITORIA TEM DE SUCEDER ANTES DO URL SAIR. Fala-se com a base como
 * service_role, em que auth.uid() e sempre NULL: usa-se o overload de 5
 * argumentos de hr_registar_acesso_sensivel, com `p_auth_uid` = quem pediu, para
 * o registo dizer QUEM abriu o ficheiro e nao so QUE foi aberto. Se a auditoria
 * falhar, nao sai URL (falhar aberto seria um acesso sensivel sem registo).
 *
 * O fluxo (e a ordem das chamadas, que e o que protege os documentos) vive em
 * `acesso.ts`, testado sem rede; este ficheiro so liga os portos ao cliente
 * real. So se abrem anexos PROMOVIDOS (submissao aceite): um ficheiro ainda
 * ligado a um convite, apagado ou na quarentena responde 404, igual a um id
 * inexistente. Respostas de erro: `{error: codigo}`, nunca texto da base nem
 * caminhos.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { erroSemDados } from "../_shared/erroSemDados.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { BUCKET_FINAL, tratarPedidoAnexoUrl, type AnexoRow, type PortosDeAcesso } from "./acesso.ts";

initSentry();

const ORIGEM = "hr-anexo-url";

serve(async (req) => {
  const corsHeaders = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const responder = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, getCorsHeaders(req));
    }

    const body = await req.json().catch(() => null);

    const portos: PortosDeAcesso = {
      lerAnexoPromovido: async (anexoId) => {
        const { data, error } = await supabase
          .from("pessoas_anexos")
          .select("id, pessoa_id, organization_id, tipo, estado, bucket, caminho, mime_type")
          .eq("id", anexoId)
          .eq("estado", "promovido")
          .maybeSingle<AnexoRow>();
        return { anexo: data ?? null, error };
      },
      temPermissao: (codigo, organizationId) =>
        supabase.rpc("has_anew_permission_in_org", {
          _auth_uid: caller.authUid,
          _permission_code: codigo,
          _organization_id: organizationId,
        }),
      pessoaDoUtilizador: (organizationId) =>
        supabase.rpc("hr_pessoa_do_utilizador", { _auth_uid: caller.authUid, _organization_id: organizationId }),
      registarAcesso: ({ pessoaId, organizationId, campo }) =>
        supabase.rpc("hr_registar_acesso_sensivel", {
          p_pessoa_id: pessoaId,
          p_organization_id: organizationId,
          p_campo: campo,
          p_accao: "revelar",
          p_auth_uid: caller.authUid,
        }),
      assinarUrl: async (caminho, ttlSegundos) => {
        const { data, error } = await supabase.storage.from(BUCKET_FINAL).createSignedUrl(caminho, ttlSegundos);
        return { signedUrl: data?.signedUrl ?? null, error };
      },
    };

    const resultado = await tratarPedidoAnexoUrl({
      isServiceRole: caller.isServiceRole,
      body,
      portos,
      registarErro: (e) => {
        captureError(erroSemDados(ORIGEM, e));
      },
    });
    return responder(resultado.body, resultado.status);
  } catch (e) {
    captureError(erroSemDados(ORIGEM, e));
    return responder({ error: "erro_inesperado" }, 500);
  }
});
