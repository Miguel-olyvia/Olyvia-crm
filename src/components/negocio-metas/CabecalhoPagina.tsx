import { Link } from "react-router-dom";
import { ChevronRight, FlaskConical } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "./estilos";

/** Cabeçalho da página: migalhas, título, resumo numa linha e a faixa de "dados de exemplo". */
export function CabecalhoPagina({ subtitulo }: { subtitulo: string }) {
  const { t } = useTranslation();
  return (
    <header className="space-y-2">
      <nav aria-label={t("businessGoals.breadcrumb.label")}>
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link to="/deals" className={`rounded-sm hover:text-foreground ${FOCO}`}>
              {t("businessGoals.breadcrumb.acquisition")}
            </Link>
          </li>
          <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
          <li aria-current="page" className="font-medium text-foreground">{t("businessGoals.title")}</li>
        </ol>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t("businessGoals.title")}
      </h1>
      <p className="text-sm text-foreground/80">{subtitulo}</p>
      <p role="note" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        {t("businessGoals.sample")}
      </p>
    </header>
  );
}
