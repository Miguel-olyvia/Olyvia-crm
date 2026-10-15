/** Os chips de texto da página «Organização»: o tipo do nó (com ícone) e o aviso «Trabalha noutro centro». */
import { ArrowRightLeft } from "lucide-react";
import { ICONE_TIPO } from "@/components/rh-exemplo/organizacao/iconesTipo";
import { useTranslation } from "@/hooks/useTranslation";
import type { TipoNo } from "@/components/rh-exemplo/organizacao/tipos";

/** A cor nunca é o único indicador: cada tipo tem também um ícone e a palavra. */
const COR_TIPO: Record<TipoNo, string> = {
  grupo: "border-foreground/30 bg-muted text-foreground",
  empresa: "border-sky-600/40 bg-sky-50 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  filial: "border-emerald-600/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  centro: "border-amber-600/40 bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
};

const COR_NOUTRO = "border-violet-600/40 bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200";
const BASE = "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium";

export function ChipTipo({ tipo }: { tipo: TipoNo }) {
  const { t } = useTranslation();
  const Icone = ICONE_TIPO[tipo];
  return (
    <span className={`${BASE} ${COR_TIPO[tipo]}`}>
      <Icone className="h-3 w-3" aria-hidden="true" />
      {t(`rhOrg.tipo.${tipo}`)}
    </span>
  );
}

/** Texto livre num chip do mesmo estilo, com o ícone de «noutro centro» (ex.: «Vínculo legal: Filial Lisboa»). */
export function ChipNoutroCentro({ texto }: { texto?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`${BASE} ${COR_NOUTRO}`}>
      <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
      {texto ?? t("rhOrg.noutroCentro")}
    </span>
  );
}
