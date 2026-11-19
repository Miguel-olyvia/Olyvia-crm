// `const { t, tn, idioma } = usePortalT();` — t(chave, params?) com fallback idioma -> pt -> chave;
// tn(chaveUm, chaveVarios, n, params?) para plurais. t e tn só mudam de identidade quando o idioma muda.
import { useMemo } from "react";
import { traduzir, traduzirN } from "./traduzir";
import { usePortalIdioma } from "./usePortalIdioma";
import type { ParamsDeTraducao, PortalIdioma } from "./tipos";

export interface PortalTraducao {
  idioma: PortalIdioma;
  t: (chave: string, params?: ParamsDeTraducao) => string;
  tn: (chaveUm: string, chaveVarios: string, n: number, params?: ParamsDeTraducao) => string;
}

export function usePortalT(): PortalTraducao {
  const { idioma } = usePortalIdioma();
  return useMemo(
    () => ({
      idioma,
      t: (chave, params) => traduzir(idioma, chave, params),
      tn: (chaveUm, chaveVarios, n, params) => traduzirN(idioma, chaveUm, chaveVarios, n, params),
    }),
    [idioma],
  );
}
