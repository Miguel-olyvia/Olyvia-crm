/**
 * Criar (ou renovar) o acesso a aplicacao de uma pessoa de RH, e mandar-lhe as
 * credenciais por e-mail -- tudo num gesto so.
 *
 * O FLUXO, TAL COMO FOI DECIDIDO
 * ------------------------------
 * Os RH abrem a ficha, carregam em "Criar acesso" e escolhem o papel. Esse e o
 * UNICO gesto humano. A partir dai esta funcao faz o resto sozinha:
 *
 *   1. confirma que quem clicou tem `hr.pessoas.conta.criar` NA ORGANIZACAO DA
 *      FICHA -- reencaminhando o JWT do chamador, como o ramo "criar" de
 *      `convite-admissao` faz;
 *   2. cria a conta de autenticacao com uma password gerada aqui;
 *   3. cria o perfil e a associacao a organizacao com o papel escolhido
 *      (`rpc_finalize_user_profile_full`, a mesma RPC de `create-user`);
 *   4. liga a conta a ficha (`rpc_hr_ligar_conta_por_servico`);
 *   5. ENVIA AS CREDENCIAIS por e-mail, sem segundo botao e sem ninguem
 *      redigir o e-mail.
 *
 * O destinatario e SEMPRE o `email_pessoal` da ficha -- que e campo obrigatorio
 * da admissao, por isso nunca falta a quem esta em condicoes de receber acesso.
 * Nunca o `email_trabalho`: mandar as credenciais para a caixa da empresa a
 * quem ainda nao entrou na empresa nao chega a lado nenhum.
 *
 * A PASSWORD NUNCA SAI NA RESPOSTA
 * --------------------------------
 * Nem na resposta, nem em log nenhum. O ecra nunca a mostra e quem a cria nunca
 * a ve -- so a propria pessoa, na sua caixa de correio. E a mesma regra de
 * `create-client-portal-access`. "Reenviar" gera uma password NOVA (a anterior
 * deixa de funcionar) e volta a enviar; nao ha forma de recuperar a antiga,
 * porque ela nunca foi guardada em lado nenhum.
 *
 * SERVICE ROLE PASSA POR CIMA DA RLS
 * ----------------------------------
 * Toda a consulta a tabela com `organization_id` filtra explicitamente por essa
 * organizacao, atraves de `_shared/orgScopedQuery.ts` -- que rebenta em vez de
 * devolver linhas de outra organizacao quando o id vem vazio. As tres unicas
 * excepcoes estao assinaladas uma a uma, com o motivo.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { orgScoped, type OrgScopedQueryBuilder } from "../_shared/orgScopedQuery.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

/** Sem ambiguidades visuais (0/O, 1/l/I) -- estas credenciais sao lidas e escritas a mao. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const COMPRIMENTO_PASSWORD = 16;

/** Papeis que esta funcao NUNCA atribui, mesmo que o pedido os peca. */
const PAPEIS_PROIBIDOS = ["super_admin", "system_admin"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function gerarPassword(): string {
  const bytes = new Uint8Array(COMPRIMENTO_PASSWORD);
  crypto.getRandomValues(bytes);
  let saida = "";
  for (const b of bytes) saida += ALFABETO[b % ALFABETO.length];
  return saida;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function corpoDoEmail(nome: string, email: string, password: string, baseUrl: string) {
  const link = baseUrl ? `${baseUrl}/login` : "";
  const html =
    `<p>Ola ${escaparHtml(nome)},</p>` +
    `<p>Foi-lhe criado acesso a Olyvia. Os seus dados de entrada:</p>` +
    `<p><strong>Utilizador:</strong> ${escaparHtml(email)}<br>` +
    `<strong>Password:</strong> ${escaparHtml(password)}</p>` +
    (link ? `<p><a href="${escaparHtml(link)}">Entrar na Olyvia</a></p>` : "") +
    `<p>Altere a password depois da primeira entrada. Esta mensagem e a unica ` +
    `copia da password: ninguem na sua organizacao a consegue ver.</p>`;
  const text =
    `Ola ${nome},\n\nFoi-lhe criado acesso a Olyvia.\n\n` +
    `Utilizador: ${email}\nPassword: ${password}\n\n` +
    (link ? `Entrar: ${link}\n\n` : "") +
    `Altere a password depois da primeira entrada. Esta mensagem e a unica copia da password.`;
  return { html, text };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const responder = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return responder({ error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const baseUrl = Deno.env.get("APP_BASE_URL") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return responder({ error: "sem_sessao" }, 401);

    const svc = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    /**
     * `orgScoped()` espera um cliente cujo `from()` ja devolva algo com `.eq()`.
     * O builder do supabase-js so ganha `.eq()` DEPOIS de `.select()`, por isso
     * a adaptacao e aqui: continua a ser `orgScoped` a impor o filtro (e a
     * rebentar quando o `organization_id` vem vazio), so que sobre um builder
     * que ja escolheu colunas.
     */
    const selectDaOrg = (tabela: string, colunas: string, org: string | null | undefined) =>
      orgScoped(
        {
          from: (t: string) =>
            svc.from(t).select(colunas) as unknown as OrgScopedQueryBuilder,
        },
        tabela,
        org,
        // deno-lint-ignore no-explicit-any
      ) as any;

    const { data: sessao, error: erroSessao } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (erroSessao || !sessao?.user) return responder({ error: "sem_sessao" }, 401);
    const authUidChamador = sessao.user.id;

    const payload = await req.json().catch(() => null);
    const pessoaId = payload?.pessoa_id;
    const roleId = payload?.role_id ?? null;
    const forcarNovaPassword = Boolean(payload?.forcar_nova_password);

    if (typeof pessoaId !== "string" || !UUID.test(pessoaId)) {
      return responder({ error: "pedido_invalido" }, 400);
    }
    if (roleId !== null && (typeof roleId !== "string" || !UUID.test(roleId))) {
      return responder({ error: "pedido_invalido" }, 400);
    }

    // EXCEPCAO 1 ao orgScoped, deliberada: e esta consulta que DESCOBRE a
    // organizacao. `pessoas.id` e chave primaria (uuid, globalmente unica), por
    // isso nao ha aqui fuga possivel entre organizacoes -- e a partir da linha
    // seguinte tudo passa a ser filtrado pelo `organization_id` que ela devolve.
    const { data: pessoa, error: erroPessoa } = await svc
      .from("pessoas")
      .select("id, organization_id, primeiro_nome, apelido, email_pessoal, deleted_at")
      .eq("id", pessoaId)
      .maybeSingle();

    if (erroPessoa) {
      captureError(erroPessoa);
      return responder({ error: "erro_inesperado" }, 500);
    }
    if (!pessoa || pessoa.deleted_at) return responder({ error: "pessoa_nao_encontrada" }, 404);

    const org: string = pessoa.organization_id;

    // -- A permissao de quem clicou, na organizacao DA FICHA ------------------
    // Nunca `has_anew_permission` (global): dados de RH sao de trabalhadores de
    // organizacoes distintas. Ver o comentario de has_anew_permission_in_org.
    const { data: pode, error: erroPermissao } = await svc.rpc("has_anew_permission_in_org", {
      _auth_uid: authUidChamador,
      _permission_code: "hr.pessoas.conta.criar",
      _organization_id: org,
    });
    if (erroPermissao) {
      captureError(erroPermissao);
      return responder({ error: "erro_inesperado" }, 500);
    }
    if (!pode) return responder({ error: "insufficient_privilege" }, 403);

    const email = (pessoa.email_pessoal ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return responder({ error: "sem_email_pessoal" }, 400);
    }
    const nome = [pessoa.primeiro_nome, pessoa.apelido].filter(Boolean).join(" ").trim() || email;

    // EXCEPCAO 2 ao orgScoped: `anew_users` NAO tem `organization_id` -- a
    // organizacao resolve-se por `anew_memberships` (ver create-user). Filtra
    // pelo auth uid, que e unico.
    const { data: actor } = await svc
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", authUidChamador)
      .maybeSingle();
    const actorId: string | null = actor?.id ?? null;

    // -- A ficha ja tem conta activa? -----------------------------------------
    const { data: contaActiva, error: erroConta } = await selectDaOrg(
      "pessoas_contas",
      "id, anew_user_id",
      org,
    )
      .eq("pessoa_id", pessoaId)
      .eq("estado", "activa")
      .maybeSingle();

    if (erroConta) {
      captureError(erroConta);
      return responder({ error: "erro_inesperado" }, 500);
    }

    const password = gerarPassword();

    // ========================================================================
    // REENVIAR: a conta ja existe. Password nova, e-mail novo, mais nada.
    // ========================================================================
    if (contaActiva) {
      if (!forcarNovaPassword) {
        return responder({ error: "pessoa_ja_tem_conta_activa" }, 409);
      }

      // EXCEPCAO 2 (de novo): anew_users nao tem organization_id. O id vem da
      // linha de `pessoas_contas` que JA foi lida com filtro de organizacao,
      // por isso a conta e comprovadamente desta organizacao.
      const { data: conta } = await svc
        .from("anew_users")
        .select("auth_user_id")
        .eq("id", contaActiva.anew_user_id)
        .maybeSingle();

      if (!conta?.auth_user_id) {
        return responder({ error: "conta_sem_utilizador_de_autenticacao" }, 409);
      }

      const { error: erroPassword } = await svc.auth.admin.updateUserById(conta.auth_user_id, {
        password,
      });
      if (erroPassword) {
        captureError(erroPassword);
        return responder({ error: "password_nao_alterada" }, 400);
      }

      const enviado = await enviarCredenciais(svc, { email, nome, password, baseUrl, org });
      return responder({
        ok: true,
        email_enviado: enviado,
        aviso: enviado ? null : "conta_criada_sem_email",
      });
    }

    // ========================================================================
    // CRIAR: conta nova, papel escolhido, ligacao a ficha, e-mail.
    // ========================================================================
    if (!roleId) return responder({ error: "papel_obrigatorio" }, 400);

    // EXCEPCAO 3 ao orgScoped: `anew_roles.organization_id` e NULO nos papeis
    // globais (super_admin, e os papeis de sistema). Um `.eq()` cego nunca os
    // apanharia; o filtro certo e "desta organizacao OU global", e esta escrito
    // por extenso.
    const { data: papel, error: erroPapel } = await svc
      .from("anew_roles")
      .select("id, code, organization_id")
      .eq("id", roleId)
      .maybeSingle();

    if (erroPapel) {
      captureError(erroPapel);
      return responder({ error: "erro_inesperado" }, 500);
    }
    if (!papel || (papel.organization_id !== null && papel.organization_id !== org)) {
      return responder({ error: "papel_fora_da_organizacao" }, 400);
    }
    // Esta funcao da acesso a quem ainda nao o tinha. Nunca o faz no topo da
    // escada: um papel de administracao da plataforma atribui-se no ecra de
    // Papeis, por quem responde pela plataforma.
    if (papel.code && PAPEIS_PROIBIDOS.includes(papel.code)) {
      return responder({ error: "papel_nao_permitido" }, 403);
    }

    // A conta de autenticacao. `admin_created` diz ao trigger handle_new_user()
    // para nao pre-criar o perfil -- ver o comentario longo em create-user.
    let authUserId: string;
    const { data: criada, error: erroCriar } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: nome, admin_created: true },
    });

    if (erroCriar) {
      const jaExiste = erroCriar.message?.includes("already been registered") ||
        erroCriar.message?.includes("already exists");
      if (!jaExiste) {
        captureError(erroCriar);
        return responder({ error: erroCriar.message ?? "conta_nao_criada" }, 400);
      }
      // Ja ha conta com este e-mail (a pessoa ja trabalhou aqui, ou tem conta
      // noutra organizacao). Reaproveita-se: a alternativa e deixar a ficha sem
      // acesso possivel para sempre.
      const existente = await procurarAuthUserPorEmail(svc, email);
      if (!existente) return responder({ error: "conta_existente_nao_encontrada" }, 400);
      authUserId = existente.id;
      const { error: erroPassword } = await svc.auth.admin.updateUserById(authUserId, { password });
      if (erroPassword) {
        captureError(erroPassword);
        return responder({ error: "password_nao_alterada" }, 400);
      }
    } else {
      authUserId = criada.user!.id;
    }

    // Contexto de auditoria, como em create-user: uma accao de utilizador, uma
    // linha de auditoria.
    if (actorId) {
      const { error: erroCtx } = await svc.rpc("set_audit_context", {
        p_user_id: actorId,
        p_source: "web_app",
      });
      if (erroCtx) captureError(erroCtx);
    }

    const { data: perfil, error: erroPerfil } = await svc
      .rpc("rpc_finalize_user_profile_full", {
        p_auth_user_id: authUserId,
        p_actor_id: actorId,
        p_name: nome,
        p_email: email,
        p_phone: null,
        p_status: "active",
        p_description: null,
        p_position: null,
        p_location: null,
        p_template_id: null,
        p_custom_attributes: null,
        p_memberships: [{ organization_id: org, role_id: roleId }],
        p_fiscal: null,
        p_addresses: [],
        p_additional_emails: [],
        p_additional_phones: [],
      })
      .single();

    // A limpeza do contexto nunca mascara o resultado (SET LOCAL cai sozinho no
    // fim da transaccao, de qualquer forma).
    const { error: erroLimpar } = await svc.rpc("clear_audit_context");
    if (erroLimpar) captureError(erroLimpar);

    if (erroPerfil || !perfil) {
      captureError(erroPerfil ?? new Error("rpc_finalize_user_profile_full sem resposta"));
      return responder({ error: erroPerfil?.message ?? "perfil_nao_criado" }, 400);
    }

    // deno-lint-ignore no-explicit-any
    const anewUserId: string = (perfil as any).id;

    // A ligacao a ficha. RPC so de service_role, com as mesmas guardas curadas
    // de rpc_hr_ligar_conta menos a de permissao -- que ja foi feita acima, com
    // o JWT de quem clicou.
    const { error: erroLigar } = await svc.rpc("rpc_hr_ligar_conta_por_servico", {
      p_pessoa_id: pessoaId,
      p_anew_user_id: anewUserId,
      p_actor_id: actorId,
    });
    if (erroLigar) {
      captureError(erroLigar);
      // A conta existe e tem papel, mas a ficha nao ficou ligada. Dizer isto e
      // melhor do que dizer "correu bem": quem le a ficha continuaria a ver
      // "sem acesso" e a carregar no botao outra vez.
      return responder({ error: erroLigar.message ?? "conta_nao_ligada_a_ficha" }, 400);
    }

    const enviado = await enviarCredenciais(svc, { email, nome, password, baseUrl, org });
    return responder({
      ok: true,
      email_enviado: enviado,
      aviso: enviado ? null : "conta_criada_sem_email",
    });
  } catch (e) {
    captureError(e);
    return responder({ error: "erro_inesperado" }, 500);
  }
});

/**
 * O envio e MELHOR-ESFORCO, como no convite de admissao: a conta ja existe e
 * ja tem papel, e falhar o e-mail nao desfaz nada. Quem enviou fica com o aviso
 * e o botao "Reenviar credenciais" a mao -- que gera password nova e tenta de
 * novo. A password NUNCA e devolvida ao ecra para compensar a falha.
 */
async function enviarCredenciais(
  // deno-lint-ignore no-explicit-any
  svc: any,
  args: { email: string; nome: string; password: string; baseUrl: string; org: string },
): Promise<boolean> {
  try {
    const { html, text } = corpoDoEmail(args.nome, args.email, args.password, args.baseUrl);
    const { error } = await svc.functions.invoke("send-email", {
      body: {
        to: args.email,
        organization_id: args.org,
        subject: "Os seus dados de acesso a Olyvia",
        html,
        text,
      },
    });
    if (error) captureError(error);
    return !error;
  } catch (e) {
    captureError(e);
    return false;
  }
}

/** `listUsers` pagina; o e-mail pode estar em qualquer pagina. */
// deno-lint-ignore no-explicit-any
async function procurarAuthUserPorEmail(svc: any, email: string): Promise<any | null> {
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    // deno-lint-ignore no-explicit-any
    const encontrado = users.find((u: any) => u.email?.toLowerCase() === email);
    if (encontrado) return encontrado;
    if (users.length < perPage) return null;
  }
  return null;
}
