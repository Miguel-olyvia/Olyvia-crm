import React, { createContext, useContext } from 'react';

export type IdiomaForcado = 'en' | 'pt' | 'es' | 'fr' | 'de';

const IdiomaForcadoContext = createContext<IdiomaForcado | undefined>(undefined);

/**
 * Lingua que `useTranslation()` (sem argumento) usa dentro desta arvore, no
 * lugar da lingua do contexto. Serve ecras publicos que escolhem a lingua pelo
 * navegador (o convite de admissao). Nao altera nem grava a lingua da aplicacao.
 */
export const IdiomaForcadoProvider: React.FC<{
  idioma: IdiomaForcado;
  children: React.ReactNode;
}> = ({ idioma, children }) => (
  <IdiomaForcadoContext.Provider value={idioma}>{children}</IdiomaForcadoContext.Provider>
);

export const useIdiomaForcado = (): IdiomaForcado | undefined => useContext(IdiomaForcadoContext);
