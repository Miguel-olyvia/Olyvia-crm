// Verificações de administração usadas pelas edge functions que gerem contas (create-user, delete-user, restore-user,
// update-user-password). Tudo é decidido na base de dados, pelas mesmas funções que as políticas usam:
//   · is_system_admin_user  — o administrador de sistema VERDADEIRO (papel global de sistema, não um papel de organização
//                             com o código 'system_admin'; ver 20270106300000).
//   · has_anew_permission   — a permissão em qualquer associação ativa (o portão geral, como antes).
// Em caso de erro devolve sempre "não" (falha fechada).

// deno-lint-ignore no-explicit-any
type ClienteAdmin = any;

export async function souAdminSistema(admin: ClienteAdmin, authUid: string): Promise<boolean> {
  if (!authUid) return false;
  const { data, error } = await admin.rpc("is_system_admin_user", { _user_id: authUid });
  if (error) {
    console.error("souAdminSistema: is_system_admin_user falhou", error);
    return false;
  }
  return data === true;
}

export async function temPermissao(admin: ClienteAdmin, authUid: string, permissao: string): Promise<boolean> {
  if (!authUid || !permissao) return false;
  const { data, error } = await admin.rpc("has_anew_permission", {
    _auth_uid: authUid,
    _permission_code: permissao,
  });
  if (error) {
    console.error("temPermissao: has_anew_permission falhou", { permissao, error });
    return false;
  }
  return data === true;
}

// Permissão na organização ou numa ACIMA dela (os direitos de administração descem, não sobem; 20270106310000).
export async function temPermissaoNaOrg(
  admin: ClienteAdmin,
  authUid: string,
  permissao: string,
  organizacaoId: string,
): Promise<boolean> {
  if (!authUid || !permissao || !organizacaoId) return false;
  const { data, error } = await admin.rpc("has_anew_permission_in_org_or_ancestor", {
    _auth_uid: authUid,
    _permission_code: permissao,
    _organization_id: organizacaoId,
  });
  if (error) {
    console.error("temPermissaoNaOrg: has_anew_permission_in_org_or_ancestor falhou", { permissao, error });
    return false;
  }
  return data === true;
}

// NULL = quem atribui pode dar este papel nesta organização; senão o motivo (20270106310000: papel de sistema só por quem
// já o tem ou pelo administrador de sistema, papel da própria organização ou de uma acima, permissões ⊆ às de quem atribui).
export async function motivoPapelNaoAtribuivel(
  admin: ClienteAdmin,
  authUid: string,
  organizacaoId: string,
  papelId: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("fn_motivo_papel_nao_atribuivel", {
    p_actor_auth: authUid,
    p_org: organizacaoId,
    p_role: papelId,
  });
  if (error) {
    console.error("motivoPapelNaoAtribuivel: fn_motivo_papel_nao_atribuivel falhou", error);
    return "Não foi possível validar o papel";
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

// Pode quem age gerir a conta desta pessoa (anew_users.id)? Permissão na organização de cada associação dela (ou acima),
// nunca a própria, nunca um administrador de sistema, nunca alguém com um papel que quem age não poderia atribuir.
export async function possoGerirUtilizador(
  admin: ClienteAdmin,
  authUid: string,
  utilizadorId: string,
  permissao: string,
  incluirInativas = false,
): Promise<boolean> {
  if (!authUid || !utilizadorId || !permissao) return false;
  const { data, error } = await admin.rpc("fn_pode_gerir_utilizador_por", {
    p_actor_auth: authUid,
    p_target_user: utilizadorId,
    p_permission: permissao,
    p_incluir_inativas: incluirInativas,
  });
  if (error) {
    console.error("possoGerirUtilizador: fn_pode_gerir_utilizador_por falhou", { permissao, error });
    return false;
  }
  return data === true;
}
