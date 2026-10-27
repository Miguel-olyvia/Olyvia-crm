// Os números que as abas da ficha de RH mostram em pastilha. Só os contratos, que vêm dos vínculos da ficha real. Os documentos
// e as ausências por decidir ficam de fora (campos ausentes, não zeros): não há fonte barata para eles, e mostrar «0» seria
// afirmar o que ninguém contou. Funções puras.
export interface ContadoresFicha {
  contratos: number;
  /** Sem fonte real: fica por definir e a aba não mostra pastilha. */
  documentos?: number;
  /** Sem fonte real: fica por definir e a aba não mostra pastilha. */
  ausenciasPorDecidir?: number;
}

export function contadoresDaFicha(ficha: { vinculos: readonly unknown[] } | null): ContadoresFicha {
  return { contratos: ficha?.vinculos.length ?? 0 };
}
