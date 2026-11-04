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
