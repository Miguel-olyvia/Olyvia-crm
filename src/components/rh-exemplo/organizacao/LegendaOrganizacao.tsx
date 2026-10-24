/** A legenda das cores e dos ícones da página «Organização»: os quatro tipos de nó, «Chefia», o aviso de outro centro e os contadores. */
import { Users } from "lucide-react";
import { ChipChefia, ChipNoutroCentro, ChipTipo } from "@/components/rh-exemplo/organizacao/Chips";
import type { TipoNo } from "@/components/rh-exemplo/organizacao/tipos";
import { useTranslation } from "@/hooks/useTranslation";

const TIPOS: TipoNo[] = ["grupo", "empresa", "filial", "centro"];

export function LegendaOrganizacao() {
  const { t } = useTranslation();
  return (
    <section aria-label={t("rhOrg.legenda")} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{t("rhOrg.legenda")}</span>
      <ul className="flex flex-wrap items-center gap-2">
        {TIPOS.map((tipo) => (
          <li key={tipo}><ChipTipo tipo={tipo} /></li>
        ))}
        <li className="flex items-center gap-1.5"><ChipChefia /> {t("rhOrg.legendaChefia")}</li>
        <li className="flex items-center gap-1.5"><ChipNoutroCentro /> {t("rhOrg.legendaNoutro")}</li>
      </ul>
      <span className="inline-flex items-center gap-1">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        {t("rhOrg.legendaLegais")}; {t("rhOrg.legendaLocais")}
      </span>
    </section>
  );
}
