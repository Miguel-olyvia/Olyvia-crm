import { useMemo } from "react";
import { useJustificacoesDoDia } from "@/components/rh-exemplo/hooks/useJustificacoesDoDia";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

export const porDecidir = (j: JustificacaoDia): boolean => j.estado === "pendente";

/**
 * As justificações de dia que esperam decisão, da base (a organização inteira, só as pendentes). Serve a fila do RH e o
 * contador do separador, lidas UMA vez por quem os junta: quem monta a fila passa estes dados à fila em vez de a deixar
 * ler por si. Quem não é RH só recebe as suas, por isso o contador nunca mostra o que não pode decidir.
 */
export function usePendentesJustificacaoDia() {
  const { justificacoes, loading, recusado, erro, indisponivel, recarregar } = useJustificacoesDoDia({ soPendentes: true });
  const pendentes = useMemo(() => justificacoes.filter(porDecidir), [justificacoes]);
  return { justificacoes: pendentes, loading, recusado, erro, indisponivel, recarregar };
}

export type PendentesJustificacaoDia = ReturnType<typeof usePendentesJustificacaoDia>;
