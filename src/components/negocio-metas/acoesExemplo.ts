// As ações de exemplo da página: a página ainda não grava nem navega a partir
// dos negócios, por isso cada ação só mostra um aviso a dizer o que faria.
import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { AcoesNegocio } from "./AcoesNegocio";

export function useAcoesExemplo(): AcoesNegocio {
  const { t } = useTranslation();
  return useMemo(() => {
    const aviso = (chave: string) => (n: { pessoa: string }) =>
      toast.info(t(`businessGoals.example.${chave}`, { name: n.pessoa }));
    return {
      abrirNegocio: aviso("openDeal"),
      abrirPessoa: aviso("openPerson"),
      criarOrcamento: aviso("createQuote"),
    };
  }, [t]);
}
