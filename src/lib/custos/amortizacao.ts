// €/h de um equipamento. Espelho de public.fn_custo_hora_equipamento.
//   €/h = (compra − residual) ÷ vida útil (h) + manutenção anual ÷ horas de uso por ano

export interface EquipamentoCusto {
  compra: number;
  vida_util_horas: number;
  residual?: number | null;
  manutencao_anual?: number | null;
  uso_horas_ano?: number | null;
}

export function custoHoraEquipamento(e: EquipamentoCusto): number {
  const amort = e.vida_util_horas > 0 ? Math.max((e.compra || 0) - (e.residual || 0), 0) / e.vida_util_horas : 0;
  const manut = (e.uso_horas_ano || 0) > 0 ? (e.manutencao_anual || 0) / (e.uso_horas_ano as number) : 0;
  return amort + manut;
}
