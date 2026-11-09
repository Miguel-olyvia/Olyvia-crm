/**
 * Os avisos da margem de tempo no processamento: «N dias por validar» (com ligacao para a fila de trabalho da assiduidade, ja
 * filtrada nos desvios a validar) e a margem ou os desvios que nao se leram (o calculo e o fecho ficam bloqueados). So em texto,
 * nunca so por cor; nada aparece quando nao ha nada a avisar.
 */
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** A fila de trabalho do mapa de assiduidade, filtrada nos desvios a validar (o filtro abre o separador «Fila»). */
export const HREF_FILA_DESVIOS = "/rh-exemplo/assiduidade-e-ausencias?dominio=assiduidade&fila_tipo=desvio_a_validar";

interface Props {
  /** Dias com desvio por validar, somados em todas as pessoas. */
  diasPorValidar: number;
  /** Pessoas cuja margem ou desvios nao se leram. */
  pessoasSemDesvios: number;
  className?: string;
}

export function AvisosDeDesvios({ diasPorValidar, pessoasSemDesvios, className }: Props) {
  const { t } = useTranslation();
  if (diasPorValidar <= 0 && pessoasSemDesvios <= 0) return null;
  return (
    <div className={cn("space-y-1", className)} data-testid="avisos-desvios">
      {pessoasSemDesvios > 0 && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhProcReal.aviso.desviosNaoLidos", { n: String(pessoasSemDesvios) })}
        </p>
      )}
      {diasPorValidar > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-amber-800 dark:text-amber-300">
          <span>{t("rhProcReal.aviso.diasPorValidar", { n: String(diasPorValidar) })}</span>
          <Link to={HREF_FILA_DESVIOS} className="min-h-11 content-center font-medium underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {t("rhProcReal.aviso.diasPorValidarLigacao")}
          </Link>
        </p>
      )}
    </div>
  );
}
