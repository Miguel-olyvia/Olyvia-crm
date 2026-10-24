// Os filtros da página: "Os meus" e as fases vêm das preferências guardadas, o resto
// (pesquisa, comercial, serviço...) vale só para esta visita.
import { useMemo, useState } from "react";
import { SEM_FILTROS, outrosFiltros, type FiltrosQuadro, type OutrosFiltros } from "./logicaQuadro";
import type { PreferenciasEstado } from "./usePreferenciasQuadro";

const OUTROS_INICIAIS = outrosFiltros(SEM_FILTROS);

export function useFiltrosPagina(prefs: PreferenciasEstado) {
  const [outros, setOutros] = useState<OutrosFiltros>(OUTROS_INICIAIS);
  const filtros = useMemo<FiltrosQuadro>(
    () => ({ ...outros, meus: prefs.meus, fases: prefs.fases }),
    [outros, prefs.meus, prefs.fases],
  );
  const mudarFiltros = (f: FiltrosQuadro) => {
    if (f.meus !== prefs.meus) prefs.mudarMeus(f.meus);
    if (f.fases !== prefs.fases) prefs.mudarFases(f.fases);
    setOutros(outrosFiltros(f));
  };
  return { filtros, mudarFiltros };
}
