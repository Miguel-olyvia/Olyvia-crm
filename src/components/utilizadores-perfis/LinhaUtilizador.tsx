import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AvatarPessoa } from "@/components/pessoas/AvatarPessoa";
import { ehProtegido, resumoAmbito } from "./logica";
import { ChipVinculo, MaisVinculos, TagEstado, type VinculoVisivel } from "./pecas";
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

/** Os vínculos ativos com organização e role conhecidas, pela ordem do utilizador (como /users, que só mostra os ativos). */
function vinculosVisiveis(u: Utilizador, roles: Role[], organizacoes: Organizacao[]): VinculoVisivel[] {
  return u.vinculos.flatMap((v) => {
    const role = roles.find((r) => r.id === v.roleId);
    const organizacao = organizacoes.find((o) => o.id === v.organizacaoId);
    return v.ativo && role && organizacao ? [{ organizacao, role }] : [];
  });
}

/** Uma linha compacta (cerca de 45 px). O nome é o botão que abre a ficha; o chip de organização e role abre a role. */
export function LinhaUtilizador({ utilizador: u, roles, organizacoes, aoAbrir, aoAbrirRole }: LinhaUtilizadorProps) {
  const { t } = useTranslation();
  const vinculos = vinculosVisiveis(u, roles, organizacoes);
  const resto = vinculos.length - MAX_CHIPS;
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
        <div className="flex items-center gap-1">
          {vinculos.slice(0, MAX_CHIPS).map((v) => <ChipVinculo key={v.organizacao.id} vinculo={v} aoAbrir={aoAbrirRole} />)}
          {vinculos.length === 0 && <span className="text-muted-foreground">-</span>}
          {resto > 0 && <MaisVinculos vinculos={vinculos} restantes={resto} />}
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
