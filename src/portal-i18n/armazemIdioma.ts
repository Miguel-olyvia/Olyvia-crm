// A fonte única do idioma do portal: lê e escreve o localStorage (que pode lançar) e avisa quem subscreve.
// Sem cache do que está guardado: ler o localStorage de cada vez mantém tudo coerente com o que lá estiver
// (outro separador, testes que o limpam). A memória só entra quando o armazenamento não se pode ler.
import { CHAVE_IDIOMA_PORTAL, IDIOMA_OMISSAO, ehPortalIdioma, type PortalIdioma } from "./tipos";

type Ouvinte = () => void;

const ouvintes = new Set<Ouvinte>();
let emMemoria: PortalIdioma | null = null;

/** `undefined` quando o armazenamento não se pode ler; `null` quando se lê mas não há valor válido. */
function lerGuardado(): PortalIdioma | null | undefined {
  try {
    const valor = window.localStorage.getItem(CHAVE_IDIOMA_PORTAL);
    return ehPortalIdioma(valor) ? valor : null;
  } catch {
    return undefined;
  }
}

/** Só para testes: esquece o idioma guardado em memória (que só conta quando o armazenamento não se pode ler). */
export function reporIdiomaEmMemoria(): void {
  emMemoria = null;
}

export function lerIdioma(): PortalIdioma {
  if (typeof window === "undefined") return IDIOMA_OMISSAO;
  const guardado = lerGuardado();
  if (guardado === undefined) return emMemoria ?? IDIOMA_OMISSAO;
  return guardado ?? IDIOMA_OMISSAO;
}

export function definirIdioma(idioma: PortalIdioma): void {
  if (!ehPortalIdioma(idioma)) return;
  emMemoria = idioma;
  try {
    window.localStorage.setItem(CHAVE_IDIOMA_PORTAL, idioma);
  } catch {
    // Armazenamento bloqueado ou cheio: o idioma vale só nesta sessão, em memória.
  }
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** Para `useSyncExternalStore`: avisa quando o idioma muda aqui ou noutro separador. */
export function subscreverIdioma(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  const aoMudarNoutroSeparador = (e: StorageEvent) => {
    if (e.key === null || e.key === CHAVE_IDIOMA_PORTAL) ouvinte();
  };
  window.addEventListener("storage", aoMudarNoutroSeparador);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", aoMudarNoutroSeparador);
  };
}
