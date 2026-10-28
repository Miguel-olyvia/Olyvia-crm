// Os separadores curtos da ficha do utilizador: Resumo e Atividade.
import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { agruparPorMenu } from "./gruposPermissoes";
import type { EntradaHistorico, EstadoAtividade } from "./historicoUtilizador";
import { permissoesEfetivas, resumoAmbito } from "./logica";
import { TagEstado } from "./pecas";
import { textoAmbito } from "./textos";
import type { Organizacao, Permissao, Role, Utilizador } from "./tipos";

interface ResumoProps {
  utilizador: Utilizador;
  roles: Role[];
  organizacoes: Organizacao[];
  catalogo: Permissao[];
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

export function SeparadorResumo({ utilizador: u, roles, organizacoes, catalogo, aoAbrirRole }: ResumoProps) {
  const { t } = useTranslation();
  const efetivas = permissoesEfetivas(u, roles, catalogo);
  const perigosas = efetivas.filter((e) => e.permissao.perigosa).length;
  const ativos = u.vinculos.filter((v) => v.ativo);
  const rolesDoUtilizador = [...new Map(ativos.flatMap((v) => roles.filter((r) => r.id === v.roleId).map((r) => [r.id, r] as const))).values()];
  return (
    <dl>
      <Linha rotulo={t("usersProfiles.col.state")}><TagEstado ativo={u.ativo} /></Linha>
      <Linha rotulo={t("usersProfiles.summary.email")}>{u.email}</Linha>
      {u.telefone && <Linha rotulo={t("usersProfiles.form.user.phone")}>{u.telefone}</Linha>}
      {u.posicao && <Linha rotulo={t("usersProfiles.form.user.position")}>{u.posicao}</Linha>}
      <Linha rotulo={t("usersProfiles.summary.organizations")}>
        {ativos.map((v) => organizacoes.find((o) => o.id === v.organizacaoId)?.nome ?? v.organizacaoId).join(", ")}
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
      <Linha rotulo={t("usersProfiles.col.scope")}>{textoAmbito(t, resumoAmbito(u, roles, catalogo))}</Linha>
      <Linha rotulo={t("usersProfiles.summary.permissions")}>
        {t("usersProfiles.summary.permissionsValue", { n: efetivas.length, modules: agruparPorMenu(efetivas.map((e) => e.permissao)).length, danger: perigosas })}
      </Linha>
    </dl>
  );
}

type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

/** A frase de uma alteração: o que mudou e quem a fez. */
export function textoDaEntrada(e: EntradaHistorico, t: Traduzir): string {
  const vazio = t("usersProfiles.activity.empty");
  const campo = e.campo ?? "";
  const base = e.tipo === "created" ? t("usersProfiles.activity.created")
    : e.tipo === "status_changed" ? t("usersProfiles.activity.statusChanged", { from: e.antes ?? vazio, to: e.depois ?? vazio })
    : e.tipo === "updated" ? t("usersProfiles.activity.updated", { field: campo, from: e.antes ?? vazio, to: e.depois ?? vazio })
    : t("usersProfiles.activity.other");
  return e.quem ? `${base} (${e.quem})` : base;
}

/** A atividade vem do histórico real: carregar, falha e sem permissão dizem-se; nunca passam por «sem atividade». */
export function SeparadorAtividade({ atividade }: { atividade: EstadoAtividade }) {
  const { t } = useTranslation();
  if (atividade.estado === "carregando") return <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.activity.loading")}</p>;
  if (atividade.estado === "semPermissao") return <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.activity.noPermission")}</p>;
  if (atividade.estado === "erro") return <p role="alert" className="text-sm text-destructive">{t("usersProfiles.activity.error", { message: atividade.mensagem })}</p>;
  if (atividade.entradas.length === 0) return <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.activity.none")}</p>;
  return (
    <ol className="space-y-2">
      {atividade.entradas.map((a) => (
        <li key={a.id} className="flex gap-3 border-b border-border/60 py-2 text-sm">
          <time dateTime={a.data} className="w-24 shrink-0 tabular-nums text-muted-foreground">{a.data}</time>
          <span className="text-foreground">{textoDaEntrada(a, t)}</span>
        </li>
      ))}
    </ol>
  );
}
