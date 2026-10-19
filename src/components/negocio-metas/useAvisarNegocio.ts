// O aviso do resultado de uma ação do negócio na ficha: um toast (para quem vê) e o anúncio da ficha (para o leitor de ecrã). O toast vive
// fora do painel lateral, que o Radix esconde do leitor de ecrã, por isso o que só aparecesse num toast não seria ouvido.
import { useCallback } from "react";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { toast } from "@/lib/toast";

export function useAvisarNegocio(): (texto: string) => void {
  const anunciar = useAnunciar();
  return useCallback((texto: string) => {
    anunciar(texto);
    toast.success(texto);
  }, [anunciar]);
}
