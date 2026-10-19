// NG001 («este negócio já não está disponível») ao gravar num diálogo: o alerta de dentro do diálogo desapareceria com ele, por isso o
// aviso sai por toast e por anúncio (o anúncio da ficha), o diálogo fecha-se e volta-se à ficha, que a mutação já mandou refazer.
import { useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { CHAVE_NEGOCIO_INDISPONIVEL } from "./useEnvioAssincrono";

/** A função para passar a `useEnvioAssincrono`: só reage ao NG001; qualquer outro erro fica dentro do diálogo. */
export function useAoNegocioIndisponivel(aoFechar: () => void): (chave: string) => void {
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  return useCallback((chave: string) => {
    if (chave !== CHAVE_NEGOCIO_INDISPONIVEL) return;
    const texto = t(chave);
    toast.error(texto);
    anunciar(texto);
    aoFechar();
  }, [t, anunciar, aoFechar]);
}
