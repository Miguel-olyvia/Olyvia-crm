/** O estado de uma hora extra: ícone + texto (a cor nunca é o único indicador). */
import { useTranslation } from "@/hooks/useTranslation";
import { ASPECTO_ESTADO_HE } from "./aspectoEstadoHE";
import type { EstadoVisivelHE } from "./horasExtraRegras";

export function EstadoHoraExtraBadge({ estado }: { estado: EstadoVisivelHE }) {
  const { t } = useTranslation();
  const { Icone, classes } = ASPECTO_ESTADO_HE[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {t(`rhFluxosC.he.estado.${estado}`)}
    </span>
  );
}
