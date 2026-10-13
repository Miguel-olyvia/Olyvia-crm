// Custo/hora de um perfil (categoria salarial).
// Espelho de public.fn_custo_hora_calc / fn_custo_hora_perfil
// (supabase/migrations/20261214110000_area_custos.sql). Se mudar um, mudar o outro.
//
//   custo/mês  = salário × meses/12 × (1 + TSU) + subsídio × dias + seguro/mês
//   custo/hora = custo/mês ÷ horas produtivas/mês × (1 + encargos)

export interface ParametrosCusto {
  meses_salario: number;
  tsu_pct: number;
  encargos_pct: number;
  subsidio_alimentacao_dia: number;
  dias_subsidio_mes: number;
  seguro_mes: number;
  horas_produtivas_mes: number;
  horas_empresa_mes: number;
  somar_estrutura: boolean;
  meses_desatualizado: number;
  margem_minima_padrao: number;
  margem_alvo_padrao: number;
}

/** Os valores por omissão (Método de Orçamentação BMG), iguais aos DEFAULT da tabela cost_parameters. */
export const PARAMETROS_BMG: ParametrosCusto = {
  meses_salario: 14,
  tsu_pct: 23.75,
  encargos_pct: 7.5,
  subsidio_alimentacao_dia: 6.15,
  dias_subsidio_mes: 22,
  seguro_mes: 0,
  horas_produtivas_mes: 173.33,
  horas_empresa_mes: 0,
  somar_estrutura: false,
  meses_desatualizado: 6,
  margem_minima_padrao: 28,
  margem_alvo_padrao: 35,
};

export interface PerfilCusto {
  salario_base: number | null;
  encargos_pct?: number | null;
  custo_hora_manual?: number | null;
}

/** Custo/mês de uma pessoa com este salário (antes dos encargos). null sem salário. */
export function custoMesPerfil(salario: number | null | undefined, par: ParametrosCusto): number | null {
  if (salario == null) return null;
  return (
    (salario * (par.meses_salario || 14)) / 12 * (1 + (par.tsu_pct || 0) / 100) +
    (par.subsidio_alimentacao_dia || 0) * (par.dias_subsidio_mes || 0) +
    (par.seguro_mes || 0)
  );
}

/** Custo/hora a partir do salário. null sem salário ou sem horas produtivas. */
export function custoHoraCalc(
  salario: number | null | undefined,
  par: ParametrosCusto,
  encargosPct: number | null = null,
): number | null {
  const mes = custoMesPerfil(salario, par);
  if (mes == null || !(par.horas_produtivas_mes > 0)) return null;
  return (mes / par.horas_produtivas_mes) * (1 + (encargosPct ?? par.encargos_pct ?? 0) / 100);
}

/** Custo/hora de um perfil: o manual manda; senão, o calculado com os parâmetros. */
export function custoHoraPerfil(p: PerfilCusto, par: ParametrosCusto): number | null {
  if (p.custo_hora_manual != null) return p.custo_hora_manual;
  return custoHoraCalc(p.salario_base, par, p.encargos_pct ?? null);
}

/** Média dos custos/hora conhecidos (a que se usa quando um perfil não tem). */
export function mediaCustoHora(valores: (number | null | undefined)[]): number | null {
  const v = valores.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
