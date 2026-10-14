// Peças pequenas partilhadas pelos ecrãs: estado, marca de perigosa e o chip de organização e role (o mesmo de /users).
import { CircleCheck, CircleOff, MailCheck, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { badgeVariants } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { Organizacao, Role } from "./tipos";

/** Ativo, Convidado (ativo mas ainda sem entrar) ou Inativo: ícone mais texto, nunca só cor. */
export function TagEstado({ ativo, convidado }: { ativo: boolean; convidado?: boolean }) {
  const { t } = useTranslation();
  const convite = ativo && !!convidado;
  const Icone = convite ? MailCheck : ativo ? CircleCheck : CircleOff;
  const texto = convite ? "usersProfiles.state.invited" : ativo ? "usersProfiles.state.active" : "usersProfiles.state.inactive";
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-sm", ativo ? "text-success" : "text-muted-foreground")}>
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-foreground">{t(texto)}</span>
    </span>
  );
}

/** Um vínculo de um utilizador: a organização da plataforma e a role que tem nela. */
export interface VinculoVisivel {
  organizacao: Organizacao;
  role: Role;
}

const RAIZ_ALVO = cn("inline-flex min-h-11 items-center rounded-sm", FOCO);

/**
 * O chip da lista de /users (UsersNew.tsx): selo com contorno, «Organização (Role)», a role em cor de destaque, no máximo
 * 160 px com reticências. Aqui é também um botão (alvo de 44 px) que abre a role; a cor nunca é o único indicador, porque a
 * role vem escrita entre parênteses.
 */
export function ChipVinculo({ vinculo, aoAbrir }: { vinculo: VinculoVisivel; aoAbrir: (id: string) => void }) {
  const { t } = useTranslation();
  const { organizacao, role } = vinculo;
  return (
    <button
      type="button" className={RAIZ_ALVO} title={`${organizacao.nome} - ${role.nome}`}
      aria-label={t("usersProfiles.link.open", { role: role.nome, org: organizacao.nome })}
      onClick={(e) => { e.stopPropagation(); aoAbrir(role.id); }}
    >
      <span className={cn(badgeVariants({ variant: "outline" }), "block max-w-[160px] truncate text-xs font-semibold")}>
        {organizacao.nome}
        <span className="ml-1 text-primary dark:text-violet-300">({role.nome})</span>
      </span>
    </button>
  );
}

/** «+N» com a lista de todos os vínculos ativos, como o popover de /users: organização, grupo a que pertence e role. */
export function MaisVinculos({ vinculos, restantes }: { vinculos: VinculoVisivel[]; restantes: number }) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button" onClick={(e) => e.stopPropagation()} aria-label={t("usersProfiles.moreLinks", { n: restantes })}
          className={cn(RAIZ_ALVO, "min-w-11 justify-center")}
        >
          <span aria-hidden="true" className={cn(badgeVariants({ variant: "secondary" }), "text-xs")}>+{restantes}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="border-b p-3">
          <h4 className="text-sm font-medium">{t("usersProfiles.summary.organizations")}</h4>
          <p className="text-xs text-muted-foreground">{t("usersProfiles.links.total", { n: vinculos.length })}</p>
        </div>
        <ul className="max-h-[200px] overflow-y-auto">
          {vinculos.map(({ organizacao, role }) => (
            <li key={organizacao.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{organizacao.nome}</p>
                {organizacao.pai && <p className="truncate text-xs text-muted-foreground">{organizacao.pai}</p>}
              </div>
              <span className={cn(badgeVariants({ variant: "outline" }), "ml-2 shrink-0 text-xs")}>{role.nome}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Marca de permissão perigosa: ícone mais texto. */
export function MarcaPerigosa() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-destructive px-1.5 py-0.5 text-xs font-medium text-destructive">
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
      {t("usersProfiles.dangerous")}
    </span>
  );
}
