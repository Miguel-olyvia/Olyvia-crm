/**
 * O convite de admissao: a UNICA ponte entre o browser sem sessao e as quatro
 * RPCs `rpc_hr_convite_admissao_*`, que sao `SECURITY DEFINER` e (tres delas)
 * so executaveis por `service_role` -- ver o PLANO FECHADO, seccao 3.
 *
 * QUATRO ACCOES, DOIS NIVEIS DE CONFIANCA
 * ---------------------------------------
 *  - "criar": chamada por um utilizador AUTENTICADO com
 *    `hr.pessoas.convite.enviar`. Reencaminha o `Authorization` do pedido para
 *    o cliente Supabase, para que `auth.uid()` dentro da RPC resolva a pessoa
 *    certa -- a verificacao de permissao e a que ja existe na base, nao uma
 *    reimplementacao aqui.
 *  - "estado", "rascunho" e "submeter": SEM sessao nenhuma -- e todo o sentido de um
 *    convite. Correm com `service_role`, atras de rate limit por IP (o mesmo
 *    mecanismo de `validate-contract-signature`).
 *
 * A CONTA BANCARIA
 * -----------------
 * Ate 28/11 esta funcao NAO a reencaminhava: o ecra pedia IBAN, banco e
 * titular, a conta vinha num campo `conta` a parte, e a resposta limitava-se a
 * devolver o aviso `conta_nao_gravada`. Quem preenchia a conta escrevia para o
 * vazio. Agora `iban`, `conta_titular` e `conta_banco` sao chaves do contrato
 * como as outras, entram em `dados` e a RPC grava-as -- o IBAN cifrado no
 * Vault, a linha so com os ultimos quatro caracteres. A decisao que faltava
 * (um token valido substitui a permissao do utilizador para escrever o IBAN?)
 * esta tomada: o token E a autorizacao, tal como ja era para o NISS.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const VALIDADE_DIAS = 7;

// A LISTA BRANCA DO CONVITE -- plana, com prefixo de tabela so onde o nome
// colidiria (`morada_*`). E EXACTAMENTE a lista de
// `src/lib/hr/conviteAdmissaoPayload.ts` e exactamente a que
// `rpc_hr_convite_admissao_submeter` le do jsonb: as tres estao amarradas
// por `src/lib/hr/__tests__/conviteAdmissaoContrato.test.ts`, precisamente
// porque ja divergiram uma vez e a divergencia apagava fichas inteiras em
// silencio (ver o cabecalho do modulo do contrato).
//
// Uma lista branca explicita -- NUNCA `jsonb_populate_record` nem SQL
// dinamico -- e o mesmo mecanismo que impede o convite de tocar
// `pessoas_retribuicoes` / `pessoas_vinculos` / `anew_memberships`.
const CAMPOS_CONVITE = [
  "carta_conducao_categorias",
  "carta_conducao_numero",
  "carta_conducao_validade",
  "conjuge_situacao_profissional",
  "conta_banco",
  "conta_titular",
  "data_nascimento",
  "dependentes",
  "dependentes_deficientes",
  "email_pessoal",
  "estado_civil",
  "genero",
  "habilitacao_academica",
  "habilitacao_data_conclusao",
  // O numero da conta viaja como `iban`: e a chave que a RPC le e o unico
  // formato de conta que ela sabe gravar.
  "iban",
  "morada_codigo_postal",
  "morada_distrito",
  "morada_linha1",
  "morada_linha2",
  "morada_localidade",
  "morada_pais",
  "nacionalidade",
  "naturalidade_concelho",
  "naturalidade_freguesia",
  "naturalidade_pais",
  "nif",
  "niss",
  "numero_documento",
  "sindicalizado",
  "sindicato",
  "tamanho_baixo",
  "tamanho_baixo_detalhe",
  "tamanho_blazer",
  "tamanho_blazer_detalhe",
  "tamanho_cima",
  "tamanho_cima_detalhe",
  "telefone_pessoal",
  "tipo_documento",
  "validade_documento",
] as const;

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
    if (action !== "estado" && action !== "submeter" && action !== "rascunho") {
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
      // O rascunho grava com "debounce" de 3s enquanto a pessoa escreve: um
      // tecto de 10/hora, como o da submissao, matava o preenchimento normal.
      maxAttempts: action === "estado" ? 30 : action === "rascunho" ? 240 : 10,
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
      // A RPC devolve o motivo EM JSONB (nao por excepcao) precisamente para
      // o incremento de `attempts` sobreviver -- um RAISE abortava a
      // transaccao e levava o proprio contador com ele.
      const motivo = (data as Record<string, unknown> | null)?.erro;
      if (typeof motivo === "string") {
        return responder({ error: motivo }, 401);
      }
      return responder({ ok: true, convite: data });
    }

    // -- rascunho: gravacao intermedia, melhor-esforco ------------------------
    if (action === "rascunho") {
      const rascunho = payload?.rascunho;
      if (!rascunho || typeof rascunho !== "object" || Array.isArray(rascunho)) {
        return responder({ error: "pedido_invalido" }, 400);
      }
      const { data, error } = await svc.rpc("rpc_hr_convite_admissao_rascunho", {
        p_token_hash: tokenHash,
        p_rascunho: rascunho,
      });
      if (error) {
        captureError(error);
        return responder({ error: "rascunho_nao_gravado" }, 400);
      }
      const motivo = (data as Record<string, unknown> | null)?.erro;
      if (typeof motivo === "string") {
        return responder({ error: motivo }, 401);
      }
      return responder({ ok: true });
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

    const corpo = {
      p_token_hash: tokenHash,
      // PLANO, sem reagrupar por tabela: a RPC le `p_dados ->> '<chave>'`
      // directamente. Reagrupar aqui foi exactamente o que fez todos os `->>`
      // resolverem NULL e apagarem as fichas.
      p_dados: soCampos(dados as Record<string, unknown>, CAMPOS_CONVITE),
      p_assinatura_nome: assinaturaNome.trim(),
      p_ip: ip,
      p_user_agent: req.headers.get("user-agent") ?? null,
    };

    const { error } = await svc.rpc("rpc_hr_convite_admissao_submeter", corpo);
    if (error) {
      captureError(error);
      return responder({ error: error.message ?? "convite_invalido_ou_usado" }, 400);
    }

    // `avisos` fica, vazio: a conta ja e gravada e nao ha nada a avisar. O ecra
    // continua a saber ler a lista, para um aviso futuro nao obrigar a mexer
    // nos dois lados ao mesmo tempo.
    return responder({ ok: true, avisos: [] as string[] });
  } catch (e) {
    captureError(e);
    return responder({ error: "erro_inesperado" }, 500);
  }
});
