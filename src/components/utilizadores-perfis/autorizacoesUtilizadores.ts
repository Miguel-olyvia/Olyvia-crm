// Quem pode editar, desativar e ver o histórico de quem. Porta de canEditUser/canDeleteUser de UsersNew.tsx, sem base:
// a permissão e o âmbito (canActOnEntity) chegam por funções injetadas pelo wrapper hooks/useAutorizacoesUtilizadores.ts.
import type { Utilizador } from "./tipos";

export interface ContextoAutorizacao {
  /** Id de autenticação de quem está a ver. */
  authUserId: string | null;
  anewUserId: string | null;
  /** Role de quem vê NA ORGANIZAÇÃO ATIVA (não a mais alta em qualquer empresa). */
  anewRoleCode: string | null;
  orgAtivaId: string | undefined;
  /** Os utilizadores carregados (serve a saber se quem vê é o criador da conta). */
  todos: readonly Utilizador[];
  tem: (permissao: string) => boolean;
  /** `canActOnEntity` com o âmbito que a pessoa tem nessa permissão. */
  podeAgir: (permissao: string, alvo: Utilizador) => boolean;
}

export interface AutorizacoesUtilizadores {
  podeCriar: boolean;
  podeGerirRoles: boolean;
  podeEditar: (u: Utilizador) => boolean;
  podeDesativar: (u: Utilizador) => boolean;
  podeVerHistorico: (u: Utilizador) => boolean;
}

const ROLES_QUE_EDITAM_OWNER = ["org_admin", "super_admin", "system_admin"];

export function criarAutorizacoes(c: ContextoAutorizacao): AutorizacoesUtilizadores {
  const ativos = (u: Utilizador) => u.vinculos.filter((v) => v.ativo);
  const ehProprio = (u: Utilizador) => !!u.authUserId && u.authUserId === c.authUserId;
  const ehCriadorDaConta = (u: Utilizador) => ativos(u).some((v) => v.roleCodigo === "super_admin" && v.criador);
  const ehSuperAdmin = (u: Utilizador) => ativos(u).some((v) => v.roleCodigo === "super_admin");
  const ehOwner = (u: Utilizador) =>
    !!c.orgAtivaId && ativos(u).some((v) => v.organizacaoId === c.orgAtivaId && v.roleCodigo === "org_admin");
  const euSouCriador = c.anewRoleCode === "super_admin" && c.todos.some((u) => ehProprio(u) && ehCriadorDaConta(u));
  const euEditoOwner = ROLES_QUE_EDITAM_OWNER.includes(c.anewRoleCode ?? "");

  /** As proteções comuns a editar e desativar (o próprio trata-se à parte). */
  const protegido = (u: Utilizador) =>
    ehCriadorDaConta(u) || (ehSuperAdmin(u) && !euSouCriador) || (ehOwner(u) && !euEditoOwner);

  return {
    podeCriar: c.tem("users.create"),
    podeGerirRoles: c.tem("users.manage_roles"),
    podeEditar: (u) => {
      if (ehProprio(u)) return true;
      if (protegido(u)) return false;
      return c.tem("users.edit") && c.podeAgir("users.edit", u);
    },
    podeDesativar: (u) => {
      if (ehProprio(u)) return false;
      if (protegido(u)) return false;
      return c.tem("users.delete") && c.podeAgir("users.delete", u);
    },
    podeVerHistorico: (u) => c.tem("users.edit") && (ehProprio(u) || c.podeAgir("users.edit", u)),
  };
}
