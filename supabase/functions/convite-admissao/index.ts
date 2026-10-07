/**
 * O convite de admissao: a UNICA ponte entre o browser sem sessao e as quatro
 * RPCs `rpc_hr_convite_admissao_*`, que sao `SECURITY DEFINER` e (tres delas)
 * so executaveis por `service_role` -- ver o PLANO FECHADO, seccao 3.
 *
 * QUATRO ACCOES, DOIS NIVEIS DE CONFIANCA
 * ---------------------------------------
 *  - "criar": chamada por um utilizador AUTENTICADO com
 *    `hr.pessoas.convite.enviar`. Esta funcao valida o JWT (`getUser`), verifica
 *    a permissao NA ORGANIZACAO DA PESSOA com `has_anew_permission_in_org` (o
 *    mesmo padrao de `criar-acesso-pessoa`) e SO DEPOIS chama
 *    `rpc_hr_convite_admissao_criar` com a chave de servico, passando em
 *    `p_actor` o id de auth.users de quem chamou (a base volta a verificar a
 *    permissao com ele e deriva dai o `created_by`). A RPC deixou de ser
 *    executavel por `authenticated`: o hash do token e escolhido aqui, nunca
 *    pelo cliente, porque o novo convite herda o rascunho do anterior.
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
 * O BIC (codigo SWIFT) viaja como `conta_swift`: a RPC valida-o e grava-o
 * mesmo sem IBAN (no ecra e na configuracao chama-se `conta_bic`).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { detectClientIp } from "../_shared/clientIp.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { erroSemDados } from "../_shared/erroSemDados.ts";
import { eAccaoAnexo, listarAnexosDoConvite, tratarAccaoAnexo, type ClienteAnexos } from "./accoesAnexos.ts";
import {
  CODIGOS_RECUSA_SUBMISSAO,
  eCodigoPublico,
  mapearErroRpc,
  statusDoCodigo,
} from "./erros.ts";
import {
  LIMITE_CRIAR_POR_PESSOA,
  LIMITE_CRIAR_POR_UTILIZADOR,
  lerResultadoCriar,
  linkDoConvite,
  linkParaOCriador,
  origemPermitida,
  resolverBaseUrl,
  sanearEmailErro,
  validarPedidoCriar,
} from "./pedidoCriar.ts";

initSentry();

const VALIDADE_DIAS = 7;

/**
 * O que vai para o Sentry quando uma accao de anexos falha: so o tipo e o
 * codigo do erro. Nunca error.message: o Storage e a base podem la meter o
 * caminho do ficheiro ou o nome que a pessoa escolheu.
 */
const erroDeAnexoSemDados = (e: unknown): Error => erroSemDados("convite-admissao anexos", e);

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
  "conta_swift",
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
  "tamanho_baixo",
  "tamanho_baixo_detalhe",
  "tamanho_calcado",
  "tamanho_calcado_detalhe",
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
  const responder = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const payload = await req.json().catch(() => null);
    const action = payload?.action;

    // -- criar: autenticado, JWT validado aqui, permissao verificada aqui -----
    if (action === "criar") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return responder({ error: "sem_sessao" }, 401);

      const pedido = validarPedidoCriar(payload);
      if (!pedido) return responder({ error: "pedido_invalido" }, 400);
      const { pessoaId, email } = pedido;

      // O URL base e obrigatorio ANTES de criar seja o que for: sem ele o link
      // (que so se mostra uma vez) sairia relativo e o convite ficava perdido.
      // O endereco e o de onde o RH esta (se for um dos permitidos); o segredo
      // APP_BASE_URL so serve de reserva. Antes saia sempre o do segredo, e num
      // ambiente de testes isso dava links para localhost.
      const baseUrl = resolverBaseUrl(
        origemPermitida(req.headers.get("origin"), Deno.env.get("ALLOWED_ORIGIN")) ??
          Deno.env.get("APP_BASE_URL"),
      );
      if (!baseUrl) {
        captureError(new Error("convite-admissao: sem origem permitida e APP_BASE_URL em falta ou invalido"));
        return responder({ error: "erro_inesperado" }, 500);
      }

      const svcCriar = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: sessao, error: erroSessao } = await svcCriar.auth.getUser(
        authHeader.replace(/^Bearer\s+/i, ""),
      );
      if (erroSessao || !sessao?.user) return responder({ error: "sem_sessao" }, 401);
      const authUidChamador = sessao.user.id;

      // `pessoas.id` e chave primaria: a consulta que DESCOBRE a organizacao nao
      // tem fuga possivel entre organizacoes (mesmo raciocinio de criar-acesso-pessoa).
      const { data: pessoaOrg, error: erroPessoa } = await svcCriar
        .from("pessoas")
        .select("organization_id, deleted_at")
        .eq("id", pessoaId)
        .maybeSingle();
      if (erroPessoa) {
        captureError(erroPessoa);
        return responder({ error: "erro_inesperado" }, 500);
      }
      if (!pessoaOrg || pessoaOrg.deleted_at || !pessoaOrg.organization_id) {
        return responder({ error: "pessoa_nao_encontrada" }, statusDoCodigo("pessoa_nao_encontrada"));
      }
      const organizationId: string = pessoaOrg.organization_id;

      const { data: pode, error: erroPermissao } = await svcCriar.rpc("has_anew_permission_in_org", {
        _auth_uid: authUidChamador,
        _permission_code: "hr.pessoas.convite.enviar",
        _organization_id: organizationId,
      });
      if (erroPermissao) {
        captureError(erroPermissao);
        return responder({ error: "erro_inesperado" }, 500);
      }
      if (!pode) return responder({ error: "insufficient_privilege" }, 403);

      // Rate limit so depois da permissao: quem nao pode nao enche o contador.
      const limitesCriar = [
        { bucket: "convite-admissao-criar", identifier: authUidChamador, maxAttempts: LIMITE_CRIAR_POR_UTILIZADOR },
        { bucket: "convite-admissao-criar-pessoa", identifier: pessoaId, maxAttempts: LIMITE_CRIAR_POR_PESSOA },
      ];
      for (const l of limitesCriar) {
        const r = await checkRateLimit(svcCriar, { ...l, windowMinutes: 60 });
        if (!r.allowed) return responder({ error: "demasiadas_tentativas" }, 429);
      }
      for (const l of limitesCriar) {
        await recordRateLimitAttempt(svcCriar, l.bucket, l.identifier);
      }

      const { token, hash } = await gerarTokenEHash();
      const validUntil = new Date(Date.now() + VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString();

      // O actor e o id de auth.users (o mesmo que `has_anew_permission_in_org`
      // recebe em `_auth_uid`): a RPC ja nao tem `auth.uid()` com a chave de
      // servico, volta a verificar a permissao com ele e e ela que deriva o
      // `created_by` (anew_users.id). Nao se passa anew_users.id.
      const { data: resultadoCriar, error } = await svcCriar.rpc("rpc_hr_convite_admissao_criar", {
        p_pessoa_id: pessoaId,
        p_token_hash: hash,
        p_valid_until: validUntil,
        p_email: email,
        p_actor: authUidChamador,
      });
      if (error) {
        // Nunca `error.message` em bruto: so um codigo do catalogo. Uma recusa
        // de negocio (permissao, pessoa inexistente) e resposta legitima, nao
        // um defeito -- so o que nao se reconhece vai para o Sentry.
        const mapeado = mapearErroRpc(error);
        if (mapeado.codigo === "erro_inesperado") captureError(error);
        return responder({ error: mapeado.codigo }, statusDoCodigo(mapeado.codigo));
      }

      // RETURNS TABLE (convite_id, rascunho_herdado): um array de UMA linha.
      const { conviteId, rascunhoHerdado } = lerResultadoCriar(resultadoCriar);

      // O envio de e-mail e melhor-esforco: se falhar, quem enviou o convite
      // ainda tem o link para copiar e mandar a mao. Nunca faz a criacao
      // falhar por causa disto.
      let emailEnviado = false;
      // O motivo real (sanitizado, sem segredos -- send-email ja tira isso via
      // sanitizeSmtpError) vai na resposta para quem criou o convite (RH),
      // nunca para o candidato: sem isto, um envio falhado ficava silencioso
      // e so "email_enviado: false", sem dizer porque.
      let emailErro: string | null = null;
      try {
        // { persistSession: false, autoRefreshToken: false } e obrigatorio aqui:
        // sem isso, functions.invoke() nao garante o cabecalho Authorization com
        // a chave de servico -- send-email recebia o pedido sem autenticacao
        // nenhuma e devolvia 401 "Authentication required", em silencio (so
        // visivel depois de a resposta desta funcao passar a incluir o erro).
        // O mesmo padrao ja e usado em criar-acesso-pessoa/index.ts.
        // O SMTP a usar e o da organizacao da pessoa (resolveOrganizationSmtp
        // em _shared/smtp.ts devolve null, e falha em silencio, sem
        // organization_id): a organizacao ja foi lida acima, ao verificar a
        // permissao.
        const { error: erroEmail } = await svcCriar.functions.invoke("send-email", {
          headers: { Authorization: `Bearer ${serviceKey}` },
          body: {
            to: email,
            subject: "Convite de admissao",
            html: `<p>Foi convidado a completar a sua admissao. Use o link (valido ${VALIDADE_DIAS} dias): </p>` +
              `<p><a href="${linkDoConvite(baseUrl, token)}">Completar admissao</a></p>`,
            organization_id: organizationId,
          },
        });
        emailEnviado = !erroEmail;
        if (erroEmail) {
          captureError(erroEmail);
          try {
            const ctx = (erroEmail as { context?: Response }).context;
            const corpo = ctx ? await ctx.clone().json().catch(() => null) : null;
            emailErro = corpo?.error ?? erroEmail.message ?? String(erroEmail);
          } catch {
            emailErro = erroEmail.message ?? String(erroEmail);
          }
        }
      } catch (e) {
        captureError(e);
        emailErro = e instanceof Error ? e.message : String(e);
      }
      // Nunca o token nem o caminho do link no texto que vai para a base e para
      // o RH (quem tem `hr.pessoas.view` le `email_erro`).
      emailErro = sanearEmailErro(typeof emailErro === "string" ? emailErro : String(emailErro ?? ""), token);

      // Registo do envio para o RH (melhor-esforco: nunca faz o convite falhar).
      // Sem id de convite nao ha nada a registar: a RPC faria um UPDATE a vazio.
      if (!conviteId) {
        captureError(new Error("convite-admissao: rpc_hr_convite_admissao_criar sem id"));
      } else {
        try {
          const { data: registado, error: erroRegisto } = await svcCriar.rpc("rpc_hr_convite_admissao_registar_envio", {
            p_convite_id: conviteId,
            p_enviado: emailEnviado,
            p_erro: emailErro,
          });
          if (erroRegisto) captureError(erroRegisto);
          // A RPC devolve boolean: false = nenhum convite com esse id.
          else if (registado !== true) {
            captureError(new Error("convite-admissao: registar_envio nao encontrou o convite"));
          }
        } catch (e) {
          captureError(e);
        }
      }

      // O link so sai quando o e-mail NAO foi: e a unica vez que quem criou o
      // convite o pode ver. Nunca e gravado, nunca entra em log nem no Sentry,
      // e nao ha accao que o volte a mostrar -- reenviar e criar outro convite.
      // Sempre absoluto: o URL base foi exigido antes de criar o convite.
      // Com o rascunho HERDADO o link nunca sai, mesmo com o e-mail falhado: abri-lo
      // mostraria ao RH os dados que a pessoa ja tinha preenchido (NIF, NISS, IBAN).
      const link = linkParaOCriador({ emailEnviado, rascunhoHerdado, baseUrl, token });
      return responder({
        ok: true,
        convite_id: conviteId,
        rascunho_herdado: rascunhoHerdado,
        link_retido: !emailEnviado && link === null,
        email_enviado: emailEnviado,
        valid_until: validUntil,
        email_erro: emailErro,
        link,
      });
    }

    // -- estado / submeter / anexos: sem sessao, service_role, atras de rate limit --
    if (action !== "estado" && action !== "submeter" && action !== "rascunho" && !eAccaoAnexo(action)) {
      return responder({ error: "accao_desconhecida" }, 400);
    }

    const token = payload?.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 200) {
      return responder({ error: "convite_invalido" }, 401);
    }

    const svc = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const ip = getClientIp(req);
    const limite = await checkRateLimit(svc, {
      bucket: `convite-admissao-${action}`,
      identifier: ip,
      // O rascunho grava com "debounce" de 3s enquanto a pessoa escreve: um
      // tecto de 10/hora, como o da submissao, matava o preenchimento normal.
      maxAttempts: action === "estado" ? 30 : action === "rascunho" ? 240 : eAccaoAnexo(action) ? 30 : 10,
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

    // -- anexos: toda a logica em accoesAnexos.ts; aqui so se despacha ------------
    if (eAccaoAnexo(action)) {
      const resultado = await tratarAccaoAnexo({
        accao: action,
        svc: svc as unknown as ClienteAnexos,
        tokenHash,
        payload,
        // So um IP valido ou null (a coluna e inet): nunca o "unknown" do rate limit.
        ip: detectClientIp(req),
        supabaseUrl,
        registarErro: (e) => {
          captureError(erroDeAnexoSemDados(e));
        },
      });
      return responder(resultado.body, resultado.status);
    }

    if (action === "estado") {
      const { data, error } = await svc.rpc("rpc_hr_convite_admissao_estado", {
        p_token_hash: tokenHash,
      });
      if (error) {
        captureError(error);
        return responder({ error: "erro_inesperado" }, 500);
      }
      // A RPC devolve o motivo EM JSONB (nao por excepcao) precisamente para
      // o incremento de `attempts` sobreviver -- um RAISE abortava a
      // transaccao e levava o proprio contador com ele. So sai o motivo se
      // for um codigo do catalogo.
      const motivo = (data as Record<string, unknown> | null)?.erro;
      if (typeof motivo === "string") {
        if (eCodigoPublico(motivo)) return responder({ error: motivo }, statusDoCodigo(motivo));
        captureError(new Error("convite-admissao: motivo de estado fora do catalogo"));
        return responder({ error: "erro_inesperado" }, 500);
      }
      // Os ficheiros ja ligados ao convite, para o ecra os mostrar ao recarregar.
      // Nunca faz a abertura falhar, mas tambem nunca finge que nao ha ficheiros:
      // se a lista nao se pode ler, `anexos_indisponiveis: true` diz-o ao ecra (que
      // avisa e nao deixa enviar mais ficheiros ate a lista carregar).
      const { anexos, indisponiveis } = await listarAnexosDoConvite(
        svc as unknown as ClienteAnexos,
        tokenHash,
        (e) => {
          captureError(erroDeAnexoSemDados(e));
        },
      );
      const convite = data !== null && typeof data === "object" && !Array.isArray(data)
        ? { ...(data as Record<string, unknown>), anexos, anexos_indisponiveis: indisponiveis }
        : data;
      return responder({ ok: true, convite });
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
        // Defensivo: a RPC devolve `rascunho_demasiado_grande` em jsonb ({erro}),
        // tratado mais abaixo; so chegaria aqui por excepcao com esse texto.
        if (mapearErroRpc(error).codigo === "rascunho_demasiado_grande") {
          return responder({ error: "rascunho_demasiado_grande" }, 400);
        }
        captureError(error);
        return responder({ error: "rascunho_nao_gravado" }, 400);
      }
      const motivo = (data as Record<string, unknown> | null)?.erro;
      if (typeof motivo === "string") {
        const codigo = eCodigoPublico(motivo) ? motivo : "convite_invalido";
        return responder({ error: codigo }, statusDoCodigo(codigo));
      }
      return responder({ ok: true });
    }

    // -- submeter --------------------------------------------------------------
    // Regista a ultima recusa no convite, para o RH a ver. Melhor-esforco:
    // nunca muda a resposta ao candidato. So os codigos de recusa de submissao;
    // os `pessoa_id` em conflito vao so para a base, nunca para a resposta.
    const registarRecusa = async (codigo: string, campos: string[], conflitos: string[]) => {
      if (!(CODIGOS_RECUSA_SUBMISSAO as readonly string[]).includes(codigo)) return;
      try {
        const { error: erroRecusa } = await svc.rpc("rpc_hr_convite_admissao_registar_recusa", {
          p_token_hash: tokenHash,
          p_codigo: codigo,
          p_campos: campos,
          p_conflito_pessoa_ids: conflitos,
        });
        // O boolean devolvido nao muda nada: false = recusa ignorada (convite ja
        // usado, revogado ou inexistente), que e uma resposta legitima da base.
        if (erroRecusa) captureError(erroRecusa);
      } catch (e) {
        captureError(e);
      }
    };

    const dados = payload?.dados;
    if (!dados || typeof dados !== "object") {
      await registarRecusa("pedido_invalido", [], []);
      return responder({ error: "pedido_invalido" }, 400);
    }
    const assinaturaNome = typeof payload?.assinatura_nome === "string" ? payload.assinatura_nome : null;
    if (!assinaturaNome || assinaturaNome.trim() === "") {
      await registarRecusa("assinatura_obrigatoria", [], []);
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
      const mapeado = mapearErroRpc(error);
      // As recusas de negocio nao sao defeitos: so o que nao se reconhece.
      if (mapeado.codigo === "erro_inesperado") captureError(error);
      await registarRecusa(mapeado.codigo, mapeado.campos ?? [], mapeado.conflitos ?? []);
      return responder(
        {
          error: mapeado.codigo,
          // Os campos em falta so saem em `admissao_incompleta`; os conflitos NUNCA.
          ...(mapeado.codigo === "admissao_incompleta" ? { campos: mapeado.campos ?? [] } : {}),
        },
        statusDoCodigo(mapeado.codigo),
      );
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
