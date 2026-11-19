// Datas ligadas ao idioma do portal: `const { formatarData } = usePortalFormato();`. Só as palavras seguem o idioma;
// dinheiro e números ficam como sempre e não passam por aqui.
import { useMemo } from "react";
import { formatarData, formatarDataHora, formatarDataIso, type EstiloDeData } from "./formato";
import { usePortalIdioma } from "./usePortalIdioma";
import type { PortalIdioma } from "./tipos";

type EntradaDeData = Date | string | number | null | undefined;

export interface PortalFormato {
  idioma: PortalIdioma;
  formatarData: (valor: EntradaDeData, estilo?: EstiloDeData) => string;
  formatarDataHora: (valor: EntradaDeData, estilo?: EstiloDeData) => string;
  formatarDataIso: (valor: string | null | undefined) => string;
}

export function usePortalFormato(): PortalFormato {
  const { idioma } = usePortalIdioma();
  return useMemo(
    () => ({
      idioma,
      formatarData: (valor, estilo) => formatarData(valor, idioma, estilo),
      formatarDataHora: (valor, estilo) => formatarDataHora(valor, idioma, estilo),
      formatarDataIso: (valor) => formatarDataIso(valor, idioma),
    }),
    [idioma],
  );
}
