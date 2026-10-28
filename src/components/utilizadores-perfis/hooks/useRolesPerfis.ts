// Wrapper: tudo o que o separador Roles da página precisa, num só sítio (a página só liga as peças). Junta as roles reais, o
// catálogo de permissões, os modelos, a contagem de utilizadores por role, as autorizações e as ações de gravar.
import { useMemo, useState } from "react";
import { contarPermissoesPorRole } from "../logica";
import type { AutorizacoesRole } from "../rolesReais";
import type { Role } from "../tipos";
import { useAutorizacoesRoles } from "./useAutorizacoesRoles";
import { useCatalogoPermissoes, type CatalogoPermissoes } from "./useCatalogoPermissoes";
import { useContagemUtilizadoresPorRole, type ContagemPorRole } from "./useContagemUtilizadoresPorRole";
import { useGuardarRole, type AcoesRole } from "./useGuardarRole";
import { useModelosRole, type ModelosRole } from "./useModelosRole";
import { useRolesReais } from "./useRolesReais";

export interface RolesPerfis {
  /** As roles ativas da organização: servem a todos os separadores (filtros, atribuição de roles). */
  roles: Role[];
  /** O que o separador Roles mostra: as ativas, ou só as eliminadas com "Ver eliminadas". */
  lista: Role[];
  estado: { carregando: boolean; erro: string | null; semOrganizacao: boolean };
  recarregar: () => void;
  verEliminadas: boolean;
  mudarVerEliminadas: (v: boolean) => void;
  catalogo: CatalogoPermissoes;
  modelos: ModelosRole;
  contagem: ContagemPorRole;
  permissoesPorRole: Record<string, number>;
  autorizacoes: AutorizacoesRole;
  acoes: AcoesRole;
}

export function useRolesPerfis(): RolesPerfis {
  const [verEliminadas, mudarVerEliminadas] = useState(false);
  const ativas = useRolesReais(false);
  const eliminadas = useRolesReais(true, verEliminadas);
  const origem = verEliminadas ? eliminadas : ativas;
  const catalogo = useCatalogoPermissoes();
  const modelos = useModelosRole(catalogo.editor);
  const ids = useMemo(() => [...ativas.roles, ...eliminadas.roles].map((r) => r.id), [ativas.roles, eliminadas.roles]);
  const contagem = useContagemUtilizadoresPorRole(ids);
  const permissoesPorRole = useMemo(
    () => contarPermissoesPorRole([...ativas.roles, ...eliminadas.roles], catalogo.visiveis), [ativas.roles, eliminadas.roles, catalogo.visiveis],
  );
  return {
    roles: ativas.roles,
    lista: origem.roles,
    estado: { carregando: origem.carregando, erro: origem.erro, semOrganizacao: origem.semOrganizacao },
    recarregar: origem.recarregar,
    verEliminadas, mudarVerEliminadas,
    catalogo, modelos, contagem, permissoesPorRole,
    autorizacoes: useAutorizacoesRoles(),
    acoes: useGuardarRole(),
  };
}
