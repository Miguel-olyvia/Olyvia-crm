// Envolve as rotas do portal (/client-portal/* e /supplier-portal/*): enquanto está montado, <html lang> acompanha
// o idioma do portal, e ao desmontar volta ao que lá estava. O idioma em si vive em armazemIdioma (partilhado com
// os hooks), por isso as páginas também funcionam sem este Provider.
import { useEffect, type ReactNode } from "react";
import { usePortalIdioma } from "./usePortalIdioma";

interface PortalLanguageProviderProps {
  children: ReactNode;
}

export function PortalLanguageProvider({ children }: PortalLanguageProviderProps) {
  const { idioma } = usePortalIdioma();

  useEffect(() => {
    const raiz = document.documentElement;
    const anterior = raiz.lang;
    return () => {
      raiz.lang = anterior;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  return <>{children}</>;
}
