/**
 * hr-documento-ficheiro-url -- emite o URL assinado de CURTA duracao que e a
 * UNICA forma de ler o ficheiro anexado a um documento de RH.
 *
 * PORQUE ISTO TINHA DE EXISTIR
 * -----------------------------
 * A migracao 20261130055000 fechou hr-documentos a SELECT directo com uma
 * RESTRICTIVE explicita, com o comentario "a leitura e SO por URL assinado
 * emitido por codigo que verifica a permissao" -- mas esse codigo nunca foi
 * escrito. Sem ele, `rpc_hr_documento_anexar_ficheiro` grava
 * `ficheiro_caminho`, mas ninguem consegue abrir o ficheiro: nem RPC (SQL nao
 * fala com o Storage) nem o cliente (bloqueado pela RESTRICTIVE), so
 * service_role -- e so um servidor pode segurar essa chave.
 *
 * PORQUE EDGE FUNCTION, E NAO RPC
 * ---------------------------------
 * `createSignedUrl` e uma chamada a API do Storage, nao SQL -- so
 * supabase-js (aqui, com a service role key) a alcanca. Uma RPC nao a
 * consegue emitir. E gerar o URL com a service role e exactamente o que a
 * migracao ja previa: "URLs assinados sao gerados por service_role, que
 * ignora RLS".
 *
 * A REGRA DE AUTORIZACAO E A MESMA DE rpc_hr_documento_ver_conteudo
 * --------------------------------------------------------------------
 * O ficheiro e so mais uma forma do "conteudo" do documento (o scan do que
 * corpo_html descreve em HTML) -- por isso usa a MESMA regra dessa RPC, nao
 * uma nova: hr.pessoas.documentos.conteudo.view NAQUELA organizacao, OU
 * hr.pessoas.documentos.view.own + ser a propria pessoa (resolvida por
 * hr_pessoa_do_utilizador, nunca por um pessoa_id que o cliente envie).
 *
 * A AUDITORIA E OBRIGATORIA, E TEM DE SUCEDER ANTES DO URL SAIR
 * -----------------------------------------------------------------
 * `hr_registar_acesso_sensivel(pessoa_id, organization_id, 'documento',
 * 'revelar', p_auth_uid)` -- os mesmos valores de campo/accao que
 * `rpc_hr_documento_ver_conteudo` ja usa para o corpo HTML, mas pelo
 * OVERLOAD de 5 args (20261130200000). Esta funcao fala com a base pelo
 * cliente service_role -- dentro dessa sessao `auth.uid()` e sempre NULL, e
 * o overload de 4 args resolveria o actor a partir dele, gravando SEMPRE
 * origem=service_role/auth_user_id=NULL: o registo diria QUE documento foi
 * revelado mas nunca QUEM o revelou. p_auth_uid passa explicitamente
 * `caller.authUid` (a identidade real, ja verificada acima) -- so
 * service_role pode preenche-lo, e e exactamente isso que este cliente e.
 * Chamavel por service_role (GRANT em 20261130200000). Se a escrita da
 * auditoria falhar, a funcao NUNCA gera o URL -- falhar aberto aqui
 * significa um acesso sensivel sem registo, o oposto do que esta tabela
 * existe para garantir.
 *
 * VALIDADE CURTA, DE PROPOSITO
 * ------------------------------
 * 60 segundos: tempo suficiente para o browser abrir o separador, curto
 * demais para ser reenviado ou guardado como um link permanente. Cada
 * abertura pede um URL novo (e regista um acesso novo) -- nunca se cacheia um
 * URL assinado no cliente.
 *
 * O QUE VOLTA NA RESPOSTA
 * -------------------------
 * Alem do `url`, devolve `hash` (ficheiro_hash_sha256) e `anexadoEm` -- para o
 * ecra poder mostrar que o ficheiro TEM resumo guardado, sem ter de pedir o
 * documento outra vez. E o que torna verificavel a promessa de
 * `rpc_hr_documento_anexar_ficheiro` de nunca sobrescrever em silencio: o
 * hash muda se, e so se, o ficheiro por tras do caminho mudou.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

/** Curta de proposito -- ver o comentario "VALIDADE CURTA" acima. */
const SIGNED_URL_TTL_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestBody {
  documentoId: string;
}

function isValidRequestBody(body: unknown): body is RequestBody {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  return typeof candidate.documentoId === "string" && UUID_RE.test(candidate.documentoId);
}

interface PessoaDocumentoRow {
  id: string;
  pessoa_id: string;
  organization_id: string;
  ficheiro_caminho: string | null;
  ficheiro_hash_sha256: string | null;
  ficheiro_anexado_em: string | null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    // Tal como validate-upload para o mesmo bucket: tem de haver sempre um
    // utilizador real por tras de um acesso a um documento de RH. Sem
    // auth.uid() nao ha ninguem para resolver "e a propria pessoa" nem para
    // atribuir o acesso registado em pessoas_acessos_sensiveis a alguem.
    if (caller.isServiceRole) {
      return new Response(
        JSON.stringify({ error: "hr-documento-ficheiro-url exige um utilizador real, não service_role/cron." }),
        { status: 403, headers: corsHeaders },
      );
    }

    const body = await req.json().catch(() => null);
    if (!isValidRequestBody(body)) {
      return new Response(
        JSON.stringify({ error: "documentoId é obrigatório e tem de ser um uuid." }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: doc, error: erroDocumento } = await supabase
      .from("pessoas_documentos")
      .select("id, pessoa_id, organization_id, ficheiro_caminho, ficheiro_hash_sha256, ficheiro_anexado_em")
      .eq("id", body.documentoId)
      .is("deleted_at", null)
      .maybeSingle<PessoaDocumentoRow>();

    if (erroDocumento) {
      console.error("hr-documento-ficheiro-url: falha ao carregar o documento:", erroDocumento);
      return new Response(
        JSON.stringify({ error: "Não foi possível carregar o documento." }),
        { status: 500, headers: corsHeaders },
      );
    }

    // Documento inexistente e documento sem permissao dao a MESMA resposta
    // (404) mais abaixo, depois da verificacao de permissao -- aqui so se
    // distingue "nao existe de todo", que nenhuma permissao resolve.
    if (!doc) {
      return new Response(
        JSON.stringify({ error: "Documento não encontrado." }),
        { status: 404, headers: corsHeaders },
      );
    }

    if (!doc.ficheiro_caminho) {
      return new Response(
        JSON.stringify({ error: "Este documento ainda não tem ficheiro anexado." }),
        { status: 404, headers: corsHeaders },
      );
    }

    // Mesma regra de autorizacao de rpc_hr_documento_ver_conteudo (20261123030000):
    // hr.pessoas.documentos.conteudo.view NAQUELA organizacao, OU
    // hr.pessoas.documentos.view.own + ser a propria pessoa.
    const { data: temConteudoView, error: erroConteudoView } = await supabase.rpc(
      "has_anew_permission_in_org",
      {
        _auth_uid: caller.authUid,
        _permission_code: "hr.pessoas.documentos.conteudo.view",
        _organization_id: doc.organization_id,
      },
    );
    if (erroConteudoView) {
      console.error("hr-documento-ficheiro-url: has_anew_permission_in_org (conteudo.view) falhou:", erroConteudoView);
      return new Response(
        JSON.stringify({ error: "Não foi possível confirmar a permissão." }),
        { status: 500, headers: corsHeaders },
      );
    }

    let autorizado = temConteudoView === true;

    if (!autorizado) {
      const { data: temViewOwn, error: erroViewOwn } = await supabase.rpc("has_anew_permission_in_org", {
        _auth_uid: caller.authUid,
        _permission_code: "hr.pessoas.documentos.view.own",
        _organization_id: doc.organization_id,
      });
      if (erroViewOwn) {
        console.error("hr-documento-ficheiro-url: has_anew_permission_in_org (view.own) falhou:", erroViewOwn);
        return new Response(
          JSON.stringify({ error: "Não foi possível confirmar a permissão." }),
          { status: 500, headers: corsHeaders },
        );
      }

      if (temViewOwn === true) {
        const { data: pessoaDoUtilizador, error: erroPessoaDoUtilizador } = await supabase.rpc(
          "hr_pessoa_do_utilizador",
          { _auth_uid: caller.authUid, _organization_id: doc.organization_id },
        );
        if (erroPessoaDoUtilizador) {
          console.error(
            "hr-documento-ficheiro-url: hr_pessoa_do_utilizador falhou:",
            erroPessoaDoUtilizador,
          );
          return new Response(
            JSON.stringify({ error: "Não foi possível confirmar a permissão." }),
            { status: 500, headers: corsHeaders },
          );
        }
        autorizado = pessoaDoUtilizador === doc.pessoa_id;
      }
    }

    if (!autorizado) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para ver o ficheiro deste documento." }),
        { status: 403, headers: corsHeaders },
      );
    }

    // A auditoria tem de suceder ANTES do URL sair -- se falhar, a funcao
    // para aqui. Um acesso sensivel sem registo e o oposto do que esta
    // tabela existe para garantir (ver o cabecalho deste ficheiro).
    const { error: erroAuditoria } = await supabase.rpc("hr_registar_acesso_sensivel", {
      p_pessoa_id: doc.pessoa_id,
      p_organization_id: doc.organization_id,
      p_campo: "documento",
      p_accao: "revelar",
      // Overload de 5 args (20261130200000): sem isto, auth.uid() dentro da
      // funcao seria sempre NULL nesta sessao service_role, e o registo de
      // auditoria nunca identificaria quem revelou o ficheiro.
      p_auth_uid: caller.authUid,
    });
    if (erroAuditoria) {
      console.error("hr-documento-ficheiro-url: hr_registar_acesso_sensivel falhou:", erroAuditoria);
      return new Response(
        JSON.stringify({ error: "Não foi possível registar o acesso." }),
        { status: 500, headers: corsHeaders },
      );
    }

    const { data: signed, error: erroSigned } = await supabase.storage
      .from("hr-documentos")
      .createSignedUrl(doc.ficheiro_caminho, SIGNED_URL_TTL_SECONDS);

    if (erroSigned || !signed?.signedUrl) {
      console.error("hr-documento-ficheiro-url: createSignedUrl falhou:", erroSigned);
      return new Response(
        JSON.stringify({ error: "Não foi possível gerar o link do ficheiro." }),
        { status: 500, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        url: signed.signedUrl,
        hash: doc.ficheiro_hash_sha256,
        anexadoEm: doc.ficheiro_anexado_em,
        expiraEmSegundos: SIGNED_URL_TTL_SECONDS,
      }),
      { headers: corsHeaders },
    );
  } catch (error: unknown) {
    console.error("hr-documento-ficheiro-url error:", error);
    await captureError(error, { function: "hr-documento-ficheiro-url" });
    const message = error instanceof Error ? error.message : "Falha ao emitir o link do ficheiro";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: corsHeaders },
    );
  }
});
