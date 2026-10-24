// O cabeçalho de página do Inventário (função head() do mockup) para Negócios e Pessoas: as migalhas pequenas ("Negócios › Quadro"), o título, o subtítulo
// e as ações à direita (no máximo uma é primária). O estilo é o de `.ph` em blocosPagina.css; precisa de um ancestral com a classe pg-root.
import type { ReactNode } from "react";
import "./blocosPagina.css";

interface CabecalhoProps { migalhas: string; titulo: string; subtitulo: ReactNode; acoes?: ReactNode }

export function CabecalhoPagina({ migalhas, titulo, subtitulo, acoes }: CabecalhoProps) {
  return (
    <header className="ph">
      <div>
        <div className="crumbs">{migalhas}</div>
        <h1>{titulo}</h1>
        <p className="ph-sub">{subtitulo}</p>
      </div>
      {acoes ? <div className="ph-actions">{acoes}</div> : null}
    </header>
  );
}
