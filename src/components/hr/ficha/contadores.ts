// Os números que as abas da ficha de RH mostram em pastilha. Hoje só os contratos, que vêm dos vínculos da ficha real. Os
// documentos e as ausências por decidir ficam de fora até haver uma fonte barata para eles (contá-los obrigaria a carregar
// todos os documentos e todos os pedidos só para pintar uma pastilha). Funções puras.
export interface ContadoresFicha {
  contratos: number;
}

export function contadoresDaFicha(ficha: { vinculos: readonly unknown[] } | null): ContadoresFicha {
  return { contratos: ficha?.vinculos.length ?? 0 };
}
