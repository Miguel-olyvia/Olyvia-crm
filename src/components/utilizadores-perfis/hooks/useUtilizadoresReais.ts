// Wrapper: a lista real de utilizadores, as organizações e os clientes do portal. Mesma leitura de UsersNew.tsx (fetchData):
// anew_hierarchy, anew_organizations (com o filtro do âmbito organizations.view), anew_users, anew_memberships, anew_roles,
// anew_entity_phones, mais os âmbitos por vínculo (anew_membership_permission_scopes). Os erros sobem: nunca se devolve uma
// lista vazia no lugar de uma falha (o filtro de visibilidade esconderia toda a gente e pareceria falta de permissões).
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissionScope, type ScopeLevel } from "@/hooks/usePermissionScope";
import { selectInBatchesOrThrow } from "@/hooks/useEntityIdentity";
import {
  clientesDoPortal, idsOrganizacoesVisiveis, montarUtilizadores, utilizadoresDaLista,
  type LinhaAmbito, type LinhaHierarquia, type LinhaMembership, type LinhaRoleBase, type LinhaTelefone, type LinhaUtilizadorBase,
} from "../mapeamentoUtilizadores";
import { agruparPermissoesPorRole, mensagemDeErro, roleDaBase, type LinhaRole, type LinhaRolePermissao } from "../rolesReais";
import type { ClientePortal, Organizacao, Role, Utilizador } from "../tipos";
import { db } from "./clienteBase";

export const CHAVE_UTILIZADORES = ["utilizadores-perfis", "utilizadores"] as const;
const ORGANIZACAO_INEXISTENTE = "00000000-0000-0000-0000-000000000000";

export interface ParametrosLeitura {
  orgAtivaId: string;
  tipoSistema: boolean;
  /** Âmbito de organizations.view de quem vê. */
  escopoOrganizacoes: ScopeLevel;
  anewUserId: string | null;
  /** As organizações a que quem vê pertence (CompanyContext.companies). */
  idsEmpresasDoUtilizador: string[];
}

export interface ResultadoLeitura {
  todos: Utilizador[];
  organizacoes: Organizacao[];
  /** As roles dos vínculos de todos os utilizadores (com permissões), mesmo as que a lista de roles não mostra. */
  rolesDosVinculos: Role[];
}

interface LinhaOrganizacao { id: string; name: string; type: string; created_by?: string | null }

/** `.select()` falhado levanta o erro da base. */
async function ler<T>(consulta: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function lerOrganizacoes(p: ParametrosLeitura, ambito: Set<string>): Promise<LinhaOrganizacao[]> {
  let consulta = db.from("anew_organizations").select("id, name, type, created_by").order("name");
  if (p.escopoOrganizacoes === "NONE") {
    consulta = p.idsEmpresasDoUtilizador.length > 0 ? consulta.in("id", p.idsEmpresasDoUtilizador) : consulta.eq("id", ORGANIZACAO_INEXISTENTE);
  } else if (ambito.size > 0) {
    consulta = consulta.in("id", [...ambito]);
  }
  const linhas = await ler<LinhaOrganizacao>(consulta);
  if (p.escopoOrganizacoes === "OWNED" && p.anewUserId) {
    const minhas = new Set(p.idsEmpresasDoUtilizador);
    return linhas.filter((o) => o.created_by === p.anewUserId || minhas.has(o.id));
  }
  return linhas;
}

async function lerRolesDosVinculos(roleIds: string[]): Promise<Role[]> {
  if (roleIds.length === 0) return [];
  const linhas = await selectInBatchesOrThrow<LinhaRole>(roleIds, (lote) =>
    db.from("anew_roles").select("id, code, name, description, organization_id, is_system, can_sign_contracts, deleted_at").in("id", lote));
  const perms = await selectInBatchesOrThrow<LinhaRolePermissao>(roleIds, (lote) =>
    db.from("anew_role_permissions").select("role_id, permission_code").in("role_id", lote).limit(5000));
  const por = agruparPermissoesPorRole(perms);
  return linhas.map((l) => roleDaBase(l, por[l.id] ?? []));
}

/** A leitura completa. Exportada para os testes. */
export async function lerUtilizadoresDaBase(p: ParametrosLeitura): Promise<ResultadoLeitura> {
  const { data: { user: autenticado } } = await db.auth.getUser();
  const hierarquia = await ler<LinhaHierarquia>(db.from("anew_hierarchy").select("parent_org_id, child_org_id"));
  const ambito = idsOrganizacoesVisiveis(hierarquia, p.orgAtivaId);
  const organizacoesLidas = await lerOrganizacoes(p, ambito);
  const users = await ler<LinhaUtilizadorBase>(db.from("anew_users").select("*").order("name"));

  const memberships = users.length === 0 ? [] : await selectInBatchesOrThrow<LinhaMembership>(users.map((u) => u.id), (lote) =>
    db.from("anew_memberships").select("id, user_id, organization_id, relationship_type, role_id, status, join_method").in("user_id", lote));
  const roleIds = [...new Set(memberships.map((m) => m.role_id).filter(Boolean))];
  const roles = roleIds.length === 0 ? [] : await selectInBatchesOrThrow<LinhaRoleBase>(roleIds, (lote) =>
    db.from("anew_roles").select("id, code, name").in("id", lote));
  const idsOrgsDosVinculos = [...new Set(memberships.map((m) => m.organization_id).filter(Boolean))];
  const orgsDosVinculos = idsOrgsDosVinculos.length === 0 ? [] : await selectInBatchesOrThrow<LinhaOrganizacao>(idsOrgsDosVinculos, (lote) =>
    db.from("anew_organizations").select("id, name, type").in("id", lote));
  const entidades = users.map((u) => u.entity_id).filter((x): x is string => !!x);
  const phones = entidades.length === 0 ? [] : await selectInBatchesOrThrow<LinhaTelefone>(entidades, (lote) =>
    db.from("anew_entity_phones").select("entity_id, phone_number, country_code, is_primary").in("entity_id", lote));
  const idsMemberships = memberships.map((m) => m.id);
  const scopes = idsMemberships.length === 0 ? [] : await selectInBatchesOrThrow<LinhaAmbito>(idsMemberships, (lote) =>
    db.from("anew_membership_permission_scopes").select("membership_id, permission_code, scope_level").in("membership_id", lote));

  const todos = montarUtilizadores({
    users, memberships, roles, phones, scopes, authUserId: autenticado?.id, tipoSistema: p.tipoSistema,
    orgAtivaId: p.orgAtivaId, orgsVisiveis: ambito,
  });

  const nomePorId = new Map(organizacoesLidas.map((o) => [o.id, o.name]));
  const paiPorId = new Map(hierarquia.map((h) => [h.child_org_id, h.parent_org_id]));
  const todasAsOrgs = new Map([...orgsDosVinculos, ...organizacoesLidas].map((o) => [o.id, o]));
  const organizacoes: Organizacao[] = [...todasAsOrgs.values()]
    .filter((o) => o.type !== "inactive")
    .map((o) => {
      const paiId = paiPorId.get(o.id);
      return { id: o.id, nome: o.name, pai: paiId ? nomePorId.get(paiId) : undefined, paiId };
    });
  const rolesDosVinculos = await lerRolesDosVinculos(roleIds);
  return { todos, organizacoes, rolesDosVinculos };
}

export interface UtilizadoresReais {
  /** Todos os visíveis (inclui os clientes do portal): serve às regras de autorização. */
  todos: Utilizador[];
  /** A lista do separador Utilizadores (sem quem só é cliente do portal). */
  utilizadores: Utilizador[];
  clientes: ClientePortal[];
  organizacoes: Organizacao[];
  rolesDosVinculos: Role[];
  carregando: boolean;
  semOrganizacao: boolean;
  erro: string | null;
  recarregar: () => void;
}

const VAZIO: Utilizador[] = [];

export function useUtilizadoresReais(): UtilizadoresReais {
  const { activeCompany, userType, companies, isLoading: organizacaoACarregar } = useCompany();
  const escopo = usePermissionScope();
  const ativa = activeCompany?.id;
  const escopoOrganizacoes = escopo.getPermissionScope("organizations.view");
  const idsEmpresas = useMemo(() => companies.map((c) => c.id), [companies]);
  const consulta = useQuery({
    queryKey: [...CHAVE_UTILIZADORES, ativa, userType, escopoOrganizacoes, escopo.anewUserId],
    queryFn: () => lerUtilizadoresDaBase({
      orgAtivaId: ativa as string, tipoSistema: userType === "system_admin", escopoOrganizacoes,
      anewUserId: escopo.anewUserId, idsEmpresasDoUtilizador: idsEmpresas,
    }),
    enabled: !!ativa && !escopo.loading,
  });
  const todos = consulta.data?.todos ?? VAZIO;
  const utilizadores = useMemo(() => utilizadoresDaLista(todos), [todos]);
  const clientes = useMemo(() => clientesDoPortal(todos), [todos]);
  return {
    todos, utilizadores, clientes, organizacoes: consulta.data?.organizacoes ?? [], rolesDosVinculos: consulta.data?.rolesDosVinculos ?? [],
    semOrganizacao: !organizacaoACarregar && !ativa,
    carregando: organizacaoACarregar || escopo.loading || (!!ativa && consulta.isPending),
    erro: consulta.error ? mensagemDeErro(consulta.error) : null,
    recarregar: () => { void consulta.refetch(); },
  };
}

/** Invalida a lista depois de uma escrita. */
export function useRecarregarUtilizadores(): () => Promise<void> {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: CHAVE_UTILIZADORES });
}
