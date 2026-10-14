import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { EDITOR_EXEMPLO, PERMISSOES } from "./catalogoExemplo";
import { ArvorePermissoes } from "./ArvorePermissoes";
import { permissoesEfetivas, permissoesVisiveis } from "./logica";
import type { Role, Utilizador } from "./tipos";

interface SeparadorPermissoesUtilizadorProps {
  utilizador: Utilizador;
  roles: Role[];
  aoAbrirRole: (id: string) => void;
}

/** Todas as permissões, no mesmo desenho das roles; as que o utilizador tem dizem de que role vêm (a role abre-se ao clicar). */
export function SeparadorPermissoesUtilizador({ utilizador, roles, aoAbrirRole }: SeparadorPermissoesUtilizadorProps) {
  const { t } = useTranslation();
  const visiveis = useMemo(() => permissoesVisiveis(PERMISSOES, EDITOR_EXEMPLO), []);
  const efetivas = useMemo(
    () => new Map(permissoesEfetivas(utilizador, roles).map((e) => [e.permissao.codigo, e.origens])),
    [utilizador, roles],
  );
  if (efetivas.size === 0) return <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.perms.none")}</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("usersProfiles.perms.intro")}</p>
      <ArvorePermissoes
        permissoes={visiveis}
        concedida={(codigo) => efetivas.has(codigo)}
        extra={(p) => (
          <span className="flex flex-wrap items-center gap-x-1 text-muted-foreground">
            {efetivas.get(p.codigo) && t("usersProfiles.perms.from")}
            {efetivas.get(p.codigo)?.map((r) => (
              <button
                key={r.id} type="button" onClick={() => aoAbrirRole(r.id)}
                className={cn("min-h-11 rounded-sm px-1.5 font-medium text-primary underline-offset-4 hover:underline dark:text-violet-300", FOCO)}
              >
                {r.nome}
              </button>
            ))}
          </span>
        )}
      />
    </div>
  );
}
