import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AvatarPessoa } from "@/components/pessoas/AvatarPessoa";
import { ehProtegido, resumoAmbito } from "./logica";
import { ChipRole, TagEstado } from "./pecas";
import { textoAcesso, textoAmbito } from "./textos";
import type { Organizacao, Role, Utilizador } from "./tipos";

interface LinhaUtilizadorProps {
  utilizador: Utilizador;
  roles: Role[];
  organizacoes: Organizacao[];
  aoAbrir: (id: string) => void;
  aoAbrirRole: (id: string) => void;
}

const CELULA = "px-3 py-0 align-middle text-sm";
const MAX_CHIPS = 1;

/** Uma linha compacta (cerca de 45 px). O nome é o botão que abre a ficha; os chips de role abrem a role. */
export function LinhaUtilizador({ utilizador: u, roles, organizacoes, aoAbrir, aoAbrirRole }: LinhaUtilizadorProps) {
  const { t } = useTranslation();
  const vinculos = u.vinculos.flatMap((v) => {
    const role = roles.find((r) => r.id === v.roleId);
    return role ? [{ v, role, org: organizacoes.find((o) => o.id === v.organizacaoId)?.nome ?? v.organizacaoId }] : [];
  });
  const visiveis = vinculos.slice(0, MAX_CHIPS);
  const resto = vinculos.slice(MAX_CHIPS);
  return (
    <TableRow className="h-[45px] cursor-pointer" onClick={() => aoAbrir(u.id)}>
      <TableCell className={CELULA}>
        <button
          type="button" onClick={(e) => { e.stopPropagation(); aoAbrir(u.id); }}
          className={cn("flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm text-left", FOCO)}
        >
          <AvatarPessoa nome={u.nome} pequeno />
          <span className="min-w-0">
            <span className="flex items-center gap-1 truncate font-medium text-foreground">
              {u.nome}
              {ehProtegido(u, roles) && (
                <>
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">{t("usersProfiles.protected")}</span>
                </>
              )}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
          </span>
        </button>
      </TableCell>
      <TableCell className={CELULA}>
        <div className="flex flex-wrap items-center gap-1.5">
          {visiveis.map(({ v, role, org }) => (
            <span key={v.organizacaoId} className="inline-flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{org}</span>
              <ChipRole role={role} aoAbrir={aoAbrirRole} />
            </span>
          ))}
          {resto.length > 0 && (
            <span className="text-xs font-medium text-foreground" title={resto.map((r) => `${r.org}: ${r.role.nome}`).join(", ")}>
              <span aria-hidden="true">+{resto.length}</span>
              <span className="sr-only">{t("usersProfiles.moreLinks", { n: resto.length })}</span>
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className={cn(CELULA, "hidden md:table-cell")}>{textoAmbito(t, resumoAmbito(u, roles))}</TableCell>
      <TableCell className={CELULA}><TagEstado ativo={u.ativo} /></TableCell>
      <TableCell className={cn(CELULA, "hidden whitespace-nowrap text-muted-foreground lg:table-cell")}>
        {textoAcesso(t, u.ultimoAcesso)}
      </TableCell>
    </TableRow>
  );
}
