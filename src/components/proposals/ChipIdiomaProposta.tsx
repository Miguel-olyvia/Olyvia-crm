import { idiomasDoDocumento, nomeDoIdioma, IDIOMA_BASE } from "@/lib/idiomaDocumento";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

export interface ChipIdiomaPropostaProps {
  /** proposals.language; ausente ou só português não mostra nada. */
  language?: string | null;
  className?: string;
}

/** «PT · EN»: o idioma do documento da proposta, discreto, só quando não é só português. */
export function ChipIdiomaProposta({ language, className }: ChipIdiomaPropostaProps) {
  const { t } = useTranslation();
  const idiomas = idiomasDoDocumento({ language });
  if (idiomas.length === 1 && idiomas[0] === IDIOMA_BASE) return null;
  return (
    <span
      title={`${t("contractTemplates.versoes.seletor.rotulo")}: ${idiomas.map(nomeDoIdioma).join(" + ")}`}
      className={cn(
        "inline-flex items-center rounded border border-border px-1.5 py-px text-[10px] font-medium leading-none tracking-wide text-muted-foreground",
        className,
      )}
    >
      {idiomas.map((c) => c.toUpperCase()).join(" · ")}
    </span>
  );
}
