import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ArvorePermissoes } from "./ArvorePermissoes";
import { permissoesEfetivas, permissoesVisiveis, type Editor } from "./logica";
import type { Permissao, Role, Utilizador } from "./tipos";

interface SeparadorPermissoesUtilizadorProps {
  utilizador: Utilizador;
  roles: Role[];
  /** As permissões do catálogo real (anew_permissions). */
  catalogo: Permissao[];
  /** Quem vê: só vê as permissões que ele próprio tem (regra de Roles.tsx), salvo administrador de sistema. */
  editor: Editor;
  /** Sem isto (no formulário) a role de origem é só texto, não um botão que abre outra ficha. */
  aoAbrirRole?: (id: string) => void;
}

/** Todas as permissões, no mesmo desenho das roles; as que o utilizador tem dizem de que role vêm (a role abre-se ao clicar). */
export function SeparadorPermissoesUtilizador({ utilizador, roles, catalogo, editor, aoAbrirRole }: SeparadorPermissoesUtilizadorProps) {
  const { t } = useTranslation();
  const visiveis = useMemo(() => permissoesVisiveis(catalogo, editor), [catalogo, editor]);
  const efetivas = useMemo(
    () => new Map(permissoesEfetivas(utilizador, roles, visiveis).map((e) => [e.permissao.codigo, e.origens])),
    [utilizador, roles, visiveis],
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
            {efetivas.get(p.codigo)?.map((r) => (aoAbrirRole ? (
              <button
                key={r.id} type="button" onClick={() => aoAbrirRole(r.id)}
                className={cn("min-h-11 rounded-sm px-1.5 font-medium text-primary underline-offset-4 hover:underline dark:text-violet-300", FOCO)}
              >
                {r.nome}
              </button>
            ) : <span key={r.id} className="px-1.5 font-medium text-foreground">{r.nome}</span>))}
          </span>
        )}
      />
    </div>
  );
}
