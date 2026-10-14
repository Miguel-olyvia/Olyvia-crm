// Os separadores curtos da ficha do utilizador: Resumo e Atividade.
import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { agruparPorMenu } from "./gruposPermissoes";
import { permissoesEfetivas, resumoAmbito } from "./logica";
import { TagEstado } from "./pecas";
import { textoAcesso, textoAmbito } from "./textos";
import type { Organizacao, Role, Utilizador } from "./tipos";

interface ResumoProps {
  utilizador: Utilizador;
  roles: Role[];
  organizacoes: Organizacao[];
  aoAbrirRole: (id: string) => void;
}

export function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-3 border-b border-border/60 py-2 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

export function SeparadorResumo({ utilizador: u, roles, organizacoes, aoAbrirRole }: ResumoProps) {
  const { t } = useTranslation();
  const efetivas = permissoesEfetivas(u, roles);
  const perigosas = efetivas.filter((e) => e.permissao.perigosa).length;
  const rolesDoUtilizador = [...new Map(u.vinculos.flatMap((v) => roles.filter((r) => r.id === v.roleId).map((r) => [r.id, r] as const))).values()];
  return (
    <dl>
      <Linha rotulo={t("usersProfiles.col.state")}><TagEstado ativo={u.ativo} /></Linha>
      <Linha rotulo={t("usersProfiles.summary.email")}>{u.email}</Linha>
      <Linha rotulo={t("usersProfiles.col.lastAccess")}>{textoAcesso(t, u.ultimoAcesso)}</Linha>
      <Linha rotulo={t("usersProfiles.summary.organizations")}>
        {u.vinculos.map((v) => organizacoes.find((o) => o.id === v.organizacaoId)?.nome ?? v.organizacaoId).join(", ")}
      </Linha>
      <Linha rotulo={t("usersProfiles.summary.roles")}>
        <span className="flex flex-wrap gap-x-2">
          {rolesDoUtilizador.map((r) => (
            <button key={r.id} type="button" onClick={() => aoAbrirRole(r.id)} className={cn("min-h-11 rounded-sm font-medium text-primary underline-offset-4 hover:underline dark:text-violet-300", FOCO)}>
              {r.nome}
            </button>
          ))}
        </span>
      </Linha>
      <Linha rotulo={t("usersProfiles.col.scope")}>{textoAmbito(t, resumoAmbito(u, roles))}</Linha>
      <Linha rotulo={t("usersProfiles.summary.permissions")}>
        {t("usersProfiles.summary.permissionsValue", { n: efetivas.length, modules: agruparPorMenu(efetivas.map((e) => e.permissao)).length, danger: perigosas })}
      </Linha>
    </dl>
  );
}

export function SeparadorAtividade({ utilizador: u }: { utilizador: Utilizador }) {
  const { t } = useTranslation();
  if (u.atividade.length === 0) return <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.activity.none")}</p>;
  return (
    <ol className="space-y-2">
      {u.atividade.map((a) => (
        <li key={`${a.data}-${a.texto}`} className="flex gap-3 border-b border-border/60 py-2 text-sm">
          <time dateTime={a.data} className="w-24 shrink-0 tabular-nums text-muted-foreground">{a.data}</time>
          <span className="text-foreground">{a.texto}</span>
        </li>
      ))}
    </ol>
  );
}
