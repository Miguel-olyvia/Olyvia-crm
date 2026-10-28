import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { ArvorePermissoes } from "./ArvorePermissoes";
import type { Permissao, Role } from "./tipos";

/** Roles com acesso total: como em Roles.tsx, não se listam permissões individuais. */
export const ehAcessoTotal = (codigo: string): boolean => codigo === "super_admin" || codigo === "system_admin";

interface MatrizPermissoesProps {
  role: Role;
  /** As permissões que quem edita pode ver (vêm da base, pela página). */
  visiveis: Permissao[];
}

/** A matriz da role: todas as permissões que quem edita pode ver, agrupadas como no ecrã de Roles, com o que a role tem. */
export function MatrizPermissoes({ role, visiveis }: MatrizPermissoesProps) {
  const { t } = useTranslation();
  const tem = useMemo(() => new Set(role.permissoes), [role]);
  if (ehAcessoTotal(role.codigo)) return <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.roles.fullAccessNote")}</p>;
  return <ArvorePermissoes permissoes={visiveis} concedida={(codigo) => tem.has(codigo)} />;
}
