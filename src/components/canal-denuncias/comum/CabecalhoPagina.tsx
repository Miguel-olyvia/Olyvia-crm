// Cabeçalho das páginas de gestão: migalhas, título, resumo numa linha e a faixa de «dados de exemplo». É uma cópia do
// padrão do módulo de negócios (sem o importar), com os textos do canal de denúncias.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FlaskConical } from "lucide-react";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";

interface CabecalhoPaginaProps {
  titulo: string;
  subtitulo: string;
  acoes?: ReactNode;
}

export function CabecalhoPagina({ titulo, subtitulo, acoes }: CabecalhoPaginaProps) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 space-y-2">
        <nav aria-label={t("cd.migalhas")}>
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link to="/canal-denuncias/gestao" className={`rounded-sm hover:text-foreground ${FOCO}`}>
                {t("cd.modulo")}
              </Link>
            </li>
            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
            <li aria-current="page" className="font-medium text-foreground">{titulo}</li>
          </ol>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{titulo}</h1>
        <p className="text-sm text-foreground/80">{subtitulo}</p>
        <p role="note" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          {t("cd.exemplo")}
        </p>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}
