/** O que falta na admissão de uma pessoa de exemplo, lido da ficha em memória. */
import { useCallback, useMemo } from "react";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";

export type OrigemPendencia = "pessoa" | "rh";
export type PosicaoPendencia = "convite" | "ficha" | "rh";

export interface Pendencia {
  codigo: string;
  origem: OrigemPendencia;
  posicao: PosicaoPendencia;
}

export interface EstadoAdmissaoPendencias {
  pendencias: Pendencia[];
  noConvite: Pendencia[];
  naFicha: Pendencia[];
  daPessoa: Pendencia[];
  doRh: Pendencia[];
  carregando: boolean;
  recarregando: boolean;
  semAcesso: boolean;
  erro: boolean;
  recarregar: () => void;
}

export function useAdmissaoPendencias(pessoaId: string | null): EstadoAdmissaoPendencias {
  const ficha = useFichaRh(pessoaId);
  const pendencias = useMemo(() => ficha?.pendencias ?? [], [ficha]);
  const recarregar = useCallback(() => undefined, []);
  return {
    pendencias,
    noConvite: pendencias.filter((p) => p.posicao === "convite"),
    naFicha: pendencias.filter((p) => p.posicao === "ficha"),
    daPessoa: pendencias.filter((p) => p.posicao === "convite" || p.posicao === "ficha"),
    doRh: pendencias.filter((p) => p.posicao === "rh"),
    carregando: false,
    recarregando: false,
    semAcesso: false,
    erro: false,
    recarregar,
  };
}
