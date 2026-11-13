// create-user: o ramo «a conta já existe». Sem Deno nem imports remotos, para correr também no vitest.
//
// Regra de produto: é a MESMA pessoa e a MESMA ficha. Nada da ficha (nome, cargo, contactos, fiscal, moradas, descrição)
// é reescrito; só se acrescenta a associação à organização nova (rpc_hr_associar_conta_existente, migração 20270112400000).
// A procura NÃO usa auth.admin.listUsers (falha com «Database error finding users»): usa get_auth_user_id_by_email
// (migração 20261110240000, SECURITY DEFINER só service_role, índice único em auth.users.email).
//
// Toda a decisão vive aqui, em funções testáveis; o index.ts só traduz o resultado para uma Response.

// deno-lint-ignore no-explicit-any
type Cliente = any;

export const MENSAGEM_FICHA_INALTERADA =
  "A pessoa já existia: foi associada à organização sem alterar a ficha.";

const MSG_PROCURAR = "Falhou ao procurar a conta existente.";
const MSG_ASSOCIAR = "Falhou ao associar à organização.";
const MSG_NAO_POSSIVEL = "Não é possível associar esta pessoa.";
const MSG_SEM_PERMISSAO = "Sem permissão para associar esta pessoa.";
const MSG_PEDIDO_INVALIDO = "Pedido inválido.";
const MSG_PROPRIO = "Não pode atribuir papéis a si próprio.";

export class ErroPasso extends Error {
  constructor(
    readonly mensagem: string,
    readonly status: number,
    readonly associadas: string[] = [],
  ) {
    super(mensagem);
    this.name = "ErroPasso";
  }
}

/**
 * Traduz um erro da RPC (código ou texto levantado pela própria função SQL) para uma mensagem em português para o
 * ecrã. Nunca devolve o código em bruto nem texto do Postgres; o original fica no log de quem chama. O estado de contas
 * de terceiros (inativa, sem perfil) dá sempre a mesma mensagem genérica, para não o revelar.
 */
export function mensagemErroRpc(
  erro: unknown,
  passo: string = MSG_ASSOCIAR,
): { mensagem: string; status: number } {
  const e = (erro ?? {}) as { code?: string; message?: string };
  const texto = typeof e.message === "string" ? e.message : "";
  if (/conta_existente_sem_perfil|conta_existente_inativa/.test(texto)) return { mensagem: MSG_NAO_POSSIVEL, status: 403 };
  if (/papel_nao_encontrado/.test(texto)) {
    return { mensagem: "Falhou ao associar à organização: o papel escolhido não existe.", status: 400 };
  }
  if (/papel_nao_permitido/.test(texto)) {
    return { mensagem: "Falhou ao associar à organização: este papel não pode ser atribuído por esta via.", status: 403 };
  }
  if (/Não pode atribuir papéis a si próprio/.test(texto)) return { mensagem: MSG_PROPRIO, status: 403 };
  if (e.code === "42501") return { mensagem: MSG_SEM_PERMISSAO, status: 403 };
  if (e.code === "22023") return { mensagem: MSG_PEDIDO_INVALIDO, status: 400 };
  return { mensagem: passo, status: 400 };
}

export interface ContaExistente {
  authUserId: string;
  anewUserId: string | null;
}

export async function procurarContaExistente(svc: Cliente, email: string): Promise<ContaExistente | null> {
  const { data: authUserId, error } = await svc.rpc("get_auth_user_id_by_email", { p_email: email });
  if (error) {
    console.error("create-user: get_auth_user_id_by_email falhou", error);
    throw new ErroPasso(MSG_PROCURAR, 500);
  }
  if (!authUserId) return null;

  const { data: perfil, error: erroPerfil } = await svc
    .from("anew_users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (erroPerfil) {
    console.error("create-user: leitura de anew_users falhou", erroPerfil);
    throw new ErroPasso(MSG_PROCURAR, 500);
  }
  return { authUserId: String(authUserId), anewUserId: perfil?.id ?? null };
}

export interface AssociacaoPedida {
  organization_id: string;
  role_id: string;
}

export async function associarContaExistente(
  svc: Cliente,
  p: { authUserId: string; actorId: string; memberships: AssociacaoPedida[] },
): Promise<{ associadas: string[] }> {
  const associadas: string[] = [];
  for (const m of p.memberships) {
    const { data, error } = await svc
      .rpc("rpc_hr_associar_conta_existente", {
        p_auth_user_id: p.authUserId,
        p_actor_id: p.actorId,
        p_organization_id: m.organization_id,
        p_role_id: m.role_id,
      })
      .single();
    if (error || !data?.id) {
      console.error("create-user: rpc_hr_associar_conta_existente falhou", { organization_id: m.organization_id, error });
      const { mensagem, status } = mensagemErroRpc(error);
      const parcial = associadas.length > 0
        ? ` Já ficaram associadas: ${associadas.length} de ${p.memberships.length}.`
        : "";
      throw new ErroPasso(`${mensagem}${parcial}`, status, associadas);
    }
    associadas.push(m.organization_id);
  }
  return { associadas };
}

/**
 * O alvo é administrador de sistema? FALHA FECHADA: só `false` explícito deixa passar; erro da RPC, exceção ou resposta
 * que não seja booleana contam como «sim» (recusa). Não usa `souAdminSistema`, que devolve false em erro: serve bem a
 * quem pergunta pelo próprio ator (falhar = menos poder), mas aplicado ao ALVO deixaria passar um administrador num
 * erro transitório.
 */
async function alvoEAdminSistemaOuIncerto(svc: Cliente, authUserId: string): Promise<boolean> {
  try {
    const { data, error } = await svc.rpc("is_system_admin_user", { _user_id: authUserId });
    if (error) {
      console.error("create-user: is_system_admin_user falhou para o alvo (recusa, falha fechada)", error);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("create-user: is_system_admin_user lançou para o alvo (recusa, falha fechada)", e);
    return true;
  }
}

/**
 * O alvo tem pelo menos um vínculo ATIVO numa organização diferente das pedidas? Ativo = status active, sem end_date,
 * papel interno (não `client`, o do portal) e organização não apagada.
 *
 * A leitura de anew_memberships é GLOBAL de propósito (todas as organizações do alvo, não só as do ator): é o único
 * modo de saber se a pessoa tem vida noutra organização. Corre com o service role e só sai daqui um booleano, nunca
 * as organizações nem os papéis.
 *
 * Schema confirmado (types.ts e migrações 20261108030000 / 20261130000000, todas aplicadas na RH segundo
 * `migration list --linked`): anew_memberships.role_is_client (boolean, a base trata NULL como interno:
 * `role_is_client IS NOT TRUE`, por isso filtra-se aqui em JS e não com `.eq(false)`, que excluiria NULL) e
 * anew_organizations.deleted_at (NULL = ativa).
 */
export async function temVinculoAtivoNoutraOrganizacao(
  svc: Cliente,
  anewUserId: string,
  organizacoesPedidas: string[],
): Promise<boolean> {
  const { data, error } = await svc
    .from("anew_memberships")
    .select("organization_id, status, end_date, role_is_client")
    .eq("user_id", anewUserId)
    .eq("status", "active")
    .is("end_date", null);
  if (error) {
    console.error("create-user: leitura de anew_memberships falhou", error);
    throw new ErroPasso(MSG_PROCURAR, 500);
  }
  const pedidas = new Set(organizacoesPedidas);
  // O filtro de status e end_date já vem da consulta; repete-se aqui para a regra não depender só dela.
  const candidatas = [...new Set(
    ((data ?? []) as { organization_id: string; status: string; end_date: string | null; role_is_client: boolean | null }[])
      .filter((m) => m.status === "active" && m.end_date == null && m.role_is_client !== true && !pedidas.has(m.organization_id))
      .map((m) => m.organization_id),
  )];
  if (candidatas.length === 0) return false;

  const { data: vivas, error: erroOrgs } = await svc
    .from("anew_organizations")
    .select("id")
    .in("id", candidatas)
    .is("deleted_at", null);
  if (erroOrgs) {
    console.error("create-user: leitura de anew_organizations falhou", erroOrgs);
    throw new ErroPasso(MSG_PROCURAR, 500);
  }
  return ((vivas ?? []) as { id: string }[]).length > 0;
}

export type ResultadoRamo =
  | { tipo: "resposta"; status: number; corpo: Record<string, unknown> }
  | { tipo: "continuar"; authUserId: string };

const recusa = (status: number, code: string, mensagem: string, extra: Record<string, unknown> = {}): ResultadoRamo => ({
  tipo: "resposta",
  status,
  // `error` já é o texto em português (o ecrã mostra `error` primeiro); `code` é o identificador estável.
  corpo: { error: mensagem, code, message: mensagem, ...extra },
});

/** A resposta de sucesso: sem identificadores nem dados da pessoa (nem anew_user_id, nem email). */
export function respostaContaExistente(associadas: string[]): ResultadoRamo {
  return {
    tipo: "resposta",
    status: 200,
    corpo: {
      existing_auth_user: true,
      ficha_alterada: false,
      associadas,
      message: MENSAGEM_FICHA_INALTERADA,
    },
  };
}

export interface PedidoRamo {
  email: string;
  actorId: string; // anew_users.id de quem pede
  actorAuthId: string; // auth.users.id de quem pede
  callerIsSystemAdmin: boolean;
  memberships: AssociacaoPedida[];
}

/**
 * O createUser disse «já existe». Procura a conta e:
 *  - com ficha (anew_users): recusa a própria conta, administradores de sistema e contas dormentes; senão só associa
 *    (nunca a finalize). A decisão de negócio é do utilizador: a mesma pessoa/ficha pode ser associada de uma
 *    organização a outra com users.create na organização alvo (a RPC volta a verificar tudo).
 *  - sem ficha: devolve `continuar` e o ramo normal cria a ficha.
 * O contexto de auditoria é sempre limpo quando o ramo responde.
 */
export async function executarRamoContaExistente(svc: Cliente, p: PedidoRamo): Promise<ResultadoRamo> {
  let resultado: ResultadoRamo;
  try {
    resultado = await decidir(svc, p);
  } catch (e) {
    resultado = e instanceof ErroPasso
      ? recusa(e.status, "existing_account_lookup_failed", e.mensagem)
      : recusa(500, "internal_error", "Falhou ao processar o pedido de criação.");
    if (!(e instanceof ErroPasso)) console.error("create-user: erro inesperado no ramo da conta existente", e);
  }
  if (resultado.tipo === "resposta") {
    const { error } = await svc.rpc("clear_audit_context");
    if (error) console.error("Failed to clear audit context:", error);
  }
  return resultado;
}

async function decidir(svc: Cliente, p: PedidoRamo): Promise<ResultadoRamo> {
  const existente = await procurarContaExistente(svc, p.email);
  if (!existente) {
    console.error("create-user: o Auth diz que o email existe mas a procura não encontrou a conta");
    return recusa(409, "existing_account_not_found", "Não foi possível associar esta pessoa. Contacte um administrador.");
  }
  console.log("create-user: conta existente", existente.authUserId);

  if (!p.callerIsSystemAdmin && existente.authUserId === p.actorAuthId) {
    return recusa(403, "cannot_assign_self", MSG_PROPRIO);
  }

  // Sem ficha: o ramo normal cria-a. Não há ficha de ninguém para proteger.
  if (!existente.anewUserId) return { tipo: "continuar", authUserId: existente.authUserId };

  if (await alvoEAdminSistemaOuIncerto(svc, existente.authUserId)) {
    return recusa(403, "existing_account_not_allowed", MSG_NAO_POSSIVEL);
  }

  const orgsPedidas = p.memberships.map((m) => m.organization_id);
  if (!(await temVinculoAtivoNoutraOrganizacao(svc, existente.anewUserId, orgsPedidas))) {
    // Mesma mensagem que para o administrador de sistema (não distinguir os dois ao exterior); o code distingue-os nos logs.
    return recusa(403, "existing_account_dormant", MSG_NAO_POSSIVEL);
  }

  try {
    const { associadas } = await associarContaExistente(svc, {
      authUserId: existente.authUserId,
      actorId: p.actorId,
      memberships: p.memberships,
    });
    return respostaContaExistente(associadas);
  } catch (e) {
    if (e instanceof ErroPasso) {
      return recusa(e.status, "existing_account_association_failed", e.mensagem, { associadas: e.associadas });
    }
    throw e;
  }
}
