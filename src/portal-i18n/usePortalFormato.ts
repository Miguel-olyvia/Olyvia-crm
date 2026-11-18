// Formatação ligada ao idioma do portal: `const { formatarData, formatarMoeda } = usePortalFormato();`
import { useMemo } from "react";
import {
  formatarData,
  formatarDataHora,
  formatarDataIso,
  formatarMoeda,
  formatarNumero,
  type EstiloDeData,
} from "./formato";
import { usePortalIdioma } from "./usePortalIdioma";
import type { PortalIdioma } from "./tipos";

type EntradaDeData = Date | string | number | null | undefined;

export interface PortalFormato {
  idioma: PortalIdioma;
  formatarData: (valor: EntradaDeData, estilo?: EstiloDeData) => string;
  formatarDataHora: (valor: EntradaDeData, estilo?: EstiloDeData) => string;
  formatarDataIso: (valor: string | null | undefined) => string;
  formatarMoeda: (valor: number | null | undefined, moeda?: string) => string;
  formatarNumero: (valor: number | null | undefined, opcoes?: Intl.NumberFormatOptions) => string;
}

export function usePortalFormato(): PortalFormato {
  const { idioma } = usePortalIdioma();
  return useMemo(
    () => ({
      idioma,
      formatarData: (valor, estilo) => formatarData(valor, idioma, estilo),
      formatarDataHora: (valor, estilo) => formatarDataHora(valor, idioma, estilo),
      formatarDataIso: (valor) => formatarDataIso(valor, idioma),
      formatarMoeda: (valor, moeda) => formatarMoeda(valor, idioma, moeda),
      formatarNumero: (valor, opcoes) => formatarNumero(valor, idioma, opcoes),
    }),
    [idioma],
  );
}
