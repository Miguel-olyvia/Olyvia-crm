/**
 * A legenda dos PADROES visuais do mapa de ausencias (`MapaMensal`).
 *
 * Nao lista os tipos de ausencia com as suas cores reais -- essa cor e
 * configuravel por organizacao, por isso "verde = ferias" seria falso noutra
 * organizacao. Os tipos, com nome ao lado da cor, ja aparecem via
 * `TipoEtiqueta`/os filtros do proprio ecra. O que falta explicar aqui e o
 * que a FORMA e a INTENSIDADE da celula significam, que e sempre igual
 * independentemente da organizacao: solido = aprovado, riscado = pendente,
 * `bg-muted` = dia nao util, `bg-accent/40` = sem marcacao.
 *
 * Vive UMA VEZ no ecra pai (`AusenciasOrganizacao`), nao dentro de
 * `MapaMensal` -- este e repetido ate 12 vezes no modo Ano, e repetir a
 * legenda outras tantas seria so ruido.
 */
import { useTranslation } from "@/hooks/useTranslation";

const COR_EXEMPLO = "#94a3b8";

export function LegendaMapaAusencias() {
  const { t } = useTranslation();

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: COR_EXEMPLO }}
        />
        <span>{t("hr.ausencias.organizacao.legendaAprovado")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-[2px]"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, ${COR_EXEMPLO}, ${COR_EXEMPLO} 3px, transparent 3px, transparent 6px)`,
            boxShadow: `inset 0 0 0 1px ${COR_EXEMPLO}`,
          }}
        />
        <span>{t("hr.ausencias.organizacao.legendaPendente")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-[2px] bg-muted" />
        <span>{t("hr.ausencias.organizacao.legendaNaoUtil")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-[2px] bg-accent/40" />
        <span>{t("hr.ausencias.organizacao.legendaSemMarcacao")}</span>
      </li>
    </ul>
  );
}
