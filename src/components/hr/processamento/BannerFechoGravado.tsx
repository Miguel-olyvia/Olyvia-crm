/**
 * O estado dos resultados gravados de um periodo FECHADO: quando e por quem foi fechado, ou porque nao ha valores
 * (fechado antes do registo, sem permissao, falha de leitura). Um periodo fechado le o gravado e nao recalcula.
 */
import type { Ref } from "react";
import { Lock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoResultados } from "@/hooks/useProcessamentoResultados";

interface Props {
  estado: EstadoResultados;
  fechadoEm: string | null;
  fechadoPorNome: string | null;
  antesDoRegisto: boolean;
  /** Para o foco passar para esta mensagem depois de fechar. */
  innerRef?: Ref<HTMLParagraphElement>;
  /** Volta a ler os resultados gravados (`useProcessamentoResultados().recarregar`); so aparece com o estado `erro`. */
  aoTentarDeNovo?: () => void;
}

function formatarData(iso: string, lingua: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso.slice(0, 10);
  return data.toLocaleDateString(lingua === "pt" ? "pt-PT" : "en-GB", { timeZone: "Europe/Lisbon" });
}

const CLASSE_AVISO = "flex items-start gap-2 rounded-md border border-amber-800/40 p-3 text-sm text-amber-800 dark:border-amber-300/40 dark:text-amber-300";

export function BannerFechoGravado({ estado, fechadoEm, fechadoPorNome, antesDoRegisto, innerRef, aoTentarDeNovo }: Props) {
  const { t, language } = useTranslation();
  if (estado === "inactivo") return null;
  if (estado === "a_carregar") {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <OlyviaLoader size={16} />
        {t("rhProcReal.fecho.aLerGravado")}
      </div>
    );
  }
  if (estado === "recusado" || estado === "erro") {
    return (
      <div role={estado === "erro" ? "alert" : "status"} className={CLASSE_AVISO}>
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t(estado === "erro" ? "rhProcReal.fecho.erroLerGravado" : "rhProcReal.fecho.semPermissaoGravado")}</p>
        {/* So uma falha de leitura se resolve a tentar de novo; a falta de permissao nao. */}
        {estado === "erro" && aoTentarDeNovo && (
          <Button type="button" variant="outline" size="sm" className="ml-auto min-h-11" onClick={aoTentarDeNovo}>
            {t("rhProcReal.fecho.tentarDeNovo")}
          </Button>
        )}
      </div>
    );
  }
  if (antesDoRegisto) {
    return (
      <p ref={innerRef} tabIndex={-1} role="status" className={`${CLASSE_AVISO} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t("rhProcReal.fecho.antesDoRegisto")}
      </p>
    );
  }
  const data = fechadoEm ? formatarData(fechadoEm, language) : "—";
  return (
    <p ref={innerRef} tabIndex={-1} role="status" className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {fechadoPorNome
        ? t("rhProcReal.fecho.fechadoPor", { data, nome: fechadoPorNome })
        : t("rhProcReal.fecho.fechadoEm", { data })}
    </p>
  );
}
