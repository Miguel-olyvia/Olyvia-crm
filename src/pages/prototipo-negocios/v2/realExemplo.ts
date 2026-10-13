// O "real" das obras na V2: DADOS DE EXEMPLO. Ainda não há registos reais de horas, equipamentos nem consumíveis
// (na app real virão do calculo_snapshot e dos fechos de tarefa; ver plano-execucao.md, etapa 4). Cada número é o real
// a dividir pelo previsto, por tipo de custo: 1,08 quer dizer que se gastou mais 8% do que a receita previa.
export interface FatoresReal { mo: number; eq: number; cons: number; estr: number }

export const REAL_EXEMPLO: Record<number, FatoresReal> = {
  1050: { mo: 1.06, eq: 0.92, cons: 1.11, estr: 1.06 }, // Joana Ribeiro: obra concluída
  1022: { mo: 1.09, eq: 1.0, cons: 0.97, estr: 1.09 }, // Marta Lima: obra em curso
};

/** Para as obras que não estão na tabela (as que se criam na demonstração). */
export const REAL_POR_DEFEITO: FatoresReal = { mo: 1.04, eq: 1.0, cons: 1.05, estr: 1.04 };

export const fatoresDe = (id: number): FatoresReal => REAL_EXEMPLO[id] ?? REAL_POR_DEFEITO;
