import { useState } from "react";
import { Check, Lock, Minus, Pencil, RotateCcw, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ehAcessoTotal } from "./MatrizPermissoes";
import { filtrarRoles } from "./rolesReais";
import type { ResultadoMutacao, Role } from "./tipos";

/** O estado da leitura das roles: nunca se mostra uma lista vazia no lugar de um erro ou de uma carga em curso. */
export interface EstadoRoles {
  carregando: boolean;
  erro: string | null;
  semOrganizacao: boolean;
}

interface AbaRolesProps {
  roles: Role[];
  estado: EstadoRoles;
  /** Quantos utilizadores tem cada role (da base); sem a role aqui, a contagem não está disponível. */
  utilizadores: Record<string, number>;
  /** Quantas permissões (das visíveis) tem cada role. */
  permissoes: Record<string, number>;
  /** "Ver eliminadas" ligado: a lista mostra só as roles eliminadas. */
  eliminadas: boolean;
  aoMudarEliminadas: (v: boolean) => void;
  aoTentarDeNovo: () => void;
  aoAbrirRole: (id: string) => void;
  /** Filtra a lista de utilizadores por esta role e passa a essa aba. */
  aoVerUtilizadores: (id: string) => void;
  /** Abre o formulário da role (as de sistema, ou sem permissão, abrem só para ver). */
  aoEditar: (id: string) => void;
  podeRestaurar: (r: Role) => boolean;
  aoRestaurar: (r: Role) => Promise<ResultadoMutacao>;
}

const CABECA = "h-11 px-3 text-xs font-medium text-muted-foreground";
const CELULA = "px-3 py-0 align-middle text-sm";
const LIGACAO = cn("inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-2 font-medium tabular-nums text-primary underline-offset-4 hover:underline dark:text-violet-300", FOCO);

export function SimNao({ sim }: { sim: boolean }) {
  const { t } = useTranslation();
  const Icone = sim ? Check : Minus;
  return (
    <span className="inline-flex items-center gap-1">
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      {sim ? t("usersProfiles.yes") : t("usersProfiles.no")}
    </span>
  );
}

function Mensagem({ children, alerta = false }: { children: React.ReactNode; alerta?: boolean }) {
  return <p role={alerta ? "alert" : "status"} className={cn("rounded-md border p-6 text-sm", alerta ? "border-destructive/50 text-destructive" : "text-muted-foreground")}>{children}</p>;
}

function CelulaUtilizadores({ role, n, aoVer }: { role: Role; n: number | undefined; aoVer: (id: string) => void }) {
  const { t } = useTranslation();
  if (n === undefined) return <span className="px-2 text-muted-foreground" aria-label={t("usersProfiles.roles.countUnavailable")}>—</span>;
  if (n === 0) return <span className="px-2 tabular-nums text-muted-foreground">0</span>;
  return (
    <button type="button" className={LIGACAO} onClick={() => aoVer(role.id)} aria-label={t("usersProfiles.roles.seeUsers", { n, name: role.nome })}>
      {n}
    </button>
  );
}

function Barra({ texto, aoMudarTexto, eliminadas, aoMudarEliminadas }: { texto: string; aoMudarTexto: (v: string) => void; eliminadas: boolean; aoMudarEliminadas: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="relative min-w-52 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search" value={texto} onChange={(e) => aoMudarTexto(e.target.value)}
          aria-label={t("usersProfiles.roles.search")} placeholder={t("usersProfiles.roles.search")} className={cn("h-11 pl-9", FOCO)}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <Switch checked={eliminadas} onCheckedChange={aoMudarEliminadas} className={FOCO} />
        {t("usersProfiles.roles.showDeleted")}
      </label>
    </div>
  );
}

function BotaoRestaurar({ role, aoRestaurar }: { role: Role; aoRestaurar: AbaRolesProps["aoRestaurar"] }) {
  const { t } = useTranslation();
  const [aOcupar, setAOcupar] = useState(false);
  const restaurar = async () => {
    setAOcupar(true);
    const r = await aoRestaurar(role);
    setAOcupar(false);
    if (r.ok) toast.success(t("usersProfiles.roles.restore.done", { name: role.nome }));
    else toast.error(r.erro);
  };
  return (
    <Button type="button" variant="outline" size="sm" className={cn("min-h-11", FOCO)} disabled={aOcupar} aria-label={t("usersProfiles.roles.restore.row", { name: role.nome })} onClick={restaurar}>
      <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {t("usersProfiles.roles.restore")}
    </Button>
  );
}

/** A lista de roles: o nome abre a role; o número de utilizadores leva à lista de utilizadores já filtrada. */
export function AbaRoles(p: AbaRolesProps) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const { roles, estado } = p;
  const visiveis = filtrarRoles(roles, texto);
  const corpo = estado.semOrganizacao ? <Mensagem>{t("usersProfiles.roles.noOrg")}</Mensagem>
    : estado.erro ? (
      <Mensagem alerta>
        {t("usersProfiles.roles.error", { message: estado.erro })}{" "}
        <Button type="button" variant="outline" className="ml-2 min-h-11" onClick={p.aoTentarDeNovo}>{t("usersProfiles.roles.retry")}</Button>
      </Mensagem>
    )
    : estado.carregando ? <Mensagem>{t("usersProfiles.roles.loading")}</Mensagem>
    : roles.length === 0 ? <Mensagem>{t(p.eliminadas ? "usersProfiles.roles.emptyDeleted" : "usersProfiles.roles.empty")}</Mensagem>
    : visiveis.length === 0 ? <Mensagem>{t("usersProfiles.roles.noMatch")}</Mensagem>
    : null;
  return (
    <div className="space-y-4">
      <Barra texto={texto} aoMudarTexto={setTexto} eliminadas={p.eliminadas} aoMudarEliminadas={p.aoMudarEliminadas} />
      {corpo ?? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={CABECA}>{t("usersProfiles.roles.col.name")}</TableHead>
                <TableHead className={`${CABECA} hidden sm:table-cell`}>{t("usersProfiles.roles.col.code")}</TableHead>
                <TableHead className={CABECA}>{t("usersProfiles.roles.col.users")}</TableHead>
                <TableHead className={`${CABECA} hidden md:table-cell`}>{t("usersProfiles.roles.col.permissions")}</TableHead>
                <TableHead className={CABECA}>{t("usersProfiles.roles.col.type")}</TableHead>
                <TableHead className={`${CABECA} hidden lg:table-cell`}>{t("usersProfiles.roles.col.signs")}</TableHead>
                <TableHead className={CABECA}>{t("usersProfiles.roles.col.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((r) => (
                <TableRow key={r.id} className="h-[45px]">
                  <TableCell className={CELULA}>
                    <button type="button" onClick={() => p.aoAbrirRole(r.id)} className={cn("min-h-11 rounded-sm text-left font-medium text-foreground", FOCO)}>
                      {r.nome}
                    </button>
                  </TableCell>
                  <TableCell className={cn(CELULA, "hidden font-mono text-xs text-muted-foreground sm:table-cell")}>{r.codigo}</TableCell>
                  <TableCell className={CELULA}><CelulaUtilizadores role={r} n={p.utilizadores[r.id]} aoVer={p.aoVerUtilizadores} /></TableCell>
                  <TableCell className={cn(CELULA, "hidden md:table-cell")}>
                    {ehAcessoTotal(r.codigo)
                      ? <Badge variant="default">{t("usersProfiles.roles.fullAccess")}</Badge>
                      : <Badge variant="secondary" className="tabular-nums">{t("usersProfiles.roles.permissionsBadge", { n: p.permissoes[r.id] ?? 0 })}</Badge>}
                  </TableCell>
                  <TableCell className={CELULA}>
                    {r.sistema ? (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        {t("usersProfiles.roles.system")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t(r.eliminada ? "usersProfiles.roles.deletedTag" : "usersProfiles.roles.custom")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className={cn(CELULA, "hidden lg:table-cell")}><SimNao sim={r.podeAssinar} /></TableCell>
                  <TableCell className={CELULA}>
                    {r.eliminada ? (p.podeRestaurar(r) ? <BotaoRestaurar role={r} aoRestaurar={p.aoRestaurar} /> : null) : (
                      <Button
                        type="button" variant="outline" size="sm" className={cn("min-h-11", FOCO)}
                        aria-label={t("usersProfiles.roles.row.edit", { name: r.nome })} onClick={() => p.aoEditar(r.id)}
                      >
                        <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {t("usersProfiles.actions.edit")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
