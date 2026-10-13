// Estado das preferências do Quadro e da Lista (modo, ordem, "Os meus" e fases),
// guardado no browser a cada mudança. Partilhado pelas duas vistas: mudar a
// ordem num lado vê-se no outro.
import { useCallback, useEffect, useState } from "react";
import type { FaseNegocio } from "./negocioMetas";
import type { Ordem } from "./ordenacaoQuadro";
import { guardarPreferencias, lerPreferencias, type PreferenciasQuadro } from "./preferenciasQuadro";
import { guardarVista, lerVista, type ModoVista } from "./vistaGuardada";

export interface PreferenciasEstado extends PreferenciasQuadro {
  modo: ModoVista;
  mudarModo: (modo: ModoVista) => void;
  mudarOrdem: (ordem: Ordem | null) => void;
  mudarMeus: (meus: boolean) => void;
  mudarFases: (fases: FaseNegocio[]) => void;
}

export function usePreferenciasQuadro(): PreferenciasEstado {
  const [modo, setModo] = useState<ModoVista>(lerVista);
  const [prefs, setPrefs] = useState<PreferenciasQuadro>(lerPreferencias);

  const mudarModo = useCallback((m: ModoVista) => {
    setModo(m);
    guardarVista(m);
  }, []);
  const mudar = useCallback((parcial: Partial<PreferenciasQuadro>) => setPrefs((atual) => ({ ...atual, ...parcial })), []);
  // Guarda depois de cada mudança, fora do atualizador de estado (que tem de ser puro).
  useEffect(() => guardarPreferencias(prefs), [prefs]);

  return {
    ...prefs,
    modo,
    mudarModo,
    mudarOrdem: useCallback((ordem) => mudar({ ordem }), [mudar]),
    mudarMeus: useCallback((meus) => mudar({ meus }), [mudar]),
    mudarFases: useCallback((fases) => mudar({ fases }), [mudar]),
  };
}
