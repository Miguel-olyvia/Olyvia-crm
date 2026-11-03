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
 * Na CRIACAO o e-mail de acesso e o da EMPRESA: e o endereco de entrada na
 * plataforma (login) e para la vao as credenciais. Vem do campo opcional
 * `email` do pedido (o que o RH confirmou no dialogo); se faltar, usa-se o
 * `pessoas.email_trabalho` e, por ultimo, o `pessoas.email_pessoal` (fallback
 * so para nao partir fichas antigas). Sem nenhum dos tres: `sem_email_acesso`.
 * Depois de a conta criada, se o e-mail escolhido difere do `email_trabalho`
 * grava-se la -- so se quem clicou tem `hr.pessoas.laborais.edit` (senao segue
 * sem gravar). No REENVIO e o e-mail da CONTA de autenticacao (nunca editavel
 * nem o `email_pessoal`, que se edita com outra permissao). Se a conta de
 * autenticacao ja existia: se NAO tem ficha em `anew_users` E e uma conta orfa
 * de admissao (admin_created, nunca usada, com menos de 14 dias, so por e-mail)
 * repoe-se-lhe a password gerada e as credenciais seguem como numa conta nova;
 * se NAO tem ficha mas nao passa essas guardas, 409
 * `conta_existente_nao_reutilizavel` e nada se toca; se TEM ficha
 * (e de alguem, talvez de outra organizacao) a password nao se repoe nem se envia.
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
import { resolveOrganizationSmtp, sendEmailViaSMTP } from "../_shared/smtp.ts";
import { criarEnviadorCorreio } from "../convite-admissao/correio.ts";
import { corpoDoEmail, destinatarioDoReenvio } from "./emailCredenciais.ts";
import { avaliarFichaCompleta } from "./fichaCompleta.ts";

initSentry();

/** Sem ambiguidades visuais (0/O, 1/l/I) -- estas credenciais sao lidas e escritas a mao. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const COMPRIMENTO_PASSWORD = 16;

/** Papeis que esta funcao NUNCA atribui, mesmo que o pedido os peca. */
const PAPEIS_PROIBIDOS = ["super_admin", "system_admin"];

/** Validacao simples (uma arroba, dominio com ponto, sem espacos); o resto e do auth. */
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Idade maxima de uma conta de admissao sem ficha para ser reaproveitada. */
const DIAS_MAXIMOS_CONTA_ORFA = 14;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * A conta de autenticacao pode ser reaproveitada (password reposta) so se for
 * uma conta orfa do login temporario de admissao: criada pelo admin, nunca
 * usada, recente, por e-mail e sem identidades sociais.
 */
// deno-lint-ignore no-explicit-any
function contaOrfaReutilizavel(u: any, agora: number = Date.now()): boolean {
  if (u?.user_metadata?.admin_created !== true) return false;
  if (u?.last_sign_in_at) return false;
  const criada = Date.parse(u?.created_at ?? "");
  if (!Number.isFinite(criada)) return false;
  if (agora - criada >= DIAS_MAXIMOS_CONTA_ORFA * MS_POR_DIA) return false;
  if (u?.app_metadata?.provider !== "email") return false;
  const identidades = Array.isArray(u?.identities) ? u.identities : [];
  // deno-lint-ignore no-explicit-any
  return identidades.every((i: any) => i?.provider === "email");
}

function gerarPassword(): string {
  const bytes = new Uint8Array(COMPRIMENTO_PASSWORD);
  crypto.getRandomValues(bytes);
  let saida = "";
  for (const b of bytes) saida += ALFABETO[b % ALFABETO.length];
  return saida;
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
    // E-mail de acesso escolhido no dialogo (opcional): validado e em minusculas.
    const emailDoPedido: string | null =
      payload?.email === undefined || payload?.email === null || payload?.email === ""
        ? null
        : typeof payload.email === "string"
          ? payload.email.trim().toLowerCase()
          : "";

    if (typeof pessoaId !== "string" || !UUID.test(pessoaId)) {
      return responder({ error: "pedido_invalido" }, 400);
    }
    if (emailDoPedido !== null && !EMAIL_VALIDO.test(emailDoPedido)) {
      return responder({ error: "email_invalido" }, 400);
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
      .select("id, organization_id, primeiro_nome, apelido, email_pessoal, email_trabalho, deleted_at")
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

    // Pedido > email_trabalho > email_pessoal (fallback de fichas antigas).
    const emailTrabalhoAtual = (pessoa.email_trabalho ?? "").trim().toLowerCase();
    const email: string =
      emailDoPedido ?? (emailTrabalhoAtual || (pessoa.email_pessoal ?? "").trim().toLowerCase());
    if (!email || !EMAIL_VALIDO.test(email)) {
      return responder({ error: "sem_email_acesso" }, 400);
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

      // O destinatario e o e-mail da CONTA de autenticacao, nunca o
      // `email_pessoal` da ficha: esse campo edita-se com `hr.pessoas.edit`, e
      // com ele quem edita a ficha de um colega recebia a password dele. A
      // password so se altera depois de haver para onde a mandar.
      const { data: authConta, error: erroAuthConta } = await svc.auth.admin.getUserById(
        conta.auth_user_id,
      );
      if (erroAuthConta) {
        captureError(erroAuthConta);
        return responder({ error: "erro_inesperado" }, 500);
      }
      const emailConta = destinatarioDoReenvio({ emailConta: authConta?.user?.email });
      if (!emailConta) return responder({ error: "conta_sem_email" }, 409);

      const { error: erroPassword } = await svc.auth.admin.updateUserById(conta.auth_user_id, {
        password,
      });
      if (erroPassword) {
        captureError(erroPassword);
        return responder({ error: "password_nao_alterada" }, 400);
      }

      const envio = await enviarCredenciais(svc, { email: emailConta, nome, password, baseUrl, org });
      return responder({
        ok: true,
        email_enviado: envio.enviado,
        aviso: envio.enviado ? null : "conta_criada_sem_email",
        motivo_email: envio.motivo,
      });
    }

    // ========================================================================
    // CRIAR: conta nova, papel escolhido, ligacao a ficha, e-mail.
    // ========================================================================
    // GUARDA: so a PRIMEIRA criacao de acesso exige a ficha completa (reenviar
    // credenciais a quem ja tem conta, acima, continua permitido). Com
    // `service_role` `auth.uid()` e nulo e `hr_admissao_pendencias` devolve
    // todas as pendencias (convite e ficha, nunca as opcionais). Se a consulta
    // falhar, fecha: 500 e nada se cria.
    const { data: pendencias, error: erroPendencias } = await svc.rpc("hr_admissao_pendencias", {
      p_pessoa_id: pessoaId,
    });
    if (erroPendencias) captureError(erroPendencias);
    const fichaIncompleta = avaliarFichaCompleta({ data: pendencias, error: erroPendencias });
    if (fichaIncompleta) return responder(fichaIncompleta.body, fichaIncompleta.status);

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
    // `null` so quando a conta ja existia E e de alguem (tem ficha em
    // `anew_users`): nesse caso nao se envia password nenhuma.
    let passwordParaEnviar: string | null = password;
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
      // Ja ha conta de autenticacao com este e-mail. Reaproveita-se: a
      // alternativa e deixar a ficha sem acesso possivel para sempre. Ha dois
      // casos, e o que os distingue e ter ou nao FICHA em `anew_users`:
      //
      //  a) SEM ficha em `anew_users` (e, por consequencia, sem linha em
      //     `pessoas_contas`, que se liga por `anew_user_id`): e a conta que
      //     nasceu do login temporario do portal de admissao (OTP por link +
      //     codigo por e-mail). So existe para a admissao, nao e de ninguem,
      //     e e seguro toca-la: define-se-lhe a password gerada e o e-mail
      //     diz as credenciais como numa conta nova.
      //  b) COM ficha em `anew_users`: e de alguem, possivelmente de outra
      //     organizacao. A password NAO se toca: repo-la por indicacao de um
      //     terceiro invalidava-lhe a sessao. A pessoa entra com a que ja tem,
      //     ou recupera-a (o e-mail diz-lho, sem password).
      const existente = await procurarAuthUserPorEmail(svc, email);
      if (!existente) return responder({ error: "conta_existente_nao_encontrada" }, 400);
      authUserId = existente.id;

      // EXCEPCAO 2 ao orgScoped (de novo): `anew_users` nao tem
      // `organization_id`; filtra-se pelo auth uid, que e unico. A consulta e
      // deliberadamente global: a pergunta e "esta conta e de alguem, em
      // qualquer organizacao?". Se falhar, fecha-se: nada se toca.
      const { data: fichaExistente, error: erroFicha } = await svc
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (erroFicha) {
        captureError(erroFicha);
        return responder({ error: "erro_inesperado" }, 500);
      }

      if (fichaExistente) {
        passwordParaEnviar = null;
      } else {
        // Ter "sem ficha" nao basta: sem ficha ha contas de outras apps, do
        // portal ou de registos pendentes, e quem tem `hr.pessoas.conta.criar`
        // nao pode repor a password de nenhuma delas. So se reaproveita a conta
        // ORFA de admissao, e ela passa TODAS estas:
        //  - `user_metadata.admin_created === true`;
        //  - nunca fez login (`last_sign_in_at` nulo);
        //  - criada ha menos de DIAS_MAXIMOS_CONTA_ORFA dias;
        //  - `app_metadata.provider === "email"`, sem identidades sociais;
        //  - sem ficha em `anew_users` (acima). Sem ficha nao ha `anew_users.id`,
        //    logo nao pode haver linha em `pessoas_contas` nem em
        //    `anew_memberships` (ambas se ligam por esse id): ficam cobertas
        //    por esta condicao e nao ha consulta possivel por fazer.
        // NAO se filtra `deleted_at` nem `status`: a conta de alguem apagado ou
        // inactivo nao deve ser reposta por terceiros -- ja nem entra aqui, tem
        // ficha. Se falhar qualquer uma: 409, nada se toca, nada se cria, nada se envia.
        if (!contaOrfaReutilizavel(existente)) {
          return responder({ error: "conta_existente_nao_reutilizavel" }, 409);
        }
        // Rasto de auditoria, sem a password.
        console.warn(JSON.stringify({
          evento: "reaproveitada_conta_orfa",
          motivo: "reaproveitada_conta_orfa",
          actorId,
          org,
          pessoaId,
          authUserId,
          created_at: existente.created_at ?? null,
          last_sign_in_at: existente.last_sign_in_at ?? null,
        }));
        // Dois pedidos simultaneos podem gerar duas passwords: ganha a ultima
        // a ser escrita e o e-mail da outra deixa de servir. O RH repete o
        // pedido ou usa "Reenviar". Aceite, sem bloqueio.
        // Antes de criar perfil/ligar: se a password nao ficar definida, nao
        // se cria nada e a pessoa nao recebe um e-mail com uma password falsa.
        const { error: erroPasswordExistente } = await svc.auth.admin.updateUserById(authUserId, {
          password,
        });
        if (erroPasswordExistente) {
          captureError(erroPasswordExistente);
          return responder({ error: "password_nao_alterada" }, 400);
        }
        passwordParaEnviar = password;
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

    // Grava o e-mail de acesso como e-mail de trabalho da ficha, se difere e se
    // quem clicou pode editar dados laborais. Melhor-esforco: a conta ja existe.
    if (email !== emailTrabalhoAtual) {
      await gravarEmailTrabalho(svc, { pessoaId, org, email, authUid: authUidChamador });
    }

    const envio = await enviarCredenciais(svc, {
      email,
      nome,
      password: passwordParaEnviar,
      baseUrl,
      org,
    });
    return responder({
      ok: true,
      email_enviado: envio.enviado,
      aviso: envio.enviado ? null : "conta_criada_sem_email",
      motivo_email: envio.motivo,
    });
  } catch (e) {
    captureError(e);
    return responder({ error: "erro_inesperado" }, 500);
  }
});

/**
 * Grava `pessoas.email_trabalho` com service role e filtro de organizacao, so
 * se o chamador tem `hr.pessoas.laborais.edit` NESSA organizacao. Nunca falha
 * o pedido: sem permissao ou com erro, regista (so erros) e segue.
 */
async function gravarEmailTrabalho(
  // deno-lint-ignore no-explicit-any
  svc: any,
  args: { pessoaId: string; org: string; email: string; authUid: string },
): Promise<void> {
  try {
    if (!args.org) return;
    const { data: pode, error: erroPermissao } = await svc.rpc("has_anew_permission_in_org", {
      _auth_uid: args.authUid,
      _permission_code: "hr.pessoas.laborais.edit",
      _organization_id: args.org,
    });
    if (erroPermissao) {
      captureError(erroPermissao);
      return;
    }
    if (!pode) return;
    const { error } = await svc
      .from("pessoas")
      .update({ email_trabalho: args.email })
      .eq("id", args.pessoaId)
      .eq("organization_id", args.org);
    if (error) captureError(error);
  } catch (e) {
    captureError(e);
  }
}

interface ResultadoEnvio {
  enviado: boolean;
  /** Codigo da falha (nunca o texto do erro); nulo quando o e-mail saiu. */
  motivo: "smtp_nao_configurado" | "smtp_falhou" | "pedido_invalido" | null;
}

/**
 * Envio DIRECTO pelo SMTP da organizacao da ficha, exactamente como o convite de
 * admissao (`convite-admissao/correio.ts`): NUNCA pela `send-email`, que grava o
 * `body_html` em `email_logs` -- a password gerada ficaria la em claro.
 */
// deno-lint-ignore no-explicit-any
const enviarCorreio = (svc: any) =>
  criarEnviadorCorreio({
    resolverSmtp: (organizationId) => resolveOrganizationSmtp(svc, organizationId),
    enviarSmtp: (smtp, mensagem) => sendEmailViaSMTP(smtp, mensagem),
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
  args: { email: string; nome: string; password: string | null; baseUrl: string; org: string },
): Promise<ResultadoEnvio> {
  try {
    const { html, text } = corpoDoEmail(args.nome, args.email, args.password, args.baseUrl);
    const r = await enviarCorreio(svc)({
      organizationId: args.org,
      para: args.email,
      assunto: "Os seus dados de acesso a Olyvia",
      html,
      texto: text,
    });
    if (r.enviado) return { enviado: true, motivo: null };
    // So o CODIGO: nunca o texto do erro, nem o destinatario, nem a password.
    console.warn(JSON.stringify({ evento: "credenciais_email_nao_enviado", org: args.org, motivo_email: r.erroCodigo }));
    return { enviado: false, motivo: r.erroCodigo };
  } catch (e) {
    // Falha ao montar o corpo (e nao ao enviar): so o codigo sai.
    captureError(e);
    console.warn(JSON.stringify({ evento: "credenciais_email_nao_enviado", org: args.org, motivo_email: "pedido_invalido" }));
    return { enviado: false, motivo: "pedido_invalido" };
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
