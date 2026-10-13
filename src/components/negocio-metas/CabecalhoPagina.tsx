import { Link } from "react-router-dom";
import { ChevronRight, FlaskConical } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "./estilos";

interface CabecalhoPaginaProps {
  subtitulo: string;
  /** Título, migalha de origem e aviso de exemplo; sem eles, os de "Negócio e metas". */
  titulo?: string;
  pai?: { to: string; texto: string };
  aviso?: string;
}

/** Cabeçalho da página: migalhas, título, resumo numa linha e a faixa de "dados de exemplo". */
export function CabecalhoPagina({ subtitulo, titulo, pai, aviso }: CabecalhoPaginaProps) {
  const { t } = useTranslation();
  const tituloFinal = titulo ?? t("businessGoals.title");
  const paiFinal = pai ?? { to: "/deals", texto: t("businessGoals.breadcrumb.acquisition") };
  return (
    <header className="space-y-2">
      <nav aria-label={t("businessGoals.breadcrumb.label")}>
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link to={paiFinal.to} className={`rounded-sm hover:text-foreground ${FOCO}`}>
              {paiFinal.texto}
            </Link>
          </li>
          <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
          <li aria-current="page" className="font-medium text-foreground">{tituloFinal}</li>
        </ol>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {tituloFinal}
      </h1>
      <p className="text-sm text-foreground/80">{subtitulo}</p>
      <p role="note" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        {aviso ?? t("businessGoals.sample")}
      </p>
    </header>
  );
}
