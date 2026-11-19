// Tipos e constantes do idioma do portal (cliente e fornecedor). Independente do LanguageContext do CRM.

/** O portal só fala português e inglês. */
export type PortalIdioma = "pt" | "en";

export const IDIOMAS_DO_PORTAL: readonly PortalIdioma[] = ["pt", "en"];

/** Português por omissão: não se adivinha pelo navegador. */
export const IDIOMA_OMISSAO: PortalIdioma = "pt";

/** Chave do localStorage, só do portal (a do CRM é 'language'). */
export const CHAVE_IDIOMA_PORTAL = "olyvia_portal_language";

export type ParamsDeTraducao = Record<string, string | number>;

export function ehPortalIdioma(valor: unknown): valor is PortalIdioma {
  return valor === "pt" || valor === "en";
}
