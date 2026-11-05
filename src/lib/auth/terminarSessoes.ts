// "Terminar sessões" (registo de autenticação): quem pode, por pessoa. Espelha a edge revoke-user-sessions:
// o administrador de sistema verdadeiro, ou quem tem users.edit e consegue gerir a conta dessa pessoa
// (fn_pode_gerir_utilizador = regra do Lote D: organização de cada associação ou acima, nunca a própria,
// nunca um administrador de sistema, nunca alguém com mais poder). A base decide; aqui só se pergunta.

export interface ContextoTerminarSessoes {
  isSystemAdmin: boolean;
  /** hasPermission("users.edit") de quem vê. */
  temUsersEdit: boolean;
  /** anew_users visíveis a quem vê, para os auth ids pedidos. */
  procurarUtilizadores: (authUserIds: string[]) => Promise<{ id: string; auth_user_id: string }[]>;
  /** fn_pode_gerir_utilizador(id, 'users.edit') como a sessão. Falha = não. */
  possoGerir: (anewUserId: string) => Promise<boolean>;
}

/** Os auth ids (das linhas) cujas sessões quem vê pode terminar. `"todos"` = administrador de sistema. */
export async function authIdsComSessoesTerminaveis(
  authUserIds: readonly (string | null | undefined)[],
  c: ContextoTerminarSessoes,
): Promise<"todos" | Set<string>> {
  if (c.isSystemAdmin) return "todos";
  if (!c.temUsersEdit) return new Set();
  const ids = [...new Set(authUserIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return new Set();
  const utilizadores = await c.procurarUtilizadores(ids);
  const respostas = await Promise.all(
    utilizadores.map(async (u) => ((await c.possoGerir(u.id).catch(() => false)) ? u.auth_user_id : null)),
  );
  return new Set(respostas.filter((x): x is string => !!x));
}

export function podeTerminarSessoes(geriveis: "todos" | ReadonlySet<string>, authUserId: string | null | undefined): boolean {
  if (!authUserId) return false;
  return geriveis === "todos" || geriveis.has(authUserId);
}
