import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { agruparPorModulo, permissoesEfetivas } from "./logica";
import { MarcaPerigosa } from "./pecas";
import type { Role, Utilizador } from "./tipos";

interface SeparadorPermissoesUtilizadorProps {
  utilizador: Utilizador;
  roles: Role[];
  aoAbrirRole: (id: string) => void;
}

/** As permissões efetivas por módulo, cada uma com a role de onde vem (a role abre-se ao clicar). */
export function SeparadorPermissoesUtilizador({ utilizador, roles, aoAbrirRole }: SeparadorPermissoesUtilizadorProps) {
  const { t } = useTranslation();
  const grupos = agruparPorModulo(permissoesEfetivas(utilizador, roles));
  if (grupos.length === 0) return <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.perms.none")}</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("usersProfiles.perms.intro")}</p>
      {grupos.map(({ modulo, itens }) => (
        <Seccao key={modulo} titulo={t(`usersProfiles.module.${modulo}`)}>
          <ul className="divide-y divide-border/60">
            {itens.map(({ permissao, origens }) => (
              <li key={permissao.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                <span className="min-w-28 font-medium text-foreground">{t(`usersProfiles.action.${permissao.acao}`)}</span>
                {permissao.perigosa && <MarcaPerigosa />}
                <span className="ml-auto flex flex-wrap items-center gap-x-1 text-muted-foreground">
                  {t("usersProfiles.perms.from")}
                  {origens.map((r) => (
                    <button
                      key={r.id} type="button" onClick={() => aoAbrirRole(r.id)}
                      className={cn("min-h-11 rounded-sm px-1.5 font-medium text-primary underline-offset-4 hover:underline dark:text-violet-300", FOCO)}
                    >
                      {r.nome}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Seccao>
      ))}
    </div>
  );
}
