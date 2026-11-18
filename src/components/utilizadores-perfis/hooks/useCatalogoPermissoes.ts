// Wrapper: o catálogo real de permissões (anew_permissions) e quem está a editar, para a matriz das roles. Mesma leitura e
// mesma regra de visibilidade de src/pages/Roles.tsx: só módulos do menu, e quem não é administrador de sistema só vê as
// permissões que ele próprio tem.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CATALOGO_PERMISSOES_QUERY_KEY, lerCatalogoPermissoes } from "@/lib/catalogoPermissoes";
import { usePermissions } from "@/hooks/usePermissions";
import { permissoesVisiveis, type Editor } from "../logica";
import { mensagemDeErro, permissoesDoMenu } from "../rolesReais";
import type { Permissao } from "../tipos";

export interface CatalogoPermissoes {
  /** Todas as permissões em uso (permissoesEmUso.ts); as escondidas não entram. */
  catalogo: Permissao[];
  /** Quem edita: administrador de sistema ou as permissões que tem. */
  editor: Editor;
  /** As que quem edita pode ver e dar (a matriz mostra só estas). */
  visiveis: Permissao[];
  carregando: boolean;
  erro: string | null;
}

export function useCatalogoPermissoes(): CatalogoPermissoes {
  const { permissions, isSystemAdmin, loading } = usePermissions();
  const consulta = useQuery({ queryKey: CATALOGO_PERMISSOES_QUERY_KEY, queryFn: lerCatalogoPermissoes });
  const catalogo = useMemo(() => permissoesDoMenu(consulta.data ?? []), [consulta.data]);
  const editor = useMemo<Editor>(() => ({ administradorSistema: !!isSystemAdmin, codigos: permissions ?? [] }), [isSystemAdmin, permissions]);
  const visiveis = useMemo(() => permissoesVisiveis(catalogo, editor), [catalogo, editor]);
  return { catalogo, editor, visiveis, carregando: loading || consulta.isPending, erro: consulta.error ? mensagemDeErro(consulta.error) : null };
}
