/**
 * A faixa discreta no topo da página pública do convite, SÓ nesta apresentação de exemplo: diz que é uma pré-visualização,
 * leva de volta à lista de estados e, nos tokens de demonstração, passa ao estado anterior ou seguinte. Não faz parte do
 * que a pessoa vê de verdade.
 */
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CAMINHO_INDICE_CONVITES, caminhoDoConvite, vizinhosDoEstado } from "@/components/rh-exemplo/convite/estadosConvite";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const LIGACAO =
  "inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium text-foreground underline-offset-4 hover:underline " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function FaixaPreVisualizacao({ token }: { token: string | undefined }) {
  const { t } = useTranslation();
  const vizinhos = vizinhosDoEstado(token);
  return (
    <nav
      aria-label={t("rhAdmIdx.faixa.aria")}
      data-testid="faixa-previsualizacao"
      className="flex flex-wrap items-center justify-between gap-x-4 border-b bg-muted px-4 text-sm text-muted-foreground"
    >
      <p className="flex flex-wrap items-center gap-x-2">
        <span className="font-medium">{t("rhAdmIdx.faixa.texto")}</span>
        <span aria-hidden="true">·</span>
        <Link to={CAMINHO_INDICE_CONVITES} className={LIGACAO}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t("rhAdmIdx.faixa.voltar")}
        </Link>
      </p>
      {vizinhos && (
        <p className="flex items-center gap-1">
          <span className="tabular-nums" aria-live="polite">
            {t("rhAdmIdx.faixa.posicao", { n: vizinhos.posicao, total: 8 })}
          </span>
          {vizinhos.anterior ? (
            <Link to={caminhoDoConvite(vizinhos.anterior.token)} className={LIGACAO}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("rhAdmIdx.faixa.anterior")}
            </Link>
          ) : (
            <span className={cn(LIGACAO, "opacity-50")} aria-disabled="true">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("rhAdmIdx.faixa.anterior")}
            </span>
          )}
          {vizinhos.seguinte ? (
            <Link to={caminhoDoConvite(vizinhos.seguinte.token)} className={LIGACAO}>
              {t("rhAdmIdx.faixa.seguinte")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={cn(LIGACAO, "opacity-50")} aria-disabled="true">
              {t("rhAdmIdx.faixa.seguinte")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </p>
      )}
    </nav>
  );
}
