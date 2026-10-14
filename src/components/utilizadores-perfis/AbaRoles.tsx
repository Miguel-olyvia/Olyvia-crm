import { Check, Lock, Minus, Pencil } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { Role } from "./tipos";

interface AbaRolesProps {
  roles: Role[];
  /** Quantos utilizadores tem cada role. */
  utilizadores: Record<string, number>;
  /** Quantas permissões (das visíveis) tem cada role. */
  permissoes: Record<string, number>;
  aoAbrirRole: (id: string) => void;
  /** Filtra a lista de utilizadores por esta role e passa a essa aba. */
  aoVerUtilizadores: (id: string) => void;
  /** Abre o formulário da role (as de sistema abrem só para ver). */
  aoEditar: (id: string) => void;
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

/** A lista de roles: o nome abre a role; o número de utilizadores leva à lista de utilizadores já filtrada. */
export function AbaRoles({ roles, utilizadores, permissoes, aoAbrirRole, aoVerUtilizadores, aoEditar }: AbaRolesProps) {
  const { t } = useTranslation();
  return (
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
          {roles.map((r) => (
            <TableRow key={r.id} className="h-[45px]">
              <TableCell className={CELULA}>
                <button type="button" onClick={() => aoAbrirRole(r.id)} className={cn("min-h-11 rounded-sm text-left font-medium text-foreground", FOCO)}>
                  {r.nome}
                </button>
              </TableCell>
              <TableCell className={cn(CELULA, "hidden font-mono text-xs text-muted-foreground sm:table-cell")}>{r.codigo}</TableCell>
              <TableCell className={CELULA}>
                {utilizadores[r.id] > 0 ? (
                  <button
                    type="button" className={LIGACAO} onClick={() => aoVerUtilizadores(r.id)}
                    aria-label={t("usersProfiles.roles.seeUsers", { n: utilizadores[r.id], name: r.nome })}
                  >
                    {utilizadores[r.id]}
                  </button>
                ) : (
                  <span className="px-2 tabular-nums text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className={cn(CELULA, "hidden md:table-cell")}>
                {r.codigo === "super_admin"
                  ? <Badge variant="default">{t("usersProfiles.roles.fullAccess")}</Badge>
                  : <Badge variant="secondary" className="tabular-nums">{t("usersProfiles.roles.permissionsBadge", { n: permissoes[r.id] })}</Badge>}
              </TableCell>
              <TableCell className={CELULA}>
                {r.sistema ? (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    {t("usersProfiles.roles.system")}
                  </Badge>
                ) : (
                  <Badge variant="secondary">{t("usersProfiles.roles.custom")}</Badge>
                )}
              </TableCell>
              <TableCell className={cn(CELULA, "hidden lg:table-cell")}><SimNao sim={r.podeAssinar} /></TableCell>
              <TableCell className={CELULA}>
                <Button
                  type="button" variant="outline" size="sm" className={cn("min-h-11", FOCO)}
                  aria-label={t("usersProfiles.roles.row.edit", { name: r.nome })} onClick={() => aoEditar(r.id)}
                >
                  <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t("usersProfiles.actions.edit")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
