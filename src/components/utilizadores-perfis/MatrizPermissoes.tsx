import { useMemo } from "react";
import { EDITOR_EXEMPLO, PERMISSOES } from "./catalogoExemplo";
import { ArvorePermissoes } from "./ArvorePermissoes";
import { permissoesVisiveis } from "./logica";
import type { Role } from "./tipos";

/** A matriz da role: todas as permissões que quem edita pode ver, agrupadas como no ecrã de Roles, com o que a role tem. */
export function MatrizPermissoes({ role }: { role: Role }) {
  const visiveis = useMemo(() => permissoesVisiveis(PERMISSOES, EDITOR_EXEMPLO), []);
  const tem = useMemo(() => new Set(role.permissoes), [role]);
  return <ArvorePermissoes permissoes={visiveis} concedida={(codigo) => tem.has(codigo)} />;
}
