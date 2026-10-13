// Estrutura €/h. Espelho de public.fn_custo_estrutura_hora.
//   estrutura €/h = Σ valor mensal (ativos) ÷ horas produtivas da empresa por mês

export interface ItemEstrutura {
  valor_mensal: number;
  ativo: boolean;
}

export const CATEGORIAS_ESTRUTURA = [
  { valor: "renda", nome: "Renda" },
  { valor: "viaturas", nome: "Viaturas" },
  { valor: "seguros", nome: "Seguros" },
  { valor: "pessoal_nao_operacional", nome: "Pessoal não operacional" },
  { valor: "licencas_software", nome: "Licenças e software" },
  { valor: "energia_agua", nome: "Energia e água" },
  { valor: "financeiro", nome: "Custos financeiros" },
  { valor: "outro", nome: "Outro" },
] as const;

export type CategoriaEstrutura = (typeof CATEGORIAS_ESTRUTURA)[number]["valor"];

export function totalEstrutura(itens: ItemEstrutura[]): number {
  return itens.filter((i) => i.ativo).reduce((a, i) => a + (Number(i.valor_mensal) || 0), 0);
}

/** 0 quando as horas da empresa não estão definidas (estrutura não calculada). */
export function estruturaHora(itens: ItemEstrutura[], horasEmpresaMes: number): number {
  return horasEmpresaMes > 0 ? totalEstrutura(itens) / horasEmpresaMes : 0;
}
