/**
 * O convite de admissao: a UNICA ponte entre o browser sem sessao e as tres
 * RPCs `rpc_hr_convite_admissao_*`, que sao `SECURITY DEFINER` e (duas delas)
 * so executaveis por `service_role` -- ver o PLANO FECHADO, seccao 3.
 *
 * TRES ACCOES, TRES NIVEIS DE CONFIANCA
 * --------------------------------------
 *  - "criar": chamada por um utilizador AUTENTICADO com
 *    `hr.pessoas.convite.enviar`. Reencaminha o `Authorization` do pedido para
 *    o cliente Supabase, para que `auth.uid()` dentro da RPC resolva a pessoa
 *    certa -- a verificacao de permissao e a que ja existe na base, nao uma
 *    reimplementacao aqui.
 *  - "estado" e "submeter": SEM sessao nenhuma -- e todo o sentido de um
 *    convite. Correm com `service_role`, atras de rate limit por IP (o mesmo
 *    mecanismo de `validate-contract-signature`).
 *
 * O QUE ESTA FUNCAO DELIBERADAMENTE NAO FAZ
 * -------------------------------------------
 * NAO escreve a conta bancaria. O relatorio da camada de base marcou essa
 * escrita como "por decidir" -- a RPC normal (`rpc_hr_definir_conta`) exige
 * `has_anew_permission_in_org(auth.uid(), ...)`, que nao resolve nada sob
 * `service_role` sem sessao. Construir aqui um caminho novo para o Vault
 * antes de essa decisao estar tomada seria decidir por quem tem de decidir.
 * O campo fica capturado no formulario (para nao obrigar a pessoa a outro
 * ecra mais tarde) mas o pedido de submissao devolve, em `avisos`, que ficou
 * por gravar -- nunca falha a submissao inteira por causa disso.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const VALIDADE_DIAS = 7;

// Colunas de `pessoas_dados_pessoais`, `pessoas_identificacao`, `pessoas_moradas`,
// `pessoas_fardamento` e `pessoas_sindicalizacao` que o convite pode escrever.
// Uma lista branca explicita -- NUNCA `jsonb_populate_record` nem SQL
// dinamico -- e o mesmo mecanismo que impede o convite de tocar
// `pessoas_retribuicoes` / `pessoas_vinculos` / `anew_memberships`.
const CAMPOS_DADOS_PESSOAIS = [
  "data_nascimento",
  "genero",
  "nacionalidade",
  "telefone_pessoal",
  "estado_civil",
  "dependentes",
  "naturalidade_freguesia",
  "naturalidade_concelho",
  "naturalidade_pais",
  "conjuge_situacao_profissional",
  "dependentes_deficientes",
  "habilitacao_academica",
  "habilitacao_data_conclusao",
] as const;
const CAMPOS_IDENTIFICACAO = [
  "tipo_documento",
  "numero_documento",
  "validade_documento",
  "nif",
  "carta_conducao_numero",
  "carta_conducao_categorias",
  "carta_conducao_validade",
] as const;
const CAMPOS_MORADA = ["linha1", "linha2", "codigo_postal", "localidade", "distrito", "pais"] as const;
const CAMPOS_FARDAMENTO = [
  "tamanho_cima",
  "tamanho_cima_detalhe",
  "tamanho_baixo",
  "tamanho_baixo_detalhe",
  "tamanho_blazer",
  "tamanho_blazer_detalhe",
] as const;
const CAMPOS_SINDICALIZACAO = ["sindicalizado", "sindicato", "quota_percentagem"] as const;

function soCampos<T extends readonly string[]>(origem: Record<string, unknown>, campos: T) {
  const resultado: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo in origem) resultado[campo] = origem[campo];
  }
  return resultado;
}

async function gerarTokenEHash(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { token, hash };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = { ...getCorsHeaders(req), "Access-Control-Allow-Origin": "*" };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const responder = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const payload = await req.json().catch(() => null);
    const action = payload?.action;

    // -- criar: autenticado, forward do JWT do chamador -----------------------
    if (action === "criar") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return responder({ error: "sem_sessao" }, 401);

      const pessoaId = payload?.pessoa_id;
      const email = payload?.email;
      if (typeof pessoaId !== "string" || typeof email !== "string" || !email.includes("@")) {
        return responder({ error: "pedido_invalido" }, 400);
      }

      const supabaseComoUtilizador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { token, hash } = await gerarTokenEHash();
      const validUntil = new Date(Date.now() + VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabaseComoUtilizador.rpc("rpc_hr_convite_admissao_criar", {
        p_pessoa_id: pessoaId,
        p_token_hash: hash,
        p_valid_until: validUntil,
        p_email: email,
      });
      if (error) {
        // Uma recusa por permissao e resposta legitima, nao um defeito.
        if (error.code !== "42501" && error.code !== "PGRST301") captureError(error);
        return responder({ error: error.message ?? "erro_desconhecido" }, 400);
      }

      // O envio de e-mail e melhor-esforco: se falhar, quem enviou o convite
      // ainda tem o link para copiar e mandar a mao. Nunca faz a criacao
      // falhar por causa disto.
      let emailEnviado = false;
      try {
        const svc = createClient(supabaseUrl, serviceKey);
        const { error: erroEmail } = await svc.functions.invoke("send-email", {
          body: {
            to: email,
            subject: "Convite de admissao",
            html: `<p>Foi convidado a completar a sua admissao. Use o link (valido ${VALIDADE_DIAS} dias): </p>` +
              `<p><a href="${Deno.env.get("APP_BASE_URL") ?? ""}/admissao/${token}">Completar admissao</a></p>`,
          },
        });
        emailEnviado = !erroEmail;
      } catch (e) {
        captureError(e);
      }

      return responder({ ok: true, email_enviado: emailEnviado, valid_until: validUntil });
    }

    // -- estado / submeter: sem sessao, service_role, atras de rate limit ----
    if (action !== "estado" && action !== "submeter") {
      return responder({ error: "accao_desconhecida" }, 400);
    }

    const token = payload?.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 200) {
      return responder({ error: "token_invalido" }, 400);
    }

    const svc = createClient(supabaseUrl, serviceKey);
    const ip = getClientIp(req);
    const limite = await checkRateLimit(svc, {
      bucket: `convite-admissao-${action}`,
      identifier: ip,
      maxAttempts: action === "estado" ? 30 : 10,
      windowMinutes: 60,
    });
    if (!limite.allowed) {
      return responder({ error: "demasiadas_tentativas" }, 429);
    }
    await recordRateLimitAttempt(svc, `convite-admissao-${action}`, ip);

    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (action === "estado") {
      const { data, error } = await svc.rpc("rpc_hr_convite_admissao_estado", {
        p_token_hash: tokenHash,
      });
      if (error) {
        captureError(error);
        return responder({ error: "convite_invalido" }, 401);
      }
      return responder({ ok: true, convite: data });
    }

    // -- submeter --------------------------------------------------------------
    const dados = payload?.dados;
    if (!dados || typeof dados !== "object") {
      return responder({ error: "pedido_invalido" }, 400);
    }
    const assinaturaNome = typeof payload?.assinatura_nome === "string" ? payload.assinatura_nome : null;
    if (!assinaturaNome || assinaturaNome.trim() === "") {
      return responder({ error: "assinatura_obrigatoria" }, 400);
    }

    const avisos: string[] = [];
    if ((dados as Record<string, unknown>).conta) {
      avisos.push("conta_nao_gravada");
    }

    const corpo = {
      p_token_hash: tokenHash,
      p_dados: {
        pessoas_dados_pessoais: soCampos(dados, CAMPOS_DADOS_PESSOAIS),
        pessoas_identificacao: soCampos(dados, CAMPOS_IDENTIFICACAO),
        pessoas_moradas: soCampos(dados, CAMPOS_MORADA),
        pessoas_fardamento: soCampos(dados, CAMPOS_FARDAMENTO),
        pessoas_sindicalizacao: soCampos(dados, CAMPOS_SINDICALIZACAO),
        email_pessoal: typeof (dados as Record<string, unknown>).email_pessoal === "string"
          ? (dados as Record<string, unknown>).email_pessoal
          : null,
      },
      p_assinatura_nome: assinaturaNome.trim(),
      p_ip: ip,
      p_user_agent: req.headers.get("user-agent") ?? null,
    };

    const { error } = await svc.rpc("rpc_hr_convite_admissao_submeter", corpo);
    if (error) {
      captureError(error);
      return responder({ error: error.message ?? "convite_invalido_ou_usado" }, 400);
    }

    return responder({ ok: true, avisos });
  } catch (e) {
    captureError(e);
    return responder({ error: "erro_inesperado" }, 500);
  }
});
