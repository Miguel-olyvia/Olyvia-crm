/** Os tipos de ausencia de exemplo. */
import { useCallback, useMemo } from "react";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";

export function useAusenciasTipos() {
  const tipos = useEstadoRh((e) => e.tiposAusencia);
  const activos = useMemo(() => tipos.filter((tipo) => tipo.activo), [tipos]);
  const porId = useMemo(() => new Map(tipos.map((tipo) => [tipo.id, tipo])), [tipos]);
  const recarregar = useCallback(async (): Promise<void> => undefined, []);
  return { tipos, activos, porId, loading: false, recusado: false, vazio: tipos.length === 0, recarregar };
}
