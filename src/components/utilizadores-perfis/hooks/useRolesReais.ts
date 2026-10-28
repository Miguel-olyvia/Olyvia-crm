// Wrapper: as roles reais da organização ativa (anew_roles + anew_role_permissions), com a leitura de src/pages/Roles.tsx
// (organização ativa e ascendentes, roles de sistema, filtro pelo papel de quem vê, soft delete). Erros sobem: nunca se
// devolve uma lista vazia no lugar de uma falha.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import {
  agruparPermissoesPorRole, mensagemDeErro, roleDaBase, rolesVisiveis, type LinhaRole, type LinhaRolePermissao,
} from "../rolesReais";
import type { Role } from "../tipos";

const MAX_NIVEIS_HIERARQUIA = 10;
const LOTE_ROLES = 10;
const LIMITE_LINHAS = 5000;

/** O id da organização ativa e os das ascendentes (a holding também dá roles), do mais próximo para cima. */
async function idsOrganizacaoEAscendentes(ativa: string): Promise<Set<string>> {
  const ids = new Set<string>([ativa]);
  let atual = ativa;
  for (let i = 0; i < MAX_NIVEIS_HIERARQUIA; i += 1) {
    const { data, error } = await supabase.from("anew_hierarchy").select("parent_org_id").eq("child_org_id", atual).maybeSingle();
    if (error) throw error;
    const pai = (data as { parent_org_id: string | null } | null)?.parent_org_id;
    if (!pai || ids.has(pai)) break;
    ids.add(pai);
    atual = pai;
  }
  return ids;
}

async function lerRoles(ativa: string, papel: string | null, eliminadas: boolean): Promise<LinhaRole[]> {
  const ids = await idsOrganizacaoEAscendentes(ativa);
  const consulta = supabase.from("anew_roles").select("*, created_by").order("name");
  const { data, error } = await (eliminadas ? consulta.not("deleted_at", "is", null) : consulta.is("deleted_at", null));
  if (error) throw error;
  return rolesVisiveis((data ?? []) as unknown as LinhaRole[], papel, ids);
}

async function lerPermissoesDasRoles(roleIds: string[]): Promise<LinhaRolePermissao[]> {
  const todas: LinhaRolePermissao[] = [];
  for (let i = 0; i < roleIds.length; i += LOTE_ROLES) {
    const { data, error } = await supabase
      .from("anew_role_permissions").select("role_id, permission_code").in("role_id", roleIds.slice(i, i + LOTE_ROLES)).limit(LIMITE_LINHAS);
    if (error) throw error;
    todas.push(...((data ?? []) as LinhaRolePermissao[]));
  }
  return todas;
}

export interface RolesReais {
  roles: Role[];
  /** A lista (ou as permissões das roles) ainda estão a carregar. */
  carregando: boolean;
  /** Não há organização ativa: não há roles para mostrar (a página di-lo em vez de mostrar uma lista vazia). */
  semOrganizacao: boolean;
  /** A mensagem da falha de leitura, ou `null`. */
  erro: string | null;
  recarregar: () => void;
}

/** `ligado` falso não lê nada (a lista de eliminadas só se lê quando se pede "Ver eliminadas"). */
export function useRolesReais(eliminadas: boolean, ligado = true): RolesReais {
  const { activeCompany, isLoading: organizacaoACarregar } = useCompany();
  const { anewRoleCode } = usePermissionScope();
  const ativa = activeCompany?.id;
  const linhas = useQuery({
    queryKey: ["anew_roles", ativa, anewRoleCode, eliminadas],
    queryFn: () => lerRoles(ativa as string, anewRoleCode, eliminadas),
    enabled: !!ativa && ligado,
  });
  const roleIds = useMemo(() => (linhas.data ?? []).map((r) => r.id), [linhas.data]);
  const perms = useQuery({
    queryKey: ["anew_role_permissions", roleIds],
    queryFn: () => lerPermissoesDasRoles(roleIds),
    enabled: roleIds.length > 0,
  });
  const roles = useMemo(() => {
    const por = agruparPermissoesPorRole(perms.data ?? []);
    return (linhas.data ?? []).map((l) => roleDaBase(l, por[l.id] ?? []));
  }, [linhas.data, perms.data]);
  const falha = linhas.error ?? perms.error;
  return {
    roles,
    semOrganizacao: !organizacaoACarregar && !ativa,
    carregando: ligado && (organizacaoACarregar || (!!ativa && (linhas.isPending || (roleIds.length > 0 && perms.isPending)))),
    erro: falha ? mensagemDeErro(falha) : null,
    recarregar: () => { void linhas.refetch(); void perms.refetch(); },
  };
}
