// O idioma do portal e a forma de o mudar. Funciona com ou sem PortalLanguageProvider: ambos leem a mesma fonte.
import { useSyncExternalStore } from "react";
import { definirIdioma, lerIdioma, subscreverIdioma } from "./armazemIdioma";
import { IDIOMA_OMISSAO, type PortalIdioma } from "./tipos";

export interface PortalIdiomaEstado {
  idioma: PortalIdioma;
  setIdioma: (idioma: PortalIdioma) => void;
}

export function usePortalIdioma(): PortalIdiomaEstado {
  const idioma = useSyncExternalStore(subscreverIdioma, lerIdioma, () => IDIOMA_OMISSAO);
  return { idioma, setIdioma: definirIdioma };
}
