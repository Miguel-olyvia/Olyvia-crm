// Peças pequenas partilhadas pelos ecrãs: estado, chip de role, marca de perigosa e textos de acesso e âmbito.
import { CircleCheck, CircleOff, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { Role } from "./tipos";

/** Ativo ou Inativo: ícone mais texto, nunca só cor. */
export function TagEstado({ ativo }: { ativo: boolean }) {
  const { t } = useTranslation();
  const Icone = ativo ? CircleCheck : CircleOff;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-sm", ativo ? "text-success" : "text-muted-foreground")}>
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-foreground">{ativo ? t("usersProfiles.state.active") : t("usersProfiles.state.inactive")}</span>
    </span>
  );
}

/** A role de uma pessoa, em chip; clicar abre a role. */
export function ChipRole({ role, aoAbrir }: { role: Role; aoAbrir: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t("usersProfiles.role.open", { name: role.nome })}
      onClick={(e) => { e.stopPropagation(); aoAbrir(role.id); }}
      className={cn("inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-input bg-card px-3 text-xs text-foreground hover:border-foreground/40 motion-reduce:transition-none", FOCO)}
    >
      {role.nome}
    </button>
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
