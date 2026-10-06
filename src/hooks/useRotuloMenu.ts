import { useCallback, useMemo } from "react";
import { useTermos } from "@/hooks/useCamposEmpresa";
import { termosParaGravar, type Termo } from "@/lib/campos/termos";

/** Entradas do menu que mostram um dos nomes configuráveis da empresa. */
const MENU_TERMO: Record<string, Termo> = {
  "sidebar.clients": "cliente",
  "sidebar.leads": "lead",
  "sidebar.proposalRequests": "negocio",
};

/**
 * Tradutor do menu com os nomes da empresa (Configurações → Fichas e campos →
 * Nomes). Só troca quando a empresa configurou um nome diferente do de
 * sempre; caso contrário fica a tradução normal, em qualquer língua.
 */
export function useRotuloMenu(t: (key: string) => string): (key: string) => string {
  const termos = useTermos();
  const configurados = useMemo(() => termosParaGravar(termos), [termos]);
  return useCallback(
    (key: string) => {
      const termo = MENU_TERMO[key];
      return (termo && configurados[termo]?.plural) || t(key);
    },
    [t, configurados],
  );
}
