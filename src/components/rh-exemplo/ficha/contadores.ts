// Os números que as abas da ficha de RH mostram em pastilha: contratos, documentos e ausências por decidir. Funções puras.
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";

export interface ContadoresFicha {
  contratos: number;
  documentos: number;
  /** Só os pedidos que ainda esperam decisão (da chefia ou de RH); os já decididos não contam. */
  ausenciasPorDecidir: number;
}

export function contadoresDaFicha(ficha: Pick<FichaRh, "vinculos" | "documentos" | "ausencias"> | null): ContadoresFicha {
  if (!ficha) return { contratos: 0, documentos: 0, ausenciasPorDecidir: 0 };
  return {
    contratos: ficha.vinculos.length,
    documentos: ficha.documentos.length,
    ausenciasPorDecidir: ficha.ausencias.pedidos.filter((p) => p.estado === "pendente_chefia" || p.estado === "pendente_rh").length,
  };
}
